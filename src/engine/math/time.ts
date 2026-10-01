/**
 * 時間：認識鐘面（讀時刻、撥時鐘）、時間單位與月曆。
 */
import type { QuestionGenerator } from '../../core/types';
import { generateUnique, shuffleChoices, timeText, type Level } from './util';

const SRC = '依 108 課綱自編';

/** 各難度分針的最小單位（分鐘） */
const STEP: Record<Level, number> = { 1: 30, 2: 5, 3: 1 };

/** 依難度抽一個時刻 */
function drawTime(rng: { int(a: number, b: number): number }, level: Level): { hour: number; minute: number } {
  const step = STEP[level];
  return { hour: rng.int(1, 12), minute: rng.int(0, 60 / step - 1) * step };
}

/** 看鐘面讀時刻（選擇題）；誘答包含「時針分針看反」「看成下一點」等常見錯誤 */
export const genClockRead: QuestionGenerator = (opts) =>
  generateUnique('math.clock-read', opts, (rng, level) => {
    if (level === 3 && rng.chance(0.3)) {
      // 兩個整點之間經過幾小時（在同一個白天裡，不跨越 12 點）
      const from = rng.int(1, 9);
      const to = rng.int(from + 1, 11);
      return {
        id: `math.clock-read:hours:${from}:${to}`,
        subject: 'math',
        skill: 'math.clock-read',
        indicators: ['N-2-13'],
        source: SRC,
        type: 'number',
        unit: '小時',
        prompt: `從 ${from} 點到 ${to} 點，時針走過了幾個數字（經過幾小時）？`,
        answer: to - from,
        visual: { kind: 'clock', hour: to, minute: 0 },
        difficulty: level,
        explain: `時針從 ${from} 走到 ${to}，一個數字一個數字數：經過 ${to - from} 小時。`,
      };
    }
    const { hour, minute } = drawTime(rng, level);
    const next = (hour % 12) + 1;
    const prev = ((hour + 10) % 12) + 1;
    const distractors = [
      // 時針分針看反（只有分針指在整數刻度時才合理）
      ...(minute % 5 === 0 && minute !== 0 ? [timeText(minute / 5, (hour * 5) % 60)] : []),
      timeText(next, minute),
      timeText(prev, minute),
      timeText(hour, (minute + 5) % 60),
      timeText(hour, minute === 30 ? 0 : 30),
    ].map((text) => ({ text }));
    const { options, answer } = shuffleChoices(rng, { text: timeText(hour, minute) }, rng.shuffle(distractors));
    return {
      id: `math.clock-read:${hour}:${minute}`,
      subject: 'math',
      skill: 'math.clock-read',
      indicators: ['N-2-13'],
      source: SRC,
      type: 'choice',
      prompt: '時鐘上是幾點幾分？',
      options,
      answer,
      visual: { kind: 'clock', hour, minute },
      difficulty: level,
      explain: '短針是時針，看它剛走過哪個數字；長針是分針，每一大格是 5 分鐘。',
    };
  });

/** 撥時鐘：把指針撥到指定時刻 */
export const genClockSet: QuestionGenerator = (opts) =>
  generateUnique('math.clock-set', opts, (rng, level) => {
    const { hour, minute } = drawTime(rng, level);
    return {
      id: `math.clock-set:${hour}:${minute}`,
      subject: 'math',
      skill: 'math.clock-set',
      indicators: ['N-2-13'],
      source: SRC,
      type: 'clock',
      prompt: `請把時鐘撥到 ${timeText(hour, minute)}`,
      hour,
      minute,
      step: STEP[level],
      difficulty: level,
      explain: '先撥長針（分針）到正確的位置，再看短針（時針）有沒有在對的地方。',
    };
  });

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const MONTH_DAYS_FACT = [
  { month: 1, days: 31 },
  { month: 3, days: 31 },
  { month: 4, days: 30 },
  { month: 6, days: 30 },
  { month: 7, days: 31 },
  { month: 8, days: 31 },
  { month: 9, days: 30 },
  { month: 11, days: 30 },
  { month: 12, days: 31 },
];

/** 某年某月有幾天 */
const daysInMonth = (y: number, m: number): number => new Date(y, m, 0).getDate();
/** 某年某月某日是星期幾（0 = 星期日） */
const weekday = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getDay();

/** 時間單位與月曆：星期、月份天數、幾天後是星期幾、看月曆 */
export const genTimeUnits: QuestionGenerator = (opts) =>
  generateUnique('math.time-units', opts, (rng, level) => {
    const base = { subject: 'math', skill: 'math.time-units', indicators: ['N-2-14'], source: SRC, difficulty: level } as const;
    const weekChoice = (correct: number, idPart: string, prompt: string, explain: string, visual?: { kind: 'calendar'; year: number; month: number; highlight?: number }) => {
      const { options, answer } = shuffleChoices(
        rng,
        { text: WEEK[correct] },
        rng.shuffle(WEEK.filter((_, i) => i !== correct)).map((text) => ({ text })),
      );
      return { ...base, id: `math.time-units:${idPart}`, type: 'choice' as const, prompt, options, answer, explain, visual };
    };
    // 課綱 N-2-14：不做時間間隔問題；可做簡單計算（例如暑假的總天數）、觀察月曆、閏年只談四年一閏
    const kinds: Record<Level, string[]> = {
      1: ['fact', 'tomorrow', 'yesterday', 'month-days'],
      2: ['later', 'calendar-weekday', 'month-days', 'tomorrow'],
      3: ['calendar-first', 'total-days', 'later', 'calendar-weekday'],
    };
    const kind = rng.pick(kinds[level]);
    if (kind === 'fact') {
      const f = rng.pick([
        { q: '1 星期有幾天？', a: 7, u: '天' },
        { q: '1 年有幾個月？', a: 12, u: '個月' },
        { q: '2 星期有幾天？', a: 14, u: '天' },
        { q: '3 星期有幾天？', a: 21, u: '天' },
        { q: '2 年有幾個月？', a: 24, u: '個月' },
        { q: '平年的 2 月有幾天？', a: 28, u: '天' },
        { q: '閏年的 2 月有幾天？', a: 29, u: '天' },
        { q: '每幾年有一次閏年？', a: 4, u: '年' },
      ]);
      return { ...base, id: `math.time-units:fact:${f.q}`, type: 'number', prompt: f.q, answer: f.a, unit: f.u, explain: '1 星期有 7 天，1 年有 12 個月。' };
    }
    if (kind === 'month-days') {
      const f = rng.pick(MONTH_DAYS_FACT);
      return { ...base, id: `math.time-units:month-days:${f.month}`, type: 'number', prompt: `${f.month} 月有幾天？`, answer: f.days, unit: '天', explain: '大月有 31 天：1、3、5、7、8、10、12 月；小月有 30 天：4、6、9、11 月；2 月是 28 或 29 天。' };
    }
    if (kind === 'tomorrow' || kind === 'yesterday') {
      const d = rng.int(0, 6);
      const ans = kind === 'tomorrow' ? (d + 1) % 7 : (d + 6) % 7;
      return kind === 'tomorrow'
        ? weekChoice(ans, `tomorrow:${d}`, `今天是${WEEK[d]}，明天是星期幾？`, `${WEEK[d]}的下一天是${WEEK[ans]}。`)
        : weekChoice(ans, `yesterday:${d}`, `今天是${WEEK[d]}，昨天是星期幾？`, `${WEEK[d]}的前一天是${WEEK[ans]}。`);
    }
    if (kind === 'later') {
      // 只考「後天」與「1、2 個星期後」，練習一星期 7 天的循環
      const d = rng.int(0, 6);
      const opt = rng.pick([
        { k: 2, text: '後天' },
        { k: 7, text: '1 個星期後的同一天' },
        { k: 14, text: '2 個星期後的同一天' },
      ]);
      const ans = (d + opt.k) % 7;
      return weekChoice(ans, `later:${d}:${opt.k}`, `今天是${WEEK[d]}，${opt.text}是星期幾？`, opt.k === 2 ? '後天是明天的明天。' : `1 個星期有 7 天，過了整個星期又會回到${WEEK[d]}。`);
    }
    // 以下為看月曆題
    const year = rng.pick([2026, 2027]);
    const month = rng.int(1, 12);
    if (kind === 'calendar-weekday') {
      const day = rng.int(1, daysInMonth(year, month));
      const ans = weekday(year, month, day);
      return weekChoice(ans, `cal-wd:${year}-${month}-${day}`, `看月曆：${month} 月 ${day} 日是星期幾？`, '找到那一天，往上看是星期幾。', { kind: 'calendar', year, month, highlight: day });
    }
    if (kind === 'calendar-first') {
      const target = rng.int(0, 6);
      const first = weekday(year, month, 1);
      const day = 1 + ((target - first + 7) % 7);
      return { ...base, id: `math.time-units:cal-first:${year}-${month}-${target}`, type: 'number', prompt: `看月曆：${month} 月的第一個${WEEK[target]}是幾日？`, answer: day, unit: '日', visual: { kind: 'calendar', year, month }, explain: `從 1 日開始找，第一個${WEEK[target]}是 ${day} 日。` };
    }
    // 兩個月份合起來一共有幾天（例如暑假 7、8 月）
    const pair = rng.pick([
      { a: 7, b: 8, name: '暑假的 7 月和 8 月' },
      { a: 1, b: 2, name: '1 月和 2 月（平年）' },
      { a: 3, b: 4, name: '3 月和 4 月' },
      { a: 5, b: 6, name: '5 月和 6 月' },
      { a: 9, b: 10, name: '9 月和 10 月' },
      { a: 11, b: 12, name: '11 月和 12 月' },
    ]);
    const days = (m: number) => (m === 2 ? 28 : [4, 6, 9, 11].includes(m) ? 30 : 31);
    const total = days(pair.a) + days(pair.b);
    return { ...base, id: `math.time-units:total-days:${pair.a}-${pair.b}`, type: 'number', prompt: `${pair.name}，一共有幾天？`, answer: total, unit: '天', explain: `${pair.a} 月有 ${days(pair.a)} 天，${pair.b} 月有 ${days(pair.b)} 天，${days(pair.a)} + ${days(pair.b)} = ${total}。` };
  });
