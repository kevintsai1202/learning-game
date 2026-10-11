/**
 * 會同步給別人看的動作代碼（自己的家第 9 節優化，docs/plans/home.md）：坐、躺、溜滑梯、盪鞦韆；
 * 班級島遊樂場（docs/plans/playground.md）的座位 ride0～ride7（座位編號，器材看他位置附近的那一座）。
 * 位置訊息（move）多帶這個代碼，伺服器驗證與轉送用；不能 import 任何東西（伺服器共用，照 duelMoves.ts 的做法）。
 */
export const ACT_CODES = ['sit', 'lie', 'slide', 'swing', 'ride0', 'ride1', 'ride2', 'ride3', 'ride4', 'ride5', 'ride6', 'ride7'] as const;
/** 一個動作代碼 */
export type ActCode = (typeof ACT_CODES)[number];

/** 遊樂器材第 seat 個座位的代碼（0～7） */
export function rideSeatCode(seat: number): ActCode {
  return `ride${seat}` as ActCode;
}

/** 動作代碼是遊樂器材的座位的話回傳座位編號，不然是 null */
export function rideSeatOf(code: string): number | null {
  const m = /^ride([0-7])$/.exec(code);
  return m ? Number(m[1]) : null;
}
