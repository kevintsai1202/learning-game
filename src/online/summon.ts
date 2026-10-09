/**
 * 集合時每個孩子的位置（老師 GM 的 G2，伺服器與畫面共用的純函式，有單元測試 tests/online/summon.test.ts）：
 * 在老師身邊排成一圈，彼此至少隔 1 公尺；人多時往外再排一圈。老師站在島邊時整圈往島中央挪，全部都在島的範圍內。
 * 第一個位置在老師正前方（往出生點、鏡頭的方向），孩子傳送過去時看得到老師。
 */
import { WALK_RADIUS } from '../world/layout';

/** 島上的一個位置 */
export interface Spot {
  x: number;
  z: number;
}

/** 同一圈相鄰兩人的距離（公尺） */
const SPACING = 1.3;
/** 第一圈離老師多遠 */
const FIRST_RING = 2.2;
/** 圈與圈的間隔 */
const RING_GAP = 1.4;

/** 每一圈的半徑與人數（n 個人照順序從內圈排起） */
function rings(n: number): { r: number; count: number }[] {
  const out: { r: number; count: number }[] = [];
  let left = n;
  for (let r = FIRST_RING; left > 0; r += RING_GAP) {
    const count = Math.min(left, Math.max(1, Math.floor((2 * Math.PI * r) / SPACING)));
    out.push({ r, count });
    left -= count;
  }
  return out;
}

/** n 個孩子集合時的位置（照傳入的順序） */
export function summonSpots(center: Spot, n: number): Spot[] {
  if (n <= 0) return [];
  const layout = rings(n);
  const outer = layout[layout.length - 1].r;
  // 整圈要在島的範圍內：老師太靠邊時把圓心往島中央挪
  const d = Math.hypot(center.x, center.z);
  const maxD = Math.max(0, WALK_RADIUS - outer);
  const k = d > maxD && d > 0 ? maxD / d : 1;
  const c = { x: center.x * k, z: center.z * k };
  const spots: Spot[] = [];
  for (const { r, count } of layout) {
    for (let i = 0; i < count; i++) {
      // 從老師正前方（+z）開始，順時針排
      const a = (i / count) * 2 * Math.PI;
      spots.push({ x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r });
    }
  }
  return spots;
}
