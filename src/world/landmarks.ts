/**
 * 島上地標的純函式（L5，docs/plans/login-ux-review.md 第 4.5 節）：班級旗子的顏色、小屋地上要拿掉的樹。
 * 不碰 three 與畫面，有單元測試（tests/world/landmarks.test.ts）。
 */
import type { TreeSpot } from './scenery';
import type { IslandLook } from '../store/island';

/**
 * 3D 島嶼的外觀（L5）：天空（白天或黃昏）、班級旗子（班級名稱與顏色）、自己的小屋與門牌（孩子名字）。
 * 標題畫面與還沒選角色時是中性的白天，背景不隨最後一個角色改變
 */
export interface SceneLook {
  sky: 'day' | 'sunset';
  flag: { name: string; color: string } | null;
  home: { name: string } | null;
}

/** 依島的外觀算出場景要畫什麼；codes 是這個孩子的所有班級（旗子顏色不撞色用） */
export function sceneLookOf(look: IslandLook | null, codes: readonly string[]): SceneLook {
  if (!look) return { sky: 'day', flag: null, home: null };
  if (look.kind === 'class') return { sky: 'day', flag: { name: look.className, color: flagColorOf(look.classCode, codes) }, home: null };
  return { sky: look.kind === 'mine' ? 'sunset' : 'day', flag: null, home: { name: look.kidName } };
}

/** 旗面的色盤（比班級上限 5 多，一個孩子的幾個班一定分得到不同顏色） */
export const FLAG_COLORS = ['#e8457c', '#2f6fde', '#f2b705', '#8b5cf6', '#ff8a3d', '#2bb5c8', '#3fbf7f', '#c0392b'];

/** 班級代碼的簡單雜湊（取色盤用） */
function hashCode(code: string): number {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * 班級旗子的顏色：依代碼從色盤取色；codes 是這個孩子的所有班級（依加入順序），排在前面的班級先挑，
 * 撞色就往後換一個，所以同一個孩子的幾個班顏色一定不同
 */
export function flagColorOf(code: string, codes: readonly string[]): string {
  const taken = new Set<number>();
  for (const c of codes.includes(code) ? codes : [...codes, code]) {
    let i = hashCode(c) % FLAG_COLORS.length;
    while (taken.has(i)) i = (i + 1) % FLAG_COLORS.length;
    if (c === code) return FLAG_COLORS[i];
    taken.add(i);
  }
  return FLAG_COLORS[hashCode(code) % FLAG_COLORS.length];
}

/** 拿掉某個位置半徑 r 以內的樹（我的島空出小屋地；其他樹的位置不變） */
export function treesAway(trees: readonly TreeSpot[], spot: { x: number; z: number }, r: number): TreeSpot[] {
  return trees.filter((t) => Math.hypot(t.x - spot.x, t.z - spot.z) >= r);
}
