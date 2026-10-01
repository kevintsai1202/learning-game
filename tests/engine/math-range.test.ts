import { describe, expect, it } from 'vitest';
import { getMathSkill } from '../../src/engine/math';
import type { Question } from '../../src/core/types';

/** 題目裡出現的所有數字（題幹、附圖、選項、答案） */
function numbersIn(q: Question): number[] {
  const texts = [q.prompt, JSON.stringify(q.visual ?? {}), q.type === 'choice' ? q.options.map((o) => o.text ?? '').join(' ') : ''];
  const nums = texts.flatMap((t) => (t.match(/\d+/g) ?? []).map(Number));
  if (q.type === 'number') nums.push(q.answer);
  if (q.type === 'money') nums.push(q.amount);
  return nums;
}

/** 二上（數到 200）會用到的技能 */
const SKILLS = ['math.place-value', 'math.add', 'math.sub', 'math.word-addsub', 'math.compare', 'math.money-count', 'math.money-pay'];

describe('單元數值上限 maxNumber（二上只學到 200 或 300）', () => {
  for (const id of SKILLS) {
    it(`${id}：設上限 200 時，題目中的數字都不超過 200，而且每個難度都出得了題`, () => {
      const skill = getMathSkill(id);
      for (const level of [1, 2, 3] as const) {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          const qs = skill.generate({ seed, count: 8, level, maxNumber: 200, allowFewer: true });
          expect(qs.length, `${id} L${level} seed ${seed}`).toBeGreaterThanOrEqual(4);
          for (const q of qs) {
            // 錢幣面額（500、1000）不會出現在上限 200 的題目裡
            for (const n of numbersIn(q)) expect(n, `${q.id}：${q.prompt}`).toBeLessThanOrEqual(200);
          }
        }
      }
    });
  }

  it('二位數的加減：上限 200 時加數、被加數都是二位數', () => {
    for (const seed of [1, 2, 3]) {
      for (const q of getMathSkill('math.add').generate({ seed, count: 8, level: 2, maxNumber: 200 })) {
        if (q.visual?.kind !== 'vertical') throw new Error('應為直式');
        expect(q.visual.a).toBeLessThan(100);
        expect(q.visual.b).toBeLessThan(100);
      }
    }
  });

  it('沒有設上限時維持一千以內', () => {
    const qs = getMathSkill('math.place-value').generate({ seed: 1, count: 10, level: 1 });
    expect(qs.some((q) => numbersIn(q).some((n) => n > 300))).toBe(true);
  });
});
