/**
 * 益智搶答的規則（純函式）：從各科出四選一題目、單人連對挑戰、和機器人搶答、機器人的答題行為。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。畫面在 src/puzzle/quiz/。
 */
import { createRng, type Rng } from '../../core/rng';
import type { ChoiceQuestion, SubjectId } from '../../core/types';
import type { ActivityDef } from '../../activities/types';
import { toArcade } from '../../quiz/arcade';
import { generatePool, pickFresh } from '../session';
import { vsOutcome, type BotLevel, type VsOutcome } from './common';

export { outcomeStars, type BotLevel, type VsOutcome } from './common';

/** 單人連對挑戰最多幾題 */
export const STREAK_MAX_QUESTIONS = 20;
/** 單人連對挑戰答錯幾題結束 */
export const STREAK_MAX_MISSES = 3;
/** 和機器人搶答幾題 */
export const DUEL_QUESTIONS = 10;

/** 每個活動出幾題當候選 */
const PER_ACTIVITY = 3;

// ---------- 出題 ----------

/**
 * 從各科活動出四選一的題目（沿用射擊模式的 toArcade 轉換；轉不了的題型略過）。
 * 依科目輪流挑活動、每個活動的題目交錯排列，一局才會混合各科；候選題目約三倍，才能避開最近做過的題目。
 */
export function buildQuizQuestions(activities: ActivityDef[], count: number, seed: number, recent: string[]): ChoiceQuestion[] {
  const rng = createRng(seed ^ 0x9e1);
  // 依科目分組，各組打散後輪流取
  const groups = new Map<SubjectId, ActivityDef[]>();
  for (const a of activities) groups.set(a.subject, [...(groups.get(a.subject) ?? []), a]);
  const queues = [...groups.values()].map((list) => rng.shuffle(list));
  /** 每個活動轉換好的題目（依挑選順序） */
  const lists: ChoiceQuestion[][] = [];
  const seen = new Set<string>();
  let total = 0;
  while (total < count * 3 && queues.some((q) => q.length)) {
    for (const queue of queues) {
      const a = queue.shift();
      if (!a) continue;
      const level = rng.chance(0.5) ? 1 : 2;
      const list: ChoiceQuestion[] = [];
      for (const q of generatePool(a, rng.int(1, 1e9), level, PER_ACTIVITY)) {
        const c = toArcade(q, rng);
        if (c && !seen.has(c.id)) {
          seen.add(c.id);
          list.push(c);
        }
      }
      lists.push(list);
      total += list.length;
    }
  }
  // 交錯排列：每個活動先各取一題，再取第二題……
  const interleaved: ChoiceQuestion[] = [];
  for (let i = 0; i < PER_ACTIVITY; i++) for (const list of lists) if (list[i]) interleaved.push(list[i]);
  return pickFresh(interleaved, recent, count, seed) as ChoiceQuestion[];
}

// ---------- 單人連對挑戰 ----------

/** 單人連對挑戰的進度 */
export interface StreakState {
  /** 已經答了幾題 */
  answered: number;
  /** 答錯幾題 */
  misses: number;
  /** 目前連對幾題 */
  streak: number;
  /** 這一局最多連對幾題 */
  best: number;
  done: boolean;
}

export function startStreak(): StreakState {
  return { answered: 0, misses: 0, streak: 0, best: 0, done: false };
}

/** 答一題；答錯 STREAK_MAX_MISSES 題或題目答完（total 題）就結束。結束後再答不會改變 */
export function streakAnswer(s: StreakState, correct: boolean, total: number): StreakState {
  if (s.done) return s;
  const answered = s.answered + 1;
  const streak = correct ? s.streak + 1 : 0;
  const misses = s.misses + (correct ? 0 : 1);
  return { answered, misses, streak, best: Math.max(s.best, streak), done: misses >= STREAK_MAX_MISSES || answered >= total };
}

/** 最多連對 10 題以上 3 星、5 題以上 2 星，其他 1 星（玩完就至少 1 星） */
export function streakStars(best: number): 1 | 2 | 3 {
  return best >= 10 ? 3 : best >= 5 ? 2 : 1;
}

// ---------- 和機器人搶答 ----------

/** 和機器人搶答的進度 */
export interface DuelState {
  /** 第幾題（從 0 開始） */
  index: number;
  /** 孩子的得分 */
  kid: number;
  /** 機器人的得分 */
  bot: number;
  /** 這一題已經答錯、不能再答 */
  kidOut: boolean;
  botOut: boolean;
  /** 這一題：還在搶（open）、孩子搶到（kid）、機器人搶到（bot）、都沒答對（none） */
  phase: 'open' | 'kid' | 'bot' | 'none';
  done: boolean;
}

export function startDuel(): DuelState {
  return { index: 0, kid: 0, bot: 0, kidOut: false, botOut: false, phase: 'open', done: false };
}

/** 有人作答：先答對的得分、這一題結束；答錯的人這一題不能再答，兩個都答錯就沒人得分 */
export function duelAnswer(s: DuelState, who: 'kid' | 'bot', correct: boolean): DuelState {
  if (s.phase !== 'open' || s.done || (who === 'kid' ? s.kidOut : s.botOut)) return s;
  if (correct) return who === 'kid' ? { ...s, kid: s.kid + 1, phase: 'kid' } : { ...s, bot: s.bot + 1, phase: 'bot' };
  const next = who === 'kid' ? { ...s, kidOut: true } : { ...s, botOut: true };
  return next.kidOut && next.botOut ? { ...next, phase: 'none' } : next;
}

/** 這一題有結果之後換下一題；total 題答完就結束 */
export function duelNext(s: DuelState, total: number): DuelState {
  if (s.phase === 'open' || s.done) return s;
  const index = s.index + 1;
  if (index >= total) return { ...s, done: true };
  return { ...s, index, kidOut: false, botOut: false, phase: 'open' };
}

/** 依比分判斷輸贏 */
export function duelOutcome(s: Pick<DuelState, 'kid' | 'bot'>): VsOutcome {
  return vsOutcome(s.kid, s.bot);
}

// ---------- 機器人 ----------

/** 機器人答對率：簡單 60％、普通 75％、厲害 90％ */
export const BOT_ACCURACY: Record<BotLevel, number> = { 1: 0.6, 2: 0.75, 3: 0.9 };
/** 讀完題目之後想多久（毫秒）：越厲害越快 */
const THINK_MS: Record<BotLevel, [number, number]> = { 1: [1800, 3000], 2: [1300, 2400], 3: [800, 1800] };

/**
 * 機器人這一題怎麼答：先「讀題」（每個字 120 毫秒，1.2～4 秒），再想一下（依難度），依答對率選對或選錯。
 * 讀題時間讓孩子也有時間聽完題目，目標是「有機會贏，但要努力」。
 */
export function botMove(q: ChoiceQuestion, level: BotLevel, rng: Rng): { delayMs: number; pick: number } {
  const read = Math.min(4000, Math.max(1200, [...q.prompt.replace(/\s/g, '')].length * 120));
  const [lo, hi] = THINK_MS[level];
  const think = lo + rng.next() * (hi - lo);
  const correct = rng.chance(BOT_ACCURACY[level]);
  const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answer);
  const pick = correct || !wrong.length ? q.answer : rng.pick(wrong);
  return { delayMs: Math.round(read + think), pick };
}
