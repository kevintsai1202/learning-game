/**
 * 即時連線中樞：每座島上誰在線上、在哪裡、說了什麼，並把變化廣播給同一座島上的人；
 * 另外把朋友的在線狀態（在線上、在哪座島）送給他的朋友。
 * 不碰網路（連線由 server/ws.ts 包成 HubConn 交進來），單元測試用假連線。
 * 規格見 docs/plans/online.md 第 5、6 節；島與好友見 docs/plans/islands.md（I1）。
 *
 * 島：班級島（id 是 class:<班級代碼>）或某個人自己的島（kid:<帳號 id>）。一條連線同一時間只在一座島上。
 * 全班的通知（班級內容更新、老師改開關）照帳號的班級送，不管他現在在哪座島。
 */
import type { ChatLine } from '../src/online/presence';
import { CLOSE_RECONNECT, type FriendState, type IslandKind, type MemberState, type RoomFlags, type ServerMessage } from '../src/online/realtime';
import { CHAT_PHRASES } from '../src/ui/lines';
import { equippedOf } from '../src/store/catalog';
import { shownTitle } from '../src/store/badges';
import type { AvatarConfig, Profile } from '../src/store/save';
import type { ZoneId } from '../src/store/useUi';
import { SPAWN, WALK_RADIUS } from '../src/world/layout';
import type { TokenVia } from './tokens';

/** 一條連線（WebSocket 包起來的介面） */
export interface HubConn {
  send(msg: ServerMessage): void;
  close(code: number, reason: string): void;
}

/** 好友名單的一位朋友（ws.ts 從資料庫讀出來：同班同學、兄弟姊妹） */
export interface FriendSeed {
  id: string;
  nickname: string;
  avatar: AvatarConfig;
}

/** 上線需要的資料（ws.ts 驗證權杖後從資料庫讀出來） */
export interface JoinInfo {
  accountId: string;
  /** 班級代碼；家長名下、沒有班級的孩子是 null（只有自己的島） */
  roomCode: string | null;
  nickname: string;
  profile: Profile;
  /** 班級的聊天、送禮開關（沒有班級時不會用到） */
  flags: RoomFlags;
  /** 這條連線的權杖來源：class（用班級代碼登入）或 parent（家長「在這台裝置玩」）；重設密碼只踢 class 的 */
  via: TokenVia;
  /** 要去的島（沒給是班級島；沒有班級時一律是自己的島） */
  island?: IslandKind;
  /** 朋友（同班同學、兄弟姊妹）；沒給是沒有朋友 */
  friends?: FriendSeed[];
}

/** 公頻保留幾則 */
const CHAT_KEEP = 30;
/** 說話：最多連發幾則、每隔多久恢復一則（毫秒） */
const SAY_BURST = 3;
const SAY_REFILL_MS = 2500;
/** 踢線用的 WebSocket 關閉代碼（4000 以上是應用程式自訂） */
export const CLOSE_KICKED = 4001;
/** 自己的島的開關：I1 島上只有自己，不能聊天、送禮（I2 開放朋友來玩時再依家長設定） */
const OWN_ISLAND_FLAGS: RoomFlags = { chatOpen: false, giftsOpen: false };

/** 線上的一位成員 */
interface Member {
  conn: HubConn;
  state: MemberState;
  /** 這 100 毫秒內有沒有移動 */
  dirty: boolean;
  /** 說話的額度（連發上限 SAY_BURST，每 SAY_REFILL_MS 恢復一則） */
  sayTokens: number;
  sayAt: number;
  /** 權杖來源（見 JoinInfo.via） */
  via: TokenVia;
  /** 他的班級（全班的通知照這個送）；沒有班級是 null */
  roomCode: string | null;
  /** 班級的開關（回到班級島、班級島還沒有人時用；老師改開關時一起更新） */
  classFlags: RoomFlags;
  /** 現在在哪座島（島的 id） */
  islandId: string;
  /** 朋友：帳號 id → 名單上顯示的暱稱與外觀（朋友上線後換成他現在的） */
  friends: Map<string, { nickname: string; avatar: AvatarConfig }>;
}

/** 一座島 */
interface Island {
  flags: RoomFlags;
  members: Map<string, Member>;
  chat: ChatLine[];
  nextChatId: number;
}

/** 班級島的 id */
const classIsland = (code: string) => `class:${code}`;
/** 某個人自己的島的 id */
const ownIsland = (accountId: string) => `kid:${accountId}`;
/** 島的 id → 種類 */
const kindOf = (islandId: string): IslandKind => (islandId.startsWith('class:') ? 'class' : 'own');

export class Hub {
  /** 有人的島（自己的島沒人時拿掉；班級島留著公頻紀錄） */
  private islands = new Map<string, Island>();
  /** 線上的帳號 → 成員 */
  private accounts = new Map<string, Member>();
  /** 連線 → 成員（已經被新連線取代的舊連線不在這裡） */
  private conns = new Map<HubConn, Member>();
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  /** 送給某座島上的每個人（except 不送） */
  private broadcast(island: Island, msg: ServerMessage, except?: string): void {
    for (const [id, m] of island.members) if (id !== except) m.conn.send(msg);
  }

  /** 這個成員要去的島的 id：班級島要有班級，不然是自己的島 */
  private islandIdFor(m: Pick<Member, 'roomCode' | 'state'>, kind: IslandKind): string {
    return kind === 'class' && m.roomCode ? classIsland(m.roomCode) : ownIsland(m.state.id);
  }

  /** 取得（或建立）一座島 */
  private islandOf(id: string, m: Member): Island {
    let island = this.islands.get(id);
    if (!island) {
      island = { flags: kindOf(id) === 'class' ? { ...m.classFlags } : { ...OWN_ISLAND_FLAGS }, members: new Map(), chat: [], nextChatId: 1 };
      this.islands.set(id, island);
    }
    return island;
  }

  /** 把成員放上一座島：送 welcome 給他、join（或 member）給島上其他人 */
  private enter(m: Member, islandId: string, replaced: boolean): void {
    const island = this.islandOf(islandId, m);
    m.islandId = islandId;
    island.members.set(m.state.id, m);
    const others = [...island.members.values()].filter((x) => x !== m).map((x) => x.state);
    m.conn.send({ t: 'welcome', self: m.state.id, island: kindOf(islandId), room: { ...island.flags }, members: others, chat: [...island.chat] });
    this.broadcast(island, replaced ? { t: 'member', member: m.state } : { t: 'join', member: m.state }, m.state.id);
  }

  /** 把成員從他所在的島拿下來：島上其他人收到 leave（notifyLeave 為 false 時不送，例如同一座島換連線） */
  private exit(m: Member, notifyLeave = true): void {
    const island = this.islands.get(m.islandId);
    if (!island || island.members.get(m.state.id) !== m) return;
    island.members.delete(m.state.id);
    if (notifyLeave) this.broadcast(island, { t: 'leave', id: m.state.id });
    if (kindOf(m.islandId) === 'own' && island.members.size === 0) this.islands.delete(m.islandId);
  }

  /** 這位成員在好友名單上的樣子（線上） */
  private friendStateOf(m: Member): FriendState {
    return { id: m.state.id, nickname: m.state.nickname, avatar: m.state.avatar, online: true, island: kindOf(m.islandId) };
  }

  /** 把一則好友狀態送給這位成員線上的朋友 */
  private tellFriends(m: Member, friend: FriendState): void {
    for (const id of m.friends.keys()) this.accounts.get(id)?.conn.send({ t: 'friend', friend });
  }

  /**
   * 上線。同一個帳號已經在線上（另一台裝置）時：舊連線收到 kicked 並關閉；
   * 新連線去同一座島就沿用舊位置（其他人收到 member，不是 leave＋join），去別座島就從出生點開始。
   * 之後送完整的好友名單給他，並告訴他線上的朋友（朋友的名單裡沒有他就加進去，例如新加入的同學）。
   */
  join(conn: HubConn, info: JoinInfo): void {
    const old = this.accounts.get(info.accountId);
    const m: Member = {
      conn,
      state: {
        id: info.accountId,
        nickname: info.nickname,
        avatar: equippedOf(info.profile),
        title: shownTitle(info.profile),
        x: SPAWN.x,
        z: SPAWN.z,
        h: Math.PI,
        zone: null,
      },
      dirty: false,
      sayTokens: SAY_BURST,
      sayAt: this.now(),
      via: info.via,
      roomCode: info.roomCode,
      classFlags: { ...info.flags },
      islandId: '',
      friends: new Map((info.friends ?? []).filter((f) => f.id !== info.accountId).map((f) => [f.id, { nickname: f.nickname, avatar: f.avatar }])),
    };
    const islandId = this.islandIdFor(m, info.island ?? 'class');
    const sameIsland = old?.islandId === islandId;
    if (old) {
      if (sameIsland) Object.assign(m.state, { x: old.state.x, z: old.state.z, h: old.state.h, zone: old.state.zone });
      this.exit(old, !sameIsland);
      this.conns.delete(old.conn);
      old.conn.send({ t: 'kicked', reason: '你在另一台裝置登入了' });
      old.conn.close(CLOSE_KICKED, 'replaced');
    }
    this.accounts.set(m.state.id, m);
    this.conns.set(conn, m);
    this.enter(m, islandId, sameIsland);

    // 完整的好友名單：線上的朋友用他現在的暱稱、外觀與所在的島
    const list: FriendState[] = [...m.friends].map(([id, seed]) => {
      const f = this.accounts.get(id);
      return f ? this.friendStateOf(f) : { id, nickname: seed.nickname, avatar: seed.avatar, online: false, island: null };
    });
    conn.send({ t: 'friends', list });
    // 朋友關係是雙向的：線上的朋友名單裡沒有他就加進去
    const me = this.friendStateOf(m);
    for (const id of m.friends.keys()) {
      const f = this.accounts.get(id);
      if (!f) continue;
      f.friends.set(m.state.id, { nickname: me.nickname, avatar: me.avatar });
      f.conn.send({ t: 'friend', friend: me });
    }
  }

  /** 連線關閉：離開所在的島，朋友收到下線。已經被新連線取代的舊連線不做事 */
  leave(conn: HubConn): void {
    const m = this.conns.get(conn);
    if (!m) return;
    this.remove(m);
  }

  /** 讓一位成員下線（連線關閉、被踢） */
  private remove(m: Member): void {
    this.exit(m);
    this.conns.delete(m.conn);
    this.accounts.delete(m.state.id);
    this.tellFriends(m, { id: m.state.id, nickname: m.state.nickname, avatar: m.state.avatar, online: false, island: null });
  }

  /**
   * 換島（不斷線）：離開原本的島、從新的島的出生點開始，朋友收到他在哪座島。
   * 要去班級島但沒有班級時去自己的島；已經在那座島上就不做事。
   */
  goTo(conn: HubConn, kind: IslandKind): void {
    const m = this.conns.get(conn);
    if (!m) return;
    const islandId = this.islandIdFor(m, kind);
    if (islandId === m.islandId) return;
    this.exit(m);
    Object.assign(m.state, { x: SPAWN.x, z: SPAWN.z, h: Math.PI, zone: null });
    m.dirty = false;
    this.enter(m, islandId, false);
    this.tellFriends(m, this.friendStateOf(m));
  }

  /** 位置更新：限制在島的圓形範圍內（不做障礙物碰撞，見規格的信任模型）；下次 flush 才廣播 */
  move(conn: HubConn, x: number, z: number, h: number): void {
    const m = this.conns.get(conn);
    if (!m) return;
    const r = Math.hypot(x, z);
    const k = r > WALK_RADIUS ? WALK_RADIUS / r : 1;
    m.state.x = x * k;
    m.state.z = z * k;
    m.state.h = h;
    m.dirty = true;
  }

  /** 每 100 毫秒呼叫一次：把有移動的人打包送給同一座島上的人（沒人移動就不送） */
  flush(): void {
    for (const island of this.islands.values()) {
      const list: [string, number, number, number][] = [];
      for (const m of island.members.values()) {
        if (!m.dirty) continue;
        m.dirty = false;
        list.push([m.state.id, m.state.x, m.state.z, m.state.h]);
      }
      if (list.length) this.broadcast(island, { t: 'moves', list });
    }
  }

  /** 進出建築：只告訴同一座島上的人（朋友名單不顯示建築） */
  where(conn: HubConn, zone: ZoneId | null): void {
    const m = this.conns.get(conn);
    if (!m) return;
    m.state.zone = zone;
    const island = this.islands.get(m.islandId);
    if (island) this.broadcast(island, { t: 'member', member: m.state }, m.state.id);
  }

  /** 說一句公頻短句：只收短句清單裡的 id；有頻率限制；島上關閉聊天時不收 */
  say(conn: HubConn, phraseId: string): void {
    const m = this.conns.get(conn);
    const island = m && this.islands.get(m.islandId);
    if (!m || !island) return;
    const phrase = CHAT_PHRASES.find((p) => p.id === phraseId);
    if (!phrase) return conn.send({ t: 'error', message: '只能說短句盤裡的句子' });
    if (!island.flags.chatOpen) return conn.send({ t: 'error', message: kindOf(m.islandId) === 'class' ? '老師把聊天關起來了' : '這裡不能聊天' });
    // 額度依經過的時間恢復，最多 SAY_BURST 則
    const t = this.now();
    m.sayTokens = Math.min(SAY_BURST, m.sayTokens + (t - m.sayAt) / SAY_REFILL_MS);
    m.sayAt = t;
    if (m.sayTokens < 1) return conn.send({ t: 'error', message: '說太快了，等一下再說' });
    m.sayTokens -= 1;
    const line: ChatLine = { id: island.nextChatId++, from: m.state.id, nickname: m.state.nickname, text: phrase.text, at: t };
    island.chat = [...island.chat, line].slice(-CHAT_KEEP);
    this.broadcast(island, { t: 'chat', line });
  }

  /** 某位孩子的存檔在伺服器端變了：更新別人看到的外觀與稱號（同島的人與朋友），並通知他自己的裝置同步 */
  profileChanged(accountId: string, rev: number, profile: Profile): void {
    const m = this.accounts.get(accountId);
    if (!m) return;
    m.state.avatar = equippedOf(profile);
    m.state.title = shownTitle(profile);
    const island = this.islands.get(m.islandId);
    if (island) this.broadcast(island, { t: 'member', member: m.state }, accountId);
    m.conn.send({ t: 'profile', rev });
    this.tellFriends(m, this.friendStateOf(m));
  }

  /** 班上線上的每個人（不管在哪座島） */
  private classmates(roomCode: string): Member[] {
    return [...this.accounts.values()].filter((m) => m.roomCode === roomCode);
  }

  /** 老師改了班級的開關：更新班級島，班級島上的人收到 room；在別座島的同學回班級島時拿到新的 */
  roomSettings(roomCode: string, flags: RoomFlags): void {
    for (const m of this.classmates(roomCode)) m.classFlags = { ...flags };
    const island = this.islands.get(classIsland(roomCode));
    if (!island) return;
    island.flags = { ...flags };
    this.broadcast(island, { t: 'room', room: { ...flags } });
  }

  /** 老師改了班級內容（班級教材版本、班級名稱）：班上線上的孩子都收到 content（在自己島上的也是），重新同步 */
  roomContent(roomCode: string): void {
    for (const m of this.classmates(roomCode)) m.conn.send({ t: 'content' });
  }

  /**
   * 踢某位孩子下線（老師移除成員或重設密碼、家長刪除角色或讓他退出班級）。
   * 給了 via 就只踢那種來源的連線：重設密碼只撤銷 class 權杖，家長裝置（parent）的連線留著。
   */
  kick(accountId: string, reason: string, via?: TokenVia): void {
    const m = this.accounts.get(accountId);
    if (!m || (via && m.via !== via)) return;
    m.conn.send({ t: 'kicked', reason });
    m.conn.close(CLOSE_KICKED, 'kicked');
    this.remove(m);
  }

  /** 某個帳號換了班級（家長掃 QR code 讓孩子加入班級）：連線以 4005 關閉，裝置重新上線時拿到新的班級與朋友 */
  reconnect(accountId: string): void {
    const m = this.accounts.get(accountId);
    if (!m) return;
    m.conn.close(CLOSE_RECONNECT, 'class changed');
    this.remove(m);
  }

  /** 送一則訊息給某位孩子的裝置（他在線上時；例如禮物狀態有變，要他重新讀取） */
  notify(accountId: string, msg: ServerMessage): void {
    this.accounts.get(accountId)?.conn.send(msg);
  }

  /** 某個帳號是否在線上 */
  isOnline(accountId: string): boolean {
    return this.accounts.has(accountId);
  }

  /** 某個帳號在哪裡（老師的成員表用）：哪一種島＋建築；離線是 null */
  whereOf(accountId: string): { island: IslandKind; zone: ZoneId | null } | null {
    const m = this.accounts.get(accountId);
    return m ? { island: kindOf(m.islandId), zone: m.state.zone } : null;
  }
}
