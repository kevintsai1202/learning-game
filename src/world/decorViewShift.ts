/**
 * 家具包打開時畫面往上移多少（自己的家第 10 節第 ① 批，docs/plans/home.md）：直式手機的家具包在下方、角色在畫面中間，
 * 畫面往上移，角色才會留在家具包上方。橫式手機與電腦的角色本來就在家具包上方，不移。
 * Player 每一格用 camera.setViewOffset 移渲染的窗（不改鏡頭方向；點擊的射線照樣準）。
 */

/** 直式手機往上移畫面高的幾成 */
const SHIFT_RATIO = 0.15;
/** 最多移幾 px */
const SHIFT_MAX = 140;

/** 畫面往上移幾 px（width、height 是畫布大小，open 是家具包或壁紙地板面板打開了） */
export function decorViewShift(width: number, height: number, open: boolean): number {
  if (!open || height <= width * 1.1) return 0;
  return Math.min(height * SHIFT_RATIO, SHIFT_MAX);
}
