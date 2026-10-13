/**
 * 學習面向（雷達圖的 9 個軸，docs/plans/learning-report.md 第 1 節）：指標歸到哪個面向、面向的一次答對率、
 * 弱項指標、全班統計、沒有 AI 時的規則建議。
 */
import { describe, expect, it } from 'vitest';
import { INDICATORS } from '../../src/content/indicators';
import {
  AREA_MIN_ATTEMPTS,
  LEARNING_AREAS,
  areaOf,
  areaStats,
  classAreaStats,
  classWeakIndicators,
  ruleTipAreas,
  weakIndicators,
  type IndicatorMap,
} from '../../src/content/learningAreas';

/** 指標統計的簡寫：作答 a 題、一次答對 f 題 */
const st = (a: number, f: number) => ({ attempts: a, firstTry: f });

describe('areaOf', () => {
  it('每個已登錄的指標都有面向', () => {
    const missing = Object.keys(INDICATORS).filter((k) => areaOf(k) === null);
    expect(missing).toEqual([]);
  });

  it('依領域歸類；同一科沒列到的代碼歸到那一科的預設面向；不認得的科目回 null', () => {
    expect(areaOf('zh:Aa-Ⅰ-2')).toBe('zhuyin');
    expect(areaOf('zh:3-Ⅰ-1')).toBe('zhuyin');
    expect(areaOf('zh:Ab-Ⅰ-3')).toBe('chars');
    expect(areaOf('zh:4-Ⅰ-5')).toBe('chars');
    expect(areaOf('zh:Ac-Ⅰ-2')).toBe('reading');
    expect(areaOf('zh:X-9')).toBe('reading');
    expect(areaOf('math:N-2-7')).toBe('number');
    expect(areaOf('math:N-2-13')).toBe('measure');
    expect(areaOf('math:N-2-5')).toBe('measure');
    expect(areaOf('math:S-2-4')).toBe('shape');
    expect(areaOf('math:D-2-1')).toBe('shape');
    expect(areaOf('en:Ab-Ⅱ-1')).toBe('letters');
    expect(areaOf('en:NTPC-Ab-Ⅰ-1')).toBe('letters');
    expect(areaOf('en:Ac-Ⅱ-3')).toBe('words');
    expect(areaOf('life:Ba-Ⅰ-1')).toBe('life');
    expect(areaOf('art:X')).toBeNull();
    expect(areaOf('N-2-7')).toBeNull();
  });

  it('9 個面向依雷達圖的順序', () => {
    expect(LEARNING_AREAS.map((a) => a.id)).toEqual(['zhuyin', 'chars', 'reading', 'number', 'measure', 'shape', 'letters', 'words', 'life']);
  });
});

describe('areaStats', () => {
  it('合計面向內的指標；作答太少的答對率是 null', () => {
    const stats = areaStats({ 'math:N-2-7': st(8, 6), 'math:N-2-2': st(2, 2), 'math:N-2-13': st(3, 1), 'life:Ba-Ⅰ-1': st(0, 0) });
    const number = stats.find((s) => s.area === 'number')!;
    expect(number).toEqual({ area: 'number', attempts: 10, firstTry: 8, rate: 0.8 });
    const measure = stats.find((s) => s.area === 'measure')!;
    expect(measure.attempts).toBeLessThan(AREA_MIN_ATTEMPTS);
    expect(measure.rate).toBeNull();
    expect(stats).toHaveLength(9);
  });
});

describe('weakIndicators', () => {
  it('作答至少 3 題、一次答對率最低的在前，最多 n 個', () => {
    const weak = weakIndicators({ 'math:N-2-7': st(10, 9), 'math:N-2-13': st(5, 1), 'zh:Aa-Ⅰ-2': st(4, 2), 'zh:Ab-Ⅰ-1': st(2, 0) }, 2);
    expect(weak.map((w) => w.key)).toEqual(['math:N-2-13', 'zh:Aa-Ⅰ-2']);
    expect(weak[0].rate).toBeCloseTo(0.2);
  });
});

describe('全班統計', () => {
  const kids: IndicatorMap[] = [
    { 'math:N-2-7': st(10, 9), 'math:N-2-13': st(6, 3) },
    { 'math:N-2-7': st(10, 5), 'math:N-2-13': st(6, 1) },
    { 'math:N-2-7': st(2, 2) },
  ];

  it('每個面向是「作答夠多的孩子」答對率的平均，記有幾個孩子', () => {
    const number = classAreaStats(kids).find((s) => s.area === 'number')!;
    expect(number.students).toBe(2);
    expect(number.rate).toBeCloseTo(0.7);
    expect(classAreaStats(kids).find((s) => s.area === 'life')).toEqual({ area: 'life', rate: null, students: 0 });
  });

  it('弱項指標用全班合計，記練過的孩子數', () => {
    const weak = classWeakIndicators(kids, 5);
    expect(weak[0]).toMatchObject({ key: 'math:N-2-13', attempts: 12, firstTry: 4, students: 2 });
  });
});

describe('ruleTipAreas', () => {
  it('先挑答對率低於 85% 的面向（最低的在前），不夠再補還沒練夠的', () => {
    const stats = areaStats({ 'math:N-2-7': st(10, 9), 'math:N-2-13': st(10, 4), 'zh:Aa-Ⅰ-2': st(10, 6) });
    expect(ruleTipAreas(stats, 3)).toEqual(['measure', 'zhuyin', 'chars']);
  });
});
