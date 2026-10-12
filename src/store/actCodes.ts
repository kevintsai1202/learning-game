/**
 * 會同步給別人看的動作代碼（自己的家第 9 節優化，docs/plans/home.md）：坐、躺、溜滑梯、盪鞦韆；
 * 班級島遊樂場（docs/plans/playground.md）的座位 ride0～ride7（座位編號，器材看他位置附近的那一座）。
 * 班級島大型設施的座位（co、wh）與飛船（sh；docs/plans/grand-rides.md）。
 * 位置訊息（move）多帶這個代碼，伺服器驗證與轉送用；不能 import 任何東西（伺服器共用，照 duelMoves.ts 的做法）。
 */
/** 班級島大型設施（docs/plans/grand-rides.md）的座位數：雲霄飛車 24、摩天輪 48（伺服器驗證代碼的範圍用） */
export const COASTER_SEATS = 24;
export const WHEEL_SEATS = 48;

/** 原本的代碼：坐、躺、溜滑梯、盪鞦韆、遊樂場的座位 */
const BASE_CODES = ['sit', 'lie', 'slide', 'swing', 'ride0', 'ride1', 'ride2', 'ride3', 'ride4', 'ride5', 'ride6', 'ride7'] as const;
/**
 * 一個動作代碼：原本的，加上大型設施的雲霄飛車座位 co0～co23、摩天輪座位 wh0～wh47、飛船 sh
 * （飛船的位置訊息送甲板上的局部座標）
 */
export type ActCode = (typeof BASE_CODES)[number] | `co${number}` | `wh${number}` | 'sh';
/** 全部的動作代碼（伺服器的格式驗證用 z.enum） */
export const ACT_CODES = [
  ...BASE_CODES,
  ...Array.from({ length: COASTER_SEATS }, (_, i) => `co${i}`),
  ...Array.from({ length: WHEEL_SEATS }, (_, i) => `wh${i}`),
  'sh',
] as unknown as readonly [ActCode, ...ActCode[]];

/** 大型設施的座位代碼（雲霄飛車 co、摩天輪 wh） */
export function grandSeatCode(ride: 'coaster' | 'wheel', seat: number): ActCode {
  return `${ride === 'coaster' ? 'co' : 'wh'}${seat}` as ActCode;
}

/** 動作代碼是大型設施的話回傳哪一樣與座位（飛船沒有座位，是 0）；不是回傳 null */
export function grandSeatOf(code: string): { ride: 'coaster' | 'wheel' | 'ship'; seat: number } | null {
  if (code === 'sh') return { ride: 'ship', seat: 0 };
  const m = /^(co|wh)(\d{1,2})$/.exec(code);
  if (!m) return null;
  const seat = Number(m[2]);
  const ride = m[1] === 'co' ? 'coaster' : 'wheel';
  return seat < (ride === 'coaster' ? COASTER_SEATS : WHEEL_SEATS) ? { ride, seat } : null;
}

/** 遊樂器材第 seat 個座位的代碼（0～7） */
export function rideSeatCode(seat: number): ActCode {
  return `ride${seat}` as ActCode;
}

/** 動作代碼是遊樂器材的座位的話回傳座位編號，不然是 null */
export function rideSeatOf(code: string): number | null {
  const m = /^ride([0-7])$/.exec(code);
  return m ? Number(m[1]) : null;
}
