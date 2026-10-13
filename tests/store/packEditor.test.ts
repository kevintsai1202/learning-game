/**
 * 班級題庫編輯器（G6，docs/plans/ai-questions.md 第 2 節）的純函式：
 * 課綱指標分組、空白題目、選指標換科目、存檔前整理題目、組成題庫包、AI 分批。
 */
import { describe, expect, it } from 'vitest';
import {
  MANUAL_SOURCE,
  buildPack,
  finalizeQuestion,
  indicatorGroups,
  newQuestion,
  planBatches,
  questionProblems,
  withIndicators,
} from '../../src/store/packEditor';
import type { ChoiceQuestion, NumberQuestion, OrderQuestion } from '../../src/core/types';

describe('indicatorGroups', () => {
  it('依科目分組（數學、國語、英語、生活與健康），每個指標有鍵、代碼與條文', () => {
    const groups = indicatorGroups();
    expect(groups.map((g) => g.label)).toEqual(['數學', '國語', '英語', '生活與健康']);
    const math = groups[0];
    expect(math.items).toContainEqual({ key: 'math:N-2-7', code: 'N-2-7', text: '十十乘法' });
  });
});

describe('newQuestion／withIndicators', () => {
  it('空白單選題有三個空選項；選指標後科目跟著第一個指標，代碼只留同一科的', () => {
    const q = newQuestion('choice', { id: 'q1' }) as ChoiceQuestion;
    expect(q.options).toHaveLength(3);
    expect(q.answer).toBe(0);
    const tagged = withIndicators(q, ['life:Ba-Ⅰ-1', 'math:N-2-7', 'life:1a-Ⅰ-1']);
    expect(tagged.subject).toBe('life');
    expect(tagged.indicators).toEqual(['Ba-Ⅰ-1', '1a-Ⅰ-1']);
    expect(tagged.skill).toBe('life.class');
  });
});

describe('finalizeQuestion', () => {
  it('去掉空白選項並修正答案位置；空的出處補「班級自編」；空的朗讀與解說拿掉', () => {
    const q: ChoiceQuestion = {
      ...(newQuestion('choice', { id: 'q1', subject: 'math' }) as ChoiceQuestion),
      prompt: ' 5 × 2 是多少？ ',
      options: [{ text: '' }, { text: ' 7 ' }, { text: '10' }],
      answer: 2,
      speak: ' ',
      explain: '',
      source: '',
    };
    const f = finalizeQuestion(q, 1) as ChoiceQuestion;
    expect(f.prompt).toBe('5 × 2 是多少？');
    expect(f.options).toEqual([{ text: '7' }, { text: '10' }]);
    expect(f.answer).toBe(1);
    expect(f.source).toBe(MANUAL_SOURCE);
    expect('speak' in f).toBe(false);
    expect('explain' in f).toBe(false);
  });

  it('排序題用正確順序打亂成詞卡，不會剛好和答案一樣', () => {
    const q: OrderQuestion = { ...(newQuestion('order', { id: 'q2', subject: 'zh' }) as OrderQuestion), prompt: '排成句子', answer: ['我', '愛', '上學', ''] };
    const f = finalizeQuestion(q, 3) as OrderQuestion;
    expect(f.answer).toEqual(['我', '愛', '上學']);
    expect([...f.tokens].sort()).toEqual([...f.answer].sort());
    expect(f.tokens).not.toEqual(f.answer);
  });
});

describe('questionProblems', () => {
  it('列出整理後還不合格的地方；合格的回空清單', () => {
    const empty = newQuestion('number', { id: 'q3', subject: 'math' }) as NumberQuestion;
    expect(questionProblems(empty).join()).toContain('題目');
    const ok = { ...empty, prompt: '4 × 3 = ?', answer: 12 };
    expect(questionProblems(ok)).toEqual([]);
  });
});

describe('buildPack', () => {
  it('合格就組成題庫包；有題目不合格就列出第幾題', () => {
    const good: NumberQuestion = { ...(newQuestion('number', { id: 'q1', subject: 'math' }) as NumberQuestion), prompt: '4 × 3 = ?', answer: 12 };
    const r = buildPack('乘法', [good], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pack).toMatchObject({ format: 'learning-island-pack', version: 1, title: '乘法', questions: [{ id: 'q1', answer: 12 }] });
    const bad = buildPack('乘法', [good, newQuestion('number', { id: 'q2', subject: 'math' })], 1);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join()).toContain('第 2 題');
    expect(buildPack(' ', [good], 1).ok).toBe(false);
    expect(buildPack('空的', [], 1).ok).toBe(false);
  });
});

describe('planBatches', () => {
  it('依每次最多 5 題分批', () => {
    expect(planBatches(5)).toEqual([5]);
    expect(planBatches(12)).toEqual([5, 5, 2]);
    expect(planBatches(20)).toEqual([5, 5, 5, 5]);
    expect(planBatches(0)).toEqual([]);
  });
});
