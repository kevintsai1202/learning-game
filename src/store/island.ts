/**
 * 班級島與我的島（老師 GM 的 G0＋G1，docs/plans/teacher-gm.md 第 3、4 節）。純函式，不碰畫面。
 * - 加入班級的孩子可以在「班級島」（和同學一起、用老師設定的教材版本）與「我的島」（自己玩、用家長選的版本）之間切換，
 *   兩座島的星星、金幣、道具都記在同一份進度。
 * - 沒有班級的角色（單機、家長名下還沒加入班級的雲端角色）只有自己的島，和改版前一樣。
 */
import { DEFAULT_CURRICULUM, type CurriculumChoice, type Profile } from './save';

/** 兩座島：班級島、我的島 */
export type Island = 'class' | 'mine';

/** 這個角色現在在哪座島：有班級而且沒有切到我的島就在班級島 */
export function islandOf(p: Profile): Island {
  return p.cloud?.room && p.cloud.island !== 'mine' ? 'class' : 'mine';
}

/**
 * 現在要用的教材版本：在班級島而且老師統一了版本，就用班級版本；
 * 其他情況（老師沒有統一、在我的島、沒有班級）用孩子自己的設定。
 */
export function activeCurriculum(p: Profile): CurriculumChoice {
  const own = p.curriculum ?? DEFAULT_CURRICULUM;
  return islandOf(p) === 'class' ? (p.cloud?.roomCurriculum ?? own) : own;
}

/** 家長在裝置上匯入的題庫要不要顯示：班級島不顯示，只在自己的島顯示（使用者決定，第 12 節第 2 點） */
export function devicePacksVisible(p: Profile | null): boolean {
  return !p || islandOf(p) === 'mine';
}

/**
 * 切換島（只改本機的雲端標記，不是進度，所以不產生同步操作）：
 * 切到我的島記下 island: 'mine'，切回班級島就拿掉；沒有班級的角色不變。
 */
export function withIsland(p: Profile, island: Island): Profile {
  if (!p.cloud?.room) return p;
  const { island: _old, ...cloud } = p.cloud;
  return { ...p, cloud: island === 'mine' ? { ...cloud, island: 'mine' } : cloud };
}
