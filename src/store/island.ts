/**
 * 班級島與我的島（老師 GM 的 G0＋G1，docs/plans/teacher-gm.md 第 3、4 節）。純函式，不碰畫面。
 * - 加入班級的孩子可以在「班級島」（和同學一起、用老師設定的教材版本）與「我的島」（自己玩、用家長選的版本）之間切換，
 *   每座島的星星、金幣、道具都記在同一份進度。
 * - 多班級（docs/plans/multi-class.md）：每一班一座班級島，教材版本照那一班老師的設定；
 *   沒選過時在第一個班級（最早加入的）的班級島，選的那一班不在清單裡了（退出、被移出）就回到第一個班級。
 * - 沒有班級的角色（單機、家長名下還沒加入班級的雲端角色）只有自己的島，和改版前一樣。
 */
import { DEFAULT_CURRICULUM, type CloudRoom, type CurriculumChoice, type Profile } from './save';

/** 兩種島：班級島、我的島 */
export type Island = 'class' | 'mine';

/** 要去的島：'mine' 是我的島，其他是班級代碼（那一班的班級島） */
export type IslandTarget = string;

/** 這個角色所在的班級（第一個班級在前面）；沒有班級是空清單 */
export function classesOf(p: Profile | null): CloudRoom[] {
  return p?.cloud?.rooms ?? [];
}

/** 這個角色現在在哪一班的班級島；在我的島、或沒有班級時是 null */
export function currentClass(p: Profile): CloudRoom | null {
  const rooms = classesOf(p);
  if (!rooms.length || p.cloud?.island === 'mine') return null;
  return rooms.find((r) => r.code === p.cloud?.island) ?? rooms[0];
}

/**
 * 島的外觀（L5，docs/plans/login-ux-review.md 第 4.5 節）：
 * - solo：沒有班級，只有自己的島，不需要區分（白天、原本的音樂、沒有所在地標籤與橫幅；門牌與小屋照樣有）
 * - class：有班級、在某一班的班級島（白天、班級旗子、原本的音樂）
 * - mine：有班級、切到自己的島（黃昏、門牌與小屋、另一首音樂）
 */
export type IslandLook =
  | { kind: 'solo'; kidName: string }
  | { kind: 'class'; kidName: string; classCode: string; className: string }
  | { kind: 'mine'; kidName: string };

/** 這個角色現在看到的島長什麼樣子 */
export function islandLook(p: Profile): IslandLook {
  const kidName = p.name;
  if (!classesOf(p).length) return { kind: 'solo', kidName };
  const room = currentClass(p);
  return room ? { kind: 'class', kidName, classCode: room.code, className: room.name } : { kind: 'mine', kidName };
}

/** 這個角色現在在哪一種島：有班級而且沒有切到我的島就在班級島 */
export function islandOf(p: Profile): Island {
  return currentClass(p) ? 'class' : 'mine';
}

/**
 * 現在要用的教材版本：在班級島而且那一班的老師統一了版本，就用班級版本；
 * 其他情況（老師沒有統一、在我的島、沒有班級）用孩子自己的設定。
 */
export function activeCurriculum(p: Profile): CurriculumChoice {
  const own = p.curriculum ?? DEFAULT_CURRICULUM;
  return currentClass(p)?.curriculum ?? own;
}

/** 家長在裝置上匯入的題庫要不要顯示：班級島不顯示，只在自己的島顯示（使用者決定，teacher-gm.md 第 12 節第 2 點） */
export function devicePacksVisible(p: Profile | null): boolean {
  return !p || islandOf(p) === 'mine';
}

/**
 * 換島（只改本機的雲端標記，不是進度，所以不產生同步操作）：記下 'mine'（我的島）或班級代碼；沒有班級的角色不變。
 */
export function withIsland(p: Profile, island: IslandTarget): Profile {
  if (!p.cloud || !classesOf(p).length) return p;
  return { ...p, cloud: { ...p.cloud, island } };
}
