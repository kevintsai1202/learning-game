/**
 * 即時連線中樞：每座島上誰在線上、在哪裡、說了什麼，並把變化廣播給同一座島上的人；
 * 另外把朋友的在線狀態（在線上、在哪座島）送給他的朋友。
 * 不碰網路（連線由 server/ws.ts 包成 HubConn 交進來），單元測試用假連線。
 * 規格見 docs/plans/online.md 第 5、6 節；島與好友見 docs/plans/islands.md（I1）。
 *
 * 島：班級島（id 是 class:<班級代碼>）或某個人自己的島（kid:<帳號 id>）。一條連線同一時間只在一座島上。
 * 全班的通知（班級內容更新、老師改開關）照帳號的班級送，不管他現在在哪座島。
 * 多班級（docs/plans/multi-class.md）：一個孩子可以在好幾個班級，每一班一座班級島；在班級島上顯示那一班的暱稱，
 * 好友名單上的名字照「各自看到的」（同學是共同班級的暱稱，ws.ts 算好放在 FriendSeed）。
 *
 * 熊熊老師（老師 GM 的 G2，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：老師用大人權杖進自己班級的班級島，
 * 成員 id 是每條連線各自的 gm:<流水號>（同一班可以有兩台老師裝置）。老師成員只在 conns 與島的 members 裡，
 * 不在 accounts（不是孩子帳號：不收禮、不算在線上的孩子，kick、leftClass、classmates 都碰不到老師）。
 * 孩子的好友名單每一班有一筆老師（teacher:<代碼>），那一班有老師連線就是線上。
 */
import type { ChatLine } from '../src/online/presence';
import {
  CLOSE_RECONNECT,
  TEACHER_AVATAR,
  TEACHER_NAME,
  teacherFriendId,
  type FriendState,
  type IslandKind,
  type MemberState,
  type RoomFlags,
  type ServerCap,
  type ServerMessage,
} from '../src/online/realtime';
import { CHAT_PHRASES } from '../src/ui/lines';
import { equippedOf } from '../src/store/catalog';
import { shownTitle } from '../src/store/badges';
import type { AvatarConfig, Profile } from '../src/store/save';
import type { ZoneId } from '../src/store/useUi';
import { SPAWN, WALK_RADIUS } from '../src/world/layout';
import { isClassLogin, type TokenVia } from './tokens';

/** 一條連線（WebSocket 包起來的介面） */
export interface HubConn {
  send(msg: ServerMessage): void;
  close(code: number, reason: string): void;
}

/** 好友名單的一位朋友（ws.ts 從資料庫讀出來：有共同班級的同學、兄弟姊妹） */
export interface FriendSeed {
  id: string;
  /** 我看到的他的名字（共同班級的暱稱；只是兄弟姊妹時是角色名字） */
  nickname: string;
  avatar: AvatarConfig;
  /** 他看到的我的名字（同一個共同班級裡我的暱稱）；沒給時用我現在的暱稱 */
  myName?: string;
}

/** 孩子所在的一個班級（多班級）：這一班的暱稱與開關 */
export interface JoinClass {
  code: string;
  /** 班級名稱（好友名單上的老師在好幾班時寫「熊熊老師（班級名稱）」；沒給時當作沒有名稱） */
  name?: string;
  nickname: string;
  /** 這一班的聊天、送禮開關 */
  flags: RoomFlags;
}

/** 上線需要的資料（ws.ts 驗證權杖後從資料庫讀出來） */
export interface JoinInfo {
  accountId: string;
  /** 角色自己的名字（自己的島上用） */
  name: string;
  /** 所在的班級，第一個班級（最早加入的）在前面；家長名下、沒有班級的孩子是空的（只有自己的島） */
  classes: JoinClass[];
  profile: Profile;
  /** 這條連線的權杖來源：class（用班級代碼登入）或 parent（家長「在這台裝置玩」）；重設密碼只踢 class 的 */
  via: TokenVia;
  /** class 權杖是用哪一班的代碼登入的（重設那一班的密碼、離開那一班時只踢這種連線）；家長權杖是 null */
  tokenRoom?: string | null;
  /** 要去的島（沒給是班級島；沒有班級時一律是自己的島） */
  island?: IslandKind;
  /** 要去哪一班的班級島（沒給、或不是成員時是第一個班級） */
  room?: string;
  /** 朋友（有共同班級的同學、兄弟姊妹）；沒給是沒有朋友 */
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
/** 這個伺服器支援的新訊息（welcome 帶給裝置，見 ServerCap） */
const CAPS: ServerCap[] = ['gm'];

/** 老師進島需要的資料（ws.ts 確認是這一班的老師後從資料庫讀出來） */
export interface TeacherJoin {
  /** 班級代碼 */
  room: string;
  /** 班級名稱 */
  name: string;
  /** 這一班的聊天、送禮開關 */
  flags: RoomFlags;
}

/** 線上的一位成員 */
interface Member {
  conn: HubConn;
  /** 孩子或熊熊老師（老師 GM 的 G2） */
  role: 'kid' | 'teacher';
  state: MemberState;
  /** 這 100 毫秒內有沒有移動 */
  dirty: boolean;
  /** 說話的額度（連發上限 SAY_BURST，每 SAY_REFILL_MS 恢復一則） */
  sayTokens: number;
  sayAt: number;
  /** 權杖來源（見 JoinInfo.via）；老師是 null */
  via: TokenVia | null;
  /** class 權杖是用哪一班的代碼登入的；家長權杖是 null */
  tokenRoom: string | null;
  /** 角色自己的名字（自己的島上顯示） */
  name: string;
  /**
   * 他的班級：代碼 → 這一班的暱稱與開關（全班的通知照這個送；開關在回到那一班的班級島、班級島還沒有人時用，
   * 老師改開關時一起更新）。Map 保持加入順序，第一個是第一個班級
   */
  classes: Map<string, { name: string; nickname: string; flags: RoomFlags }>;
  /** 現在在哪座島（島的 id） */
  islandId: string;
  /** 朋友：帳號 id → 我看到的他的名字與外觀（名字照共同班級，外觀在朋友上線後換成他現在的） */
  friends: Map<string, { nickname: string; avatar: AvatarConfig }>;
  /** 朋友看到的我的名字：帳號 id → 名字（還不在對方名單上時，用它加進去） */
  myNames: Map<string, string>;
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
/** 島的 id → 班級代碼（自己的島是 null） */
const codeOf = (islandId: string): string | null => (islandId.startsWith('class:') ? islandId.slice('class:'.length) : null);

export class Hub {
  /** 有人的島（自己的島沒人時拿掉；班級島留著公頻紀錄） */
  private islands = new Map<string, Island>();
  /** 線上的帳號 → 成員 */
  private accounts = new Map<string, Member>();
  /** 連線 → 成員（已經被新連線取代的舊連線不在這裡；老師也在這裡） */
  private conns = new Map<HubConn, Member>();
  /** 每一班有幾台老師裝置在島上（好友名單上的老師是否在線上） */
  private gmCount = new Map<string, number>();
  /** 老師成員 id 的流水號 */
  private gmSeq = 0;
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  /** 送給某座島上的每個人（except 不送） */
  private broadcast(island: Island, msg: ServerMessage, except?: string): void {
    for (const [id, m] of island.members) if (id !== except) m.conn.send(msg);
  }

  /**
   * 這個成員要去的島的 id：班級島要有班級（room 是哪一班；沒給或不是成員時是第一個班級），不然是自己的島
   */
  private islandIdFor(m: Pick<Member, 'classes' | 'state'>, kind: IslandKind, room?: string): string {
    if (kind !== 'class' || !m.classes.size) return ownIsland(m.state.id);
    const code = room !== undefined && m.classes.has(room) ? room : m.classes.keys().next().value!;
    return classIsland(code);
  }

  /** 取得（或建立）一座島：班級島的開關用這位成員記得的那一班的開關 */
  private islandOf(id: string, m: Member): Island {
    let island = this.islands.get(id);
    if (!island) {
      const code = codeOf(id);
      const flags = code !== null ? (m.classes.get(code)?.flags ?? OWN_ISLAND_FLAGS) : OWN_ISLAND_FLAGS;
      island = { flags: { ...flags }, members: new Map(), chat: [], nextChatId: 1 };
      this.islands.set(id, island);
    }
    return island;
  }

  /**
   * 把成員放上一座島：送 welcome 給他、join（或 member）給島上其他人。
   * 島上顯示的名字：班級島用那一班的暱稱，自己的島用角色的名字（多班級）
   */
  private enter(m: Member, islandId: string, replaced: boolean): void {
    const island = this.islandOf(islandId, m);
    const code = codeOf(islandId);
    m.islandId = islandId;
    m.state.nickname = code !== null ? (m.classes.get(code)?.nickname ?? m.name) : m.name;
    island.members.set(m.state.id, m);
    const others = [...island.members.values()].filter((x) => x !== m).map((x) => x.state);
    m.conn.send({ t: 'welcome', self: m.state.id, island: kindOf(islandId), classCode: code, room: { ...island.flags }, members: others, chat: [...island.chat], caps: CAPS });
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

  /** 某位孩子的好友名單上，某一班的老師：只在一班時叫熊熊老師，好幾班時寫上班級名稱；那一班有老師裝置在島上就是線上 */
  private teacherFriendOf(kid: Member, code: string): FriendState {
    const className = kid.classes.get(code)?.name;
    const name = kid.classes.size > 1 && className ? `${TEACHER_NAME}（${className}）` : TEACHER_NAME;
    const online = (this.gmCount.get(code) ?? 0) > 0;
    return { id: teacherFriendId(code), nickname: name, avatar: TEACHER_AVATAR, online, island: online ? 'class' : null };
  }

  /** 某一班的老師上線或離線：那一班線上的孩子（不管在哪座島）收到 friend */
  private tellClassAboutTeacher(code: string): void {
    for (const kid of this.classmates(code)) kid.conn.send({ t: 'friend', friend: this.teacherFriendOf(kid, code) });
  }

  /** 把一則好友狀態送給這位成員線上的朋友：名字照每位朋友看到的（他名單上記的名字） */
  private tellFriends(m: Member, friend: FriendState): void {
    for (const id of m.friends.keys()) {
      const f = this.accounts.get(id);
      if (f) f.conn.send({ t: 'friend', friend: { ...friend, nickname: f.friends.get(m.state.id)?.nickname ?? friend.nickname } });
    }
  }

  /**
   * 上線。同一個帳號已經在線上（另一台裝置）時：舊連線收到 kicked 並關閉；
   * 新連線去同一座島就沿用舊位置（其他人收到 member，不是 leave＋join），去別座島就從出生點開始。
   * 之後送完整的好友名單給他，並告訴他線上的朋友（朋友的名單裡沒有他就加進去，例如新加入的同學）。
   */
  join(conn: HubConn, info: JoinInfo): void {
    const old = this.accounts.get(info.accountId);
    const seeds = (info.friends ?? []).filter((f) => f.id !== info.accountId);
    const m: Member = {
      conn,
      role: 'kid',
      state: {
        id: info.accountId,
        nickname: info.name,
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
      tokenRoom: info.tokenRoom ?? null,
      name: info.name,
      classes: new Map(info.classes.map((c) => [c.code, { name: c.name ?? '', nickname: c.nickname, flags: { ...c.flags } }])),
      islandId: '',
      friends: new Map(seeds.map((f) => [f.id, { nickname: f.nickname, avatar: f.avatar }])),
      myNames: new Map(seeds.filter((f) => f.myName !== undefined).map((f) => [f.id, f.myName!])),
    };
    const islandId = this.islandIdFor(m, info.island ?? 'class', info.room);
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

    // 完整的好友名單：名字照我看到的（共同班級的暱稱）；線上的朋友用他現在的外觀與所在的島；最後是每一班的熊熊老師
    const list: FriendState[] = [...m.friends].map(([id, seed]) => {
      const f = this.accounts.get(id);
      return f ? { ...this.friendStateOf(f), nickname: seed.nickname } : { id, nickname: seed.nickname, avatar: seed.avatar, online: false, island: null };
    });
    for (const code of m.classes.keys()) list.push(this.teacherFriendOf(m, code));
    conn.send({ t: 'friends', list });
    // 朋友關係是雙向的：線上的朋友名單裡沒有他就加進去（名字用他看到的我的名字）
    const me = this.friendStateOf(m);
    for (const id of m.friends.keys()) {
      const f = this.accounts.get(id);
      if (!f) continue;
      const name = f.friends.get(m.state.id)?.nickname ?? m.myNames.get(f.state.id) ?? me.nickname;
      f.friends.set(m.state.id, { nickname: name, avatar: me.avatar });
      f.conn.send({ t: 'friend', friend: { ...me, nickname: name } });
    }
  }

  /**
   * 熊熊老師進島（老師 GM 的 G2）：每條連線是一位新的熊熊老師（gm:<流水號>），直接進那一班的班級島。
   * 這一班第一台老師裝置進島時，班上線上的孩子收到好友名單上的老師上線
   */
  joinTeacher(conn: HubConn, info: TeacherJoin): void {
    const m: Member = {
      conn,
      role: 'teacher',
      state: { id: `gm:${++this.gmSeq}`, nickname: TEACHER_NAME, avatar: TEACHER_AVATAR, title: null, x: SPAWN.x, z: SPAWN.z, h: Math.PI, zone: null, role: 'teacher' },
      dirty: false,
      sayTokens: 0,
      sayAt: this.now(),
      via: null,
      tokenRoom: null,
      name: TEACHER_NAME,
      classes: new Map([[info.room, { name: info.name, nickname: TEACHER_NAME, flags: { ...info.flags } }]]),
      islandId: '',
      friends: new Map(),
      myNames: new Map(),
    };
    this.conns.set(conn, m);
    this.enter(m, classIsland(info.room), false);
    const count = (this.gmCount.get(info.room) ?? 0) + 1;
    this.gmCount.set(info.room, count);
    if (count === 1) this.tellClassAboutTeacher(info.room);
  }

  /** 連線關閉：離開所在的島，朋友收到下線。已經被新連線取代的舊連線不做事 */
  leave(conn: HubConn): void {
    const m = this.conns.get(conn);
    if (!m) return;
    this.remove(m);
  }

  /** 讓一位成員下線（連線關閉、被踢） */
  private remove(m: Member): void {
    if (m.role === 'teacher') return this.removeTeacher(m);
    this.exit(m);
    this.conns.delete(m.conn);
    this.accounts.delete(m.state.id);
    this.tellFriends(m, { id: m.state.id, nickname: m.state.nickname, avatar: m.state.avatar, online: false, island: null });
  }

  /** 熊熊老師離開：離開班級島；這一班最後一台老師裝置離開時，班上線上的孩子收到老師離線 */
  private removeTeacher(m: Member): void {
    this.exit(m);
    this.conns.delete(m.conn);
    const code = codeOf(m.islandId)!;
    const count = (this.gmCount.get(code) ?? 1) - 1;
    if (count > 0) this.gmCount.set(code, count);
    else {
      this.gmCount.delete(code);
      this.tellClassAboutTeacher(code);
    }
  }

  /**
   * 換島（不斷線）：離開原本的島、從新的島的出生點開始，朋友收到他在哪座島。
   * 要去班級島但沒有班級時去自己的島；room 是哪一班的班級島（沒給或不是成員時是第一個班級）；已經在那座島上就不做事。
   */
  goTo(conn: HubConn, kind: IslandKind, room?: string): void {
    const m = this.conns.get(conn);
    // 熊熊老師只在自己班級的班級島（去孩子的島要等島嶼互訪 I2）
    if (!m || m.role === 'teacher') return;
    const islandId = this.islandIdFor(m, kind, room);
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
    if (!m || m.role === 'teacher') return;
    m.state.zone = zone;
    const island = this.islands.get(m.islandId);
    if (island) this.broadcast(island, { t: 'member', member: m.state }, m.state.id);
  }

  /** 說一句公頻短句：只收短句清單裡的 id；有頻率限制；島上關閉聊天時不收 */
  say(conn: HubConn, phraseId: string): void {
    const m = this.conns.get(conn);
    const island = m && this.islands.get(m.islandId);
    // 熊熊老師不說短句（用全班公告）
    if (!m || !island || m.role === 'teacher') return;
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

  /** 班上線上的每個人（不管在哪座島；多班級：只要是這一班的成員） */
  private classmates(roomCode: string): Member[] {
    return [...this.accounts.values()].filter((m) => m.classes.has(roomCode));
  }

  /** 老師改了班級的開關：更新這一班的班級島，島上的人收到 room；在別座島的同學回這一班的班級島時拿到新的 */
  roomSettings(roomCode: string, flags: RoomFlags): void {
    for (const m of this.classmates(roomCode)) m.classes.get(roomCode)!.flags = { ...flags };
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
   * 踢某位孩子下線（刪除角色、老師重設密碼）。
   * 給了 via 就只踢那種來源的連線：重設密碼只撤銷 class 權杖，家長裝置（parent）的連線留著；
   * 再給 room 就只踢用那一班代碼登入的連線（多班級：重設某一班的密碼不影響用別班代碼登入的平板）。
   */
  kick(accountId: string, reason: string, via?: TokenVia, room?: string): void {
    const m = this.accounts.get(accountId);
    if (!m || (via && m.via !== via) || (room !== undefined && m.tokenRoom !== room)) return;
    m.conn.send({ t: 'kicked', reason });
    m.conn.close(CLOSE_KICKED, 'kicked');
    this.remove(m);
  }

  /**
   * 某位孩子離開了某一班（老師移出、家長讓他退出；多班級）：用那一班代碼登入的連線踢下線（那張權杖已經撤銷）；
   * 其他連線（家長裝置、用別班代碼登入的）先收到提示，再以 4005 重新上線，拿新的班級與朋友（不封鎖）
   */
  leftClass(accountId: string, room: string, reason: string): void {
    const m = this.accounts.get(accountId);
    if (!m) return;
    if (m.via && isClassLogin(m.via) && m.tokenRoom === room) return this.kick(accountId, reason);
    m.conn.send({ t: 'notice', message: reason });
    this.reconnect(accountId);
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

  /**
   * 某個帳號在哪裡（老師的成員表用）：哪一種島＋建築；離線是 null。
   * room 是老師看的那一班：在別班的班級島時是 otherClass（不寫是哪一班）；沒給時任何班級島都算 class
   */
  whereOf(accountId: string, room?: string): { island: IslandKind | 'otherClass'; zone: ZoneId | null } | null {
    const m = this.accounts.get(accountId);
    if (!m) return null;
    const code = codeOf(m.islandId);
    const island = code === null ? 'own' : room === undefined || code === room ? 'class' : 'otherClass';
    return { island, zone: m.state.zone };
  }
}
