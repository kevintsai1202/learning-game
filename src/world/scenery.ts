/**
 * 島上裝飾物的擺放（純函式、固定種子）：樹、花、石頭、步道石。
 * 會避開建築、門口步道、中央廣場與出生點，樹的位置也當成碰撞障礙。
 */
import { createRng } from '../core/rng';
import { FOUNTAIN, SPAWN, TEACHER_POS, WALK_RADIUS, ZONES, doorOf } from './layout';
import type { Obstacle } from './movement';

export interface TreeSpot {
  x: number;
  z: number;
  /** 大小倍率 */
  s: number;
  kind: 'round' | 'pine' | 'palm';
  /** 樹冠顏色 */
  color: string;
}

/** 廣場中心與半徑 */
export const PLAZA = { x: 0, z: -2.5, radius: 6 };

/** 點到線段的距離 */
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2)) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** 步道：廣場中心到每個門口，以及出生點到廣場 */
export function pathSegments(): { ax: number; az: number; bx: number; bz: number }[] {
  const segs = ZONES.map((z) => {
    const d = doorOf(z);
    return { ax: PLAZA.x, az: PLAZA.z, bx: d.x, bz: d.z };
  });
  segs.push({ ax: PLAZA.x, az: PLAZA.z, bx: SPAWN.x, bz: SPAWN.z + 6 });
  return segs;
}

/** 這個位置是否空著（不在建築、步道、廣場、出生點附近） */
export function isFree(x: number, z: number, margin: number): boolean {
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + margin) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 3 + margin) return false;
  for (const zone of ZONES) if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + 1.6 + margin) return false;
  for (const s of pathSegments()) if (distToSegment(x, z, s.ax, s.az, s.bx, s.bz) < 1.4 + margin) return false;
  return true;
}

/** 擺放樹木：草地上的圓樹與松樹、沙灘上的椰子樹 */
export function placeTrees(seed = 2026): TreeSpot[] {
  const rng = createRng(seed);
  const out: TreeSpot[] = [];
  const greens = ['#4aa84d', '#59c25b', '#3d9a59', '#7ad36a', '#2f8f5b'];
  const farEnough = (x: number, z: number, d: number) => out.every((t) => Math.hypot(t.x - x, t.z - z) > d);
  for (let tries = 0; tries < 2000 && out.filter((t) => t.kind !== 'palm').length < 30; tries++) {
    const a = rng.next() * Math.PI * 2;
    const r = 6 + Math.sqrt(rng.next()) * (WALK_RADIUS - 6.5);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (!isFree(x, z, 0.4) || !farEnough(x, z, 2.2)) continue;
    // 鏡頭在角色南方，出生點附近（島的南半部中央）種樹會擋住視線
    if (z > 2 && Math.abs(x) < 9) continue;
    out.push({ x, z, s: 0.75 + rng.next() * 0.4, kind: rng.chance(0.35) ? 'pine' : 'round', color: rng.pick(greens) });
  }
  // 沙灘椰子樹：避開南邊碼頭
  for (let tries = 0; tries < 600 && out.filter((t) => t.kind === 'palm').length < 9; tries++) {
    const a = rng.next() * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.35) continue;
    const r = 22.3 + rng.next() * 1.4;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (!farEnough(x, z, 3)) continue;
    out.push({ x, z, s: 0.9 + rng.next() * 0.4, kind: 'palm', color: '#3fbf7f' });
  }
  return out;
}

/** 擺放小花（純裝飾，不擋路） */
export function placeFlowers(seed = 7): { x: number; z: number; color: string }[] {
  const rng = createRng(seed);
  const colors = ['#ff9db0', '#ffc93c', '#ffffff', '#c9a7ff', '#ff6b4a'];
  const out: { x: number; z: number; color: string }[] = [];
  for (let tries = 0; tries < 3000 && out.length < 140; tries++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * (WALK_RADIUS - 0.8);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (!isFree(x, z, -0.6)) continue;
    out.push({ x, z, color: rng.pick(colors) });
  }
  return out;
}

/** 所有碰撞障礙：建築、噴水池、熊熊老師、樹 */
export function worldObstacles(trees: TreeSpot[]): Obstacle[] {
  return [
    ...ZONES.map((z) => ({ x: z.x, z: z.z, r: z.radius })),
    { x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.radius },
    { x: TEACHER_POS.x, z: TEACHER_POS.z, r: 0.8 },
    ...trees.filter((t) => t.kind !== 'palm').map((t) => ({ x: t.x, z: t.z, r: 0.55 * t.s })),
  ];
}
