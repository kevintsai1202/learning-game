/**
 * 班級島遊樂場的器材種類與資料格式（docs/plans/playground.md；伺服器共用：老師改設定的驗證、資料表）。
 * 班級島上固定 4 個位置，每個位置一種器材或空的（null）。只 import zod（伺服器也有）。
 */
import { z } from 'zod';

/** 八種大型遊樂器材：旋轉木馬、翹翹板、大鞦韆組、彈跳床、溜滑梯城堡、摩天輪、咖啡杯、小火車 */
export const RIDE_KINDS = ['carousel', 'seesaw', 'swingset', 'trampoline', 'slidecastle', 'ferris', 'teacups', 'train'] as const;
/** 一種器材 */
export type RideKind = (typeof RIDE_KINDS)[number];
/** 班級島上的遊樂場位置數 */
export const PLAYGROUND_SLOTS = 4;
/** 班級島的遊樂場：每個位置一種器材或空的 */
export type Playground = (RideKind | null)[];

/** 遊樂場的格式（老師改設定、資料表、班級島的歡迎訊息共用） */
export const playgroundSchema = z.array(z.enum(RIDE_KINDS).nullable()).length(PLAYGROUND_SLOTS);

/** 沒有器材的遊樂場（新班級、舊資料） */
export function emptyPlayground(): Playground {
  return Array(PLAYGROUND_SLOTS).fill(null);
}
