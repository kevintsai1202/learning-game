import { describe, expect, it } from 'vitest';
import { LIFE_ACTIVITIES } from '../../src/activities/life';
import { LIFE_INDICATORS } from '../../src/content/life/codes';
import { questionSchema } from '../../src/content/schema';
import { checkAnswer, correctResponse } from '../../src/engine/check';
import { LIFE_TOPICS, allLifeQuestions, hasEmoji } from '../../src/engine/life';

/** 一組測試用種子 */
const SEEDS = Array.from({ length: 10 }, (_, i) => i * 7919 + 1);

describe('生活與健康：活動清單', () => {
  it('至少 7 個活動，id 不重複、屬於生活區與生活科、每回合 10 題、不分難度', () => {
    expect(LIFE_ACTIVITIES.length).toBeGreaterThanOrEqual(7);
    const ids = LIFE_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of LIFE_ACTIVITIES) {
      expect(a.zone, a.id).toBe('life');
      expect(a.subject, a.id).toBe('life');
      expect(a.count, a.id).toBe(10);
      expect(a.levels, a.id).toBe(false);
      expect(a.indicators.length, a.id).toBeGreaterThan(0);
      for (const code of a.indicators) expect(LIFE_INDICATORS[code], `${a.id} ${code}`).toBeTruthy();
    }
  });

  it('LIFE_INDICATORS 只收題庫有用到的代碼', () => {
    const used = new Set(LIFE_TOPICS.flatMap((t) => t.items.flatMap((i) => i.indicators)));
    for (const code of Object.keys(LIFE_INDICATORS)) expect(used.has(code), code).toBe(true);
  });
});

for (const activity of LIFE_ACTIVITIES) {
  const topic = LIFE_TOPICS.find((t) => t.id === activity.id)!;

  describe(activity.id, () => {
    it('題庫至少 24 題', () => {
      expect(topic.items.length).toBeGreaterThanOrEqual(24);
    });

    it('指定題數、id 不重複、相同種子結果相同', () => {
      for (const seed of SEEDS) {
        const qs = activity.make({ seed, count: 10, level: 1 });
        expect(qs.length).toBe(10);
        expect(new Set(qs.map((q) => q.id)).size).toBe(10);
        expect(activity.make({ seed, count: 10, level: 1 })).toEqual(qs);
      }
      // 不同種子要有不同的題目組合
      const a = activity.make({ seed: 1, count: 10, level: 1 }).map((q) => q.id).join();
      const b = activity.make({ seed: 2, count: 10, level: 1 }).map((q) => q.id).join();
      expect(a).not.toBe(b);
    });

    it('題目 id 穩定：同一題不論種子，id 與內容的對應不變', () => {
      const byId = new Map<string, string>();
      for (const seed of SEEDS) {
        for (const q of activity.make({ seed, count: 10, level: 1 })) {
          expect(q.id.startsWith(`${activity.id}:`)).toBe(true);
          const prev = byId.get(q.id);
          if (prev !== undefined) expect(prev, q.id).toBe(q.prompt);
          byId.set(q.id, q.prompt);
        }
      }
    });

    it('題庫每一題都通過 schema、標準答案判為正確、選項不重複', () => {
      const qs = allLifeQuestions(topic);
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
      for (const q of qs) {
        const parsed = questionSchema.safeParse(q);
        expect(parsed.success, `${q.id} ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`).toBe(true);
        expect(q.subject).toBe('life');
        expect(q.skill).toBe(activity.id);
        expect(checkAnswer(q, correctResponse(q)), q.id).toBe(true);
        if (q.type === 'choice') {
          const keys = q.options.map((o) => `${o.text ?? ''}|${o.emoji ?? ''}`);
          expect(new Set(keys).size, q.id).toBe(keys.length);
          expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
        }
        if (q.type === 'order') {
          expect(new Set(q.answer).size, q.id).toBe(q.answer.length);
        }
      }
    });

    it('每題都有課綱代碼（且都在 LIFE_INDICATORS）、依據說明與解說', () => {
      for (const q of allLifeQuestions(topic)) {
        expect(q.indicators.length, q.id).toBeGreaterThan(0);
        for (const code of q.indicators) expect(LIFE_INDICATORS[code], `${q.id} ${code}`).toBeTruthy();
        expect(q.source, q.id).toBeTruthy();
        expect(q.explain, q.id).toBeTruthy();
      }
    });

    it('有 emoji 的題目都有朗讀文字，朗讀文字不含 emoji；選項都有文字', () => {
      for (const q of allLifeQuestions(topic)) {
        if (hasEmoji(q.prompt)) expect(q.speak, q.id).toBeTruthy();
        if (q.speak) expect(hasEmoji(q.speak), q.id).toBe(false);
        if (q.type === 'choice') for (const o of q.options) expect(o.text, q.id).toBeTruthy();
      }
    });

    it('選項順序由種子決定：不同種子下正解位置會變動', () => {
      const positions = new Set<number>();
      for (const seed of SEEDS) {
        for (const q of activity.make({ seed, count: 10, level: 1 })) {
          if (q.type === 'choice' && q.options.length === 4) positions.add(q.answer);
        }
      }
      // 有 4 個選項的選擇題至少有 3 種正解位置，代表確實有打散
      if (topic.items.some((i) => i.kind === 'choice')) expect(positions.size).toBeGreaterThanOrEqual(3);
    });

    it('排序題打散後的詞卡與正解不同序', () => {
      for (const seed of SEEDS) {
        for (const q of activity.make({ seed, count: 24, level: 1 })) {
          if (q.type === 'order') expect(q.tokens.join('|'), q.id).not.toBe(q.answer.join('|'));
        }
      }
    });
  });
}
