/**
 * 集合時每個孩子的位置（src/online/summon.ts，老師 GM 的 G2）：在老師身邊排成一圈，彼此不重疊，都在島的範圍內。
 */
import { describe, expect, it } from 'vitest';
import { summonSpots } from '../../src/online/summon';
import { WALK_RADIUS } from '../../src/world/layout';

describe('summonSpots', () => {
  it('n 個位置圍著老師，彼此距離至少 1 公尺，離老師 2～6 公尺', () => {
    for (const n of [1, 2, 8, 30]) {
      const spots = summonSpots({ x: 0, z: 0 }, n);
      expect(spots).toHaveLength(n);
      for (const s of spots) {
        const d = Math.hypot(s.x, s.z);
        expect(d).toBeGreaterThanOrEqual(2);
        expect(d).toBeLessThanOrEqual(6);
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThanOrEqual(1);
    }
  });

  it('老師站在島的邊緣：位置都收回島的範圍內', () => {
    const edge = { x: WALK_RADIUS - 0.5, z: 0 };
    for (const s of summonSpots(edge, 12)) expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(WALK_RADIUS);
  });

  it('沒有人：空清單', () => {
    expect(summonSpots({ x: 0, z: 0 }, 0)).toEqual([]);
  });
});
