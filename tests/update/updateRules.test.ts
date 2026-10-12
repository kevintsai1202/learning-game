/**
 * 更新通知的規則（docs/plans/update-notice.md；純函式）：
 * - 新舊版本比較：version.json 的 id 和網頁裡的不一樣才算有新版；讀不到、格式不對、空的都不算。
 * - 這個畫面與狀態要「自動」（倒數重新整理）、「等」（做完再說）還是「只提示」（大人的頁面）。
 * - 重新整理後回到哪個畫面。
 */
import { describe, expect, it } from 'vitest';
import { isNewVersion, isStuck, resumeScreenOf, updateMode } from '../../src/update/updateRules';

const CALM = { acting: false, duel: false, picking: false };

describe('isNewVersion', () => {
  it('id 不一樣才算有新版；讀不到、格式不對、空的不算', () => {
    expect(isNewVersion('abc', { id: 'def' })).toBe(true);
    expect(isNewVersion('abc', { id: 'abc' })).toBe(false);
    expect(isNewVersion('abc', { id: '' })).toBe(false);
    expect(isNewVersion('abc', null)).toBe(false);
    expect(isNewVersion('abc', '<html>')).toBe(false);
    expect(isNewVersion('abc', { version: 'x' })).toBe(false);
    // 網頁自己沒有版本號（開發模式）：不提示
    expect(isNewVersion('', { id: 'def' })).toBe(false);
  });
});

describe('updateMode', () => {
  it('孩子在島上、選活動、獎章、百寶屋、標題與選角色：自動', () => {
    for (const s of ['island', 'zone', 'badges', 'shop', 'title', 'profiles'] as const) expect(updateMode(s, CALM)).toBe('auto');
  });

  it('在島上但正在用家具或設施、對戰中、拿著家具在擺：等', () => {
    expect(updateMode('island', { ...CALM, acting: true })).toBe('wait');
    expect(updateMode('island', { ...CALM, duel: true })).toBe('wait');
    expect(updateMode('island', { ...CALM, picking: true })).toBe('wait');
  });

  it('答題、結算、益智遊戲館：等（做完回到島上再更新）', () => {
    for (const s of ['activity', 'result', 'puzzle'] as const) expect(updateMode(s, CALM)).toBe('wait');
  });

  it('大人的頁面（帳號頁、班級頁、家長區、熊熊老師進島、教室頁）：只提示', () => {
    for (const s of ['teacher', 'class', 'parent', 'gm', 'classroom'] as const) expect(updateMode(s, CALM)).toBe('prompt');
  });
});

describe('resumeScreenOf', () => {
  it('重新整理後回到原本的地方；熊熊老師進島回帳號頁；家長區要密碼回標題；答題中回島上', () => {
    expect(resumeScreenOf('island')).toBe('island');
    expect(resumeScreenOf('zone')).toBe('island');
    expect(resumeScreenOf('shop')).toBe('island');
    expect(resumeScreenOf('badges')).toBe('island');
    expect(resumeScreenOf('activity')).toBe('island');
    expect(resumeScreenOf('teacher')).toBe('teacher');
    expect(resumeScreenOf('class')).toBe('class');
    expect(resumeScreenOf('classroom')).toBe('classroom');
    expect(resumeScreenOf('gm')).toBe('teacher');
    expect(resumeScreenOf('parent')).toBeNull();
    expect(resumeScreenOf('title')).toBeNull();
    expect(resumeScreenOf('profiles')).toBe('profiles');
  });
});

describe('isStuck', () => {
  it('更新後重新載入，網頁的版本號還不是要更新到的那個（CDN 還沒換完、代理伺服器快取）：卡住了，不要再自動重新整理', () => {
    expect(isStuck('old', 'new')).toBe(true);
    expect(isStuck('new', 'new')).toBe(false);
    // 沒有記下要更新到哪一版（一般的重新載入）、開發模式：不算
    expect(isStuck('old', null)).toBe(false);
    expect(isStuck('', 'new')).toBe(false);
  });
});
