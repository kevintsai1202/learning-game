/**
 * 找不同的規則（純函式）：產生左右兩張風景、挑出不同處、點擊判定、星數、機器人找到的速度。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/core/rng';
import {
  DIFFS_BY_LEVEL,
  SCENE_H,
  SCENE_W,
  SPOT_SECONDS,
  botFindDelay,
  hitDiff,
  makeSpotScene,
  spotStars,
  spotTap,
  type SceneObject,
} from '../../../src/engine/puzzle/spotDiff';

/** 兩個物件看起來一樣嗎（位置、種類、顏色、大小、方向都相同） */
const same = (a: SceneObject, b: SceneObject) => JSON.stringify(a) === JSON.stringify(b);

describe('找不同：產生風景', () => {
  it('簡單 3 處、普通 5 處、厲害 7 處不同', () => {
    expect(DIFFS_BY_LEVEL).toEqual({ 1: 3, 2: 5, 3: 7 });
    for (const level of [1, 2, 3] as const) expect(makeSpotScene(level * 11, level).diffs).toHaveLength(DIFFS_BY_LEVEL[level]);
  });

  it('每一處不同都真的不一樣；其他物件左右完全相同', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const level of [1, 2, 3] as const) {
        const scene = makeSpotScene(seed, level);
        const changed = new Set(scene.diffs.map((d) => d.objectId));
        for (const left of scene.left) {
          const right = scene.right.find((o) => o.id === left.id);
          if (changed.has(left.id)) expect(right && same(left, right), `seed ${seed} 物件 ${left.id}`).toBeFalsy();
          else expect(right && same(left, right), `seed ${seed} 物件 ${left.id}`).toBe(true);
        }
        // 右圖不會多出左圖沒有的物件
        for (const right of scene.right) expect(scene.left.some((o) => o.id === right.id)).toBe(true);
      }
    }
  });

  it('物件都在畫面裡；不同處的點擊範圍互不重疊（點一下不會算到兩處）', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const scene = makeSpotScene(seed, 3);
      for (const o of scene.left) {
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.x).toBeLessThanOrEqual(SCENE_W);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeLessThanOrEqual(SCENE_H);
      }
      for (const a of scene.diffs) {
        for (const b of scene.diffs) {
          if (a === b) continue;
          expect(Math.hypot(a.x - b.x, a.y - b.y), `seed ${seed}`).toBeGreaterThan(a.r + b.r);
        }
      }
    }
  });

  it('簡單只改顏色或拿掉一樣；左右翻轉只出現在厲害', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const d of makeSpotScene(seed, 1).diffs) expect(['color', 'missing']).toContain(d.change);
      for (const d of makeSpotScene(seed, 2).diffs) expect(d.change).not.toBe('flip');
    }
    const kinds = new Set(Array.from({ length: 30 }, (_, i) => makeSpotScene(i + 1, 3).diffs.map((d) => d.change)).flat());
    expect(kinds).toEqual(new Set(['color', 'missing', 'size', 'flip']));
  });

  it('同一個種子出同一組圖', () => {
    expect(makeSpotScene(123, 2)).toEqual(makeSpotScene(123, 2));
  });
});

describe('找不同：點擊判定', () => {
  const scene = makeSpotScene(7, 2);

  it('點在不同處的範圍裡算找到；點別的地方不算', () => {
    const d = scene.diffs[2];
    expect(hitDiff(scene, [], d.x, d.y)).toBe(2);
    expect(hitDiff(scene, [], d.x + d.r * 0.7, d.y)).toBe(2);
    expect(hitDiff(scene, [], -50, -50)).toBe(-1);
  });

  it('已經找到的不再算', () => {
    const d = scene.diffs[0];
    expect(hitDiff(scene, [0], d.x, d.y)).toBe(-1);
  });

  it('點的結果：找到新的一處、重複點已經圈起來的地方（不算點錯）、點錯', () => {
    const d = scene.diffs[1];
    expect(spotTap(scene, [], d.x, d.y)).toEqual({ kind: 'hit', index: 1 });
    expect(spotTap(scene, [1], d.x, d.y)).toEqual({ kind: 'again' });
    expect(spotTap(scene, [1], -50, -50)).toEqual({ kind: 'miss' });
  });
});

describe('找不同：星數與機器人', () => {
  it('時間：簡單 90 秒、普通 120 秒、厲害 150 秒', () => {
    expect(SPOT_SECONDS).toEqual({ 1: 90, 2: 120, 3: 150 });
  });

  it('全部找到而且剩四成以上時間 3 星、全部找到 2 星、沒找完 1 星', () => {
    expect(spotStars(5, 5, 60, 120)).toBe(3);
    expect(spotStars(5, 5, 48, 120)).toBe(3);
    expect(spotStars(5, 5, 30, 120)).toBe(2);
    expect(spotStars(4, 5, 0, 120)).toBe(1);
  });

  it('機器人每隔幾秒找到一處，越厲害越快', () => {
    const avg = (level: 1 | 2 | 3) => {
      const rng = createRng(level);
      let sum = 0;
      for (let i = 0; i < 300; i++) {
        const ms = botFindDelay(level, rng);
        expect(ms).toBeGreaterThanOrEqual(4000);
        expect(ms).toBeLessThanOrEqual(20000);
        sum += ms;
      }
      return sum / 300;
    };
    expect(avg(3)).toBeLessThan(avg(2));
    expect(avg(2)).toBeLessThan(avg(1));
  });
});
