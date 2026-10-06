/**
 * 即時連線（WebSocket）的訊息格式（前端與伺服器共用的純模組）。
 * 裝置送來的訊息一律用 zod 驗證（格式錯就斷線）；伺服器送出的訊息用 TypeScript 型別描述。
 * 規格見 docs/plans/online.md 第 5、6、10 節。
 */
import { z } from 'zod';
import type { AvatarConfig } from '../store/save';
import type { ZoneId } from '../store/useUi';
import type { ChatLine } from './presence';

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

/** 裝置 → 伺服器 */
export const clientMessage = z.discriminatedUnion('t', [
  /**
   * 連上後第一則：登入權杖；island 是要去的島（沒給是班級島，舊版網頁不會送；沒有班級的孩子一律進自己的島）；
   * room 是要去哪一班的班級島（多班級，docs/plans/multi-class.md；沒給或不是成員是第一個班級）
   */
  z.object({ t: z.literal('hello'), token: z.string().min(10).max(200), island: z.enum(ISLAND_KINDS).optional(), room: roomCode.optional() }),
  /** 換島（不斷線）：班級島（room 是哪一班，沒給是第一個班級）、自己的島 */
  z.object({ t: z.literal('go'), island: z.enum(ISLAND_KINDS), room: roomCode.optional() }),
  /** 位置與朝向（zod 4 的 number 本身就拒絕 Infinity、NaN） */
  z.object({ t: z.literal('move'), x: z.number(), z: z.number(), h: z.number() }),
  /** 進出建築（null 表示回到島上） */
  z.object({ t: z.literal('where'), zone: z.enum(ZONE_IDS).nullable() }),
  /** 說一句公頻短句（只送 id） */
  z.object({ t: z.literal('say'), phrase: z.string().max(40) }),
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
}

/** 好友名單上的一位朋友：只有在線上與在哪座島，不含建築（使用者決定，docs/plans/islands.md） */
export interface FriendState {
  id: string;
  nickname: string;
  avatar: AvatarConfig;
  online: boolean;
  /** 在哪座島（離線是 null）：班級島（不管是哪一班）、他自己的島 */
  island: IslandKind | null;
}

/** 伺服器 → 裝置 */
export type ServerMessage =
  /**
   * 進到一座島：island 是進了哪一種島（舊版伺服器沒有這個欄位）；classCode 是哪一班的班級島（自己的島是 null；
   * 多班級之前的伺服器沒有這個欄位）
   */
  | { t: 'welcome'; self: string; island: IslandKind; classCode?: string | null; room: RoomFlags; members: MemberState[]; chat: ChatLine[] }
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
