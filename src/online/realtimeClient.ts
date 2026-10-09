/**
 * 即時連線的裝置端：雲端角色有權杖、而且在遊戲畫面裡時連到班級伺服器的 /ws，
 * 收到的訊息寫進 usePresence（其他玩家、公頻、氣泡），並送出自己的位置、所在建築、說的短句。
 *
 * - 位置有變才送（最多每秒 10 次）；靜止時每 2 秒送一次心跳
 * - 換畫面就送所在建築（在建築、答題、結算、百寶屋時算在建築裡）
 * - 斷線依 2、4、8…秒重連（最多 30 秒）；被踢下線（另一台裝置登入、老師移除或重設密碼）就不再自動重連
 * - 收到 profile（自己的存檔在伺服器端變了）就同步一次
 * - 連上時與收到 gift（禮物狀態有變）時重新讀取禮物
 */
import { create } from 'zustand';
import { BUBBLE_MS, emptyPresence, expireBubbles, moveMember, receiveChat, removeMember, upsertMember, type PresenceState, type RemoteMember } from './presence';
import { CLOSE_NO_CLASS, CLOSE_RECONNECT, type IslandKind, type MemberState, type RoomFlags, type ServerMessage } from './realtime';
import { useFriends } from './useFriends';
import { usePresence } from './usePresence';
import { getToken } from './storage';
import { useCloud } from './useCloud';
import { useGifts } from './useGifts';
import { summonKind, useTeacherCalls } from './useTeacherCalls';
import { speak } from '../audio/speech';
import { GM_LINES } from '../ui/lines';
import { useGame } from '../store/useGame';
import { useUi, type Screen, type ZoneId } from '../store/useUi';
import { equippedOf } from '../store/catalog';
import { classesOf, currentClass } from '../store/island';
import type { AvatarConfig, CloudLink } from '../store/save';
import { player, teleport } from '../world/input';

/** 自己的資料（welcome 時放進成員：說話才有氣泡，但不畫在島上） */
export interface SelfInfo {
  nickname: string;
  avatar: AvatarConfig;
}

/** 伺服器的成員資料轉成畫面用的格式 */
const toRemote = (m: MemberState): RemoteMember => ({
  id: m.id,
  nickname: m.nickname,
  avatar: m.avatar,
  x: m.x,
  z: m.z,
  heading: m.h,
  zone: m.zone,
  title: m.title,
  ...(m.role ? { role: m.role } : {}),
});

/** 把一則伺服器訊息套進同島狀態（純函式；連線狀態類的訊息不在這裡處理） */
export function applyServerMessage(s: PresenceState, msg: ServerMessage, self: SelfInfo, now: number): PresenceState {
  switch (msg.t) {
    case 'welcome': {
      let next: PresenceState = { ...emptyPresence(), selfId: msg.self, chat: msg.chat.slice(-30) };
      next = upsertMember(next, { id: msg.self, nickname: self.nickname, avatar: self.avatar, x: 0, z: 0, heading: 0, zone: null });
      for (const m of msg.members) next = upsertMember(next, toRemote(m));
      return next;
    }
    case 'join':
    case 'member':
      return upsertMember(s, toRemote(msg.member));
    case 'leave':
      return removeMember(s, msg.id);
    case 'moves':
      return msg.list.reduce((acc, [id, x, z, h]) => (id === s.selfId ? acc : moveMember(acc, id, x, z, h)), s);
    case 'chat':
      return receiveChat(s, msg.line, now);
    default:
      return s;
  }
}

/** 伺服器網址換成 WebSocket 網址（http → ws、https → wss） */
export function wsUrlOf(server: string): string {
  return `${server.replace(/\/+$/, '').replace(/^http/, 'ws')}/ws`;
}

/**
 * 依目前畫面判斷在哪棟建築裡（建築選單、答題、結算、百寶屋）；其他畫面算在島上。
 * 益智遊戲館（screen 'puzzle'）第一批不回報：已經開著的舊版網頁收到不認得的建築，
 * 會在畫同學位置時丟出例外而整個畫面當掉；舊版伺服器也會因為格式不符而斷線。第二批做線上對局時再加進 ZONE_IDS。
 */
export function zoneOfScreen(screen: Screen, zone: ZoneId | null): ZoneId | null {
  return screen === 'zone' || screen === 'activity' || screen === 'result' || screen === 'shop' ? zone : null;
}

/**
 * 被踢線或伺服器說「沒有班級」之後記住的帳號、班級與權杖：三者都沒變就不再自動重連。
 * room 是班級組合（多班級：所有班級代碼接起來，見 roomsKey）；沒有班級是 undefined
 */
export interface RealtimeBlock {
  accountId: string;
  room: string | undefined;
  /** 封鎖當下這台裝置的權杖：重新登入拿到新權杖就解除 */
  token: string | null;
}

/**
 * 角色、班級或權杖變了之後，封鎖怎麼處理（純函式；token 是這台裝置目前的權杖）：
 * - 都沒變：維持（例如在別台裝置登入被踢，不要兩台互踢）
 * - 同一個角色拿到新權杖（重新登入，例如老師重設密碼後用新密碼登入）：解除封鎖，提示清掉。
 *   權杖被清成 null（同步回 401）不算，提示要留到重新登入
 * - 同一個角色退出了班級（被老師移出、家長讓他退出，同步後本機班級清空）：反正不會再連線，
 *   被踢的提示留著，讓孩子看到「進度都還在」；之後加入班級或換角色才清掉
 * - 換了角色、或加入了別的班級：解除封鎖，提示清掉
 */
export function updateBlock(
  blocked: RealtimeBlock | null,
  current: { accountId: string; room?: string } | undefined,
  token: string | null,
): { blocked: RealtimeBlock | null; clearNotice: boolean } {
  if (!blocked) return { blocked: null, clearNotice: false };
  const sameAccount = blocked.accountId === current?.accountId;
  if (sameAccount && token !== null && token !== blocked.token) return { blocked: null, clearNotice: true };
  if (sameAccount && blocked.room === current?.room) return { blocked, clearNotice: false };
  if (sameAccount && !current?.room) return { blocked: { ...blocked, room: undefined }, clearNotice: false };
  return { blocked: null, clearNotice: true };
}

/** 雲端角色的班級組合（封鎖用；多班級：所有班級代碼接起來，加入或退出任何一班都算變了）；沒有班級是 undefined */
export function roomsKey(cloud: CloudLink | undefined): string | undefined {
  const codes = (cloud?.rooms ?? []).map((r) => r.code);
  return codes.length ? codes.join(',') : undefined;
}

/**
 * 熊熊老師請大家集合（老師 GM 的 G2）：在那一班的班級島上就直接站到老師身邊；
 * 在建築裡或別座島時跳卡片讓孩子選（summonKind）。答題時不唸
 */
function onSummon(room: string, x: number, z: number): void {
  const p = useGame.getState().profile();
  const { screen } = useUi.getState();
  const kind = summonKind(!!p && currentClass(p)?.code === room, screen);
  if (kind === 'now') {
    teleport({ x, z });
    useUi.getState().say(GM_LINES.summon);
    speak(GM_LINES.summon);
    return;
  }
  useTeacherCalls.getState().showSummon({ room, x, z, kind });
  if (screen !== 'activity') speak(kind === 'back' ? GM_LINES.backToClass : GM_LINES.summon);
}

/** 不在遊戲裡的畫面（不連線）；gm 是老師以熊熊老師進島，用老師自己的連線（gmClient.ts） */
const OFFLINE_SCREENS: Screen[] = ['title', 'profiles', 'class', 'classroom', 'teacher', 'gm'];

/** 即時連線的狀態（畫面顯示用） */
interface RealtimeStore {
  status: 'off' | 'connecting' | 'online' | 'kicked';
  flags: RoomFlags;
  /** 要給孩子看的訊息（被踢下線的原因、說太快了等） */
  notice: string | null;
  /** 現在在哪一種島（伺服器的 welcome 說的；沒連線是 null）。島嶼互訪 I1 */
  island: IslandKind | null;
}

export const useRealtime = create<RealtimeStore>(() => ({ status: 'off', flags: { chatOpen: true, giftsOpen: true }, notice: null, island: null }));

/** 目前的連線（說短句用） */
let socket: WebSocket | null = null;

/** 說一句公頻短句（只送 id）；沒連線時不做事 */
export function sayPhrase(phraseId: string): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'say', phrase: phraseId }));
}

/** 啟動即時連線管理（App 掛載時呼叫一次）；回傳停止的函式 */
export function startRealtime(): () => void {
  /** 目前連線的帳號（換角色、登出時要重連或斷線） */
  let accountId: string | null = null;
  let retry = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * 被踢線或伺服器說「沒有班級」時，記住是哪個帳號在哪個班級：同一個帳號、同一個班級不再自動重連
   * （避免兩台裝置互踢、或一直連到已經退出的班級）。角色或班級變了之後怎麼處理見 updateBlock。
   */
  let blocked: RealtimeBlock | null = null;
  /** 記住被踢或「沒有班級」當下的帳號、班級與權杖 */
  const blockNow = (): RealtimeBlock | null => (accountId ? { accountId, room: roomsKey(useGame.getState().profile()?.cloud), token: getToken(accountId) } : null);
  let last = { x: NaN, z: NaN, h: NaN, at: 0 };
  let lastZone: ZoneId | null | undefined;

  /**
   * 要去的島（送 hello 與 go 用）：連線途中換島時更新，welcome 回來時比對。
   * 在 welcome 之前送的 go 會被伺服器忽略（還在驗證權杖），所以等 welcome 再補送
   */
  let desiredIsland: IslandKind = 'class';
  /** 要去哪一班的班級島（多班級；在自己的島時沒有） */
  let desiredRoom: string | undefined;

  /**
   * 應該連到哪個帳號、去哪座島；不該連線時回傳 null。
   * 雲端角色在島上就一直連線（島嶼互訪 I1）：在班級島或自己的島都連，家長名下沒有班級的角色也連（看得到兄弟姊妹）
   */
  const wanted = () => {
    const p = useGame.getState().profile();
    if (!p?.cloud || OFFLINE_SCREENS.includes(useUi.getState().screen)) return null;
    const token = getToken(p.cloud.accountId);
    const cls = currentClass(p);
    const island: IslandKind = cls ? 'class' : 'own';
    return token ? { profile: p, token, url: wsUrlOf(p.cloud.server), island, room: cls?.code } : null;
  };

  /** 送出換島（不斷線）：班級島帶班級代碼 */
  const sendGo = () => send({ t: 'go', island: desiredIsland, ...(desiredRoom ? { room: desiredRoom } : {}) });

  /** 送一則訊息 */
  const send = (msg: object) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  };

  /** 送出目前所在建築（有變才送） */
  const sendWhere = (force = false) => {
    const { screen, zone } = useUi.getState();
    const z = zoneOfScreen(screen, zone);
    if (force || z !== lastZone) {
      lastZone = z;
      send({ t: 'where', zone: z });
    }
  };

  const disconnect = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    const s = socket;
    socket = null;
    accountId = null;
    s?.close();
    usePresence.getState().clear();
    useGifts.getState().clear();
    useFriends.getState().clear();
    useRealtime.setState({ island: null });
    if (useRealtime.getState().status !== 'kicked') useRealtime.setState({ status: 'off' });
  };

  const connect = (target: NonNullable<ReturnType<typeof wanted>>) => {
    accountId = target.profile.cloud!.accountId;
    desiredIsland = target.island;
    desiredRoom = target.room;
    useRealtime.setState({ status: 'connecting', notice: null });
    const ws = new WebSocket(target.url);
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: target.token, island: desiredIsland, ...(desiredRoom ? { room: desiredRoom } : {}) }));
    ws.onmessage = (ev) => {
      if (socket !== ws) return;
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      const p = useGame.getState().profile();
      const self: SelfInfo = { nickname: p?.name ?? '', avatar: p ? equippedOf(p) : { animal: 'bear', color: '#8b5a2b', hat: null } };
      usePresence.setState((s) => applyServerMessage(s, msg, self, Date.now()));
      switch (msg.t) {
        case 'welcome':
          retry = 0;
          useRealtime.setState({ status: 'online', flags: msg.room, island: msg.island ?? null });
          last = { x: NaN, z: NaN, h: NaN, at: 0 };
          sendWhere(true);
          void useGifts.getState().load();
          // 進的島和要去的不一樣：要去班級島卻進了自己的島，是伺服器說沒有班級（同步一次更新本機的班級）；
          // 要去的那一班伺服器說不是成員（進了別班，例如在別台裝置退出了）：同步一次更新本機的班級清單；
          // 其他情況是連線途中換了島，補送 go。舊版伺服器的 welcome 沒有 island，不補送（舊版不認得 go）；
          // 多班級之前的伺服器沒有 classCode，不比對是哪一班
          if (msg.island && msg.island !== desiredIsland) {
            if (desiredIsland === 'class' && msg.island === 'own') void useCloud.getState().syncNow();
            else sendGo();
          } else if (msg.island === 'class' && msg.classCode && desiredRoom && msg.classCode !== desiredRoom) {
            if (classesOf(useGame.getState().profile()).some((r) => r.code === desiredRoom)) void useCloud.getState().syncNow();
            else sendGo();
          }
          break;
        case 'friends':
        case 'friend':
          useFriends.getState().apply(msg);
          break;
        case 'chat':
          // 對話氣泡時間到就收起來
          setTimeout(() => usePresence.setState((s) => expireBubbles(s, Date.now())), BUBBLE_MS + 50);
          break;
        case 'room':
          useRealtime.setState({ flags: msg.room });
          break;
        case 'profile':
        // 老師改了班級教材版本：同步一次，從回應拿新的班級版本（老師 GM 的 G0）
        case 'content':
          void useCloud.getState().syncNow();
          break;
        case 'gift':
          void useGifts.getState().load();
          break;
        case 'kicked':
          blocked = blockNow();
          useRealtime.setState({ status: 'kicked', notice: msg.reason });
          // 被移出班級時，家長名下的角色進度還在：同步一次，本機的班級跟著清掉（用班級代碼登入的裝置會變成要重新登入）
          void useCloud.getState().syncNow();
          break;
        case 'error':
          useRealtime.setState({ notice: msg.message });
          break;
        case 'notice':
          // 離開了其中一班（多班級）：熊熊老師的泡泡說明，接著伺服器以 4005 讓這台重新上線（不封鎖）
          useUi.getState().say(msg.message);
          break;
        case 'announce':
          // 熊熊老師的全班公告（老師 GM 的 G2）：上方大字幕；答題時只顯示不唸，以免蓋過題目
          useTeacherCalls.getState().showAnnounce(msg.room, msg.text);
          if (useUi.getState().screen !== 'activity') speak(msg.text);
          break;
        case 'summon':
          onSummon(msg.room, msg.x, msg.z);
          break;
      }
    };
    ws.onclose = (ev) => {
      if (socket !== ws) return;
      socket = null;
      usePresence.getState().clear();
      if (useRealtime.getState().status === 'kicked') return;
      // 換了班級（家長掃 QR code 讓孩子加入班級）：不算斷線，同步一次拿到新的班級後馬上重新上線
      if (ev.code === CLOSE_RECONNECT) {
        accountId = null;
        useRealtime.setState({ status: 'connecting' });
        void useCloud.getState().syncNow().finally(evaluate);
        return;
      }
      // 伺服器說這個角色沒有班級（剛退出班級、本機還沒同步到）：不重連，同步一次更新本機的班級
      if (ev.code === CLOSE_NO_CLASS) {
        blocked = blockNow();
        accountId = null;
        useRealtime.setState({ status: 'off' });
        void useCloud.getState().syncNow();
        return;
      }
      // 斷線：2、4、8…秒後重連，最多 30 秒
      useRealtime.setState({ status: 'connecting' });
      retry += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        accountId = null;
        evaluate();
      }, Math.min(30_000, 2000 * 2 ** (retry - 1)));
    };
  };

  /** 依目前的角色與畫面決定連線、換帳號或斷線 */
  const evaluate = () => {
    const target = wanted();
    const id = target?.profile.cloud?.accountId ?? null;
    // 角色、班級或權杖變了：解除封鎖或保留被踢的提示（updateBlock）。evaluate 每次狀態變動都會跑，沒有封鎖時不讀權杖
    if (blocked) {
      const cloud = useGame.getState().profile()?.cloud;
      const next = updateBlock(blocked, cloud ? { accountId: cloud.accountId, room: roomsKey(cloud) } : undefined, cloud ? getToken(cloud.accountId) : null);
      blocked = next.blocked;
      if (next.clearNotice && useRealtime.getState().status === 'kicked') useRealtime.setState({ status: 'off', notice: null });
    }
    const isBlocked = blocked !== null && blocked.accountId === id;
    if (!target || isBlocked) {
      if (socket || accountId) disconnect();
      return;
    }
    if (accountId === id && (socket || retryTimer)) {
      // 同一個帳號換島（多班級：也可能是換到另一班的班級島）：連著的話送 go（不斷線），先清掉原本島上的人，
      // 免得新的島上還畫著舊同學
      if (target.island !== desiredIsland || target.room !== desiredRoom) {
        desiredIsland = target.island;
        desiredRoom = target.room;
        if (useRealtime.getState().status === 'online') {
          usePresence.getState().clear();
          sendGo();
        }
      }
      return;
    }
    if (socket || accountId) disconnect();
    connect(target);
  };

  // 位置：有變才送（最多每秒 10 次），靜止時每 2 秒送一次
  const tick = setInterval(() => {
    if (useRealtime.getState().status !== 'online' || useUi.getState().screen !== 'island') return;
    const now = Date.now();
    const { x, z } = player.pos;
    const h = player.heading;
    const moved = Math.abs(x - last.x) > 0.02 || Math.abs(z - last.z) > 0.02 || Math.abs(h - last.h) > 0.05;
    if (moved || now - last.at > 2000) {
      last = { x, z, h, at: now };
      send({ t: 'move', x, z, h });
    }
  }, 100);

  const offGame = useGame.subscribe(evaluate);
  const offUi = useUi.subscribe((s, prev) => {
    if (s.screen !== prev.screen) {
      evaluate();
      sendWhere();
    }
  });
  evaluate();

  return () => {
    clearInterval(tick);
    offGame();
    offUi();
    disconnect();
  };
}
