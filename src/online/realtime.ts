/**
 * 即時連線（WebSocket）的訊息格式（前端與伺服器共用的純模組）。
 * 裝置送來的訊息一律用 zod 驗證（格式錯就斷線）；伺服器送出的訊息用 TypeScript 型別描述。
 * 規格見 docs/plans/online.md 第 5、6、10 節。
 */
import { z } from 'zod';
import type { AvatarConfig } from '../store/save';
import type { ZoneId } from '../store/useUi';
import type { ChatLine } from './presence';
import { PUZZLE_GAME_IDS, type PuzzleGameId } from '../store/puzzle';
import { DUEL_DECLINE_REASONS, DUEL_MOVE_KINDS, type DuelDeclineReason, type DuelMoveKind } from '../engine/puzzle/duelMoves';
import type { YardItem } from '../store/yard';

/**
 * WebSocket 關閉代碼：角色沒有班級；和權杖無效（4003）分開，裝置不再重連。
 * 島嶼互訪 I1 起伺服器不再送（沒有班級的孩子進自己的島）；裝置保留處理，部署途中連到舊版伺服器時用
 */
export const CLOSE_NO_CLASS = 4004;
/**
 * WebSocket 關閉代碼：帳號換了班級（家長掃 QR code 讓孩子加入班級等），要重新上線拿新的班級與朋友。
 * 裝置同步一次後馬上重連（不算斷線、不封鎖）；舊版網頁不認得，照一般斷線幾秒後重連
 */
export const CLOSE_RECONNECT = 4005;

/** 島上的建築 id（和 useUi 的 ZoneId 相同；伺服器驗證 where 訊息用） */
export const ZONE_IDS = ['tower', 'math', 'zh', 'life', 'en', 'shop'] as const satisfies readonly ZoneId[];

/**
 * 島的種類（島嶼互訪，docs/plans/islands.md）：班級島，或某個人自己的島。
 * 裝置本機的「我的島」記成 CloudLink.island = 'mine'（G1 已上線的欄位），送到伺服器時一律寫成 'own'
 */
export const ISLAND_KINDS = ['class', 'own'] as const;
export type IslandKind = (typeof ISLAND_KINDS)[number];

/** 班級代碼（6 位數字；多班級時說要去哪一班的班級島） */
const roomCode = z.string().regex(/^\d{6}$/);

/** 熊熊老師（老師 GM 的 G2）：名字與外觀（舊版網頁不認得 role，畫成一隻叫熊熊老師的棕色熊） */
export const TEACHER_NAME = '熊熊老師';
export const TEACHER_AVATAR: AvatarConfig = { animal: 'bear', color: '#8b5a2b', hat: null };
/** 全班公告最多幾個字（老師 GM 的 G2） */
export const ANNOUNCE_MAX = 60;
/** 孩子回報「在做什麼」的名稱最多幾個字（老師 GM 的 G3） */
export const DOING_MAX = 40;
/** 好友名單上某一班老師的 id（每一班一筆） */
export const teacherFriendId = (code: string): string => `teacher:${code}`;
/**
 * 新伺服器在 welcome 告訴裝置支援哪些新訊息（部署途中新網頁可能連到舊伺服器，舊伺服器收到不認得的訊息會斷線）：
 * gm 是老師 GM 的 G2＋G3（孩子回報在做什麼等）；duel 是和朋友益智對戰（島嶼互訪 I4）
 */
export type ServerCap = 'gm' | 'duel';

/** 對戰的難度（益智搶答不分難度，照樣帶一個） */
const duelLevel = z.union([z.literal(1), z.literal(2), z.literal(3)]);
/** 對戰一局的指紋（出好的題目的雜湊，見 src/puzzle/friendRound.ts） */
const duelCheck = z.string().regex(/^[0-9a-z]{1,16}$/);
/** 對戰動作裡的數字（第幾題、第幾張、選項、放好幾塊） */
const duelNumber = z.number().int().min(0).max(999);

/** 裝置 → 伺服器 */
export const clientMessage = z.discriminatedUnion('t', [
  /**
   * 連上後第一則：登入權杖；island 是要去的島（沒給是班級島，舊版網頁不會送；沒有班級的孩子一律進自己的島）；
   * room 是要去哪一班的班級島（多班級，docs/plans/multi-class.md；沒給或不是成員是第一個班級）
   */
  z.object({
    t: z.literal('hello'),
    token: z.string().min(10).max(200),
    island: z.enum(ISLAND_KINDS).optional(),
    room: roomCode.optional(),
    /** 老師以熊熊老師進島（老師 GM 的 G2）：大人權杖＋自己班級的代碼，進那一班的班級島 */
    gm: roomCode.optional(),
  }),
  /** 換島（不斷線）：班級島（room 是哪一班，沒給是第一個班級）、自己的島 */
  z.object({ t: z.literal('go'), island: z.enum(ISLAND_KINDS), room: roomCode.optional() }),
  /** 位置與朝向（zod 4 的 number 本身就拒絕 Infinity、NaN） */
  z.object({ t: z.literal('move'), x: z.number(), z: z.number(), h: z.number() }),
  /** 進出建築（null 表示回到島上） */
  z.object({ t: z.literal('where'), zone: z.enum(ZONE_IDS).nullable() }),
  /** 說一句公頻短句（只送 id） */
  z.object({ t: z.literal('say'), phrase: z.string().max(40) }),
  /** 熊熊老師的全班公告（老師自己輸入，去掉前後空白後 1～60 字；只有老師的連線有效） */
  z.object({ t: z.literal('announce'), text: z.string().trim().min(1).max(ANNOUNCE_MAX) }),
  /** 熊熊老師請大家集合（只有老師的連線有效） */
  z.object({ t: z.literal('summon') }),
  /** 開放或關閉自己的島（島嶼互訪 I2；只在自己的島上有效，下線、離開自己的島就關閉） */
  z.object({ t: z.literal('island'), open: z.boolean() }),
  /** 去某位朋友的島（島嶼互訪 I2；熊熊老師也可以去班上孩子的島）；回自己的島用 go own */
  z.object({ t: z.literal('visit'), to: z.string().min(1).max(64) }),
  /** 島主請某位訪客回家（島嶼互訪 I2） */
  z.object({ t: z.literal('kickVisitor'), id: z.string().min(1).max(64) }),
  /**
   * 孩子回報在做什麼（老師 GM 的 G3）：活動或遊戲的名稱（最多 40 字），沒有在做什麼是 null。
   * 伺服器只放記憶體、只給老師的成員表；裝置只在 welcome 的 caps 有 gm 時才送（舊版伺服器不認得會斷線）
   */
  z.object({ t: z.literal('doing'), label: z.string().trim().min(1).max(DOING_MAX).nullable() }),
  /**
   * 邀請同一座島上的朋友益智對戰（島嶼互訪 I4）：遊戲、難度、種子由邀請的人決定，check 是這一局的指紋（對方比對版本）。
   * 裝置只在 welcome 的 caps 有 duel 時才送
   */
  z.object({
    t: z.literal('duelInvite'),
    to: z.string().min(1).max(64),
    game: z.enum(PUZZLE_GAME_IDS),
    level: duelLevel,
    seed: z.number().int().min(0).max(2147483647),
    check: duelCheck,
  }),
  /** 取消自己送出的邀請 */
  z.object({ t: z.literal('duelCancel') }),
  /** 回覆某人的邀請：接受，或不接受與原因（沒給是 no） */
  z.object({ t: z.literal('duelReply'), from: z.string().min(1).max(64), accept: z.boolean(), reason: z.enum(DUEL_DECLINE_REASONS).optional() }),
  /** 對戰中的一則動作（伺服器排好順序轉給兩個人，規則在 src/engine/puzzle/friend.ts） */
  z.object({ t: z.literal('duelMove'), k: z.enum(DUEL_MOVE_KINDS), i: duelNumber.optional(), n: duelNumber.optional() }),
  /** 中途離開對戰（按 ✕、休息鎖定）：對方直接贏 */
  z.object({ t: z.literal('duelLeave') }),
]);
export type ClientMessage = z.infer<typeof clientMessage>;

/** 房間的開關（老師可以切換） */
export interface RoomFlags {
  chatOpen: boolean;
  giftsOpen: boolean;
}

/** 其他人看到的一位成員（外觀已經過伺服器的擁有檢查） */
export interface MemberState {
  id: string;
  nickname: string;
  avatar: AvatarConfig;
  /** 顯示的稱號文字（沒有時為 null） */
  title: string | null;
  x: number;
  z: number;
  h: number;
  zone: ZoneId | null;
  /** 熊熊老師（老師 GM 的 G2）；孩子沒有這個欄位 */
  role?: 'teacher';
}

/** 好友名單上的一位朋友：只有在線上與在哪座島，不含建築（使用者決定，docs/plans/islands.md） */
export interface FriendState {
  id: string;
  nickname: string;
  avatar: AvatarConfig;
  online: boolean;
  /** 在哪座島（離線是 null）：班級島（不管是哪一班）、自己的島（在別人的島上也是 own，見 host） */
  island: IslandKind | null;
  /** 他在自己的島而且開放中：朋友可以去玩（島嶼互訪 I2；沒開放時沒有這個欄位） */
  open?: boolean;
  /** 他在別人的島上：島主的名字（照各自看到的；不認識島主時是空字串，畫面寫「在朋友的島」） */
  host?: string;
  /** 有共同班級（在朋友的島上可以送禮給他；只是兄弟姊妹時沒有這個欄位） */
  classmate?: boolean;
}

/** 伺服器 → 裝置 */
export type ServerMessage =
  /**
   * 進到一座島：island 是進了哪一種島（舊版伺服器沒有這個欄位）；classCode 是哪一班的班級島（自己的島是 null；
   * 多班級之前的伺服器沒有這個欄位）；caps 是伺服器支援的新訊息（舊版伺服器沒有）
   */
  | {
      t: 'welcome';
      self: string;
      island: IslandKind;
      classCode?: string | null;
      room: RoomFlags;
      members: MemberState[];
      chat: ChatLine[];
      caps?: ServerCap[];
      /** 在別人的島上時：島主（name 照自己看到的；島嶼互訪 I2） */
      host?: { id: string; name: string };
      /** 自己的島（不管是誰的）：島主的院子（自己的家，docs/plans/home.md；班級島沒有這個欄位） */
      yard?: YardItem[];
    }
  /** 上線時的完整好友名單（離線的朋友也在裡面） */
  | { t: 'friends'; list: FriendState[] }
  /** 某位朋友上線、下線、換島或換外觀（名單裡沒有的就加進去） */
  | { t: 'friend'; friend: FriendState }
  | { t: 'join'; member: MemberState }
  | { t: 'leave'; id: string }
  /** 這 100 毫秒內有移動的人：[id, x, z, 朝向] */
  | { t: 'moves'; list: [string, number, number, number][] }
  /** 某位成員的外觀、稱號或所在建築變了 */
  | { t: 'member'; member: MemberState }
  | { t: 'chat'; line: ChatLine }
  /** 自己的存檔在伺服器端變了（例如收到禮物），裝置要同步 */
  | { t: 'profile'; rev: number }
  | { t: 'room'; room: RoomFlags }
  /** 班級內容更新了（老師改了班級教材版本）：裝置重新同步，從回應拿新的設定（老師 GM 的 G0；舊版網頁不認得，會忽略） */
  | { t: 'content' }
  /** 被踢下線（另一台裝置登入、老師移除或重設密碼） */
  | { t: 'kicked'; reason: string }
  /**
   * 一則提示（熊熊老師的泡泡；多班級：離開了其中一班時，緊接著以 4005 重新上線，不封鎖）。舊版網頁不認得，會忽略
   */
  | { t: 'notice'; message: string }
  /** 禮物狀態有變（收到新禮物，或送出的禮物有結果）：裝置重新讀 GET /api/gifts */
  | { t: 'gift' }
  /** 熊熊老師的全班公告（老師 GM 的 G2）：room 是哪一班；班上線上的孩子不管在哪座島都收到。舊版網頁不認得，會忽略 */
  | { t: 'announce'; room: string; text: string }
  /**
   * 熊熊老師請大家集合（老師 GM 的 G2）：x、z 是這個孩子在老師身邊的位置。在那一班的班級島上的孩子直接過去，
   * 在建築裡或別座島的跳卡片讓孩子選。舊版網頁不認得，會忽略
   */
  | { t: 'summon'; room: string; x: number; z: number }
  /** 收到老師的獎勵（老師 GM 的 G3）：裝置讀 GET /api/rewards 顯示卡片。舊版網頁不認得，會忽略（存檔照樣同步） */
  | { t: 'reward' }
  /**
   * 拜訪結束（島嶼互訪 I2）：島主離開或下線（closed）、島主請你回家（kicked）；host 是島主的名字。
   * 緊接著伺服器把他送回自己的島（新的 welcome）
   */
  | { t: 'visitEnded'; reason: 'closed' | 'kicked'; host: string }
  /** 有人邀請你益智對戰（島嶼互訪 I4）：name 是他在這座島上的名字。舊版網頁不認得，會忽略 */
  | { t: 'duelInvite'; from: string; name: string; game: PuzzleGameId; level: 1 | 2 | 3; seed: number; check: string }
  /** 邀請取消了（邀請的人取消、送了新的邀請、離開這座島，或回覆時邀請已經不在） */
  | { t: 'duelCancelled'; from: string }
  /** 對方不接受你的邀請；gone 是對方不在這座島（或不能被邀請）、busy 是對方正在對戰 */
  | { t: 'duelDeclined'; to: string; reason: DuelDeclineReason | 'gone' }
  /** 對戰開始：兩個人收到同一局；first 是先手（邀請的人），opponent 是對方與他在這座島上的名字 */
  | { t: 'duelStart'; id: string; game: PuzzleGameId; level: 1 | 2 | 3; seed: number; first: string; opponent: { id: string; name: string } }
  /** 對戰中的一則動作（兩個人照同一個順序收到，自己的也會回來） */
  | { t: 'duelMove'; by: string; k: DuelMoveKind; i?: number; n?: number }
  /** 對方離開了對戰：按 ✕（left）、斷線或離開這座島（gone）；你直接贏 */
  | { t: 'duelEnd'; reason: 'left' | 'gone' }
  /** 島主的院子變了（自己的家）：送給島上島主以外的人。舊版網頁不認得，會忽略 */
  | { t: 'yard'; items: YardItem[] }
  | { t: 'error'; message: string };

/** 解析裝置送來的訊息；格式不符回傳 null（呼叫端斷線） */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = clientMessage.safeParse(data);
  return r.success ? r.data : null;
}
