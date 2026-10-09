/**
 * 和朋友對戰的動作種類（島嶼互訪 I4）：即時連線的訊息格式（伺服器共用）與規則（friend.ts）都用。
 * 這個檔不 import 任何東西，伺服器打包時才不會帶進出題器。
 */

/**
 * pick 作答（i 第幾題、n 選項）、ready 看完這一題的結果（i 第幾題）、flip 翻牌（i 第幾張）、
 * claim 找到一處（i 第幾處）、time 時間到、progress 放好幾塊（n）、done 拼完
 */
export const DUEL_MOVE_KINDS = ['pick', 'ready', 'flip', 'claim', 'time', 'progress', 'done'] as const;
export type DuelMoveKind = (typeof DUEL_MOVE_KINDS)[number];

/** 被邀請的人不接受的原因：不要、正在忙、今天的益智時間用完、網頁版本不同（同一個種子出的題目不一樣） */
export const DUEL_DECLINE_REASONS = ['no', 'busy', 'tired', 'version'] as const;
export type DuelDeclineReason = (typeof DUEL_DECLINE_REASONS)[number];
