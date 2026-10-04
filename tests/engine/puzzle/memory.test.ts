/**
 * 記憶翻牌的規則（純函式）：牌組、翻牌與配對、輪流、星數、機器人的記憶。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/core/rng';
import {
  BOT_MEMORY,
  MEMORY_KINDS,
  PAIRS_BY_LEVEL,
  botPicks,
  flipCard,
  makeMemoryDeck,
  memoryStars,
  remember,
  settle,
  startMemory,
  type MemoryState,
} from '../../../src/engine/puzzle/memory';

/** 依序翻牌（每次都由目前輪到的人翻），兩張沒配對就蓋回去 */
function play(s: MemoryState, indices: number[]): MemoryState {
  for (const i of indices) {
    s = flipCard(s, i, s.turn);
    if (s.open.length === 2) s = settle(s);
  }
  return s;
}

/** 找出同一對的兩張牌 */
const pairOf = (s: MemoryState, pair: number) => s.cards.map((c, i) => (c.pair === pair ? i : -1)).filter((i) => i >= 0);

describe('記憶翻牌：牌組', () => {
  it('簡單 6 對、普通 8 對、厲害 10 對；每一對剛好兩張、兩面內容不同', () => {
    expect(PAIRS_BY_LEVEL).toEqual({ 1: 6, 2: 8, 3: 10 });
    for (const kind of MEMORY_KINDS) {
      for (const level of [1, 2, 3] as const) {
        const deck = makeMemoryDeck(level * 17, level, kind);
        expect(deck.kind).toBe(kind);
        expect(deck.cards).toHaveLength(PAIRS_BY_LEVEL[level] * 2);
        for (let p = 0; p < PAIRS_BY_LEVEL[level]; p++) {
          const two = deck.cards.filter((c) => c.pair === p);
          expect(two, `${kind} 第 ${p} 對`).toHaveLength(2);
          expect(JSON.stringify(two[0].face)).not.toBe(JSON.stringify(two[1].face));
        }
      }
    }
  });

  it('同一副牌裡不會有兩張一樣的牌面（否則孩子分不出來）', () => {
    for (const kind of MEMORY_KINDS) {
      for (let seed = 1; seed <= 20; seed++) {
        const faces = makeMemoryDeck(seed, 3, kind).cards.map((c) => JSON.stringify(c.face));
        expect(new Set(faces).size, `${kind} seed ${seed}`).toBe(faces.length);
      }
    }
  });

  it('乘法：算式配答案，答案在同一副牌裡不重複', () => {
    const deck = makeMemoryDeck(5, 3, 'mul');
    for (let p = 0; p < 10; p++) {
      const [a, b] = deck.cards.filter((c) => c.pair === p).map((c) => c.face.text!);
      const [expr, ans] = a.includes('×') ? [a, b] : [b, a];
      const [x, y] = expr.split('×').map((v) => Number(v.trim()));
      expect(x * y).toBe(Number(ans));
    }
  });

  it('同一個種子出同一副牌；沒有指定內容時依種子輪流', () => {
    expect(makeMemoryDeck(9, 2)).toEqual(makeMemoryDeck(9, 2));
    const kinds = new Set(Array.from({ length: 12 }, (_, i) => makeMemoryDeck(i, 1).kind));
    expect(kinds.size).toBe(MEMORY_KINDS.length);
  });
});

describe('記憶翻牌：翻牌與配對', () => {
  const deck = makeMemoryDeck(3, 1, 'en');

  it('翻到同一對：留在桌上算配對成功，同一個人可以再翻；步數加一', () => {
    const s0 = startMemory(deck, 'vs');
    const [a, b] = pairOf(s0, 0);
    const s = play(s0, [a, b]);
    expect(s.owner[a]).toBe('kid');
    expect(s.owner[b]).toBe('kid');
    expect(s.scores).toEqual({ kid: 1, bot: 0 });
    expect(s.turn).toBe('kid');
    expect(s.steps).toBe(1);
  });

  it('翻到不同對：兩張先留著給孩子看，蓋回去之後換人', () => {
    const s0 = startMemory(deck, 'vs');
    const a = pairOf(s0, 0)[0];
    const c = pairOf(s0, 1)[0];
    let s = flipCard(flipCard(s0, a, 'kid'), c, 'kid');
    expect(s.open).toEqual([a, c]);
    expect(flipCard(s, pairOf(s0, 2)[0], 'kid')).toEqual(s);
    s = settle(s);
    expect(s.open).toEqual([]);
    expect(s.turn).toBe('bot');
  });

  it('自己玩不換人；不能翻已經配對的、已經翻開的牌；不是你的回合也不能翻', () => {
    const s0 = startMemory(deck, 'solo');
    const [a, b] = pairOf(s0, 0);
    const c = pairOf(s0, 1)[0];
    let s = play(s0, [a, c]);
    expect(s.turn).toBe('kid');
    s = play(s, [a, b]);
    expect(flipCard(s, a, 'kid')).toEqual(s);
    const opened = flipCard(s, c, 'kid');
    expect(flipCard(opened, c, 'kid')).toEqual(opened);
    expect(flipCard(startMemory(deck, 'vs'), a, 'bot')).toEqual(startMemory(deck, 'vs'));
  });

  it('全部配完就結束', () => {
    let s = startMemory(deck, 'solo');
    for (let p = 0; p < PAIRS_BY_LEVEL[1]; p++) s = play(s, pairOf(s, p));
    expect(s.done).toBe(true);
    expect(s.steps).toBe(PAIRS_BY_LEVEL[1]);
  });

  it('自己玩的星數看步數：配 6 對用 11 步以內 3 星、16 步以內 2 星', () => {
    expect(memoryStars(6, 6)).toBe(3);
    expect(memoryStars(11, 6)).toBe(3);
    expect(memoryStars(12, 6)).toBe(2);
    expect(memoryStars(16, 6)).toBe(2);
    expect(memoryStars(17, 6)).toBe(1);
  });
});

describe('記憶翻牌：機器人', () => {
  const deck = makeMemoryDeck(4, 1, 'mul');

  it('簡單記 2 張、普通記 4 張、厲害記 8 張；舊的會忘記', () => {
    expect(BOT_MEMORY).toEqual({ 1: 2, 2: 4, 3: 8 });
    let mem: number[] = [];
    for (const i of [0, 1, 2, 3]) mem = remember(mem, i, 2);
    expect(mem).toEqual([2, 3]);
    expect(remember([2, 3], 2, 2)).toEqual([3, 2]);
  });

  it('記得同一對的兩張：直接翻那一對', () => {
    const s = { ...startMemory(deck, 'vs'), turn: 'bot' as const };
    const [a, b] = pairOf(s, 3);
    const picks = botPicks(s, [a, 5, b].filter((v, i, arr) => arr.indexOf(v) === i), createRng(1));
    expect(new Set(picks)).toEqual(new Set([a, b]));
  });

  it('翻開的第一張如果記得另一半，就翻另一半', () => {
    const s = { ...startMemory(deck, 'vs'), turn: 'bot' as const };
    const [a, b] = pairOf(s, 2);
    // 只記得 b：第一張翻沒看過的；如果剛好翻到 a，第二張一定翻 b
    for (let seed = 0; seed < 40; seed++) {
      const [first, second] = botPicks(s, [b], createRng(seed));
      if (first === a) expect(second).toBe(b);
      expect(first).not.toBe(second);
    }
  });

  it('不會翻已經配對的牌；第一張優先翻沒看過的', () => {
    let s: MemoryState = { ...startMemory(deck, 'vs'), turn: 'kid' };
    s = play(s, pairOf(s, 0));
    s = { ...s, turn: 'bot' };
    const done = pairOf(s, 0);
    const seen = [pairOf(s, 1)[0], pairOf(s, 2)[0]];
    for (let seed = 0; seed < 40; seed++) {
      const [first, second] = botPicks(s, seen, createRng(seed));
      expect(done).not.toContain(first);
      expect(done).not.toContain(second);
      expect(seen).not.toContain(first);
    }
  });
});
