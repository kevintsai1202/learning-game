/**
 * 島上的地標（L5，docs/plans/login-ux-review.md 第 4.5 節）：班級旗子的顏色依班級不同（多班級時一個孩子的幾個班一定不同色）；
 * 我的島的小屋地上的樹拿掉（其他島的樹一棵不動）。
 */
import { describe, expect, it } from 'vitest';
import { FLAG_COLORS, flagColorOf, sceneLookOf, treesAway } from '../../src/world/landmarks';
import { placeTrees } from '../../src/world/scenery';
import { HOUSE } from '../../src/world/layout';

describe('班級旗子的顏色', () => {
  it('同一個代碼每次都同一個顏色，顏色來自色盤', () => {
    expect(flagColorOf('123456', ['123456'])).toBe(flagColorOf('123456', ['123456']));
    expect(FLAG_COLORS).toContain(flagColorOf('123456', ['123456']));
  });

  it('一個孩子的好幾個班級顏色都不同（色盤撞色時換下一個）', () => {
    // 找兩個雜湊撞色的代碼
    const base = flagColorOf('100000', ['100000']);
    let other = '100001';
    for (let n = 100001; n < 101000; n++) {
      if (flagColorOf(String(n), [String(n)]) === base) {
        other = String(n);
        break;
      }
    }
    expect(flagColorOf(other, [other])).toBe(base);
    const codes = ['100000', other];
    expect(flagColorOf('100000', codes)).not.toBe(flagColorOf(other, codes));
    // 五個班級（上限）也都不同
    const five = ['100000', other, '200000', '300000', '400000'];
    expect(new Set(five.map((c) => flagColorOf(c, five))).size).toBe(5);
  });
});

describe('小屋地上的樹', () => {
  it('只拿掉小屋附近的樹，其他的位置與數量不變', () => {
    const trees = placeTrees();
    const kept = treesAway(trees, HOUSE, HOUSE.clear);
    expect(kept.every((t) => Math.hypot(t.x - HOUSE.x, t.z - HOUSE.z) >= HOUSE.clear)).toBe(true);
    const removed = trees.filter((t) => !kept.includes(t));
    expect(removed.every((t) => Math.hypot(t.x - HOUSE.x, t.z - HOUSE.z) < HOUSE.clear)).toBe(true);
    expect(kept.length + removed.length).toBe(trees.length);
  });
});

describe('場景外觀（3D 島嶼依島切換）', () => {
  it('標題畫面、還沒選角色：中性的白天，沒有旗子也沒有小屋', () => {
    expect(sceneLookOf(null, [])).toEqual({ sky: 'day', flag: null, home: null });
  });

  it('沒有班級：白天、有小屋與門牌（自己的島），沒有旗子', () => {
    expect(sceneLookOf({ kind: 'solo', kidName: '小安' }, [])).toEqual({ sky: 'day', flag: null, home: { name: '小安' } });
  });

  it('班級島：白天、那一班的旗子（顏色依班級），沒有小屋', () => {
    const look = sceneLookOf({ kind: 'class', kidName: '小安', classCode: '123456', className: '二年一班' }, ['123456', '654321']);
    expect(look).toEqual({ sky: 'day', flag: { name: '二年一班', color: flagColorOf('123456', ['123456', '654321']) }, home: null });
  });

  it('有班級的孩子在自己的島：黃昏、小屋與門牌，沒有旗子', () => {
    expect(sceneLookOf({ kind: 'mine', kidName: '小安' }, ['123456'])).toEqual({ sky: 'sunset', flag: null, home: { name: '小安' } });
  });
});
