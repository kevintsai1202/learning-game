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
import type { MemberState, RoomFlags, ServerMessage } from './realtime';
import { usePresence } from './usePresence';
import { getToken } from './storage';
import { useCloud } from './useCloud';
import { useGifts } from './useGifts';
import { useGame } from '../store/useGame';
import { useUi, type Screen, type ZoneId } from '../store/useUi';
import { equippedOf } from '../store/catalog';
import type { AvatarConfig } from '../store/save';
import { player } from '../world/input';

/** 自己的資料（welcome 時放進成員：說話才有氣泡，但不畫在島上） */
export interface SelfInfo {
  nickname: string;
  avatar: AvatarConfig;
}

/** 伺服器的成員資料轉成畫面用的格式 */
const toRemote = (m: MemberState): RemoteMember => ({ id: m.id, nickname: m.nickname, avatar: m.avatar, x: m.x, z: m.z, heading: m.h, zone: m.zone, title: m.title });

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

/** 不在遊戲裡的畫面（不連線） */
const OFFLINE_SCREENS: Screen[] = ['title', 'profiles', 'class', 'teacher'];

/** 即時連線的狀態（畫面顯示用） */
interface RealtimeStore {
  status: 'off' | 'connecting' | 'online' | 'kicked';
  flags: RoomFlags;
  /** 要給孩子看的訊息（被踢下線的原因、說太快了等） */
  notice: string | null;
}

export const useRealtime = create<RealtimeStore>(() => ({ status: 'off', flags: { chatOpen: true, giftsOpen: true }, notice: null }));

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
  let kickedFor: string | null = null;
  let last = { x: NaN, z: NaN, h: NaN, at: 0 };
  let lastZone: ZoneId | null | undefined;

  /** 應該連到哪個帳號；不該連線時回傳 null */
  const wanted = () => {
    const p = useGame.getState().profile();
    if (!p?.cloud || OFFLINE_SCREENS.includes(useUi.getState().screen)) return null;
    const token = getToken(p.cloud.accountId);
    return token ? { profile: p, token, url: wsUrlOf(p.cloud.server) } : null;
  };

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
    if (useRealtime.getState().status !== 'kicked') useRealtime.setState({ status: 'off' });
  };

  const connect = (target: NonNullable<ReturnType<typeof wanted>>) => {
    accountId = target.profile.cloud!.accountId;
    useRealtime.setState({ status: 'connecting', notice: null });
    const ws = new WebSocket(target.url);
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: target.token }));
    ws.onmessage = (ev) => {
      if (socket !== ws) return;
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      const p = useGame.getState().profile();
      const self: SelfInfo = { nickname: p?.name ?? '', avatar: p ? equippedOf(p) : { animal: 'bear', color: '#8b5a2b', hat: null } };
      usePresence.setState((s) => applyServerMessage(s, msg, self, Date.now()));
      switch (msg.t) {
        case 'welcome':
          retry = 0;
          useRealtime.setState({ status: 'online', flags: msg.room });
          last = { x: NaN, z: NaN, h: NaN, at: 0 };
          sendWhere(true);
          void useGifts.getState().load();
          break;
        case 'chat':
          // 對話氣泡時間到就收起來
          setTimeout(() => usePresence.setState((s) => expireBubbles(s, Date.now())), BUBBLE_MS + 50);
          break;
        case 'room':
          useRealtime.setState({ flags: msg.room });
          break;
        case 'profile':
          void useCloud.getState().syncNow();
          break;
        case 'gift':
          void useGifts.getState().load();
          break;
        case 'kicked':
          kickedFor = accountId;
          useRealtime.setState({ status: 'kicked', notice: msg.reason });
          break;
        case 'error':
          useRealtime.setState({ notice: msg.message });
          break;
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      usePresence.getState().clear();
      if (useRealtime.getState().status === 'kicked') return;
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
    if (id !== kickedFor) {
      kickedFor = null;
      if (useRealtime.getState().status === 'kicked') useRealtime.setState({ status: 'off', notice: null });
    }
    if (!target || id === kickedFor) {
      if (socket || accountId) disconnect();
      return;
    }
    if (accountId === id && (socket || retryTimer)) return;
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
