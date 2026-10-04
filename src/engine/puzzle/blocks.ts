/**
 * 積木大師「數數看」的規則（純函式）：積木堆（每一格的高度）、看得到的積木、四選一、星數、機器人。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。畫面在 src/puzzle/blocks/（等角投影的 SVG）。
 *
 * 座標：x 往右前方、z 往左前方（都朝向看的人）、y 往上。每一疊都從地面堆起，
 * 而且越前面越矮或一樣高，所以每一疊的頂面都看得到；被擋住的只有疊在下面的積木（課本「看不到的也要算」）。
 */
import { createRng, type Rng } from '../../core/rng';
import type { BotLevel } from './common';

/** 一局幾題 */
export const BLOCKS_QUESTIONS = 8;

/** 各難度的大小：寬（x）、深（z）、最高幾層、積木數範圍 */
const SIZE: Record<BotLevel, { w: number; d: number; maxH: number; min: number; max: number }> = {
  1: { w: 2, d: 2, maxH: 3, min: 3, max: 7 },
  2: { w: 3, d: 2, maxH: 3, min: 5, max: 10 },
  3: { w: 3, d: 3, maxH: 4, min: 8, max: 15 },
};

/** 一題：每一格的高度 heights[x][z]、四個選項（積木數）、正解的索引 */
export interface BlocksQuestion {
  heights: number[][];
  options: number[];
  answer: number;
}

/** 積木總數 */
export function countBlocks(heights: number[][]): number {
  return heights.flat().reduce((a, b) => a + b, 0);
}

/**
 * 看得到的積木數：上面、右前方、左前方三面都被別的積木蓋住的才看不到。
 * 孩子只數看得到的積木，就會得到這個數（常見的錯誤，當作誘答）。
 */
export function visibleBlocks(heights: number[][]): number {
  let hidden = 0;
  for (let x = 0; x < heights.length; x++) {
    for (let z = 0; z < heights[x].length; z++) {
      for (let y = 0; y < heights[x][z]; y++) {
        const above = y + 1 < heights[x][z];
        const right = x + 1 < heights.length && heights[x + 1][z] > y;
        const left = z + 1 < heights[x].length && heights[x][z + 1] > y;
        if (above && right && left) hidden++;
      }
    }
  }
  return countBlocks(heights) - hidden;
}

/** 產生積木堆：最後面的角落最高，往前每一格不比後面兩格高 */
function makeHeights(rng: Rng, level: BotLevel): number[][] {
  const { w, d, maxH, min, max } = SIZE[level];
  for (let tries = 0; tries < 200; tries++) {
    const h = Array.from({ length: w }, () => Array<number>(d).fill(0));
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        if (x === 0 && z === 0) h[x][z] = rng.int(Math.max(1, maxH - 1), maxH);
        else h[x][z] = rng.int(0, Math.min(x > 0 ? h[x - 1][z] : maxH, z > 0 ? h[x][z - 1] : maxH));
      }
    }
    const total = countBlocks(h);
    if (total >= min && total <= max) return h;
  }
  throw new Error('積木大師：產生不出符合範圍的積木堆');
}

/** 出一題（同一個種子出同一題） */
export function makeBlocksQuestion(seed: number, level: BotLevel): BlocksQuestion {
  const rng = createRng(seed ^ 0xb10c);
  const heights = makeHeights(rng, level);
  const total = countBlocks(heights);
  const visible = visibleBlocks(heights);
  // 誘答：「只數看得到的」優先，其他用相差 1、2 的數
  const wrong: number[] = visible < total ? [visible] : [];
  for (const d of rng.shuffle([-1, 1, 2, -2, 3])) {
    if (wrong.length >= 3) break;
    const v = total + d;
    if (v > 0 && v !== total && !wrong.includes(v)) wrong.push(v);
  }
  const options = rng.shuffle([total, ...wrong.slice(0, 3)]);
  return { heights, options, answer: options.indexOf(total) };
}

/** 一局的題目（積木堆不重複） */
export function buildBlocksRound(seed: number, level: BotLevel, count = BLOCKS_QUESTIONS): BlocksQuestion[] {
  const rng = createRng(seed ^ 0x10c);
  const out: BlocksQuestion[] = [];
  const seen = new Set<string>();
  for (let tries = 0; tries < count * 40 && out.length < count; tries++) {
    const q = makeBlocksQuestion(rng.int(1, 1e9), level);
    const key = JSON.stringify(q.heights);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

/** 自己玩的星數：答對 85％以上 3 星、60％以上 2 星，其他 1 星 */
export function blocksStars(correct: number, total: number): 1 | 2 | 3 {
  const ratio = total > 0 ? correct / total : 0;
  return ratio >= 0.85 ? 3 : ratio >= 0.6 ? 2 : 1;
}

/** 機器人答對率（和益智搶答相同） */
const ACCURACY: Record<BotLevel, number> = { 1: 0.6, 2: 0.75, 3: 0.9 };
/** 機器人數積木的速度倍數：越厲害越快 */
const SPEED: Record<BotLevel, number> = { 1: 1.35, 2: 1.05, 3: 0.75 };

/**
 * 機器人這一題怎麼答：積木越多數越久（每個 0.33 秒，加上 1.8 秒看圖），依難度調快慢；
 * 答錯時多半是「只數看得到的」，跟孩子常犯的錯一樣。
 */
export function botBlocksMove(q: BlocksQuestion, level: BotLevel, rng: Rng): { delayMs: number; pick: number } {
  const total = countBlocks(q.heights);
  const delayMs = Math.round((1800 + total * 330) * SPEED[level] + rng.next() * 900);
  if (rng.chance(ACCURACY[level])) return { delayMs, pick: q.answer };
  const visible = q.options.indexOf(visibleBlocks(q.heights));
  const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answer);
  const pick = visible >= 0 && visible !== q.answer && rng.chance(0.6) ? visible : rng.pick(wrong);
  return { delayMs, pick };
}
