/**
 * 建築擋住角色時隱形（自己的家改版，docs/plans/home.md 第 7 節）：鏡頭到角色頭頂的線段穿過哪些建築的包圍球。
 * 純函式；島嶼場景每一格畫面呼叫一次，擋住的建築設成 visible = false（建築的材質有共用快取，不能改不透明度）。
 */

/** 一棟建築的包圍球：id、球心（世界座標）、半徑 */
export interface Occluder {
  id: string;
  x: number;
  y: number;
  z: number;
  r: number;
}

/** 三維的點 */
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 擋住角色的建築：線段（鏡頭 → 角色頭頂）上離球心最近的點在線段中間（不在兩端外），而且距離小於半徑。
 * 建築在角色後面（最近點在角色那一端之外）或在旁邊（距離太遠）都不算
 */
export function occluders(camera: Vec3, target: Vec3, spheres: readonly Occluder[]): string[] {
  const dx = target.x - camera.x;
  const dy = target.y - camera.y;
  const dz = target.z - camera.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 === 0) return [];
  const out: string[] = [];
  for (const s of spheres) {
    const t = ((s.x - camera.x) * dx + (s.y - camera.y) * dy + (s.z - camera.z) * dz) / len2;
    if (t <= 0 || t >= 1) continue;
    const px = camera.x + dx * t - s.x;
    const py = camera.y + dy * t - s.y;
    const pz = camera.z + dz * t - s.z;
    if (Math.hypot(px, py, pz) < s.r) out.push(s.id);
  }
  return out;
}
