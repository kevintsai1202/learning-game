/**
 * 即時連線中樞：每個房間誰在線上、在哪裡、說了什麼，並把變化廣播給同房間的人。
 * 不碰網路（連線由 server/ws.ts 包成 HubConn 交進來），單元測試用假連線。
 * 規格見 docs/plans/online.md 第 5、6 節與「P2 實作順序」。
 */
import type { ChatLine } from '../src/online/presence';
import type { MemberState, RoomFlags, ServerMessage } from '../src/online/realtime';
import { CHAT_PHRASES } from '../src/ui/lines';
import { equippedOf } from '../src/store/catalog';
import { shownTitle } from '../src/store/badges';
import type { Profile } from '../src/store/save';
import type { ZoneId } from '../src/store/useUi';
import { SPAWN, WALK_RADIUS } from '../src/world/layout';
import type { TokenVia } from './tokens';

/** 一條連線（WebSocket 包起來的介面） */
export interface HubConn {
  send(msg: ServerMessage): void;
  close(code: number, reason: string): void;
}

/** 加入房間需要的資料（ws.ts 驗證權杖後從資料庫讀出來） */
export interface JoinInfo {
  accountId: string;
  roomCode: string;
  nickname: string;
  profile: Profile;
  flags: RoomFlags;
  /** 這條連線的權杖來源：class（用班級代碼登入）或 parent（家長「在這台裝置玩」）；重設密碼只踢 class 的 */
  via: TokenVia;
}

/** 公頻保留幾則 */
const CHAT_KEEP = 30;
/** 說話：最多連發幾則、每隔多久恢復一則（毫秒） */
const SAY_BURST = 3;
const SAY_REFILL_MS = 2500;
/** 踢線用的 WebSocket 關閉代碼（4000 以上是應用程式自訂） */
export const CLOSE_KICKED = 4001;

/** 房間裡的一位成員 */
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
}

/** 一個房間 */
interface Room {
  flags: RoomFlags;
  members: Map<string, Member>;
  chat: ChatLine[];
  nextChatId: number;
}

export class Hub {
  private rooms = new Map<string, Room>();
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  /** 找出某條連線所在的房間與成員 */
  private locate(conn: HubConn): { room: Room; member: Member } | null {
    for (const room of this.rooms.values()) {
      for (const member of room.members.values()) if (member.conn === conn) return { room, member };
    }
    return null;
  }

  /** 送給房間裡的每個人（except 不送） */
  private broadcast(room: Room, msg: ServerMessage, except?: string): void {
    for (const [id, m] of room.members) if (id !== except) m.conn.send(msg);
  }

  /**
   * 加入房間。同一個帳號已經在線上（另一台裝置）時：舊連線收到 kicked 並關閉，新連線沿用舊位置，
   * 其他人收到 member（不是 leave＋join）。
   */
  join(conn: HubConn, info: JoinInfo): void {
    let room = this.rooms.get(info.roomCode);
    if (!room) {
      room = { flags: { ...info.flags }, members: new Map(), chat: [], nextChatId: 1 };
      this.rooms.set(info.roomCode, room);
    }
    const old = room.members.get(info.accountId);
    const state: MemberState = {
      id: info.accountId,
      nickname: info.nickname,
      avatar: equippedOf(info.profile),
      title: shownTitle(info.profile),
      x: old?.state.x ?? SPAWN.x,
      z: old?.state.z ?? SPAWN.z,
      h: old?.state.h ?? Math.PI,
      zone: old?.state.zone ?? null,
    };
    if (old) {
      old.conn.send({ t: 'kicked', reason: '你在另一台裝置登入了' });
      old.conn.close(CLOSE_KICKED, 'replaced');
    }
    room.members.set(info.accountId, { conn, state, dirty: false, sayTokens: SAY_BURST, sayAt: this.now(), via: info.via });
    const others = [...room.members.values()].filter((m) => m.state.id !== info.accountId).map((m) => m.state);
    conn.send({ t: 'welcome', self: info.accountId, room: { ...room.flags }, members: others, chat: [...room.chat] });
    this.broadcast(room, old ? { t: 'member', member: state } : { t: 'join', member: state }, info.accountId);
  }

  /** 連線關閉。已經被新連線取代的舊連線不做事 */
  leave(conn: HubConn): void {
    const found = this.locate(conn);
    if (!found) return;
    const { room, member } = found;
    room.members.delete(member.state.id);
    this.broadcast(room, { t: 'leave', id: member.state.id });
  }

  /** 位置更新：限制在島的圓形範圍內（不做障礙物碰撞，見規格的信任模型）；下次 flush 才廣播 */
  move(conn: HubConn, x: number, z: number, h: number): void {
    const found = this.locate(conn);
    if (!found) return;
    const r = Math.hypot(x, z);
    const k = r > WALK_RADIUS ? WALK_RADIUS / r : 1;
    const s = found.member.state;
    s.x = x * k;
    s.z = z * k;
    s.h = h;
    found.member.dirty = true;
  }

  /** 每 100 毫秒呼叫一次：把有移動的人打包送給整個房間（沒人移動就不送） */
  flush(): void {
    for (const room of this.rooms.values()) {
      const list: [string, number, number, number][] = [];
      for (const m of room.members.values()) {
        if (!m.dirty) continue;
        m.dirty = false;
        list.push([m.state.id, m.state.x, m.state.z, m.state.h]);
      }
      if (list.length) this.broadcast(room, { t: 'moves', list });
    }
  }

  /** 進出建築 */
  where(conn: HubConn, zone: ZoneId | null): void {
    const found = this.locate(conn);
    if (!found) return;
    found.member.state.zone = zone;
    this.broadcast(found.room, { t: 'member', member: found.member.state }, found.member.state.id);
  }

  /** 說一句公頻短句：只收短句清單裡的 id；有頻率限制；老師關閉聊天時不收 */
  say(conn: HubConn, phraseId: string): void {
    const found = this.locate(conn);
    if (!found) return;
    const { room, member } = found;
    const phrase = CHAT_PHRASES.find((p) => p.id === phraseId);
    if (!phrase) return conn.send({ t: 'error', message: '只能說短句盤裡的句子' });
    if (!room.flags.chatOpen) return conn.send({ t: 'error', message: '老師把聊天關起來了' });
    // 額度依經過的時間恢復，最多 SAY_BURST 則
    const t = this.now();
    member.sayTokens = Math.min(SAY_BURST, member.sayTokens + (t - member.sayAt) / SAY_REFILL_MS);
    member.sayAt = t;
    if (member.sayTokens < 1) return conn.send({ t: 'error', message: '說太快了，等一下再說' });
    member.sayTokens -= 1;
    const line: ChatLine = { id: room.nextChatId++, from: member.state.id, nickname: member.state.nickname, text: phrase.text, at: t };
    room.chat = [...room.chat, line].slice(-CHAT_KEEP);
    this.broadcast(room, { t: 'chat', line });
  }

  /** 某位孩子的存檔在伺服器端變了：更新別人看到的外觀與稱號，並通知他自己的裝置同步 */
  profileChanged(accountId: string, rev: number, profile: Profile): void {
    for (const room of this.rooms.values()) {
      const m = room.members.get(accountId);
      if (!m) continue;
      m.state.avatar = equippedOf(profile);
      m.state.title = shownTitle(profile);
      this.broadcast(room, { t: 'member', member: m.state }, accountId);
      m.conn.send({ t: 'profile', rev });
    }
  }

  /** 老師改了房間設定 */
  roomSettings(roomCode: string, flags: RoomFlags): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.flags = { ...flags };
    this.broadcast(room, { t: 'room', room: { ...flags } });
  }

  /**
   * 踢某位孩子下線（老師移除成員或重設密碼、家長刪除角色或讓他退出班級）。
   * 給了 via 就只踢那種來源的連線：重設密碼只撤銷 class 權杖，家長裝置（parent）的連線留著。
   */
  kick(accountId: string, reason: string, via?: TokenVia): void {
    for (const room of this.rooms.values()) {
      const m = room.members.get(accountId);
      if (!m || (via && m.via !== via)) continue;
      m.conn.send({ t: 'kicked', reason });
      m.conn.close(CLOSE_KICKED, 'kicked');
      room.members.delete(accountId);
      this.broadcast(room, { t: 'leave', id: accountId });
    }
  }

  /** 送一則訊息給某位孩子的裝置（他在線上時；例如禮物狀態有變，要他重新讀取） */
  notify(accountId: string, msg: ServerMessage): void {
    for (const room of this.rooms.values()) room.members.get(accountId)?.conn.send(msg);
  }

  /** 某個帳號是否在線上（老師的成員列表用） */
  isOnline(accountId: string): boolean {
    for (const room of this.rooms.values()) if (room.members.has(accountId)) return true;
    return false;
  }
}
