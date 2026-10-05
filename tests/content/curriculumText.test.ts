/**
 * 教材版本設定的一行說明（老師的班級頁、家長專區顯示班級版本用；老師 GM 的 G0）。
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_EDITIONS, GENERIC_EDITION, curriculumText } from '../../src/content/editions';

describe('教材版本設定的說明文字', () => {
  it('出版社名稱＋學期', () => {
    expect(curriculumText(BUILT_IN_EDITIONS, { zh: 'nani-zh', math: 'hanlin-math', term: '上' })).toBe('國語 南一・數學 翰林・二年級上學期');
    expect(curriculumText(BUILT_IN_EDITIONS, { zh: 'kanghsuan-zh', math: 'nani-math', term: 'auto' })).toBe('國語 康軒・數學 南一・學期自動');
  });

  it('依 108 課綱通用、這台裝置沒有的版本', () => {
    expect(curriculumText(BUILT_IN_EDITIONS, { zh: GENERIC_EDITION, math: 'no-such-math', term: '下' })).toBe('國語 108 課綱通用・數學 找不到的版本・二年級下學期');
  });
});
