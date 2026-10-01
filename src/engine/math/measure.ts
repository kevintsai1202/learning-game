/**
 * 量與實測：錢幣、長度（公分、公尺）、單位分數。
 */
import type { QuestionGenerator } from '../../core/types';
import { generateUnique, sample, shuffleChoices, zhNumber, type Level } from './util';

const SRC = '依 108 課綱自編';

/** 各難度可用的錢幣與鈔票面額 */
const MONEY_DENOMS: Record<Level, number[]> = {
  1: [1, 5, 10, 50],
  2: [1, 5, 10, 50, 100, 500],
  3: [1, 5, 10, 50, 100, 500, 1000],
};

/** 數錢：看一把錢算總額；難度 3 另有換錢題 */
export const genMoneyCount: QuestionGenerator = (opts) =>
  generateUnique('math.money-count', opts, (rng, level) => {
    const base = { subject: 'math', skill: 'math.money-count', indicators: ['N-2-5'], source: SRC, type: 'number', unit: '元', difficulty: level } as const;
    const max = Math.min(1000, opts.maxNumber ?? 1000);
    /** 這個範圍用得到的面額 */
    const denoms = MONEY_DENOMS[level].filter((d) => d <= max);
    if (level === 3 && max >= 1000 && rng.chance(0.4)) {
      const ex = rng.pick([
        { big: 1000, small: 100 },
        { big: 500, small: 100 },
        { big: 100, small: 10 },
        { big: 500, small: 50 },
        { big: 1000, small: 500 },
        { big: 100, small: 50 },
        { big: 50, small: 10 },
        { big: 50, small: 5 },
      ]);
      const unitName = ex.small >= 100 ? '張' : '個';
      return { ...base, id: `math.money-count:exchange:${ex.big}:${ex.small}`, unit: unitName, prompt: `1 張（個）${ex.big} 元可以換成幾${unitName} ${ex.small} 元？`, answer: ex.big / ex.small, explain: `${ex.small} × ${ex.big / ex.small} = ${ex.big}。` };
    }
    const limit = Math.min(level === 1 ? 100 : 1000, max);
    const items = sample(
      rng,
      (r) => {
        const n = r.int(2, level === 1 ? 6 : 7);
        return Array.from({ length: n }, () => r.pick(denoms)).sort((a, b) => b - a);
      },
      (arr) => arr.reduce((s, v) => s + v, 0) <= limit,
    );
    const sum = items.reduce((s, v) => s + v, 0);
    return { ...base, id: `math.money-count:${items.join('+')}`, prompt: '一共有多少錢？', answer: sum, visual: { kind: 'money', items }, explain: `從面額大的開始數：${items.join(' + ')} = ${sum}。` };
  });

/** 商店商品（付錢題情境） */
const SHOP = [
  { name: '鉛筆', mw: '枝', emoji: '✏️' },
  { name: '橡皮擦', mw: '個', emoji: '🧽' },
  { name: '筆記本', mw: '本', emoji: '📒' },
  { name: '玩具車', mw: '台', emoji: '🚗' },
  { name: '故事書', mw: '本', emoji: '📕' },
  { name: '水壺', mw: '個', emoji: '🧴' },
  { name: '球', mw: '顆', emoji: '⚽' },
] as const;

/** 付錢：拿出剛好的錢；難度 3 另有找錢題 */
export const genMoneyPay: QuestionGenerator = (opts) =>
  generateUnique('math.money-pay', opts, (rng, level) => {
    const it = rng.pick(SHOP);
    const base = { subject: 'math', skill: 'math.money-pay', indicators: ['N-2-5'], source: SRC, difficulty: level } as const;
    const max = Math.min(1000, opts.maxNumber ?? 1000);
    if (level === 3 && rng.chance(0.5)) {
      const pay = rng.pick([100, 500, 1000].filter((v) => v <= max));
      const price = rng.int(Math.floor(pay / 10), pay - 1);
      return { ...base, id: `math.money-pay:change:${pay}:${price}`, type: 'number', unit: '元', prompt: `${it.name}一${it.mw} ${price} 元，付了 ${pay} 元，要找回幾元？`, answer: pay - price, explain: `${pay} − ${price} = ${pay - price}。` };
    }
    const hi = Math.min(level === 1 ? 99 : level === 2 ? 999 : 1000, max);
    const amount = level === 1 ? rng.int(6, hi) : rng.int(Math.min(101, hi - 50), hi);
    return {
      ...base,
      id: `math.money-pay:${amount}:${it.name}`,
      type: 'money',
      prompt: `${it.emoji} ${it.name}一${it.mw}賣 ${amount} 元，請拿出剛好 ${amount} 元。`,
      amount,
      denominations: MONEY_DENOMS[level].filter((d) => d <= max),
      explain: '先拿面額大的，再用小的補到剛好。',
    };
  });

/** 量長度的物品 */
const RULER_ITEMS = [
  { name: '鉛筆', emoji: '✏️' },
  { name: '蠟筆', emoji: '🖍️' },
  { name: '鑰匙', emoji: '🔑' },
  { name: '紅蘿蔔', emoji: '🥕' },
  { name: '毛毛蟲', emoji: '🐛' },
  { name: '迴紋針', emoji: '📎' },
  { name: '香蕉', emoji: '🍌' },
  { name: '牙刷', emoji: '🪥' },
] as const;

/** 長度：用尺量（難度 2 起點不是 0）、公尺公分換算與加減 */
export const genLength: QuestionGenerator = (opts) =>
  generateUnique('math.length', opts, (rng, level) => {
    const base = { subject: 'math', skill: 'math.length', indicators: ['N-2-11'], source: SRC, type: 'number', unit: '公分', difficulty: level } as const;
    if (level === 1 || level === 2) {
      const it = rng.pick(RULER_ITEMS);
      const start = level === 1 ? 0 : rng.int(1, 5);
      const len = rng.int(2, 12);
      return {
        ...base,
        indicators: ['N-2-11', 'S-2-3'],
        id: `math.length:ruler:${it.name}:${start}:${len}`,
        prompt: `${it.name}有幾公分長？`,
        answer: len,
        visual: { kind: 'ruler', start, end: start + len, item: it.emoji },
        explain: start === 0 ? `從 0 量到 ${len}，就是 ${len} 公分。` : `從 ${start} 量到 ${start + len}，要數中間有幾格：${start + len} − ${start} = ${len} 公分。`,
      };
    }
    const kind = rng.pick(['to-cm', 'split', 'cut', 'join'] as const);
    if (kind === 'to-cm') {
      const m = rng.int(1, 9);
      const cm = rng.int(0, 99);
      return { ...base, id: `math.length:to-cm:${m}:${cm}`, prompt: cm === 0 ? `${m} 公尺是幾公分？` : `${m} 公尺 ${cm} 公分是幾公分？`, answer: m * 100 + cm, explain: `1 公尺 = 100 公分，${m} 公尺是 ${m * 100} 公分，再加 ${cm} 公分。` };
    }
    if (kind === 'split') {
      const n = rng.int(101, 999);
      return { ...base, id: `math.length:split:${n}`, prompt: `${n} 公分 = ${Math.floor(n / 100)} 公尺 ? 公分，? 是多少？`, answer: n % 100, explain: `100 公分是 1 公尺，${n} 公分是 ${Math.floor(n / 100)} 公尺 ${n % 100} 公分。` };
    }
    if (kind === 'cut') {
      const a = rng.int(50, 300);
      const b = rng.int(10, a - 10);
      return { ...base, id: `math.length:cut:${a}:${b}`, prompt: `一條繩子長 ${a} 公分，剪掉 ${b} 公分，還剩下幾公分？`, answer: a - b, explain: `${a} − ${b} = ${a - b}。` };
    }
    const a = rng.int(20, 400);
    const b = rng.int(20, 400);
    return { ...base, id: `math.length:join:${a}:${b}`, prompt: `紅緞帶長 ${a} 公分，藍緞帶長 ${b} 公分，接起來（不重疊）一共長幾公分？`, answer: a + b, explain: `${a} + ${b} = ${a + b}。` };
  });

/** 分數文字與朗讀，例如 1/4、四分之一 */
const fracOption = (n: number) => ({ text: `1/${n}`, speak: `${zhNumber(n)}分之一` });

/**
 * 各難度可用的等分數。課綱 N-2-10：分數限連續量；摺紙限「摺半」（長方形摺出 2、4、8，圓摺出 2 或 4），
 * 已等分割的格圖以長方形或圓形為主。
 */
const FRACTION_PARTS: Record<Level, { pizza: number[]; bar: number[] }> = {
  1: { pizza: [2, 4], bar: [2, 4, 8] },
  2: { pizza: [2, 3, 4, 6, 8], bar: [2, 3, 4, 5, 6, 8] },
  3: { pizza: [2, 3, 4, 6, 8], bar: [2, 3, 4, 5, 6, 7, 8] },
};

/** 單位分數：看等分圖說出幾分之一；難度 3 加入摺紙與「一半」的說法（只認識，不比大小） */
export const genFraction: QuestionGenerator = (opts) =>
  generateUnique('math.fraction', opts, (rng, level) => {
    const base = { subject: 'math', skill: 'math.fraction', indicators: ['N-2-10'], source: SRC, type: 'choice', difficulty: level } as const;
    if (level === 3 && rng.chance(0.35)) {
      const fold = rng.pick([
        { q: '把一張長方形色紙對摺 1 次，打開後每一格是整張的幾分之幾？', n: 2 },
        { q: '把一張長方形色紙對摺再對摺（摺 2 次），打開後每一格是整張的幾分之幾？', n: 4 },
        { q: '把一張長方形色紙對摺 3 次，打開後每一格是整張的幾分之幾？', n: 8 },
        { q: '把一張圓形色紙對摺再對摺，打開後每一格是整張的幾分之幾？', n: 4 },
        { q: '一個蛋糕的「一半」，就是這個蛋糕的幾分之幾？', n: 2 },
      ]);
      const { options, answer } = shuffleChoices(rng, fracOption(fold.n), rng.shuffle([2, 3, 4, 6, 8].filter((v) => v !== fold.n)).map(fracOption));
      return { ...base, id: `math.fraction:fold:${fold.q}`, prompt: fold.q, options, answer, explain: `每摺半一次，格子數就變 2 倍；平分成 ${fold.n} 格，一格就是${zhNumber(fold.n)}分之一。` };
    }
    const shape = rng.pick(['pizza', 'bar'] as const);
    const parts = rng.pick(FRACTION_PARTS[level][shape]);
    const thing = shape === 'pizza' ? '披薩' : '長條';
    if (level < 3 && rng.chance(0.3)) {
      // 看圖數一數平分成幾份（認識「等分」）
      return {
        ...base,
        type: 'number',
        id: `math.fraction:count:${shape}:${parts}`,
        prompt: `這個${thing}平分成幾份？`,
        answer: parts,
        unit: '份',
        visual: { kind: 'fraction', parts, shaded: 1, shape },
        explain: `數一數，一共有 ${parts} 份，每一份一樣大。`,
      };
    }
    if (level < 3 && rng.chance(0.2)) {
      // 日常語言「的一半」「的四分之一」（N-2-10 說明）
      const talk = rng.pick([
        { q: '把一個披薩平分成 2 份，其中 1 份是這個披薩的幾分之幾？', n: 2 },
        { q: '把一條吐司平分成 4 片，其中 1 片是整條吐司的幾分之幾？', n: 4 },
        { q: '把一個西瓜切成一樣大的 2 塊，1 塊就是西瓜的「一半」。一半是幾分之幾？', n: 2 },
        { q: '把一張紙平分成 8 格，其中 1 格是整張紙的幾分之幾？', n: 8 },
      ]);
      const { options, answer } = shuffleChoices(rng, fracOption(talk.n), rng.shuffle([2, 3, 4, 8].filter((v) => v !== talk.n)).map(fracOption));
      return { ...base, id: `math.fraction:talk:${talk.q}`, prompt: talk.q, options, answer, explain: `平分成 ${talk.n} 份，1 份就是${zhNumber(talk.n)}分之一。` };
    }
    const distractors = [parts - 1, parts + 1, parts * 2, parts + 2].filter((v) => v >= 2 && v <= 8 && v !== parts).map(fracOption);
    const { options, answer } = shuffleChoices(rng, fracOption(parts), rng.shuffle(distractors));
    return {
      ...base,
      id: `math.fraction:id:${shape}:${parts}`,
      prompt: `塗色的部分是整個${thing}的幾分之幾？`,
      options,
      answer,
      visual: { kind: 'fraction', parts, shaded: 1, shape },
      explain: `平分成 ${parts} 份，其中 1 份就是${zhNumber(parts)}分之一。`,
    };
  });

/** 量的比較情境：容量（杯）、重量（積木與天平）、面積（格子） */
const MEASURE_KINDS = [
  { id: 'cap', code: 'N-2-12', things: ['甲瓶', '乙瓶', '丙瓶'], unit: '杯', how: (n: number) => `可以倒滿 ${n} 杯水`, more: '裝的水比較多', most: '裝的水最多', tool: '（杯子都一樣大）' },
  { id: 'wt', code: 'N-2-12', things: ['蘋果', '橘子', '芭樂'], unit: '個積木', how: (n: number) => `放在天平上要用 ${n} 個積木才平衡`, more: '比較重', most: '最重', tool: '（積木都一樣重）' },
  { id: 'area', code: 'S-2-5', things: ['甲圖形', '乙圖形', '丙圖形'], unit: '格', how: (n: number) => `剛好可以鋪滿 ${n} 個格子`, more: '的面積比較大', most: '的面積最大', tool: '（格子都一樣大）' },
];

/**
 * 容量、重量、面積的比較（課綱 N-2-12、S-2-5）：只做直接比較與「個別單位」的間接比較，不教常用單位。
 * 難度 1 問哪一個比較多；難度 2 問多幾個單位；難度 3 三個比較。
 */
export const genMeasureCompare: QuestionGenerator = (opts) =>
  generateUnique('math.measure-compare', opts, (rng, level) => {
    const kind = rng.pick(MEASURE_KINDS);
    const base = { subject: 'math', skill: 'math.measure-compare', indicators: [kind.code], source: SRC, difficulty: level } as const;
    const n = level === 3 ? 3 : 2;
    const vals = sample(rng, (r) => Array.from({ length: n }, () => r.int(2, 12)), (arr) => new Set(arr).size === arr.length);
    const lines = vals.map((v, i) => `${kind.things[i]}${kind.how(v)}`).join('，');
    const maxIdx = vals.indexOf(Math.max(...vals));
    if (level === 2) {
      const diff = Math.abs(vals[0] - vals[1]);
      const bigger = vals[0] > vals[1] ? 0 : 1;
      return {
        ...base,
        id: `math.measure-compare:${kind.id}:diff:${vals.join(',')}`,
        type: 'number',
        unit: kind.unit,
        prompt: `${lines}${kind.tool}。${kind.things[bigger]}比${kind.things[1 - bigger]}多幾${kind.unit}？`,
        answer: diff,
        explain: `${Math.max(...vals)} − ${Math.min(...vals)} = ${diff}。`,
      };
    }
    return {
      ...base,
      id: `math.measure-compare:${kind.id}:${vals.join(',')}`,
      type: 'choice',
      prompt: `${lines}${kind.tool}。哪一個${level === 3 ? kind.most : kind.more}？`,
      options: vals.map((_, i) => ({ text: kind.things[i] })),
      answer: maxIdx,
      explain: '用一樣大的單位來比，數量越多就越多（越重、越大）。',
    };
  });

/** 周長（課綱 S-2-4）：把每一邊的長度連加起來，不用公式 */
export const genPerimeter: QuestionGenerator = (opts) =>
  generateUnique('math.perimeter', opts, (rng, level) => {
    const base = { subject: 'math', skill: 'math.perimeter', indicators: ['S-2-4'], source: SRC, type: 'number', unit: '公分', difficulty: level } as const;
    if (level === 1) {
      const sides = Array.from({ length: 3 }, () => rng.int(2, 9));
      const sum = sides.reduce((s, v) => s + v, 0);
      return {
        ...base,
        id: `math.perimeter:tri:${sides.join(',')}`,
        prompt: `三角形的三個邊分別是 ${sides.join(' 公分、')} 公分，繞一圈是幾公分？`,
        answer: sum,
        visual: { kind: 'shape', shape: 'triangle' },
        explain: `把三個邊加起來：${sides.join(' + ')} = ${sum}。`,
      };
    }
    if (level === 2 || rng.chance(0.5)) {
      const a = rng.int(3, 12);
      const b = rng.int(2, a - 1);
      return {
        ...base,
        id: `math.perimeter:rect:${a}x${b}`,
        prompt: `長方形的長邊是 ${a} 公分、短邊是 ${b} 公分，繞一圈是幾公分？`,
        answer: 2 * (a + b),
        visual: { kind: 'shape', shape: 'rectangle' },
        explain: `長方形相對的邊一樣長：${a} + ${b} + ${a} + ${b} = ${2 * (a + b)}。`,
      };
    }
    const s = rng.int(2, 12);
    return {
      ...base,
      id: `math.perimeter:square:${s}`,
      prompt: `正方形的一個邊是 ${s} 公分，繞一圈是幾公分？`,
      answer: 4 * s,
      visual: { kind: 'shape', shape: 'square' },
      explain: `正方形 4 個邊一樣長：${s} + ${s} + ${s} + ${s} = ${4 * s}。`,
    };
  });
