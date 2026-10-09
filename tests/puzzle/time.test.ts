/**
 * 益智遊戲館的時間規則：哪些畫面算遊玩時間、益智遊戲今天還能玩多久。
 */
import { describe, expect, it } from 'vitest';
import { playTimeKind, puzzleSecondsLeft } from '../../src/puzzle/time';
import { addPlayTime, addProfile, createEmptySave } from '../../src/store/save';

const NOW = new Date('2026-10-04T10:00:00+08:00');

describe('遊玩時間怎麼算', () => {
  it('標題、選角、家長區不算；益智遊戲館算益智時間；其他畫面算一般時間', () => {
    expect(playTimeKind('title')).toBe('none');
    expect(playTimeKind('profiles')).toBe('none');
    expect(playTimeKind('parent')).toBe('none');
    // 大人的畫面不替孩子累計（帳號頁、班級登入、教室平板、熊熊老師進島；2026-10-09）
    for (const screen of ['teacher', 'class', 'classroom', 'gm'] as const) expect(playTimeKind(screen)).toBe('none');
    expect(playTimeKind('puzzle')).toBe('puzzle');
    expect(playTimeKind('island')).toBe('play');
    expect(playTimeKind('activity')).toBe('play');
    expect(playTimeKind('shop')).toBe('play');
  });
});

describe('益智遊戲今天還能玩多久', () => {
  it('上限減掉今天在益智遊戲館的秒數，最少 0；上限 0 表示不另外限制（回傳 null）', () => {
    let s = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW);
    const id = s.profiles[0].id;
    expect(puzzleSecondsLeft(s.profiles[0], 15, NOW)).toBe(900);
    s = addPlayTime(s, id, 600, NOW, true);
    s = addPlayTime(s, id, 600, NOW);
    expect(puzzleSecondsLeft(s.profiles[0], 15, NOW)).toBe(300);
    s = addPlayTime(s, id, 600, NOW, true);
    expect(puzzleSecondsLeft(s.profiles[0], 15, NOW)).toBe(0);
    expect(puzzleSecondsLeft(s.profiles[0], 0, NOW)).toBeNull();
  });
});
