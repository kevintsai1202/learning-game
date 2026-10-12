/**
 * 班級島大型設施的種類與價錢（docs/plans/grand-rides.md；伺服器共用：扣金幣的操作）。不 import 任何東西。
 */

/** 三樣固定設施：雲霄飛車、巨大摩天輪、環島飛船 */
export const GRAND_RIDES = ['coaster', 'wheel', 'ship'] as const;
/** 一樣設施 */
export type GrandRide = (typeof GRAND_RIDES)[number];
/** 玩一次的價錢（金幣；使用者 2026-10-12：三個設施都要花 5 金幣玩） */
export const GRAND_PRICE = 5;
