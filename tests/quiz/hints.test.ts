/**
 * 選項的 emoji 改成提示（2026-10-13 使用者決定，docs/decisions.md「選項的 emoji 改成提示」）：
 * 有文字的選項預設只顯示文字，按「💡 提示」才出現 emoji；只有 emoji 的選項（emoji 就是答案）一律顯示；
 * 挑戰塔是考試，沒有提示（錯題再挑戰是練習，例外）。
 */
import { describe, expect, it } from 'vitest';
import { hasEmojiHint, hintsAllowed, optionShowsEmoji } from '../../src/quiz/hints';
import type { ChoiceQuestion, NumberQuestion } from '../../src/core/types';
import type { ActivityDef } from '../../src/activities/types';

const choice = (options: ChoiceQuestion['options']): ChoiceQuestion => ({ id: 'q', subject: 'life', skill: 'x', indicators: [], type: 'choice', prompt: '?', options, answer: 0 });
const activity = (id: string, zone: ActivityDef['zone']) => ({ id, zone }) as ActivityDef;

describe('optionShowsEmoji', () => {
  it('文字＋emoji：按提示前不顯示、按了才顯示；只有 emoji：一律顯示；沒有 emoji：不顯示', () => {
    expect(optionShowsEmoji({ text: '走斑馬線', emoji: '🚸' }, false)).toBe(false);
    expect(optionShowsEmoji({ text: '走斑馬線', emoji: '🚸' }, true)).toBe(true);
    expect(optionShowsEmoji({ emoji: '🍎' }, false)).toBe(true);
    expect(optionShowsEmoji({ text: '十二' }, true)).toBe(false);
  });

  it('是非題的 ⭕對／❌錯 一律顯示（只是裝飾）；⭕ 配別的文字照樣是提示', () => {
    expect(optionShowsEmoji({ text: '對', emoji: '⭕' }, false)).toBe(true);
    expect(optionShowsEmoji({ text: '錯', emoji: '❌' }, false)).toBe(true);
    expect(optionShowsEmoji({ text: '把 fish 這個字圈起來。', emoji: '⭕' }, false)).toBe(false);
  });
});

describe('hasEmojiHint', () => {
  it('單選題至少有一個「文字＋emoji」的選項才有提示可看', () => {
    expect(hasEmojiHint(choice([{ text: '甲', emoji: '🍎' }, { text: '乙' }]))).toBe(true);
    expect(hasEmojiHint(choice([{ emoji: '🍎' }, { emoji: '🍌' }]))).toBe(false);
    expect(hasEmojiHint(choice([{ text: '甲' }, { text: '乙' }]))).toBe(false);
    expect(hasEmojiHint(choice([{ text: '對', emoji: '⭕' }, { text: '錯', emoji: '❌' }]))).toBe(false);
    const num: NumberQuestion = { id: 'n', subject: 'math', skill: 'x', indicators: [], type: 'number', prompt: '?', answer: 1 };
    expect(hasEmojiHint(num)).toBe(false);
  });
});

describe('hintsAllowed', () => {
  it('挑戰塔（段考模擬、期中期末、自訂與班級題庫）沒有提示；錯題再挑戰與其他建築有', () => {
    expect(hintsAllowed(activity('tower.math', 'tower'))).toBe(false);
    expect(hintsAllowed(activity('exam:kanghsuan-zh:上:mid', 'tower'))).toBe(false);
    expect(hintsAllowed(activity('class.p1', 'tower'))).toBe(false);
    expect(hintsAllowed(activity('pack.abc', 'tower'))).toBe(false);
    expect(hintsAllowed(activity('review.life', 'tower'))).toBe(true);
    expect(hintsAllowed(activity('life.traffic', 'life'))).toBe(true);
  });
});
