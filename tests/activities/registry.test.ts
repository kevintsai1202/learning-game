import { describe, expect, it } from 'vitest';
import { ALL_ACTIVITIES, activitiesInZone, getActivity } from '../../src/activities/registry';
import { mixFrom } from '../../src/activities/tower';
import { MATH_ACTIVITIES } from '../../src/activities/math';
import { questionSchema } from '../../src/content/schema';
import { checkAnswer, correctResponse } from '../../src/engine/check';

describe('活動總表', () => {
  it('活動 id 不重複，每個活動都屬於島上的建築', () => {
    const ids = ALL_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ALL_ACTIVITIES) expect(['math', 'zh', 'en', 'life', 'tower', 'shop']).toContain(a.zone);
  });

  it('每個活動產生的題目都符合題庫格式，標準答案判為正確', () => {
    for (const a of ALL_ACTIVITIES) {
      const levels = a.levels ? ([1, 2, 3] as const) : ([1] as const);
      for (const level of levels) {
        const qs = a.make({ seed: 20261001, count: a.count, level });
        expect(qs.length, `${a.id} L${level}`).toBeGreaterThan(0);
        for (const q of qs) {
          const r = questionSchema.safeParse(q);
          expect(r.success, `${a.id} ${q.id}：${r.success ? '' : JSON.stringify(r.error.issues[0])}`).toBe(true);
          expect(checkAnswer(q, correctResponse(q)), q.id).toBe(true);
        }
      }
    }
  });

  it('數學城堡有全部數學技能，查不到的活動會丟出錯誤', () => {
    expect(activitiesInZone('math').length).toBe(MATH_ACTIVITIES.length);
    expect(() => getActivity('nope')).toThrow();
  });
});

describe('段考模擬 mixFrom', () => {
  it('湊滿指定題數、不重複、不含描寫題，且相同種子結果相同', () => {
    for (const seed of [1, 2, 3, 99, 2026]) {
      const qs = mixFrom(MATH_ACTIVITIES, { seed, count: 15, level: 2 }, 2);
      expect(qs).toHaveLength(15);
      expect(new Set(qs.map((q) => q.id)).size).toBe(15);
      expect(qs.some((q) => q.type === 'write')).toBe(false);
      expect(mixFrom(MATH_ACTIVITIES, { seed, count: 15, level: 2 }, 2)).toEqual(qs);
      // 每個技能最多 2 題，題目分散在多個單元
      const perSkill = new Map<string, number>();
      for (const q of qs) perSkill.set(q.skill, (perSkill.get(q.skill) ?? 0) + 1);
      expect(Math.max(...perSkill.values())).toBeLessThanOrEqual(2);
    }
  });
});
