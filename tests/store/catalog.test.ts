import { describe, expect, it } from 'vitest';
import { HATS, findItem } from '../../src/store/catalog';

describe('商品目錄', () => {
  it('帽子清單與價格沒有變（從 Hats.tsx 搬出來時不能改到內容）', () => {
    expect(HATS.map((h) => [h.id, h.price])).toEqual([
      ['hat.party', 20],
      ['hat.cap', 30],
      ['hat.flower', 40],
      ['hat.straw', 50],
      ['hat.helmet', 60],
      ['hat.chef', 60],
      ['hat.crown', 120],
      ['hat.wizard', 150],
    ]);
  });

  it('用 id 查得到商品與價格；查不到回傳 undefined', () => {
    expect(findItem('hat.crown')).toMatchObject({ id: 'hat.crown', name: '皇冠', price: 120 });
    expect(findItem('hat.unknown')).toBeUndefined();
  });
});
