import { describe, expect, it } from 'vitest';
import { MATH_SKILLS, getMathSkill } from '../../src/engine/math';
import { checkAnswer, correctResponse } from '../../src/engine/check';
import type { Question } from '../../src/core/types';

const LEVELS = [1, 2, 3] as const;
const SEEDS = Array.from({ length: 15 }, (_, i) => i * 7919 + 1);

/** 直式加法的進位次數 */
function carries(a: number, b: number): number {
  let c = 0;
  let n = 0;
  while (a > 0 || b > 0) {
    const s = (a % 10) + (b % 10) + c;
    c = s >= 10 ? 1 : 0;
    n += c;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return n;
}

/** 直式減法的退位次數（a − b，a ≥ b） */
function borrows(a: number, b: number): number {
  let br = 0;
  let n = 0;
  while (a > 0 || b > 0) {
    const d = (a % 10) - br - (b % 10);
    br = d < 0 ? 1 : 0;
    n += br;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return n;
}

/** 取出直式題目的兩個運算元 */
function operands(q: Question): { a: number; b: number } {
  if (q.visual?.kind !== 'vertical') throw new Error(`${q.id} 沒有直式附圖`);
  return { a: q.visual.a, b: q.visual.b };
}

describe('所有數學技能的共同性質', () => {
  it('技能 id 不重複，且都有課綱代碼', () => {
    const ids = MATH_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MATH_SKILLS.length).toBeGreaterThanOrEqual(19);
    for (const s of MATH_SKILLS) {
      expect(s.indicators.length, s.id).toBeGreaterThan(0);
      for (const code of s.indicators) expect(code, s.id).toMatch(/^[NSRD]-2-\d+$/);
    }
  });

  for (const skill of MATH_SKILLS) {
    describe(skill.id, () => {
      it('每個難度都產生指定題數、題目 id 不重複、相同種子結果相同', () => {
        for (const level of LEVELS) {
          for (const seed of SEEDS.slice(0, 5)) {
            const qs = skill.generate({ seed, count: 8, level });
            expect(qs.length).toBe(8);
            expect(new Set(qs.map((q) => q.id)).size, `${skill.id} L${level} seed ${seed} 有重複題`).toBe(8);
            expect(skill.generate({ seed, count: 8, level })).toEqual(qs);
          }
        }
      });

      it('每一題欄位完整，且標準答案判題為正確', () => {
        for (const level of LEVELS) {
          for (const seed of SEEDS) {
            for (const q of skill.generate({ seed, count: 6, level })) {
              expect(q.subject).toBe('math');
              expect(q.skill).toBe(skill.id);
              expect(q.indicators.length).toBeGreaterThan(0);
              expect(q.prompt.length).toBeGreaterThan(0);
              expect(checkAnswer(q, correctResponse(q)), `${q.id} 的標準答案判為錯`).toBe(true);
              if (q.type === 'choice') {
                expect(q.options.length).toBeGreaterThanOrEqual(2);
                const keys = q.options.map((o) => `${o.text ?? ''}|${o.emoji ?? ''}|${o.shape ?? ''}`);
                expect(new Set(keys).size, `${q.id} 選項重複：${keys.join(', ')}`).toBe(keys.length);
              }
              if (q.type === 'number') {
                expect(Number.isInteger(q.answer)).toBe(true);
                expect(q.answer).toBeGreaterThanOrEqual(0);
              }
            }
          }
        }
      });
    });
  }
});

describe('math.add 加法', () => {
  const skill = getMathSkill('math.add');
  it('難度 1 不進位、難度 2 至少進位一次且有三位數、難度 3 至少連續進位兩次；和不超過 999', () => {
    for (const seed of SEEDS) {
      for (const q of skill.generate({ seed, count: 10, level: 1 })) {
        const { a, b } = operands(q);
        expect(carries(a, b)).toBe(0);
        expect(q.type === 'number' && q.answer).toBe(a + b);
      }
      for (const q of skill.generate({ seed, count: 10, level: 2 })) {
        const { a, b } = operands(q);
        expect(carries(a, b)).toBeGreaterThanOrEqual(1);
        expect(Math.max(a, b)).toBeGreaterThanOrEqual(100);
        expect(a + b).toBeLessThanOrEqual(999);
      }
      for (const q of skill.generate({ seed, count: 10, level: 3 })) {
        const { a, b } = operands(q);
        expect(carries(a, b)).toBeGreaterThanOrEqual(2);
        expect(a + b).toBeLessThanOrEqual(999);
      }
    }
  });
});

describe('math.sub 減法', () => {
  const skill = getMathSkill('math.sub');
  it('課綱 N-2-2「減法限一次退位」：難度 1 不退位、難度 2 與 3 剛好退位一次，難度 3 的數字含 0；差不為負', () => {
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        for (const q of skill.generate({ seed, count: 10, level })) {
          const { a, b } = operands(q);
          expect(a - b).toBeGreaterThanOrEqual(0);
          expect(q.type === 'number' && q.answer).toBe(a - b);
          const n = borrows(a, b);
          if (level === 1) expect(n).toBe(0);
          else expect(n, `${a} − ${b}`).toBe(1);
          if (level === 3) expect(`${a}${b}${a - b}`, `${a} − ${b} 應含 0`).toContain('0');
        }
      }
    }
  });
});

describe('math.add 進位上限', () => {
  it('課綱 N-2-2「加法含二次進位」：任何難度都不超過兩次進位', () => {
    const skill = getMathSkill('math.add');
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        for (const q of skill.generate({ seed, count: 10, level })) {
          const { a, b } = operands(q);
          expect(carries(a, b)).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

describe('math.time-units 時間單位', () => {
  it('課綱 N-2-14「不做時間間隔問題」：不出「相差幾天」「經過幾天」', () => {
    const skill = getMathSkill('math.time-units');
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        for (const q of skill.generate({ seed, count: 10, level })) {
          expect(q.prompt).not.toMatch(/相差|經過|間隔/);
        }
      }
    }
  });
});

describe('math.fraction 分數範圍', () => {
  it('課綱 N-2-10：只認識單位分數（不比大小），圓形分母限 2、4、8 以內的等分，長方形分母不超過 8', () => {
    const skill = getMathSkill('math.fraction');
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        for (const q of skill.generate({ seed, count: 8, level })) {
          expect(q.prompt).not.toMatch(/比較多|比較大|比較小/);
          if (q.visual?.kind === 'fraction') {
            expect(q.visual.parts).toBeLessThanOrEqual(8);
            if (q.visual.shape === 'pizza') expect([2, 3, 4, 6, 8]).toContain(q.visual.parts);
          }
        }
      }
    }
  });
});

describe('math.times 十十乘法', () => {
  const skill = getMathSkill('math.times');
  it('難度 1 只考 2、5、10 的乘法，答案等於兩數相乘', () => {
    for (const seed of SEEDS) {
      for (const q of skill.generate({ seed, count: 10, level: 1 })) {
        const m = /^(\d+) × (\d+) = \?$/.exec(q.prompt);
        expect(m, q.prompt).not.toBeNull();
        const [a, b] = [Number(m![1]), Number(m![2])];
        expect([2, 5, 10]).toContain(a);
        expect(b).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(10);
        expect(q.type === 'number' && q.answer).toBe(a * b);
      }
    }
  });
});

describe('math.clock-set 撥時鐘', () => {
  const skill = getMathSkill('math.clock-set');
  it('難度 1 只有整點與半點，難度 2 以 5 分鐘為一格', () => {
    for (const seed of SEEDS) {
      for (const q of skill.generate({ seed, count: 10, level: 1 })) {
        expect(q.type).toBe('clock');
        if (q.type !== 'clock') continue;
        expect([0, 30]).toContain(q.minute);
        expect(q.hour).toBeGreaterThanOrEqual(1);
        expect(q.hour).toBeLessThanOrEqual(12);
      }
      for (const q of skill.generate({ seed, count: 10, level: 2 })) {
        if (q.type !== 'clock') throw new Error('應為時鐘題');
        expect(q.minute % 5).toBe(0);
        expect(q.step).toBe(5);
      }
    }
  });
});

describe('math.money-count 數錢', () => {
  const skill = getMathSkill('math.money-count');
  it('答案等於附圖上所有錢幣的總和，難度 1 不超過 100 元', () => {
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        for (const q of skill.generate({ seed, count: 10, level })) {
          if (q.visual?.kind !== 'money' || q.type !== 'number') continue;
          const sum = q.visual.items.reduce((s, v) => s + v, 0);
          expect(q.answer).toBe(sum);
          if (level === 1) expect(sum).toBeLessThanOrEqual(100);
          expect(sum).toBeLessThanOrEqual(1000);
        }
      }
    }
  });
});

describe('math.length 長度', () => {
  const skill = getMathSkill('math.length');
  it('量尺題答案等於終點減起點；難度 2 的起點不是 0', () => {
    for (const seed of SEEDS) {
      for (const level of [1, 2] as const) {
        for (const q of skill.generate({ seed, count: 10, level })) {
          if (q.visual?.kind !== 'ruler' || q.type !== 'number') throw new Error('應為量尺數字題');
          expect(q.answer).toBe(q.visual.end - q.visual.start);
          if (level === 1) expect(q.visual.start).toBe(0);
          if (level === 2) expect(q.visual.start).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('math.fraction 單位分數', () => {
  const skill = getMathSkill('math.fraction');
  it('辨認題只塗一份，正確選項是「1/平分份數」', () => {
    for (const seed of SEEDS) {
      for (const q of skill.generate({ seed, count: 8, level: 1 })) {
        // 只檢查看圖選分數的題目（另有數份數、一半的說法等題型）
        if (q.type !== 'choice' || q.visual?.kind !== 'fraction') continue;
        expect(q.visual.shaded).toBe(1);
        expect(q.options[q.answer].text).toBe(`1/${q.visual.parts}`);
      }
    }
  });
});

describe('math.mul-meaning 乘法的意義', () => {
  const skill = getMathSkill('math.mul-meaning');
  it('算式選擇題依台灣慣例「每份數量 × 份數」，且選項不放顛倒的乘式避免爭議', () => {
    for (const seed of SEEDS) {
      for (const q of skill.generate({ seed, count: 10, level: 2 })) {
        if (q.type !== 'choice' || q.visual?.kind !== 'emoji' || !q.visual.groups) continue;
        const { count, groups } = q.visual;
        expect(q.options[q.answer].text).toBe(`${count} × ${groups}`);
        if (count !== groups) {
          expect(q.options.map((o) => o.text)).not.toContain(`${groups} × ${count}`);
        }
      }
    }
  });
});
