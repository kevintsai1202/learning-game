/**
 * 角色移動與碰撞（純函式，不依賴 three），給 3D 控制器每幀呼叫。
 */

export interface Vec2 {
  x: number;
  z: number;
}

/** 圓形障礙物 */
export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

/** 朝目標點走一步；回傳新位置與是否已抵達 */
export function stepToward(pos: Vec2, target: Vec2, speed: number, dt: number): { pos: Vec2; arrived: boolean } {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const step = speed * dt;
  if (dist <= step || dist < 1e-6) return { pos: { x: target.x, z: target.z }, arrived: true };
  return { pos: { x: pos.x + (dx / dist) * step, z: pos.z + (dz / dist) * step }, arrived: false };
}

/** 依輸入方向移動（方向向量長度超過 1 時正規化，斜走不會比較快） */
export function moveByInput(pos: Vec2, dir: Vec2, speed: number, dt: number): Vec2 {
  const len = Math.hypot(dir.x, dir.z);
  if (len < 1e-6) return { x: pos.x, z: pos.z };
  const k = (Math.min(len, 1) / len) * speed * dt;
  return { x: pos.x + dir.x * k, z: pos.z + dir.z * k };
}

/** 把位置推出所有障礙物，並限制在可行走半徑內（bodyR 為角色身體半徑） */
export function resolveCollisions(pos: Vec2, obstacles: Obstacle[], walkRadius: number, bodyR: number): Vec2 {
  let { x, z } = pos;
  for (let iter = 0; iter < 3; iter++) {
    for (const o of obstacles) {
      const dx = x - o.x;
      const dz = z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + bodyR;
      if (d < min) {
        // 剛好在圓心時往鏡頭方向（+z）推出去
        const nx = d > 1e-6 ? dx / d : 0;
        const nz = d > 1e-6 ? dz / d : 1;
        x = o.x + nx * min;
        z = o.z + nz * min;
      }
    }
    const r = Math.hypot(x, z);
    const max = walkRadius - bodyR;
    if (r > max) {
      x = (x / r) * max;
      z = (z / r) * max;
    }
  }
  return { x, z };
}

/** 回傳距離在 maxDist 以內、最近的門口 id；都太遠時回傳 null */
export function nearestDoor<T extends string>(pos: Vec2, doors: { id: T; x: number; z: number }[], maxDist: number): T | null {
  let best: T | null = null;
  let bestD = maxDist;
  for (const d of doors) {
    const dist = Math.hypot(pos.x - d.x, pos.z - d.z);
    if (dist <= bestD) {
      best = d.id;
      bestD = dist;
    }
  }
  return best;
}
