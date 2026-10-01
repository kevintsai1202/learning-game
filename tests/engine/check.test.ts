import { describe, expect, it } from 'vitest';
import { checkAnswer, scoreSession } from '../../src/engine/check';
import type { Question } from '../../src/core/types';

const base = { id: 't', subject: 'math' as const, skill: 'test', indicators: ['N-2-2'], prompt: '測試' };

describe('checkAnswer 判題', () => {
  it('單選題：索引相同才算對', () => {
    const q: Question = { ...base, type: 'choice', options: [{ text: '甲' }, { text: '乙' }], answer: 1 };
    expect(checkAnswer(q, { type: 'choice', index: 1 })).toBe(true);
    expect(checkAnswer(q, { type: 'choice', index: 0 })).toBe(false);
  });

  it('數字題：數值相同才算對', () => {
    const q: Question = { ...base, type: 'number', answer: 283 };
    expect(checkAnswer(q, { type: 'number', value: 283 })).toBe(true);
    expect(checkAnswer(q, { type: 'number', value: 238 })).toBe(false);
  });

  it('排序題：順序完全相同才算對', () => {
    const q: Question = { ...base, type: 'order', tokens: ['上學', '我', '去'], answer: ['我', '去', '上學'] };
    expect(checkAnswer(q, { type: 'order', tokens: ['我', '去', '上學'] })).toBe(true);
    expect(checkAnswer(q, { type: 'order', tokens: ['去', '我', '上學'] })).toBe(false);
    expect(checkAnswer(q, { type: 'order', tokens: ['我', '去'] })).toBe(false);
  });

  it('時鐘題：時與分都對才算對，12 點與 0 點視為相同', () => {
    const q: Question = { ...base, type: 'clock', hour: 12, minute: 30, step: 5 };
    expect(checkAnswer(q, { type: 'clock', hour: 12, minute: 30 })).toBe(true);
    expect(checkAnswer(q, { type: 'clock', hour: 0, minute: 30 })).toBe(true);
    expect(checkAnswer(q, { type: 'clock', hour: 12, minute: 35 })).toBe(false);
    expect(checkAnswer(q, { type: 'clock', hour: 6, minute: 30 })).toBe(false);
  });

  it('付錢題：總額相同且都用可用面額才算對（不限組合方式）', () => {
    const q: Question = { ...base, type: 'money', amount: 165, denominations: [1, 5, 10, 50, 100] };
    expect(checkAnswer(q, { type: 'money', items: [100, 50, 10, 5] })).toBe(true);
    expect(checkAnswer(q, { type: 'money', items: [50, 50, 50, 10, 5] })).toBe(true);
    expect(checkAnswer(q, { type: 'money', items: [100, 50, 10] })).toBe(false);
    // 用了不提供的面額（20 元）不算對
    expect(checkAnswer(q, { type: 'money', items: [100, 20, 20, 20, 5] })).toBe(false);
  });

  it('描寫題：寫完就算對', () => {
    const q: Question = { ...base, type: 'write', target: '山', script: 'hanzi' };
    expect(checkAnswer(q, { type: 'write', completed: true, mistakes: 3 })).toBe(true);
    expect(checkAnswer(q, { type: 'write', completed: false, mistakes: 0 })).toBe(false);
  });

  it('作答型別和題型不同時算錯', () => {
    const q: Question = { ...base, type: 'number', answer: 5 };
    expect(checkAnswer(q, { type: 'choice', index: 5 })).toBe(false);
  });
});

describe('scoreSession 星星與金幣', () => {
  it('一次答對九成以上得 3 顆星', () => {
    expect(scoreSession(10, 9).stars).toBe(3);
    expect(scoreSession(10, 10).stars).toBe(3);
  });
  it('六成以上得 2 顆星', () => {
    expect(scoreSession(10, 6).stars).toBe(2);
    expect(scoreSession(10, 8).stars).toBe(2);
  });
  it('有完成就至少 1 顆星（鼓勵孩子）', () => {
    expect(scoreSession(10, 0).stars).toBe(1);
    expect(scoreSession(10, 5).stars).toBe(1);
  });
  it('金幣 = 一次答對題數 + 星星數 × 2', () => {
    expect(scoreSession(10, 9).coins).toBe(9 + 3 * 2);
    expect(scoreSession(10, 0).coins).toBe(0 + 1 * 2);
  });
  it('0 題時不會除以零', () => {
    expect(scoreSession(0, 0)).toEqual({ stars: 0, coins: 0 });
  });
});
