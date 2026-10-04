/**
 * 記憶翻牌的規則（純函式）：牌組、翻牌與配對、輪流、星數、機器人的記憶。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。畫面在 src/puzzle/memory/。
 *
 * - 一次翻兩張，同一對就留在桌上（算翻的人配到的）；不同對就蓋回去。
 * - 自己玩：步數（每翻兩張算一步）越少星星越多。
 * - 和機器人輪流：配對成功可以再翻一次；配到比較多對的贏。機器人只記得最近幾張翻過的牌。
 */
import { createRng, type Rng } from '../../core/rng';
import type { SpeakLang } from '../../core/types';
import { WORDS } from '../../content/en/words';
import type { BotLevel } from './common';

/** 各難度幾對牌 */
export const PAIRS_BY_LEVEL: Record<BotLevel, number> = { 1: 6, 2: 8, 3: 10 };

/** 牌的內容：英文單字配圖、乘法算式配答案、中文名稱配圖 */
export const MEMORY_KINDS = ['en', 'mul', 'zh'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** 機器人記得最近幾張翻過的牌：簡單 2、普通 4、厲害 8 */
export const BOT_MEMORY: Record<BotLevel, number> = { 1: 2, 2: 4, 3: 8 };

/** 牌面：文字或圖（emoji）；lang 是翻開時朗讀的語言 */
export interface CardFace {
  text?: string;
  emoji?: string;
  lang?: SpeakLang;
}

/** 一張牌：屬於第幾對、牌面 */
export interface MemoryCard {
  pair: number;
  face: CardFace;
}

/** 一副牌 */
export interface MemoryDeck {
  kind: MemoryKind;
  cards: MemoryCard[];
}

/** 一局的狀態 */
export interface MemoryState {
  mode: 'solo' | 'vs';
  cards: MemoryCard[];
  /** 每張牌被誰配到（還沒配對是 null） */
  owner: ('kid' | 'bot' | null)[];
  /** 目前翻開、還沒配對的牌（最多兩張） */
  open: number[];
  /** 輪到誰（自己玩永遠是孩子） */
  turn: 'kid' | 'bot';
  /** 翻了幾步（每翻兩張算一步） */
  steps: number;
  scores: { kid: number; bot: number };
  done: boolean;
}

// ---------- 牌組 ----------

/** 可以配圖的英文字（數字的圖是鍵帽，不放）；英文只用比較基本的字 */
const PICTURE_WORDS = WORDS.filter((w) => w.pic && w.topic !== 'num');

/** 每一對的兩個牌面 */
function pairFaces(kind: MemoryKind, count: number, rng: Rng): [CardFace, CardFace][] {
  if (kind === 'mul') {
    // 2～9 的乘法，答案在同一副牌裡不重複
    const used = new Set<number>();
    const out: [CardFace, CardFace][] = [];
    while (out.length < count) {
      const a = rng.int(2, 9);
      const b = rng.int(2, 9);
      if (used.has(a * b)) continue;
      used.add(a * b);
      out.push([{ text: `${a} × ${b}` }, { text: String(a * b) }]);
    }
    return out;
  }
  const pool = kind === 'en' ? PICTURE_WORDS.filter((w) => w.lv <= 2) : PICTURE_WORDS;
  // 中文名稱也不能重複（不同的英文字可能翻成同一個中文）
  const unique = [...new Map(pool.map((w) => [kind === 'en' ? w.en : w.zh, w])).values()];
  return rng
    .shuffle(unique)
    .slice(0, count)
    .map((w) => (kind === 'en' ? [{ text: w.en, lang: 'en-US' }, { emoji: w.emoji }] : [{ text: w.zh, lang: 'zh-TW' }, { emoji: w.emoji }]));
}

/** 洗好的一副牌；沒有指定內容時依種子輪流（英文、乘法、中文） */
export function makeMemoryDeck(seed: number, level: BotLevel, kind?: MemoryKind): MemoryDeck {
  const k = kind ?? MEMORY_KINDS[Math.abs(Math.floor(seed)) % MEMORY_KINDS.length];
  const rng = createRng(seed ^ 0x3e3);
  const cards = pairFaces(k, PAIRS_BY_LEVEL[level], rng).flatMap(([a, b], pair) => [
    { pair, face: a },
    { pair, face: b },
  ]);
  return { kind: k, cards: rng.shuffle(cards) };
}

// ---------- 翻牌 ----------

export function startMemory(deck: MemoryDeck, mode: 'solo' | 'vs'): MemoryState {
  return { mode, cards: deck.cards, owner: deck.cards.map(() => null), open: [], turn: 'kid', steps: 0, scores: { kid: 0, bot: 0 }, done: false };
}

/**
 * 翻一張牌：輪到的人才能翻；已經配對、已經翻開、或桌上已經有兩張沒配對的牌時不能翻。
 * 翻開第二張時算一步；同一對就留在桌上（配到的人加一分，可以再翻）。不同對要等 settle 蓋回去。
 */
export function flipCard(s: MemoryState, index: number, who: 'kid' | 'bot'): MemoryState {
  if (s.done || who !== s.turn || s.open.length >= 2 || s.owner[index] || s.open.includes(index) || !s.cards[index]) return s;
  const open = [...s.open, index];
  if (open.length < 2) return { ...s, open };
  const steps = s.steps + 1;
  const [a, b] = open;
  if (s.cards[a].pair !== s.cards[b].pair) return { ...s, open, steps };
  const owner = s.owner.slice();
  owner[a] = who;
  owner[b] = who;
  const scores = { ...s.scores, [who]: s.scores[who] + 1 };
  return { ...s, owner, open: [], steps, scores, done: owner.every((o) => o !== null) };
}

/** 兩張不同對的牌給大家看過之後蓋回去；和機器人比賽時換人 */
export function settle(s: MemoryState): MemoryState {
  if (s.open.length < 2) return s;
  return { ...s, open: [], turn: s.mode === 'vs' ? (s.turn === 'kid' ? 'bot' : 'kid') : 'kid' };
}

/** 自己玩的星數：步數在對數的 1.8 倍以內 3 星、2.6 倍以內 2 星，其他 1 星 */
export function memoryStars(steps: number, pairs: number): 1 | 2 | 3 {
  return steps <= Math.round(pairs * 1.8) ? 3 : steps <= Math.round(pairs * 2.6) ? 2 : 1;
}

// ---------- 機器人 ----------

/** 機器人看到一張牌：記在最後面（看過的移到最後），只留最近 capacity 張 */
export function remember(mem: number[], index: number, capacity: number): number[] {
  return [...mem.filter((i) => i !== index), index].slice(-capacity);
}

/**
 * 機器人這一回合要翻哪兩張（mem 是記得的牌，由舊到新）：
 * 1. 記得同一對的兩張 → 直接翻那一對
 * 2. 否則第一張翻沒看過的牌；翻開後如果記得它的另一半就翻另一半，不然再翻一張沒看過的
 * 沒看過的牌翻完了才翻記得的牌。已經配對的牌不會翻。
 */
export function botPicks(s: MemoryState, mem: number[], rng: Rng): [number, number] {
  const left = s.cards.map((_, i) => i).filter((i) => !s.owner[i]);
  const known = mem.filter((i) => !s.owner[i]);
  for (let x = 0; x < known.length; x++) {
    for (let y = x + 1; y < known.length; y++) {
      if (s.cards[known[x]].pair === s.cards[known[y]].pair) return [known[x], known[y]];
    }
  }
  const unseen = left.filter((i) => !known.includes(i));
  const first = rng.pick(unseen.length ? unseen : left);
  const partner = known.find((i) => i !== first && s.cards[i].pair === s.cards[first].pair);
  if (partner !== undefined) return [first, partner];
  const rest = unseen.filter((i) => i !== first);
  return [first, rng.pick(rest.length ? rest : left.filter((i) => i !== first))];
}
