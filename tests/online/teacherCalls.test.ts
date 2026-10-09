/**
 * 熊熊老師的集合（老師 GM 的 G2，src/online/useTeacherCalls.ts）：孩子收到集合時怎麼處理。
 * 在那一班的班級島、而且在島上 → 直接過去；在那一班的班級島但在建築裡（答題、百寶屋…）→ 卡片「過去」；
 * 在別座島（自己的島、別班的班級島）→ 卡片「回班級島」，不自動拉走（使用者決定，teacher-gm.md 第 12 節第 10 點）。
 */
import { describe, expect, it } from 'vitest';
import { summonKind } from '../../src/online/useTeacherCalls';

describe('summonKind', () => {
  it('在那一班的班級島上：直接過去', () => {
    expect(summonKind(true, 'island')).toBe('now');
  });

  it('在那一班的班級島但在建築裡：卡片「過去」', () => {
    for (const screen of ['zone', 'activity', 'result', 'shop', 'puzzle', 'badges', 'parent'] as const) expect(summonKind(true, screen)).toBe('go');
  });

  it('在別座島：卡片「回班級島」（不管在島上還是建築裡）', () => {
    expect(summonKind(false, 'island')).toBe('back');
    expect(summonKind(false, 'activity')).toBe('back');
  });
});
