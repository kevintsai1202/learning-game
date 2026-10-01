/**
 * 數與計算：一千以內的數、三位數加減、加減文字題、比大小。
 * 對應課綱 N-2-1、N-2-2、N-2-3、R-2-1（代碼以 docs/research/curriculum-108.md 為準）。
 */
import type { Rng } from '../../core/rng';
import type { Question, QuestionGenerator } from '../../core/types';
import { ITEMS, generateUnique, numberDistractors, sample, shuffleChoices, twoPeople, type Level } from './util';

const SRC = '依 108 課綱自編';

/** 直式加法的進位次數 */
export function countCarries(a: number, b: number): number {
  let carry = 0;
  let n = 0;
  while (a > 0 || b > 0) {
    const s = (a % 10) + (b % 10) + carry;
    carry = s >= 10 ? 1 : 0;
    n += carry;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return n;
}

/** 直式減法的退位次數（a − b） */
export function countBorrows(a: number, b: number): number {
  let borrow = 0;
  let n = 0;
  while (a > 0 || b > 0) {
    const d = (a % 10) - borrow - (b % 10);
    borrow = d < 0 ? 1 : 0;
    n += borrow;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return n;
}

/** 一千以內的數：位值組合、指定位數的數字、數數列、比大小 */
export const genPlaceValue: QuestionGenerator = (opts) =>
  generateUnique('math.place-value', opts, (rng, level) => {
    const base = { subject: 'math', skill: 'math.place-value', indicators: ['N-2-1'], source: SRC } as const;
    /** 數值上限（課本單元範圍） */
    const max = Math.min(999, opts.maxNumber ?? 999);
    if (level === 1) {
      const n = rng.int(100, max);
      const h = Math.floor(n / 100);
      const t = Math.floor(n / 10) % 10;
      const o = n % 10;
      return {
        ...base,
        id: `math.place-value:compose:${n}`,
        type: 'number',
        prompt: `${h} 個百、${t} 個十、${o} 個一，合起來是多少？`,
        answer: n,
        explain: `${h} 個百是 ${h * 100}，${t} 個十是 ${t * 10}，再加 ${o}，合起來是 ${n}。`,
      };
    }
    if (level === 2) {
      const n = rng.int(100, max);
      const pos = rng.pick(['百', '十', '個'] as const);
      const digit = pos === '百' ? Math.floor(n / 100) : pos === '十' ? Math.floor(n / 10) % 10 : n % 10;
      return {
        ...base,
        id: `math.place-value:digit:${n}:${pos}`,
        type: 'number',
        prompt: `${n} 的${pos}位數字是多少？`,
        answer: digit,
        explain: `${n} 是 ${Math.floor(n / 100)} 個百、${Math.floor(n / 10) % 10} 個十、${n % 10} 個一。`,
      };
    }
    if (rng.chance(0.5)) {
      // 數數列：每次多 step，問下一個數
      const step = rng.pick([2, 5, 10, 100].filter((v) => v * 5 <= max));
      const start = rng.int(1, Math.floor((max - step * 3) / step)) * step;
      const seq = [start, start + step, start + step * 2];
      return {
        ...base,
        id: `math.place-value:seq:${start}:${step}`,
        type: 'number',
        prompt: `每次多 ${step}：${seq.join('、')}、？ 接下來是多少？`,
        answer: start + step * 3,
        explain: `${seq[2]} 再多 ${step} 是 ${start + step * 3}。`,
      };
    }
    // 比大小：四個不同的三位數，問最大或最小
    const nums = sample(
      rng,
      (r) => Array.from({ length: 4 }, () => r.int(100, max)),
      (arr) => new Set(arr).size === 4,
    );
    const wantMax = rng.chance(0.5);
    const target = wantMax ? Math.max(...nums) : Math.min(...nums);
    const { options, answer } = shuffleChoices(
      rng,
      { text: String(target) },
      nums.filter((v) => v !== target).map((v) => ({ text: String(v) })),
    );
    return {
      ...base,
      id: `math.place-value:${wantMax ? 'max' : 'min'}:${[...nums].sort().join(',')}`,
      type: 'choice',
      prompt: `哪一個數${wantMax ? '最大' : '最小'}？`,
      options,
      answer,
      explain: '先比百位，百位一樣再比十位，十位也一樣再比個位。',
    };
  });

/** 三位數加法（直式），難度決定進位次數 */
export const genAdd: QuestionGenerator = (opts) =>
  generateUnique('math.add', opts, (rng, level) => {
    const max = Math.min(999, opts.maxNumber ?? 999);
    /** 上限 300 以內（二上「二位數的加減」）：加數、被加數都是二位數 */
    const twoDigit = max <= 300;
    const [a, b] = sample(
      rng,
      (r): [number, number] =>
        twoDigit
          ? [r.int(10, 99), r.int(10, 99)]
          : level === 1
            ? [r.int(10, 899), r.int(10, 899)]
            : level === 2
              ? [r.int(100, 899), r.int(10, 899)]
              : [r.int(100, 899), r.int(100, 899)],
      ([x, y]) => {
        const c = countCarries(x, y);
        if (x + y > max) return false;
        return level === 1 ? c === 0 : level === 2 ? c >= 1 : c >= 2;
      },
    );
    return {
      id: `math.add:${a}+${b}`,
      subject: 'math',
      skill: 'math.add',
      indicators: ['N-2-2'],
      source: SRC,
      type: 'number',
      prompt: `${a} + ${b} = ?`,
      speak: `${a} 加 ${b} 等於多少？`,
      answer: a + b,
      visual: { kind: 'vertical', a, b, op: '+' },
      difficulty: level,
      explain: '直式加法從個位開始算，滿十要進位到左邊一位。',
    };
  });

/**
 * 三位數減法（直式）。課綱 N-2-2：減法限一次退位、須處理數字中有 0 的題型。
 * 難度 1 不退位；難度 2 剛好退位一次；難度 3 剛好退位一次且題目或答案含 0。
 */
export const genSub: QuestionGenerator = (opts) =>
  generateUnique('math.sub', opts, (rng, level) => {
    const [a, b] = sample(
      rng,
      (r): [number, number] => {
        const max = Math.min(999, opts.maxNumber ?? 999);
        // 上限 300 以內（二上）：減數是二位數
        if (max <= 300) {
          const x = r.int(20, max);
          return [x, r.int(10, Math.min(99, x))];
        }
        const x = level === 1 ? r.int(20, max) : r.int(100, max);
        return [x, r.int(10, x)];
      },
      ([x, y]) => {
        const n = countBorrows(x, y);
        if (level === 1) return n === 0;
        if (n !== 1) return false;
        return level === 2 || `${x}${y}${x - y}`.includes('0');
      },
    );
    return {
      id: `math.sub:${a}-${b}`,
      subject: 'math',
      skill: 'math.sub',
      indicators: ['N-2-2'],
      source: SRC,
      type: 'number',
      prompt: `${a} − ${b} = ?`,
      speak: `${a} 減 ${b} 等於多少？`,
      answer: a - b,
      visual: { kind: 'vertical', a, b, op: '-' },
      difficulty: level,
      explain: '直式減法從個位開始算，不夠減就向左邊一位借 1 當 10。',
    };
  });

/** 加減文字題：難度 1 結果未知、難度 2 改變量未知或「比…少」、難度 3 起始量未知 */
export const genWordAddSub: QuestionGenerator = (opts) =>
  generateUnique('math.word-addsub', opts, (rng, level) => {
    const item = rng.pick(ITEMS);
    const [p, q] = twoPeople(rng);
    const max = Math.min(level === 1 ? 100 : level === 2 ? 500 : 999, opts.maxNumber ?? 999);
    const { name, mw } = item;
    const base = {
      subject: 'math',
      skill: 'math.word-addsub',
      indicators: ['N-2-3'],
      source: SRC,
      type: 'number',
      unit: mw,
      difficulty: level,
    } as const;
    const pickPair = (r: Rng): [number, number] => {
      const x = r.int(Math.floor(max / 4), max - 10);
      return [x, r.int(5, Math.min(x - 1, max - x))];
    };
    const [a, b] = sample(rng, pickPair, ([x, y]) => y > 0 && x > y && x + y <= max);
    const kinds: Record<Level, string[]> = {
      1: ['join', 'separate', 'more'],
      2: ['change', 'less', 'join'],
      3: ['start-separate', 'start-join', 'less'],
    };
    const kind = rng.pick(kinds[level]);
    switch (kind) {
      case 'join':
        return { ...base, id: `math.word-addsub:join:${a}:${b}:${name}`, prompt: `${p}有 ${a} ${mw}${name}，${q}又給${p} ${b} ${mw}，${p}現在有幾${mw}${name}？`, answer: a + b, explain: `原本的加上新給的：${a} + ${b} = ${a + b}。` };
      case 'separate':
        return { ...base, id: `math.word-addsub:sep:${a}:${b}:${name}`, prompt: `${p}有 ${a} ${mw}${name}，送給${q} ${b} ${mw}，${p}還剩下幾${mw}？`, answer: a - b, explain: `原本的減掉送出去的：${a} − ${b} = ${a - b}。` };
      case 'more':
        return { ...base, id: `math.word-addsub:more:${a}:${b}:${name}`, prompt: `${p}有 ${a} ${mw}${name}，${q}有 ${b} ${mw}，${p}比${q}多幾${mw}？`, answer: a - b, explain: `比多少用減法：${a} − ${b} = ${a - b}。` };
      case 'change':
        return { ...base, id: `math.word-addsub:change:${a}:${b}:${name}`, prompt: `${p}原本有 ${a} ${mw}${name}，${q}又給了${p}一些，現在${p}一共有 ${a + b} ${mw}。${q}給了幾${mw}？`, answer: b, explain: `現在的減掉原本的：${a + b} − ${a} = ${b}。` };
      case 'less':
        return { ...base, id: `math.word-addsub:less:${a}:${b}:${name}`, prompt: `${p}有 ${a} ${mw}${name}，比${q}少 ${b} ${mw}，${q}有幾${mw}？`, answer: a + b, explain: `${p}比${q}少，表示${q}比較多：${a} + ${b} = ${a + b}。` };
      case 'start-separate':
        return { ...base, id: `math.word-addsub:start-sep:${a}:${b}:${name}`, prompt: `${p}有一些${name}，送給${q} ${b} ${mw}以後，還剩下 ${a - b} ${mw}。${p}原本有幾${mw}？`, answer: a, explain: `剩下的加回送出去的：${a - b} + ${b} = ${a}。` };
      default:
        return { ...base, id: `math.word-addsub:start-join:${a}:${b}:${name}`, prompt: `${p}有一些${name}，${q}又給${p} ${b} ${mw}以後，${p}一共有 ${a} ${mw}。${p}原本有幾${mw}？`, answer: a - b, explain: `一共的減掉給的：${a} − ${b} = ${a - b}。` };
    }
  });

/** 比大小（>、<、=），難度 2 起出現算式，難度 3 練習交換律與位值拆解 */
export const genCompare: QuestionGenerator = (opts) =>
  generateUnique('math.compare', opts, (rng, level) => {
    const max = Math.min(999, opts.maxNumber ?? 999);
    let left: string;
    let right: string;
    let lv: number;
    let rv: number;
    if (level === 1) {
      [lv, rv] = sample(rng, (r): [number, number] => [r.int(100, max), r.int(100, max)], ([x, y]) => x !== y && Math.floor(x / 100) === Math.floor(y / 100));
      left = String(lv);
      right = String(rv);
    } else if (level === 2) {
      // 算式與數字比大小；所有數字都不超過上限
      [lv, rv, left] = sample(
        rng,
        (r): [number, number, string] => {
          const x = r.int(Math.min(100, Math.floor(max / 2)), Math.floor(max * 0.6));
          const y = r.int(10, Math.max(10, Math.floor(max * 0.3)));
          const sum = x + y;
          return [sum, sum + r.pick([0, 0, 1, -1, 10, -10, 5, -5]), `${x} + ${y}`];
        },
        ([a, b]) => a <= max && b <= max && b > 0,
      );
      right = String(rv);
    } else if (rng.chance(0.5)) {
      const x = rng.int(10, 99);
      const y = rng.int(10, 99);
      const swap = rng.chance(0.6);
      lv = x + y;
      rv = swap ? y + x : y + x + rng.pick([1, -1, 10]);
      left = `${x} + ${y}`;
      right = swap ? `${y} + ${x}` : String(rv);
    } else {
      [lv, rv, left] = sample(
        rng,
        (r): [number, number, string] => {
          const h = r.int(1, 9);
          const t = r.int(1, 9);
          const o = r.int(1, 9);
          const n = h * 100 + t * 10 + o;
          return [n, n + r.pick([0, 0, 9, -9, 90, -90]), `${h * 100} + ${t * 10} + ${o}`];
        },
        ([a, b]) => a <= max && b <= max,
      );
      right = String(rv);
    }
    const answer = lv > rv ? 0 : lv < rv ? 1 : 2;
    // 「36 + 27 ○ 27 + 36」這一型是加法交換（R-2-2），其餘是大小關係（R-2-1）
    const swapped = /^\d+ \+ \d+$/.test(right);
    return {
      id: `math.compare:${left}?${right}`,
      subject: 'math',
      skill: 'math.compare',
      indicators: swapped ? ['R-2-1', 'R-2-2'] : ['R-2-1'],
      source: SRC,
      type: 'choice',
      prompt: `${left} ○ ${right}，○ 裡要填什麼？`,
      options: [
        { text: '>', speak: '大於' },
        { text: '<', speak: '小於' },
        { text: '=', speak: '等於' },
      ],
      answer,
      difficulty: level,
      explain: `左邊是 ${lv}，右邊是 ${rv}，所以填「${['>', '<', '='][answer]}」。`,
    };
  });

/**
 * 簡單加減估算（課綱 N-2-4）：以百位數估算為主、貼近生活情境。
 * 難度 1 大約是幾百；難度 2 兩樣東西合起來大約幾百；難度 3 帶的錢夠不夠。
 */
export const genEstimate: QuestionGenerator = (opts) =>
  generateUnique('math.estimate', opts, (rng, level) => {
    const base = { subject: 'math', skill: 'math.estimate', indicators: ['N-2-4'], source: SRC, type: 'choice', difficulty: level } as const;
    const goods = rng.shuffle(['書包', '球鞋', '外套', '玩具車', '故事書', '水壺', '雨傘', '鉛筆盒']);
    /** 接近某個整百的價錢（差 1～9 元） */
    const near = (r: Rng) => r.int(1, 8) * 100 + r.pick([-1, 1]) * r.int(1, 9);
    const hundredOption = (v: number) => ({ text: `大約 ${v} 元` });
    if (level === 1) {
      const p = near(rng);
      const round = Math.round(p / 100) * 100;
      const { options, answer } = shuffleChoices(rng, hundredOption(round), [round - 100, round + 100, round + 200].filter((v) => v > 0).map(hundredOption));
      return { ...base, id: `math.estimate:round:${p}`, prompt: `${goods[0]}賣 ${p} 元，大約是幾百元？`, options, answer, explain: `${p} 最接近 ${round}。` };
    }
    const [p1, p2] = sample(rng, (r): [number, number] => [near(r), near(r)], ([x, y]) => x + y < 1000);
    const est = Math.round(p1 / 100) * 100 + Math.round(p2 / 100) * 100;
    if (level === 2) {
      const { options, answer } = shuffleChoices(rng, hundredOption(est), [est - 100, est + 100, est + 200].filter((v) => v > 0).map(hundredOption));
      return {
        ...base,
        id: `math.estimate:sum:${p1}:${p2}`,
        prompt: `${goods[0]} ${p1} 元，${goods[1]} ${p2} 元，兩樣合起來大約是幾百元？`,
        options,
        answer,
        explain: `${p1} 大約 ${Math.round(p1 / 100) * 100}，${p2} 大約 ${Math.round(p2 / 100) * 100}，合起來大約 ${est}。`,
      };
    }
    // 帶的錢與實際總價差距至少 50 元，估算才判斷得出來
    const budget = sample(rng, (r) => r.int(3, 10) * 100, (b) => Math.abs(b - (p1 + p2)) >= 50);
    const enough = budget >= p1 + p2;
    return {
      ...base,
      id: `math.estimate:budget:${p1}:${p2}:${budget}`,
      prompt: `媽媽帶了 ${budget} 元，想買 ${p1} 元的${goods[0]}和 ${p2} 元的${goods[1]}，錢夠不夠？`,
      options: [{ text: '夠' }, { text: '不夠' }],
      answer: enough ? 0 : 1,
      explain: `兩樣大約 ${est} 元，${enough ? '沒有超過' : '超過了'} ${budget} 元。`,
    };
  });

/** 讓其他模組產生數字誘答選項 */
export { numberDistractors };

/** 出題器回傳的題目型別別名（給其他檔案共用） */
export type { Question };
