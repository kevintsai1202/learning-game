import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '../../src/core/rng';

describe('createRng 可指定種子的亂數', () => {
  it('同一個種子產生同一串數字', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('不同種子產生不同的數字', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it('int 會落在兩端都含的範圍內，而且兩端都取得到', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('int 的 max 小於 min 時丟出錯誤', () => {
    expect(() => createRng(1).int(5, 2)).toThrow();
  });

  it('shuffle 不改動原陣列，且元素相同', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng(9).shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(src);
  });

  it('pick 空陣列丟出錯誤', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});

describe('hashString', () => {
  it('相同字串得到相同雜湊、不同字串大多不同', () => {
    expect(hashString('數學城堡')).toBe(hashString('數學城堡'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});
