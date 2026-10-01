import { describe, expect, it } from 'vitest';
import { RECYCLE_BINS, RECYCLE_ITEMS, genRecycle } from '../../src/engine/life/recycle';
import { questionSchema } from '../../src/content/schema';
import { checkAnswer, correctResponse } from '../../src/engine/check';
import { LIFE_INDICATORS } from '../../src/content/life/codes';

describe('垃圾分類大作戰', () => {
  it('每回合 10 題、不重複、相同種子結果相同', () => {
    const a = genRecycle({ seed: 5, count: 10, level: 1 });
    expect(a).toHaveLength(10);
    expect(new Set(a.map((q) => q.id)).size).toBe(10);
    expect(genRecycle({ seed: 5, count: 10, level: 1 })).toEqual(a);
  });

  it('選項固定為三個桶子（3D 舞台依同樣順序擺放），正解對應物品的分類', () => {
    for (const q of genRecycle({ seed: 9, count: RECYCLE_ITEMS.length, level: 1 })) {
      if (q.type !== 'choice' || q.visual?.kind !== 'bins') throw new Error('應為分類選擇題');
      expect(q.options.map((o) => o.text)).toEqual(RECYCLE_BINS.map((b) => b.text));
      const item = RECYCLE_ITEMS.find((it) => it.emoji === (q.visual as { item: string }).item)!;
      expect(q.answer).toBe(item.bin);
      expect(questionSchema.safeParse(q).success).toBe(true);
      expect(checkAnswer(q, correctResponse(q))).toBe(true);
      for (const code of q.indicators) expect(LIFE_INDICATORS[code], code).toBeTruthy();
    }
  });

  it('三類都有物品，而且物品名稱不重複', () => {
    for (const bin of [0, 1, 2]) expect(RECYCLE_ITEMS.filter((it) => it.bin === bin).length).toBeGreaterThanOrEqual(5);
    expect(new Set(RECYCLE_ITEMS.map((it) => it.name)).size).toBe(RECYCLE_ITEMS.length);
  });
});
