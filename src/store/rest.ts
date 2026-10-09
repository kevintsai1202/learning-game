/**
 * 玩一段時間要休息（docs/decisions.md「遊玩時間：玩一段時間要休息」，2026-10-09；純函式，有單元測試 tests/store/rest.test.ts）：
 * - 只算有操作的時間：最後一次點、滑、按鍵在 1 分鐘內才算在玩
 * - 累計到家長設定的連續上限（預設 30 分鐘）就開始休息（預設 15 分鐘），照真實時間倒數，累計歸零；上限 0 表示不限制
 * 休息狀態存在這台裝置的存檔裡（每個角色一份，SaveData.rest），不跟雲端同步。
 */

/** 多久沒操作就不算在玩（毫秒） */
export const IDLE_MS = 60_000;

/** 一個角色的休息狀態 */
export interface RestState {
  /** 這一輪連續玩了幾秒（只算有操作的時間） */
  activeSec: number;
  /** 休息到什麼時候（毫秒時間戳）；沒有在休息是 null */
  restUntil: number | null;
}

/** 還沒開始玩的狀態 */
export const EMPTY_REST: RestState = { activeSec: 0, restUntil: null };

/** 有沒有在玩：最後一次操作在 1 分鐘內 */
export function isActive(lastInputAt: number, now: number): boolean {
  return now - lastInputAt <= IDLE_MS;
}

/** 還要休息幾秒（0 表示不用休息） */
export function restLeftSec(s: RestState, now: number): number {
  return s.restUntil === null ? 0 : Math.max(0, Math.ceil((s.restUntil - now) / 1000));
}

/**
 * 累計一段有操作的時間（秒）：休息中不累計；休息時間已過就先清掉再累計；
 * 累計到連續上限（sessionLimitMin 分鐘，0 是不限制）就開始休息 restMin 分鐘，累計歸零
 */
export function addActive(s: RestState, seconds: number, now: number, sessionLimitMin: number, restMin: number): RestState {
  if (restLeftSec(s, now) > 0) return s;
  const activeSec = (s.restUntil === null ? s.activeSec : 0) + seconds;
  if (sessionLimitMin > 0 && activeSec >= sessionLimitMin * 60) return { activeSec: 0, restUntil: now + restMin * 60_000 };
  return { activeSec, restUntil: null };
}
