/**
 * 擋住角色的建築變半透明（自己的家第 9 節優化，docs/plans/home.md）：把一棟建築的網格材質換成半透明副本，
 * 走出來換回原本的材質。
 * 建築的 toon 材質有共用快取（全島同顏色共用同一個材質物件），不能直接改原材質的不透明度，不然別棟也會變淡；
 * 副本依原材質快取（全島共用，擋住的建築都一樣淡）。原材質記在網格的 userData，StaticMerge 重建後的新網格也照樣處理。
 * 只換看得到的網格（StaticMerge 把原始網格藏起來、另外畫合併後的網格）。
 */
import type * as THREE from 'three';

/** 半透明的不透明度 */
export const FADE_OPACITY = 0.3;

/** 原材質 → 半透明副本 */
const fadedCache = new Map<THREE.Material, THREE.Material>();

/** 原材質的半透明副本（第一次用到才複製） */
function fadedOf(orig: THREE.Material): THREE.Material {
  let f = fadedCache.get(orig);
  if (!f) {
    f = orig.clone();
    f.transparent = true;
    f.opacity = Math.min(orig.opacity, FADE_OPACITY);
    f.depthWrite = false;
    fadedCache.set(orig, f);
  }
  return f;
}

/** 一棟建築變半透明（on）或換回原材質；重複呼叫不會疊加 */
export function fadeGroup(group: THREE.Object3D, on: boolean): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const orig = mesh.userData.fadeOrig as THREE.Material | undefined;
    if (on) {
      if (orig || !mesh.visible || Array.isArray(mesh.material)) return;
      mesh.userData.fadeOrig = mesh.material;
      mesh.material = fadedOf(mesh.material);
    } else if (orig) {
      mesh.material = orig;
      delete mesh.userData.fadeOrig;
    }
  });
}
