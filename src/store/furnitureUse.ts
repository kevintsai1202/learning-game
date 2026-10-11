/**
 * 可以用的家具（自己的家第 9 節優化，docs/plans/home.md；純資料與純函式）：坐、躺、溜滑梯、盪鞦韆、開關、沙堡。
 * - 座位表在家具的局部座標（格子中心為原點、正面朝 +z），跟著家具轉方向換成世界座標（localToWorld）。
 *   y 是角色往上抬的高度（角色身體底部約在 0.17×縮放），scale 是角色的縮放（鞦韆、滑梯、床的角色縮小，頭才不會穿過去）。
 * - 起身點在家具前面、碰撞圓外（距離格子中心至少 0.9 公尺）。
 * - 動作的時間軸 actFrame：本機的角色與別人看到的同一支函式（溜滑梯、鞦韆照時間播，不照收到的座標）。
 * 不 import 畫面、音訊、3D 的程式（之後伺服器若要驗證也能用）。
 */
import type { ActCode } from './actCodes';
import type { DecorSpace, YardItem } from './yard';

/** 家具的用法 */
export type UseKind = 'sit' | 'lie' | 'slide' | 'swing' | 'piano' | 'toggle' | 'sandcastle';

/** 座位（局部座標）：位置、抬高、朝向（局部，0 = 正面 +z）、角色縮放 */
export interface Seat {
  x: number;
  z: number;
  y: number;
  facing: number;
  scale: number;
}

/** 一種家具怎麼用 */
export interface UseSpec {
  kind: UseKind;
  /** 按鈕的字（開關類是「打開」的字） */
  label: string;
  /** 開關類、沙堡：已經打開時的按鈕字 */
  offLabel?: string;
  /** 坐、躺、盪、溜滑梯的座位（溜滑梯是爬梯子的起點） */
  seat?: Seat;
  /** 起來後站的位置（局部座標） */
  exit: { x: number; z: number };
}

/** 角色的姿勢 */
export type Pose = 'stand' | 'sit' | 'lie' | 'climb';

/** 鞦韆橫桿的高度（公尺；盪的樞軸；架子比角色高，盪的時候頭才不會穿過橫桿） */
export const SWING_PIVOT = 1.75;
/** 溜滑梯一趟多久（秒）：爬 1 秒、轉身 0.3 秒、溜 0.9 秒、站起來 0.2 秒 */
export const SLIDE_TIME = 2.4;

/** 可以用的家具（id 在 src/store/catalog.ts 的 FURNITURE；模型在 src/world/Furniture.tsx） */
export const FURNITURE_USE: Record<string, UseSpec> = {
  // 長椅：椅面頂 0.35，椅背在後面
  'decor.bench': { kind: 'sit', label: '🪑 坐下', seat: { x: 0, z: 0.02, y: 0.18, facing: 0, scale: 1 }, exit: { x: 0, z: 0.95 } },
  // 野餐桌：坐前面那條長凳（凳面頂 0.3），面向桌子
  'decor.picnic': { kind: 'sit', label: '🪑 坐下', seat: { x: 0, z: 0.42, y: 0.13, facing: Math.PI, scale: 1 }, exit: { x: 0, z: 1.0 } },
  // 椅子：椅面頂 0.45
  'decor.chair': { kind: 'sit', label: '🪑 坐下', seat: { x: 0, z: 0.03, y: 0.28, facing: 0, scale: 1 }, exit: { x: 0, z: 0.95 } },
  // 沙發：坐墊頂 0.41
  'decor.sofa': { kind: 'sit', label: '🛋️ 坐下', seat: { x: 0, z: 0.08, y: 0.24, facing: 0, scale: 1 }, exit: { x: 0, z: 1.0 } },
  // 鋼琴：坐琴椅（頂 0.34），面向琴鍵
  'decor.piano': { kind: 'piano', label: '🎹 彈琴', seat: { x: 0, z: 0.4, y: 0.17, facing: Math.PI, scale: 1 }, exit: { x: 0, z: 1.0 } },
  // 床：躺平（腳在床尾 +z、頭在床頭 -z），床墊頂約 0.44；角色縮小到半個（床只有 1 公尺長）
  'decor.bed': { kind: 'lie', label: '🛏️ 躺下', seat: { x: 0, z: 0.55, y: 0.64, facing: 0, scale: 0.5 }, exit: { x: 0, z: 1.0 } },
  // 溜滑梯：從梯子前面爬上去（面向梯子），從滑道尾端（+x）下來
  'decor.slide': { kind: 'slide', label: '🛝 溜滑梯', seat: { x: -0.32, z: 0.25, y: 0, facing: Math.PI, scale: 0.6 }, exit: { x: 1.0, z: 0.1 } },
  // 鞦韆：座椅頂 0.445（角色縮小，身體底部 0.1）
  'decor.swing': { kind: 'swing', label: '🎠 盪鞦韆', seat: { x: 0, z: 0, y: 0.345, facing: 0, scale: 0.6 }, exit: { x: 0, z: 1.0 } },
  // 開關類與沙堡：只在自己的畫面上變
  'decor.tv': { kind: 'toggle', label: '📺 開電視', offLabel: '📺 關電視', exit: { x: 0, z: 1.0 } },
  'decor.lamp': { kind: 'toggle', label: '💡 開燈', offLabel: '💡 關燈', exit: { x: 0, z: 1.0 } },
  'decor.floorlamp': { kind: 'toggle', label: '💡 開燈', offLabel: '💡 關燈', exit: { x: 0, z: 1.0 } },
  'decor.sandbox': { kind: 'sandcastle', label: '🏰 堆沙堡', offLabel: '🏰 推倒沙堡', exit: { x: 0, z: 1.0 } },
};

/** 會同步的動作代碼（鋼琴是坐著；開關、沙堡只在本機，沒有） */
export const ACT_OF_KIND: Partial<Record<UseKind, ActCode>> = { sit: 'sit', piano: 'sit', lie: 'lie', slide: 'slide', swing: 'swing' };

/** 這種家具怎麼用（不能用是 undefined） */
export function useSpecOf(id: string): UseSpec | undefined {
  return FURNITURE_USE[id];
}

/** 家具局部座標的一點換成世界座標（rotation.y = rot × 90°：x′ = x·cos + z·sin、z′ = −x·sin + z·cos） */
export function localToWorld(item: YardItem, space: DecorSpace, lx: number, lz: number): { x: number; z: number } {
  const a = (item.rot * Math.PI) / 2;
  const c = space.toWorld(item.gx, item.gz);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: c.x + lx * cos + lz * sin, z: c.z - lx * sin + lz * cos };
}

/** 局部的朝向換成世界的朝向（加上家具轉的角度） */
export function headingOf(item: YardItem, localFacing: number): number {
  return localFacing + (item.rot * Math.PI) / 2;
}

/** 起來後站的位置（世界座標） */
export function exitPoint(item: YardItem, space: DecorSpace): { x: number; z: number } {
  const spec = FURNITURE_USE[item.id];
  const e = spec?.exit ?? { x: 0, z: 1 };
  return localToWorld(item, space, e.x, e.z);
}

/** 鞦韆盪的角度（弧度；從 0 開始，最大 0.55） */
export function swingAngle(t: number): number {
  return 0.55 * Math.sin(t * 2.4);
}

/** 某一刻角色的樣子：位置（世界座標）、抬高、朝向、姿勢、縮放、繞樞軸的傾斜（鞦韆）、做完了沒（溜滑梯） */
export interface ActFrame {
  x: number;
  z: number;
  y: number;
  heading: number;
  pose: Pose;
  scale: number;
  /** 繞樞軸的傾斜（鞦韆前後盪；躺下是 -90°，樞軸在腳） */
  tiltX: number;
  /** 樞軸的高度（鞦韆是橫桿；其他是 0） */
  pivotY: number;
  done: boolean;
}

/** 兩個數之間依比例取值（比例夾在 0～1） */
function lerp(a: number, b: number, k: number): number {
  const t = Math.max(0, Math.min(1, k));
  return a + (b - a) * t;
}

/**
 * 溜滑梯的時間軸（局部座標）：爬梯子（面向梯子，越爬越高）→ 走到滑道頂端、轉身坐下 → 沿滑道溜下來（越溜越低）→
 * 站到滑道尾端外面
 */
function slideLocal(t: number): { x: number; z: number; y: number; facing: number; pose: Pose; done: boolean } {
  /** 塔頂高度、滑道頂端與尾端（局部 x）與那裡的抬高 */
  const TOP = 0.9;
  const startX = -0.32;
  const startZ = 0.25;
  const topX = -0.22;
  const topY = 0.72;
  const endX = 0.55;
  const endY = 0.02;
  if (t < 1) return { x: startX, z: startZ, y: lerp(0, TOP, t), facing: Math.PI, pose: 'climb', done: false };
  if (t < 1.3) {
    const k = (t - 1) / 0.3;
    return { x: lerp(startX, topX, k), z: lerp(startZ, 0.1, k), y: lerp(TOP, topY, k), facing: Math.PI / 2, pose: 'sit', done: false };
  }
  if (t < 2.2) {
    const k = (t - 1.3) / 0.9;
    return { x: lerp(topX, endX, k), z: 0.1, y: lerp(topY, endY, k), facing: Math.PI / 2, pose: 'sit', done: false };
  }
  const exit = FURNITURE_USE['decor.slide'].exit;
  if (t < SLIDE_TIME) {
    const k = (t - 2.2) / (SLIDE_TIME - 2.2);
    return { x: lerp(endX, exit.x, k), z: lerp(0.1, exit.z, k), y: lerp(endY, 0, k), facing: Math.PI / 2, pose: 'stand', done: false };
  }
  return { x: exit.x, z: exit.z, y: 0, facing: Math.PI / 2, pose: 'stand', done: true };
}

/**
 * 某一刻角色在家具上的樣子（t 是開始用之後幾秒；kind 是用法）：
 * 坐、鋼琴、躺、盪一直待在座位上（盪的時候繞橫桿前後擺）；溜滑梯照時間軸，做完 done
 */
export function actFrame(item: YardItem, space: DecorSpace, kind: UseKind, t: number): ActFrame {
  const spec = FURNITURE_USE[item.id];
  const seat = spec?.seat ?? { x: 0, z: 0, y: 0, facing: 0, scale: 1 };
  if (kind === 'slide') {
    const s = slideLocal(t);
    const w = localToWorld(item, space, s.x, s.z);
    return { x: w.x, z: w.z, y: s.y, heading: headingOf(item, s.facing), pose: s.pose, scale: seat.scale, tiltX: 0, pivotY: 0, done: s.done };
  }
  const w = localToWorld(item, space, seat.x, seat.z);
  const base = { x: w.x, z: w.z, y: seat.y, heading: headingOf(item, seat.facing), scale: seat.scale, done: false };
  // 躺下：先抬到床墊的高度（樞軸在那裡），再繞腳往後躺平（頭朝床頭 -z）
  if (kind === 'lie') return { ...base, pose: 'lie', tiltX: -Math.PI / 2, pivotY: seat.y };
  if (kind === 'swing') return { ...base, pose: 'sit', tiltX: swingAngle(t), pivotY: SWING_PIVOT };
  return { ...base, pose: 'sit', tiltX: 0, pivotY: 0 };
}

/** 角色旁邊（maxDist 內）最近的可以用的家具；沒有是 null */
export function nearestUsable(items: readonly YardItem[], pos: { x: number; z: number }, space: DecorSpace, maxDist = 1.5): YardItem | null {
  let best: YardItem | null = null;
  let bestD = maxDist;
  for (const it of items) {
    if (!FURNITURE_USE[it.id]) continue;
    const c = space.toWorld(it.gx, it.gz);
    const d = Math.hypot(c.x - pos.x, c.z - pos.z);
    if (d <= bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

/** 別人的動作代碼對應的家具：他附近（maxDist 內）最近的、用法對得上的那一件（坐包含鋼琴）；沒有是 null */
export function anchorFor(items: readonly YardItem[], space: DecorSpace, act: ActCode, pos: { x: number; z: number }, maxDist = 1.5): YardItem | null {
  let best: YardItem | null = null;
  let bestD = maxDist;
  for (const it of items) {
    const spec = FURNITURE_USE[it.id];
    if (!spec || ACT_OF_KIND[spec.kind] !== act) continue;
    const c = space.toWorld(it.gx, it.gz);
    const d = Math.hypot(c.x - pos.x, c.z - pos.z);
    if (d <= bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}
