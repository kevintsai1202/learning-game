/**
 * 益智遊戲館的共用規則（純模組，前端與伺服器共用；規格見 docs/plans/puzzle-house.md 第 6 節）：
 * 遊戲清單、每局金幣、每日金幣上限、每日時間上限的預設值。
 * 每局怎麼算星星由各遊戲決定（src/engine/puzzle/），這裡只管星星換成金幣。
 *
 * 這個檔案不 import save.ts 的執行期內容（save.ts 會 import 這裡，避免循環引用）。
 */

/** 益智遊戲的 id（伺服器驗證操作用；新增遊戲時加在這裡，伺服器要一起部署） */
export const PUZZLE_GAME_IDS = ['quiz', 'memory', 'spot', 'blocks', 'tangram'] as const;

export type PuzzleGameId = (typeof PUZZLE_GAME_IDS)[number];

/** 每局的金幣：索引是星星數（1 星 2 枚、2 星 3 枚、3 星 5 枚） */
export const PUZZLE_COINS_BY_STARS = [0, 2, 3, 5] as const;

/** 益智遊戲每天最多拿到幾枚金幣（學習活動的金幣不算在內） */
export const PUZZLE_DAILY_COIN_CAP = 20;

/** 益智遊戲館每天可以玩幾分鐘的預設值（家長專區可調；0 表示不另外限制） */
export const DEFAULT_PUZZLE_LIMIT_MIN = 15;

/** 每日紀錄只留最近幾天 */
export const PUZZLE_DAYS_KEPT = 14;

/** 某一天的益智遊戲紀錄 */
export interface PuzzleDay {
  /** 在益智遊戲館的遊玩秒數 */
  seconds: number;
  /** 從益智遊戲拿到的金幣 */
  coins: number;
}

/** 一位小朋友的益智遊戲紀錄（Profile.puzzle） */
export interface PuzzleStats {
  /** 每日紀錄，鍵為 YYYY-MM-DD */
  days: Record<string, PuzzleDay>;
  /** 各遊戲的最佳星數，鍵為遊戲 id */
  best: Record<string, number>;
}

/**
 * 這一局給幾枚金幣：依星星數，但今天的益智金幣加起來不超過每日上限。
 * earnedToday 是今天已經從益智遊戲拿到的金幣。
 */
export function puzzleCoinsFor(stars: number, earnedToday: number): number {
  const base = PUZZLE_COINS_BY_STARS[Math.max(0, Math.min(3, Math.round(stars)))];
  return Math.max(0, Math.min(base, PUZZLE_DAILY_COIN_CAP - earnedToday));
}

/** 只留最近 PUZZLE_DAYS_KEPT 天（日期字串可以直接比大小） */
export function trimPuzzleDays(days: Record<string, PuzzleDay>): Record<string, PuzzleDay> {
  const keys = Object.keys(days).sort();
  if (keys.length <= PUZZLE_DAYS_KEPT) return days;
  const out: Record<string, PuzzleDay> = {};
  for (const k of keys.slice(-PUZZLE_DAYS_KEPT)) out[k] = days[k];
  return out;
}
