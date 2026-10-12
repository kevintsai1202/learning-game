/**
 * 班級島遊樂場的器材種類與資料格式（docs/plans/playground.md；伺服器共用：老師改設定的驗證、資料表）。
 * 班級島上固定 4 個位置，每個位置一種器材或空的（null）。只 import zod（伺服器也有）。
 */
import { z } from 'zod';

/** 八種大型遊樂器材：旋轉木馬、翹翹板、大鞦韆組、彈跳床、溜滑梯城堡、摩天輪、咖啡杯、小火車 */
export const RIDE_KINDS = ['carousel', 'seesaw', 'swingset', 'trampoline', 'slidecastle', 'ferris', 'teacups', 'train'] as const;
/** 一種器材 */
export type RideKind = (typeof RIDE_KINDS)[number];
/**
 * 老師的選單上可以選的器材：小摩天輪拿掉（班級島有固定的巨大摩天輪，docs/plans/grand-rides.md）。
 * ferris 還留在 RIDE_KINDS（資料格式）：已經選了的班級照樣畫、選單上那一格照樣顯示，老師換掉就不再出現
 */
export const PICKABLE_RIDES: readonly RideKind[] = RIDE_KINDS.filter((k) => k !== 'ferris');
/** 班級島上的遊樂場位置數 */
export const PLAYGROUND_SLOTS = 4;
/** 班級島的遊樂場：每個位置一種器材或空的 */
export type Playground = (RideKind | null)[];

/** 遊樂場的格式（老師改設定、資料表、班級島的歡迎訊息共用） */
export const playgroundSchema = z.array(z.enum(RIDE_KINDS).nullable()).length(PLAYGROUND_SLOTS);

/** 沒有器材的遊樂場（自己的島、舊版伺服器） */
export function emptyPlayground(): Playground {
  return Array(PLAYGROUND_SLOTS).fill(null);
}

/**
 * 老師還沒設定過的班級先放好的 4 座（使用者 2026-10-12：進班級就看得到，老師可以調整）：
 * 旋轉木馬、翹翹板、大鞦韆組、彈跳床（量過對平板最輕的一組）。老師改過就照老師的，全部改成空地也是
 */
export const DEFAULT_PLAYGROUND: readonly (RideKind | null)[] = ['carousel', 'seesaw', 'swingset', 'trampoline'];
