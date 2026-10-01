import { describe, expect, it } from 'vitest';
import { buildSession, pickFresh } from '../../src/engine/session';
import { getActivity, ALL_ACTIVITIES } from '../../src/activities/registry';
import type { Question } from '../../src/core/types';

const q = (id: string): Question => ({ id, subject: 'math', skill: 's', indicators: ['N-2-1'], prompt: id, type: 'number', answer: 1 });

describe('pickFresh 優先出沒做過的題', () => {
  it('沒做過的題優先，數量不足時補最久以前做過的', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'].map(q);
    // recent 由舊到新：a 最久以前、c 最近
    const picked = pickFresh(pool, ['a', 'b', 'c'], 3, 1).map((x) => x.id);
    expect(picked).toHaveLength(3);
    expect(picked).toContain('d');
    expect(picked).toContain('e');
    expect(picked).toContain('a');
    expect(picked).not.toContain('c');
  });

  it('題目池比要的少時全部給', () => {
    expect(pickFresh([q('x')], [], 5, 1)).toHaveLength(1);
  });
});

describe('buildSession 一回合的題目', () => {
  it('題目池很小的技能也不會出錯（每個活動每個難度都試）', () => {
    for (const a of ALL_ACTIVITIES) {
      for (const level of a.levels ? ([1, 2, 3] as const) : ([1] as const)) {
        const qs = buildSession(a, { seed: 7, level }, []);
        expect(qs.length, `${a.id} L${level}`).toBeGreaterThan(0);
        expect(qs.length).toBeLessThanOrEqual(a.count);
        expect(new Set(qs.map((x) => x.id)).size).toBe(qs.length);
      }
    }
  });

  it('連玩三回合時，會避開前面做過的題（生活與健康題庫）', () => {
    const a = getActivity('life.traffic');
    let recent: string[] = [];
    const seen = new Set<string>();
    let repeats = 0;
    for (let round = 0; round < 3; round++) {
      const qs = buildSession(a, { seed: 100 + round, level: 1 }, recent);
      for (const x of qs) {
        if (seen.has(x.id)) repeats++;
        seen.add(x.id);
      }
      recent = [...recent, ...qs.map((x) => x.id)];
    }
    // 題庫 26 題、三回合 30 題：最多只會重複 4 題
    expect(repeats).toBeLessThanOrEqual(4);
  });

  it('數學程式出題連玩三回合幾乎不重複', () => {
    const a = getActivity('math.add');
    let recent: string[] = [];
    const all: string[] = [];
    for (let round = 0; round < 3; round++) {
      const qs = buildSession(a, { seed: 5 + round, level: 2 }, recent);
      all.push(...qs.map((x) => x.id));
      recent = [...recent, ...qs.map((x) => x.id)];
    }
    expect(new Set(all).size).toBe(all.length);
  });
});
