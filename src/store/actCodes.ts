/**
 * 會同步給別人看的動作代碼（自己的家第 9 節優化，docs/plans/home.md）：坐、躺、溜滑梯、盪鞦韆。
 * 位置訊息（move）多帶這個代碼，伺服器驗證與轉送用；不能 import 任何東西（伺服器共用，照 duelMoves.ts 的做法）。
 */
export const ACT_CODES = ['sit', 'lie', 'slide', 'swing'] as const;
/** 一個動作代碼 */
export type ActCode = (typeof ACT_CODES)[number];
