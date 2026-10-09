/**
 * 和朋友對戰的一局（島嶼互訪 I4）：兩台裝置用同一個種子出同一局，邀請帶指紋讓對方比對（版本不同時題目會不一樣）。
 */
import { describe, expect, it } from 'vitest';
import { ALL_ACTIVITIES } from '../../src/activities/registry';
import { DUEL_QUESTIONS } from '../../src/engine/puzzle/quizBattle';
import { FRIEND_QUIZ_ACTIVITIES, duelCheck, friendQuizQuestions } from '../../src/puzzle/friendRound';

describe('益智搶答的題目', () => {
  it('只用各科固定活動（不含挑戰塔與停用的；課本單元不在固定活動裡）', () => {
    expect(FRIEND_QUIZ_ACTIVITIES.length).toBeGreaterThan(0);
    for (const a of FRIEND_QUIZ_ACTIVITIES) {
      expect(ALL_ACTIVITIES).toContain(a);
      expect(a.zone).not.toBe('tower');
      expect(a.disabledReason).toBeUndefined();
    }
  });

  it('同一個種子出同一組題，題數是和機器人搶答的題數', () => {
    const a = friendQuizQuestions(4242);
    const b = friendQuizQuestions(4242);
    expect(a).toHaveLength(DUEL_QUESTIONS);
    expect(b.map((q) => [q.id, q.answer])).toEqual(a.map((q) => [q.id, q.answer]));
  });
});

describe('指紋', () => {
  const games = ['quiz', 'blocks', 'memory', 'spot', 'tangram'] as const;

  it('同一局的指紋一樣', () => {
    for (const g of games) expect(duelCheck(g, 777, 2)).toBe(duelCheck(g, 777, 2));
  });

  it('種子不同時指紋不同', () => {
    for (const g of games) expect(duelCheck(g, 777, 2)).not.toBe(duelCheck(g, 778, 2));
  });

  it('指紋是 1～16 個英數字（放得進邀請訊息）', () => {
    for (const g of games) expect(duelCheck(g, 1, 1)).toMatch(/^[0-9a-z]{1,16}$/);
  });
});
