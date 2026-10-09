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
 *
 * 去朋友的島（島嶼互訪 I2，docs/plans/islands.md 第 12 節 I2 實作設計）：島主在自己的島上開放，朋友（同學、兄弟姊妹）
 * 才能去；一座島最多 8 個孩子（熊熊老師不算）。島主離開自己的島（換島、斷線、被踢）時，訪客收到 visitEnded 回自己的島，
 * 島上的熊熊老師回班級島；在第二台裝置登入同一座島不算離開。自己的島有第二個人時才開聊天。
 * 熊熊老師可以去班上孩子的島（不用開放），班級代碼記在成員上（room），公告、斷線照樣找得到班級。
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
import { summonSpots } from '../src/online/summon';
import { equippedOf } from '../src/store/catalog';
import { shownTitle } from '../src/store/badges';
import type { AvatarConfig, Profile } from '../src/store/save';
import type { ZoneId } from '../src/store/useUi';
import type { PuzzleGameId } from '../src/store/puzzle';
import type { DuelDeclineReason, DuelMoveKind } from '../src/engine/puzzle/duelMoves';
import { SPAWN, TEACHER_POS, WALK_RADIUS } from '../src/world/layout';
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
  /** 有共同班級（不是只有兄弟姊妹關係）：在朋友的島上可以送禮 */
  classmate?: boolean;
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
/** 一座自己的島最多幾個孩子（島主＋訪客；熊熊老師不算） */
const MAX_ISLAND_KIDS = 8;
/** 熊熊老師的公告：每條連線至少隔多久（毫秒） */
const ANNOUNCE_GAP_MS = 10_000;
/** 這個伺服器支援的新訊息（welcome 帶給裝置，見 ServerCap） */
const CAPS: ServerCap[] = ['gm', 'duel'];
/** 一局對戰最多轉送幾則動作（島嶼互訪 I4；正常一局不到 200 則） */
const DUEL_MAX_MOVES = 2000;

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
  /** 熊熊老師上一則公告的時間（孩子用不到） */
  announceAt: number;
  /** 在做什麼（老師 GM 的 G3）：孩子回報的活動名稱，只給老師的成員表；沒在做什麼是 null */
  doing: string | null;
  /** 熊熊老師的班級代碼（孩子是 null）：老師去孩子的島時也找得到班級 */
  room: string | null;
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
  /** 朋友：帳號 id → 我看到的他的名字與外觀（名字照共同班級，外觀在朋友上線後換成他現在的）、有沒有共同班級 */
  friends: Map<string, { nickname: string; avatar: AvatarConfig; classmate?: boolean }>;
  /** 朋友看到的我的名字：帳號 id → 名字（還不在對方名單上時，用它加進去） */
  myNames: Map<string, string>;
  /** 正在進行的益智對戰（島嶼互訪 I4；只放記憶體） */
  duel: Duel | null;
  /** 送出、對方還沒回覆的對戰邀請（同時只有一個） */
  invite: PendingInvite | null;
}

/** 一局和朋友的益智對戰（島嶼互訪 I4）：a 是邀請的人（先手）；伺服器只轉送動作，不懂遊戲規則 */
interface Duel {
  id: string;
  a: Member;
  b: Member;
  /** 已經轉送幾則動作 */
  moves: number;
}

/** 送出、還沒回覆的對戰邀請：邀請誰、這一局的遊戲、難度、種子與指紋 */
interface PendingInvite {
  to: Member;
  game: PuzzleGameId;
  level: 1 | 2 | 3;
  seed: number;
  check: string;
}

/** 一座島 */
interface Island {
  flags: RoomFlags;
  members: Map<string, Member>;
  chat: ChatLine[];
  nextChatId: number;
  /** 自己的島：島主有沒有開放（島嶼互訪 I2；只放記憶體） */
  open: boolean;
}

/** 班級島的 id */
const classIsland = (code: string) => `class:${code}`;
/** 某個人自己的島的 id */
const ownIsland = (accountId: string) => `kid:${accountId}`;
/** 島的 id → 種類 */
const kindOf = (islandId: string): IslandKind => (islandId.startsWith('class:') ? 'class' : 'own');
/** 島的 id → 班級代碼（自己的島是 null） */
const codeOf = (islandId: string): string | null => (islandId.startsWith('class:') ? islandId.slice('class:'.length) : null);
/** 島的 id → 島主的帳號 id（班級島是 null） */
const ownerOf = (islandId: string): string | null => (islandId.startsWith('kid:') ? islandId.slice('kid:'.length) : null);

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
  /** 對戰 id 的流水號 */
  private duelSeq = 0;
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
      island = { flags: { ...flags }, members: new Map(), chat: [], nextChatId: 1, open: false };
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
    this.updateOwnFlags(island, islandId, m.state.id);
    const others = [...island.members.values()].filter((x) => x !== m).map((x) => x.state);
    const owner = ownerOf(islandId);
    const host = owner && owner !== m.state.id ? { id: owner, name: this.hostNameFor(m, owner) } : undefined;
    m.conn.send({
      t: 'welcome',
      self: m.state.id,
      island: kindOf(islandId),
      classCode: code,
      room: { ...island.flags },
      members: others,
      chat: [...island.chat],
      caps: CAPS,
      ...(host ? { host } : {}),
    });
    this.broadcast(island, replaced ? { t: 'member', member: m.state } : { t: 'join', member: m.state }, m.state.id);
  }

  /** 把成員從他所在的島拿下來：島上其他人收到 leave（notifyLeave 為 false 時不送，例如同一座島換連線） */
  private exit(m: Member, notifyLeave = true): void {
    // 離開這座島（換島、斷線、另一台裝置登入）：對戰結束、邀請作廢
    this.dropDuel(m);
    const island = this.islands.get(m.islandId);
    if (!island || island.members.get(m.state.id) !== m) return;
    island.members.delete(m.state.id);
    if (notifyLeave) this.broadcast(island, { t: 'leave', id: m.state.id });
    if (kindOf(m.islandId) === 'own' && island.members.size === 0) this.islands.delete(m.islandId);
    else this.updateOwnFlags(island, m.islandId);
  }

  /**
   * 自己的島的聊天與送禮開關（島嶼互訪 I2）：有第二個人（訪客或熊熊老師）時開，只剩一個人時關；變了就通知島上的人
   * （except 是剛進來的人，他從 welcome 拿到）。送禮能不能送由送禮 API 判斷（要有共同班級、老師開放送禮）
   */
  private updateOwnFlags(island: Island, islandId: string, except?: string): void {
    if (kindOf(islandId) !== 'own') return;
    const on = island.members.size > 1;
    if (island.flags.chatOpen === on && island.flags.giftsOpen === on) return;
    island.flags = { chatOpen: on, giftsOpen: on };
    this.broadcast(island, { t: 'room', room: { ...island.flags } }, except);
  }

  /** viewer 看到的島主名字：朋友名單上的名字；島主是自己時是自己的名字；熊熊老師看到的是那一班的暱稱；不認識是空字串 */
  private hostNameFor(viewer: Member, ownerId: string): string {
    if (viewer.state.id === ownerId) return viewer.name;
    const owner = this.accounts.get(ownerId);
    if (viewer.role === 'teacher') return (viewer.room && owner?.classes.get(viewer.room)?.nickname) ?? owner?.name ?? '';
    return viewer.friends.get(ownerId)?.nickname ?? '';
  }

  /**
   * 換到另一座島（不斷線）：離開原本的島（離開自己的島時先送走訪客）、從那座島的上岸處開始，孩子的朋友收到他在哪裡。
   * 熊熊老師回班級島時站回廣場上 NPC 的位置
   */
  private moveTo(m: Member, islandId: string): void {
    if (islandId === m.islandId) return;
    if (m.role === 'kid' && m.islandId === ownIsland(m.state.id)) this.closeOwnIsland(m);
    this.exit(m);
    const back = m.role === 'teacher' && codeOf(islandId) !== null;
    Object.assign(m.state, back ? { x: TEACHER_POS.x, z: TEACHER_POS.z, h: 0 } : { x: SPAWN.x, z: SPAWN.z, h: Math.PI }, { zone: null });
    m.dirty = false;
    this.enter(m, islandId, false);
    if (m.role === 'kid') this.tellFriends(m);
  }

  /**
   * 島主離開自己的島（換島、斷線、被踢）：島關閉，訪客收到 visitEnded（closed）回自己的島，熊熊老師回班級島
   */
  private closeOwnIsland(host: Member): void {
    const island = this.islands.get(ownIsland(host.state.id));
    if (!island) return;
    island.open = false;
    for (const v of [...island.members.values()]) {
      if (v === host) continue;
      if (v.role === 'teacher') this.moveTo(v, classIsland(v.room!));
      else {
        v.conn.send({ t: 'visitEnded', reason: 'closed', host: this.hostNameFor(v, host.state.id) });
        this.moveTo(v, ownIsland(v.state.id));
      }
    }
  }

  /**
   * 這位成員在 viewer 的好友名單上的樣子（線上）：在自己的島而且開放中時 open；在別人的島上時 host（viewer 認識島主才給名字）；
   * 有共同班級時 classmate（照 viewer 的名單）
   */
  private friendStateFor(m: Member, viewer: Member): FriendState {
    const owner = ownerOf(m.islandId);
    const atHome = owner === m.state.id;
    const open = atHome && !!this.islands.get(m.islandId)?.open;
    const classmate = viewer.friends.get(m.state.id)?.classmate;
    return {
      id: m.state.id,
      nickname: m.state.nickname,
      avatar: m.state.avatar,
      online: true,
      island: kindOf(m.islandId),
      ...(open ? { open: true } : {}),
      ...(owner && !atHome ? { host: this.hostNameFor(viewer, owner) } : {}),
      ...(classmate ? { classmate: true } : {}),
    };
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

  /** 把這位成員的好友狀態送給他線上的朋友（offline 是下線）：名字照每位朋友看到的（他名單上記的名字） */
  private tellFriends(m: Member, offline = false): void {
    for (const id of m.friends.keys()) {
      const f = this.accounts.get(id);
      if (!f) continue;
      const nickname = f.friends.get(m.state.id)?.nickname ?? m.state.nickname;
      const classmate = f.friends.get(m.state.id)?.classmate;
      const friend: FriendState = offline
        ? { id: m.state.id, nickname, avatar: m.state.avatar, online: false, island: null, ...(classmate ? { classmate: true } : {}) }
        : { ...this.friendStateFor(m, f), nickname };
      f.conn.send({ t: 'friend', friend });
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
      announceAt: -Infinity,
      doing: null,
      room: null,
      via: info.via,
      tokenRoom: info.tokenRoom ?? null,
      name: info.name,
      classes: new Map(info.classes.map((c) => [c.code, { name: c.name ?? '', nickname: c.nickname, flags: { ...c.flags } }])),
      islandId: '',
      friends: new Map(seeds.map((f) => [f.id, { nickname: f.nickname, avatar: f.avatar, ...(f.classmate ? { classmate: true } : {}) }])),
      myNames: new Map(seeds.filter((f) => f.myName !== undefined).map((f) => [f.id, f.myName!])),
      duel: null,
      invite: null,
    };
    const islandId = this.islandIdFor(m, info.island ?? 'class', info.room);
    const sameIsland = old?.islandId === islandId;
    if (old) {
      if (sameIsland) Object.assign(m.state, { x: old.state.x, z: old.state.z, h: old.state.h, zone: old.state.zone });
      // 換到別座島才算島主離開自己的島（同一座島換裝置，訪客留著）
      else if (old.islandId === ownIsland(old.state.id)) this.closeOwnIsland(old);
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
      return f
        ? { ...this.friendStateFor(f, m), nickname: seed.nickname }
        : { id, nickname: seed.nickname, avatar: seed.avatar, online: false, island: null, ...(seed.classmate ? { classmate: true } : {}) };
    });
    for (const code of m.classes.keys()) list.push(this.teacherFriendOf(m, code));
    conn.send({ t: 'friends', list });
    // 朋友關係是雙向的：線上的朋友名單裡沒有他就加進去（名字用他看到的我的名字；有共同班級照我這邊的名單）
    for (const [id, seed] of m.friends) {
      const f = this.accounts.get(id);
      if (!f) continue;
      const name = f.friends.get(m.state.id)?.nickname ?? m.myNames.get(f.state.id) ?? m.state.nickname;
      const classmate = f.friends.get(m.state.id)?.classmate ?? seed.classmate;
      f.friends.set(m.state.id, { nickname: name, avatar: m.state.avatar, ...(classmate ? { classmate: true } : {}) });
      f.conn.send({ t: 'friend', friend: { ...this.friendStateFor(m, f), nickname: name } });
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
      // 站在廣場上 NPC 熊熊老師平常站的地方（不和剛上岸的孩子擠在出生點），面向出生點
      state: { id: `gm:${++this.gmSeq}`, nickname: TEACHER_NAME, avatar: TEACHER_AVATAR, title: null, x: TEACHER_POS.x, z: TEACHER_POS.z, h: 0, zone: null, role: 'teacher' },
      dirty: false,
      sayTokens: 0,
      sayAt: this.now(),
      announceAt: -Infinity,
      doing: null,
      room: info.room,
      via: null,
      tokenRoom: null,
      name: TEACHER_NAME,
      classes: new Map([[info.room, { name: info.name, nickname: TEACHER_NAME, flags: { ...info.flags } }]]),
      islandId: '',
      friends: new Map(),
      myNames: new Map(),
      duel: null,
      invite: null,
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
    if (m.islandId === ownIsland(m.state.id)) this.closeOwnIsland(m);
    this.exit(m);
    this.conns.delete(m.conn);
    this.accounts.delete(m.state.id);
    this.tellFriends(m, true);
  }

  /** 熊熊老師離開：離開班級島；這一班最後一台老師裝置離開時，班上線上的孩子收到老師離線 */
  private removeTeacher(m: Member): void {
    this.exit(m);
    this.conns.delete(m.conn);
    const code = m.room!;
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
    if (!m) return;
    // 熊熊老師只能回自己班級的班級島
    if (m.role === 'teacher') {
      if (kind === 'class') this.moveTo(m, classIsland(m.room!));
      return;
    }
    this.moveTo(m, this.islandIdFor(m, kind, room));
  }

  /** 開放或關閉自己的島（島嶼互訪 I2）：只在自己的島上有效；朋友收到 open 的變化。關掉時已經在島上的人留著 */
  setOpen(conn: HubConn, open: boolean): void {
    const m = this.conns.get(conn);
    if (!m || m.role !== 'kid' || m.islandId !== ownIsland(m.state.id)) return;
    const island = this.islands.get(m.islandId);
    if (!island || island.open === open) return;
    island.open = open;
    this.tellFriends(m);
  }

  /**
   * 去某位朋友的島（島嶼互訪 I2）：要是朋友、對方在線上而且在自己的島、島有開放、島上的孩子不到 8 人；不符合回 error，留在原地。
   * 熊熊老師可以去班上孩子的島（在他自己的島上就好，不用開放、不佔人數）
   */
  visit(conn: HubConn, to: string): void {
    const m = this.conns.get(conn);
    if (!m) return;
    const fail = (message: string) => conn.send({ t: 'error', message });
    const host = this.accounts.get(to);
    const islandId = ownIsland(to);
    if (m.role === 'teacher') {
      if (!host || !host.classes.has(m.room!)) return fail('只能去班上孩子的島');
      if (host.islandId !== islandId) return fail('他現在不在自己的島上');
      return this.moveTo(m, islandId);
    }
    if (to === m.state.id) return this.moveTo(m, islandId);
    if (!m.friends.has(to)) return fail('只能去朋友的島');
    if (!host) return fail('朋友現在不在線上');
    if (host.islandId !== islandId) return fail('朋友現在不在自己的島上');
    const island = this.islands.get(islandId);
    if (!island?.open) return fail('朋友的島還沒有開放');
    if ([...island.members.values()].filter((x) => x.role === 'kid').length >= MAX_ISLAND_KIDS) return fail('朋友的島人數滿了，等一下再去');
    this.moveTo(m, islandId);
  }

  /** 島主請某位訪客回家（島嶼互訪 I2）：訪客先收到 visitEnded（kicked）再回自己的島；不是島主送的不做事 */
  kickVisitor(conn: HubConn, id: string): void {
    const m = this.conns.get(conn);
    if (!m || m.role !== 'kid' || m.islandId !== ownIsland(m.state.id)) return;
    const v = this.accounts.get(id);
    if (!v || v === m || v.islandId !== m.islandId) return;
    v.conn.send({ t: 'visitEnded', reason: 'kicked', host: this.hostNameFor(v, m.state.id) });
    this.moveTo(v, ownIsland(v.state.id));
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

  /** 孩子回報在做什麼（老師 GM 的 G3）：只記在記憶體，老師的成員表（whereOf）看得到，不廣播給同學；熊熊老師不做事 */
  // ---------- 和朋友益智對戰（島嶼互訪 I4，docs/plans/islands.md 第 12 節） ----------

  /**
   * 邀請同一座島上的孩子對戰：新的邀請取代舊的。對方不在這座島、是熊熊老師、是自己時回 gone，正在對戰時回 busy。
   * 熊熊老師與對戰中的人送的不做事
   */
  duelInvite(conn: HubConn, msg: { to: string; game: PuzzleGameId; level: 1 | 2 | 3; seed: number; check: string }): void {
    const m = this.conns.get(conn);
    if (!m || m.role !== 'kid' || m.duel) return;
    this.cancelInvite(m);
    const target = this.islands.get(m.islandId)?.members.get(msg.to);
    if (!target || target === m || target.role !== 'kid') return m.conn.send({ t: 'duelDeclined', to: msg.to, reason: 'gone' });
    if (target.duel) return m.conn.send({ t: 'duelDeclined', to: msg.to, reason: 'busy' });
    const { game, level, seed, check } = msg;
    m.invite = { to: target, game, level, seed, check };
    target.conn.send({ t: 'duelInvite', from: m.state.id, name: m.state.nickname, game, level, seed, check });
  }

  /** 取消自己送出的邀請 */
  duelCancel(conn: HubConn): void {
    const m = this.conns.get(conn);
    if (m) this.cancelInvite(m);
  }

  /**
   * 回覆邀請：不接受時邀請的人收到原因；接受時兩個人還在同一座島、都不在對戰才開局（兩個人收到同一局的 duelStart），
   * 兩個人送出的其他邀請作廢、別人送給他們的邀請回 busy。邀請已經不在（取消、取代、邀請的人離開）時接受的人收到 duelCancelled
   */
  duelReply(conn: HubConn, msg: { from: string; accept: boolean; reason?: DuelDeclineReason }): void {
    const m = this.conns.get(conn);
    if (!m || m.role !== 'kid') return;
    const inviter = this.accounts.get(msg.from);
    const invite = inviter?.invite;
    if (!inviter || !invite || invite.to !== m) {
      if (msg.accept) m.conn.send({ t: 'duelCancelled', from: msg.from });
      return;
    }
    inviter.invite = null;
    if (!msg.accept) return inviter.conn.send({ t: 'duelDeclined', to: m.state.id, reason: msg.reason ?? 'no' });
    if (inviter.islandId !== m.islandId || inviter.duel || m.duel) {
      m.conn.send({ t: 'duelCancelled', from: msg.from });
      inviter.conn.send({ t: 'duelDeclined', to: m.state.id, reason: 'gone' });
      return;
    }
    const duel: Duel = { id: `duel:${++this.duelSeq}`, a: inviter, b: m, moves: 0 };
    inviter.duel = duel;
    m.duel = duel;
    for (const p of [inviter, m]) {
      this.cancelInvite(p);
      this.declineInvitesTo(p, 'busy');
    }
    const start = { t: 'duelStart' as const, id: duel.id, game: invite.game, level: invite.level, seed: invite.seed, first: inviter.state.id };
    inviter.conn.send({ ...start, opponent: { id: m.state.id, name: m.state.nickname } });
    m.conn.send({ ...start, opponent: { id: inviter.state.id, name: inviter.state.nickname } });
  }

  /** 對戰中的一則動作：依收到的順序轉給兩個人（自己的也回去，兩邊才用同一個順序套用），每局最多 DUEL_MAX_MOVES 則 */
  duelMove(conn: HubConn, msg: { k: DuelMoveKind; i?: number; n?: number }): void {
    const m = this.conns.get(conn);
    const duel = m?.duel;
    if (!m || !duel || duel.moves >= DUEL_MAX_MOVES) return;
    duel.moves++;
    const out: ServerMessage = { t: 'duelMove', by: m.state.id, k: msg.k, ...(msg.i !== undefined ? { i: msg.i } : {}), ...(msg.n !== undefined ? { n: msg.n } : {}) };
    duel.a.conn.send(out);
    duel.b.conn.send(out);
  }

  /** 中途離開對戰（按 ✕、休息鎖定）：對方收到 duelEnd（left），直接贏 */
  duelLeave(conn: HubConn): void {
    const m = this.conns.get(conn);
    if (m) this.endDuel(m, 'left');
  }

  /** 結束這個人的對戰：對方收到 duelEnd */
  private endDuel(m: Member, reason: 'left' | 'gone'): void {
    const duel = m.duel;
    if (!duel) return;
    duel.a.duel = null;
    duel.b.duel = null;
    (duel.a === m ? duel.b : duel.a).conn.send({ t: 'duelEnd', reason });
  }

  /** 收回這個人送出的邀請：對方收到 duelCancelled */
  private cancelInvite(m: Member): void {
    if (!m.invite) return;
    m.invite.to.conn.send({ t: 'duelCancelled', from: m.state.id });
    m.invite = null;
  }

  /** 別人送給這個人、還沒回覆的邀請都作廢：邀請的人收到 duelDeclined（邀請的人一定在同一座島上，離開時邀請就收回了） */
  private declineInvitesTo(m: Member, reason: 'busy' | 'gone'): void {
    for (const x of this.islands.get(m.islandId)?.members.values() ?? []) {
      if (x.invite?.to !== m) continue;
      x.invite = null;
      x.conn.send({ t: 'duelDeclined', to: m.state.id, reason });
    }
  }

  /** 離開這座島（換島、斷線、另一台裝置登入）：對戰結束（對方收到 gone）、送出與收到的邀請作廢 */
  private dropDuel(m: Member): void {
    this.endDuel(m, 'gone');
    this.cancelInvite(m);
    this.declineInvitesTo(m, 'gone');
  }

  doing(conn: HubConn, label: string | null): void {
    const m = this.conns.get(conn);
    if (!m || m.role === 'teacher') return;
    m.doing = label;
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

  /**
   * 熊熊老師的全班公告（老師 GM 的 G2）：這一班線上的孩子不管在哪座島都收到 announce；
   * 班級島的公頻記一則「熊熊老師：…」。每條老師連線每 10 秒最多一則；不是老師的連線不做事
   */
  announce(conn: HubConn, text: string): void {
    const m = this.conns.get(conn);
    const island = m && this.islands.get(m.islandId);
    if (!m || !island || m.role !== 'teacher') return;
    const t = this.now();
    if (t - m.announceAt < ANNOUNCE_GAP_MS) return conn.send({ t: 'error', message: `公告要隔 ${ANNOUNCE_GAP_MS / 1000} 秒才能再發` });
    m.announceAt = t;
    const code = m.room!;
    const line: ChatLine = { id: island.nextChatId++, from: m.state.id, nickname: m.state.nickname, text, at: t };
    island.chat = [...island.chat, line].slice(-CHAT_KEEP);
    this.broadcast(island, { t: 'chat', line });
    for (const kid of this.classmates(code)) kid.conn.send({ t: 'announce', room: code, text });
  }

  /**
   * 熊熊老師請大家集合（老師 GM 的 G2）：這一班線上的孩子（不管在哪座島）各收到一個老師身邊的位置（summonSpots，不重疊）。
   * 不是老師的連線不做事
   */
  summon(conn: HubConn): void {
    const m = this.conns.get(conn);
    // 老師不在班級島上（在孩子的島）時不集合：位置是繞著老師排的
    if (!m || m.role !== 'teacher' || m.islandId !== classIsland(m.room!)) return;
    const code = m.room!;
    const kids = this.classmates(code);
    const spots = summonSpots({ x: m.state.x, z: m.state.z }, kids.length);
    kids.forEach((kid, i) => kid.conn.send({ t: 'summon', room: code, x: spots[i].x, z: spots[i].z }));
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
    this.tellFriends(m);
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
   * 某個帳號在哪裡（老師的成員表用）：哪一種島＋建築＋在做什麼；離線是 null。
   * room 是老師看的那一班：在別班的班級島時是 otherClass（不寫是哪一班）；沒給時任何班級島都算 class
   */
  whereOf(accountId: string, room?: string): { island: IslandKind | 'otherClass'; zone: ZoneId | null; doing?: string } | null {
    const m = this.accounts.get(accountId);
    if (!m) return null;
    const code = codeOf(m.islandId);
    const island = code === null ? 'own' : room === undefined || code === room ? 'class' : 'otherClass';
    // 在做什麼只在有的時候帶（老師 GM 的 G3）
    return { island, zone: m.state.zone, ...(m.doing ? { doing: m.doing } : {}) };
  }
}
