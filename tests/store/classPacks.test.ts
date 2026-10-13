/**
 * 班級題庫在孩子這邊（docs/plans/ai-questions.md 第 1 節第 4 點）：
 * 題庫包轉成挑戰塔的活動；班級內容的快取什麼時候要重新抓。
 */
import { describe, expect, it } from 'vitest';
import { classPackActivity, needsClassContent, parseClassContentCache } from '../../src/store/classPacks';
import type { ContentPack } from '../../src/content/schema';

const pack: ContentPack = {
  format: 'learning-island-pack',
  version: 1,
  title: '乘法練習',
  questions: Array.from({ length: 12 }, (_, i) => ({
    id: `q${i}`,
    subject: 'math' as const,
    skill: 'math.class',
    indicators: ['N-2-7'],
    type: 'number' as const,
    prompt: `${i} × 2 = ?`,
    answer: i * 2,
  })),
};

describe('classPackActivity', () => {
  it('變成挑戰塔「班級題庫」分組的活動，一回合最多 10 題', () => {
    const a = classPackActivity({ id: 'p1', title: '乘法練習', pack });
    expect(a).toMatchObject({ id: 'class.p1', zone: 'tower', subject: 'math', title: '乘法練習', group: '班級題庫', count: 10, levels: false, indicators: ['N-2-7'] });
    const qs = a.make({ seed: 1, count: 10, level: 1 });
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.id)).size).toBe(10);
  });
});

describe('needsClassContent', () => {
  it('伺服器的版本號和快取不同才要抓；舊版伺服器沒有版本號就不抓', () => {
    expect(needsClassContent({}, { code: '123456', contentRev: 2 })).toBe(true);
    expect(needsClassContent({ '123456': { rev: 2, packs: [] } }, { code: '123456', contentRev: 2 })).toBe(false);
    expect(needsClassContent({ '123456': { rev: 1, packs: [] } }, { code: '123456', contentRev: 2 })).toBe(true);
    expect(needsClassContent({}, { code: '123456' })).toBe(false);
  });
});

describe('parseClassContentCache', () => {
  it('讀回快取；壞掉的整份丟掉，格式錯的題庫略過', () => {
    expect(parseClassContentCache(null)).toEqual({});
    expect(parseClassContentCache('{壞掉')).toEqual({});
    const raw = JSON.stringify({ '123456': { rev: 2, packs: [{ id: 'p1', title: '乘法練習', pack }, { id: 'bad', title: 'x', pack: { format: 'nope' } }] } });
    const cache = parseClassContentCache(raw);
    expect(cache['123456'].rev).toBe(2);
    expect(cache['123456'].packs.map((p) => p.id)).toEqual(['p1']);
  });
});
