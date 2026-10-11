/**
 * 老師看到的班上孩子「在哪裡」（src/ui/memberWhere.ts）：島＋建築（或小屋裡）＋在做什麼。
 */
import { describe, expect, it } from 'vitest';
import { whereText } from '../../src/ui/memberWhere';

describe('whereText', () => {
  it('島、建築、在做什麼；離線空白；舊版伺服器只有 online', () => {
    expect(whereText({ online: true, where: { island: 'class', zone: 'math', doing: '加法練習' } })).toBe('🟢 班級島・數學城堡・加法練習');
    expect(whereText({ online: true, where: { island: 'own', zone: null } })).toBe('🟢 自己的島');
    expect(whereText({ online: true, where: null })).toBe('🟢');
    expect(whereText({ online: false, where: null })).toBe('');
  });

  it('自己的家第二期：在屋子裡寫「小屋裡」', () => {
    expect(whereText({ online: true, where: { island: 'own', zone: 'home' } })).toBe('🟢 自己的島・小屋裡');
  });
});
