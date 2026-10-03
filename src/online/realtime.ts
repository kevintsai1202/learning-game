/**
 * 即時連線（WebSocket）的訊息格式（前端與伺服器共用的純模組）。
 * 裝置送來的訊息一律用 zod 驗證（格式錯就斷線）；伺服器送出的訊息用 TypeScript 型別描述。
 * 規格見 docs/plans/online.md 第 5、6、10 節。
 */
import { z } from 'zod';
import type { AvatarConfig } from '../store/save';
import type { ZoneId } from '../store/useUi';
import type { ChatLine } from './presence';

/** WebSocket 關閉代碼：角色沒有班級（家長名下、還沒加入班級，或剛退出班級）；和權杖無效（4003）分開，裝置不再重連 */
export const CLOSE_NO_CLASS = 4004;

/** 島上的建築 id（和 useUi 的 ZoneId 相同；伺服器驗證 where 訊息用） */
export const ZONE_IDS = ['tower', 'math', 'zh', 'life', 'en', 'shop'] as const satisfies readonly ZoneId[];

/** 裝置 → 伺服器 */
export const clientMessage = z.discriminatedUnion('t', [
  /** 連上後第一則：登入權杖 */
  z.object({ t: z.literal('hello'), token: z.string().min(10).max(200) }),
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

/** 伺服器 → 裝置 */
export type ServerMessage =
  | { t: 'welcome'; self: string; room: RoomFlags; members: MemberState[]; chat: ChatLine[] }
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
  /** 被踢下線（另一台裝置登入、老師移除或重設密碼） */
  | { t: 'kicked'; reason: string }
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
