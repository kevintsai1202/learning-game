import { describe, expect, it } from 'vitest';
import { hitPoints, toArcade } from '../../src/quiz/arcade';
import { createRng } from '../../src/core/rng';
import { checkAnswer, correctResponse } from '../../src/engine/check';
import { getMathSkill } from '../../src/engine/math';
import type { Question } from '../../src/core/types';

describe('toArcade 射擊模式題目轉換', () => {
  it('數字題變成 4 個不重複的答案氣球，正解在其中、題目 id 不變', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const q of getMathSkill('math.times').generate({ seed, count: 10, level: 2 })) {
        const a = toArcade(q, createRng(seed));
        expect(a).not.toBeNull();
        expect(a!.id).toBe(q.id);
        expect(a!.options).toHaveLength(4);
        expect(new Set(a!.options.map((o) => o.text)).size).toBe(4);
        expect(a!.options[a!.answer].text).toBe(String(q.type === 'number' && q.answer));
        expect(checkAnswer(a!, correctResponse(a!))).toBe(true);
      }
    }
  });

  it('答案很小時也湊得滿 4 個誘答（不會出現負數）', () => {
    const q: Question = { id: 'x', subject: 'math', skill: 's', indicators: ['N-2-1'], prompt: '1 - 1', type: 'number', answer: 0 };
    const a = toArcade(q, createRng(1))!;
    expect(a.options).toHaveLength(4);
    for (const o of a.options) expect(Number(o.text)).toBeGreaterThanOrEqual(0);
  });

  it('單選題最多 4 個選項，正解保留，相同種子結果相同', () => {
    const q: Question = {
      id: 'c',
      subject: 'zh',
      skill: 's',
      indicators: ['Ab-Ⅰ-1'],
      prompt: '選出正確的字',
      type: 'choice',
      options: ['甲', '乙', '丙', '丁', '戊', '己'].map((text) => ({ text })),
      answer: 4,
    };
    const a = toArcade(q, createRng(7))!;
    expect(a.options).toHaveLength(4);
    expect(a.options[a.answer].text).toBe('戊');
    expect(toArcade(q, createRng(7))).toEqual(a);
  });

  it('撥時鐘、付錢、描寫等題型，以及只有圖形的選項不適合射擊', () => {
    const clock: Question = { id: 'k', subject: 'math', skill: 's', indicators: ['N-2-13'], prompt: '撥', type: 'clock', hour: 3, minute: 0, step: 5 };
    expect(toArcade(clock, createRng(1))).toBeNull();
    const shapes: Question = { id: 's', subject: 'math', skill: 's', indicators: ['S-2-2'], prompt: '哪一個是三角形', type: 'choice', options: [{ shape: 'triangle' }, { shape: 'circle' }], answer: 0 };
    expect(toArcade(shapes, createRng(1))).toBeNull();
  });

  it('連擊越多分數越高', () => {
    expect(hitPoints(1)).toBe(100);
    expect(hitPoints(3)).toBe(140);
  });
});
