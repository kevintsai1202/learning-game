/**
 * 擋住角色的建築變半透明（第 9 節優化，src/world/fadeGroup.ts）：把網格的材質換成半透明副本，走出來換回原本的。
 * toon 材質有共用快取（全島共用同一個材質物件），所以不能直接改原材質的不透明度。
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FADE_OPACITY, fadeGroup } from '../../src/world/fadeGroup';

/** 一棟假建築：兩個網格共用同一個材質、一個被合併網格藏起來的原始網格 */
function building() {
  const shared = new THREE.MeshToonMaterial({ color: '#ff8a3d' });
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const b = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  hidden.visible = false;
  g.add(a, b, hidden);
  return { g, a, b, hidden, shared };
}

describe('fadeGroup', () => {
  it('擋住時換成半透明副本（共用材質的網格共用同一個副本），原材質不變', () => {
    const { g, a, b, shared } = building();
    fadeGroup(g, true);
    expect(a.material).not.toBe(shared);
    expect(a.material).toBe(b.material);
    const m = a.material as THREE.Material;
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBeCloseTo(FADE_OPACITY);
    expect(m.depthWrite).toBe(false);
    expect(shared.opacity).toBe(1);
    expect(shared.transparent).toBe(false);
    expect(g.visible).toBe(true);
  });

  it('兩棟用同一個原材質：副本也共用（不會每棟各複製一份）', () => {
    const x = building();
    const y = building();
    y.a.material = x.shared;
    fadeGroup(x.g, true);
    fadeGroup(y.g, true);
    expect(y.a.material).toBe(x.a.material);
  });

  it('走出來換回原材質；重複呼叫不會疊加；藏起來的原始網格不動', () => {
    const { g, a, hidden, shared } = building();
    fadeGroup(g, true);
    fadeGroup(g, true);
    expect(hidden.material).toBe(shared);
    fadeGroup(g, false);
    expect(a.material).toBe(shared);
    fadeGroup(g, false);
    expect(a.material).toBe(shared);
  });
});
