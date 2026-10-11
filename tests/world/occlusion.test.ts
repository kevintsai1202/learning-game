/**
 * 建築擋住角色時隱形（自己的家改版，docs/plans/home.md 第 7 節）：鏡頭到角色頭頂的線段穿過哪些建築的包圍球。
 */
import { describe, expect, it } from 'vitest';
import { occluders, type Occluder } from '../../src/world/occlusion';

const SHOP: Occluder = { id: 'shop', x: 0, y: 2.5, z: 0, r: 3 };

describe('occluders', () => {
  it('角色在建築正後方（建築擋在鏡頭和角色之間）：擋住', () => {
    const camera = { x: 0, y: 15, z: 20 };
    const player = { x: 0, y: 1, z: -3 };
    expect(occluders(camera, player, [SHOP])).toEqual(['shop']);
  });

  it('角色在建築旁邊（線段沒有穿過）：不擋', () => {
    const camera = { x: 8, y: 15, z: 20 };
    const player = { x: 8, y: 1, z: -2 };
    expect(occluders(camera, player, [SHOP])).toEqual([]);
  });

  it('角色站在鏡頭和建築之間（建築在角色後面）：不擋', () => {
    const camera = { x: 0, y: 15, z: 25 };
    const player = { x: 0, y: 1, z: 6 };
    expect(occluders(camera, player, [SHOP])).toEqual([]);
  });

  it('好幾棟建築：只回傳擋住的那幾棟', () => {
    const camera = { x: 0, y: 15, z: 20 };
    const player = { x: 0, y: 1, z: -3 };
    const far: Occluder = { id: 'tower', x: 0, y: 3, z: -15, r: 4 };
    expect(occluders(camera, player, [SHOP, far])).toEqual(['shop']);
  });
});
