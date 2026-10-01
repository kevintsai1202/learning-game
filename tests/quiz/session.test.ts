import { describe, expect, it } from 'vitest';
import { answer, nextQuestion, startQuiz, summarize } from '../../src/quiz/session';
import type { Question } from '../../src/core/types';

const num = (id: string, ans: number): Question => ({ id, subject: 'math', skill: 'math.add', indicators: ['N-2-2'], prompt: id, type: 'number', answer: ans });

describe('答題流程', () => {
  it('第一次就答對：記為一次答對，進入 correct', () => {
    let s = startQuiz([num('a', 1), num('b', 2)]);
    s = answer(s, { type: 'number', value: 1 });
    expect(s.phase).toBe('correct');
    expect(s.records).toEqual([{ question: s.questions[0], correct: true, firstTry: true }]);
  });

  it('第一次答錯可以再試一次，第二次答對算答對但不是一次答對', () => {
    let s = startQuiz([num('a', 1)]);
    s = answer(s, { type: 'number', value: 9 });
    expect(s.phase).toBe('retry');
    expect(s.records).toHaveLength(0);
    s = answer(s, { type: 'number', value: 1 });
    expect(s.phase).toBe('correct');
    expect(s.records[0]).toMatchObject({ correct: true, firstTry: false });
  });

  it('兩次都答錯就公布答案', () => {
    let s = startQuiz([num('a', 1)]);
    s = answer(s, { type: 'number', value: 9 });
    s = answer(s, { type: 'number', value: 8 });
    expect(s.phase).toBe('reveal');
    expect(s.records[0]).toMatchObject({ correct: false, firstTry: false });
  });

  it('非作答階段送出的答案會被忽略（避免連點重複計分）', () => {
    let s = startQuiz([num('a', 1), num('b', 2)]);
    s = answer(s, { type: 'number', value: 1 });
    const again = answer(s, { type: 'number', value: 1 });
    expect(again.records).toHaveLength(1);
  });

  it('最後一題之後進入 done，結算星星與金幣', () => {
    let s = startQuiz([num('a', 1), num('b', 2)]);
    s = answer(s, { type: 'number', value: 1 });
    s = nextQuestion(s);
    expect(s.index).toBe(1);
    expect(s.phase).toBe('answering');
    s = answer(s, { type: 'number', value: 5 });
    s = answer(s, { type: 'number', value: 2 });
    s = nextQuestion(s);
    expect(s.phase).toBe('done');
    const r = summarize(s, 'math.add', 'math', 61.4);
    expect(r).toMatchObject({ activityId: 'math.add', subject: 'math', total: 2, correct: 1, stars: 1, seconds: 61 });
    expect(r.coins).toBe(1 + 1 * 2);
  });

  it('描寫題寫錯一筆以內仍算一次答對', () => {
    const w: Question = { id: 'w', subject: 'zh', skill: 'zh.write', indicators: ['Ab-Ⅰ-2'], prompt: '寫寫看', type: 'write', target: '山', script: 'hanzi' };
    let s = startQuiz([w]);
    s = answer(s, { type: 'write', completed: true, mistakes: 1 });
    expect(s.records[0].firstTry).toBe(true);
    let t = startQuiz([w]);
    t = answer(t, { type: 'write', completed: true, mistakes: 4 });
    expect(t.phase).toBe('correct');
    expect(t.records[0].firstTry).toBe(false);
  });
});
