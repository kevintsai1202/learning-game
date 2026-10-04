/**
 * 積木大師（數數看）的規則（純函式）：積木堆、看得到的積木、四選一、星數、機器人。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/core/rng';
import {
  BLOCKS_QUESTIONS,
  blocksStars,
  botBlocksMove,
  buildBlocksRound,
  countBlocks,
  makeBlocksQuestion,
  visibleBlocks,
} from '../../../src/engine/puzzle/blocks';

describe('積木大師：積木堆', () => {
  it('每一疊都從地面堆起，而且越前面（靠近看的人）越矮或一樣高：每一疊的頂面都看得到', () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const level of [1, 2, 3] as const) {
        const { heights } = makeBlocksQuestion(seed, level);
        for (let x = 0; x < heights.length; x++) {
          for (let z = 0; z < heights[x].length; z++) {
            if (x + 1 < heights.length) expect(heights[x + 1][z]).toBeLessThanOrEqual(heights[x][z]);
            if (z + 1 < heights[x].length) expect(heights[x][z + 1]).toBeLessThanOrEqual(heights[x][z]);
          }
        }
      }
    }
  });

  it('積木數依難度：簡單 3～7、普通 5～10、厲害 8～15', () => {
    const ranges = { 1: [3, 7], 2: [5, 10], 3: [8, 15] } as const;
    for (let seed = 1; seed <= 60; seed++) {
      for (const level of [1, 2, 3] as const) {
        const total = countBlocks(makeBlocksQuestion(seed, level).heights);
        expect(total, `level ${level} seed ${seed}`).toBeGreaterThanOrEqual(ranges[level][0]);
        expect(total, `level ${level} seed ${seed}`).toBeLessThanOrEqual(ranges[level][1]);
      }
    }
  });

  it('看得到的積木：一疊 3 個都看得到；2×2×2 的大方塊只有最裡面那一個看不到', () => {
    expect(visibleBlocks([[3]])).toBe(3);
    expect(
      visibleBlocks([
        [2, 2],
        [2, 2],
      ]),
    ).toBe(7);
  });
});

describe('積木大師：題目', () => {
  it('四個選項不重複、都是正數，正解是積木總數；有看不到的積木時，「只數看得到的」是誘答之一', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const q = makeBlocksQuestion(seed, 3);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      for (const o of q.options) expect(o).toBeGreaterThan(0);
      expect(q.options[q.answer]).toBe(countBlocks(q.heights));
      const visible = visibleBlocks(q.heights);
      if (visible < countBlocks(q.heights)) expect(q.options).toContain(visible);
    }
  });

  it(`一局 ${BLOCKS_QUESTIONS} 題，積木堆不重複；同一個種子出同一局`, () => {
    const round = buildBlocksRound(42, 2);
    expect(round).toHaveLength(BLOCKS_QUESTIONS);
    expect(new Set(round.map((q) => JSON.stringify(q.heights))).size).toBe(BLOCKS_QUESTIONS);
    expect(buildBlocksRound(42, 2)).toEqual(round);
  });

  it('答對 85％以上 3 星、60％以上 2 星，其他 1 星', () => {
    expect(blocksStars(7, 8)).toBe(3);
    expect(blocksStars(6, 8)).toBe(2);
    expect(blocksStars(5, 8)).toBe(2);
    expect(blocksStars(4, 8)).toBe(1);
  });
});

describe('積木大師：機器人', () => {
  const q = makeBlocksQuestion(9, 2);

  it('答對率接近 60／75／90％；答錯時選別的選項', () => {
    for (const level of [1, 2, 3] as const) {
      const rng = createRng(level * 7);
      let right = 0;
      for (let i = 0; i < 3000; i++) {
        const m = botBlocksMove(q, level, rng);
        expect(m.pick).toBeGreaterThanOrEqual(0);
        expect(m.pick).toBeLessThan(4);
        if (m.pick === q.answer) right++;
      }
      expect(right / 3000, `level ${level}`).toBeCloseTo([0.6, 0.75, 0.9][level - 1], 1);
    }
  });

  it('積木越多數越久；越厲害越快', () => {
    const small = { ...q, heights: [[2]] };
    const big = { ...q, heights: [[4, 3, 2], [3, 2, 1], [2, 1, 1]] };
    const delay = (question: typeof q, level: 1 | 2 | 3) => botBlocksMove(question, level, createRng(5)).delayMs;
    expect(delay(big, 2)).toBeGreaterThan(delay(small, 2));
    expect(delay(big, 3)).toBeLessThan(delay(big, 1));
  });
});
