/**
 * 乘法與除法前置：乘法的意義、十十乘法、兩步驟問題、分裝與平分。
 * 乘式依台灣教材慣例寫成「每份數量 × 份數」（3 盤、每盤 4 個 → 4 × 3）。
 */
import type { QuestionGenerator } from '../../core/types';
import { PEOPLE, generateUnique, shuffleChoices, type Level } from './util';

const SRC = '依 108 課綱自編';

/** 乘法情境用的物品：emoji、名稱、量詞、容器 */
const GROUP_ITEMS = [
  { emoji: '🍎', name: '蘋果', mw: '顆', box: '盤' },
  { emoji: '🍪', name: '餅乾', mw: '片', box: '包' },
  { emoji: '🐟', name: '魚', mw: '條', box: '缸' },
  { emoji: '🌸', name: '花', mw: '朵', box: '束' },
  { emoji: '🥚', name: '蛋', mw: '顆', box: '盒' },
  { emoji: '🖍️', name: '蠟筆', mw: '枝', box: '盒' },
] as const;

/** 乘法的意義：數一數幾個幾、選出正確乘式、「幾倍」 */
export const genMulMeaning: QuestionGenerator = (opts) =>
  generateUnique('math.mul-meaning', opts, (rng, level) => {
    const it = rng.pick(GROUP_ITEMS);
    const count = rng.int(2, level === 1 ? 5 : 9);
    const groups = rng.int(2, level === 1 ? 5 : 6);
    const base = { subject: 'math', skill: 'math.mul-meaning', indicators: ['N-2-6'], source: SRC, difficulty: level } as const;
    if (level === 1) {
      return {
        ...base,
        id: `math.mul-meaning:count:${it.name}:${count}x${groups}`,
        type: 'number',
        prompt: `每${it.box}有 ${count} ${it.mw}${it.name}，${groups} ${it.box}一共有幾${it.mw}？`,
        answer: count * groups,
        unit: it.mw,
        visual: { kind: 'emoji', emoji: it.emoji, count, groups },
        explain: `${groups} 個 ${count} 是 ${count} × ${groups} = ${count * groups}。`,
      };
    }
    // 誘答：加法、相同數相乘；刻意不放「份數 × 每份數量」的顛倒乘式，避免與教材慣例衝突
    const formulaDistractors = [`${count} + ${groups}`, `${count} × ${count}`, `${groups} × ${groups}`, `${count} + ${count}`].map((text) => ({ text }));
    if (level === 2) {
      const withPicture = rng.chance(0.6);
      const { options, answer } = shuffleChoices(rng, { text: `${count} × ${groups}` }, formulaDistractors);
      return {
        ...base,
        id: `math.mul-meaning:formula:${withPicture ? it.name : 'text'}:${count}x${groups}`,
        type: 'choice',
        prompt: withPicture
          ? `每${it.box}有 ${count} ${it.mw}，有 ${groups} ${it.box}。可以用哪一個算式表示？`
          : `「${groups} 個 ${count}」可以寫成哪一個算式？`,
        options,
        answer,
        visual: withPicture ? { kind: 'emoji', emoji: it.emoji, count, groups } : undefined,
        explain: `每份 ${count} 個、有 ${groups} 份，寫成 ${count} × ${groups}。`,
      };
    }
    if (rng.chance(0.5)) {
      const sum = Array.from({ length: groups }, () => String(count)).join(' + ');
      const { options, answer } = shuffleChoices(rng, { text: `${count} × ${groups}` }, formulaDistractors);
      return {
        ...base,
        id: `math.mul-meaning:repeat:${count}x${groups}`,
        type: 'choice',
        prompt: `${sum} 可以寫成哪一個乘法算式？`,
        options,
        answer,
        explain: `${groups} 個 ${count} 相加，就是 ${count} × ${groups}。`,
      };
    }
    return {
      ...base,
      id: `math.mul-meaning:times:${count}x${groups}`,
      type: 'number',
      prompt: `${count} 的 ${groups} 倍是多少？`,
      answer: count * groups,
      explain: `${count} 的 ${groups} 倍就是 ${groups} 個 ${count}：${count} × ${groups} = ${count * groups}。`,
    };
  });

/** 各難度考的乘法表 */
const TABLES: Record<Level, number[]> = {
  1: [2, 5, 10],
  2: [2, 3, 4, 5, 6, 10],
  3: [2, 3, 4, 5, 6, 7, 8, 9],
};

/** 十十乘法：難度 1 為 2、5、10，難度 2 加入 3、4、6，難度 3 為 2～9 */
export const genTimes: QuestionGenerator = (opts) =>
  generateUnique('math.times', opts, (rng, level) => {
    const a = rng.pick(TABLES[level]);
    const b = rng.int(1, 10);
    return {
      id: `math.times:${a}x${b}`,
      subject: 'math',
      skill: 'math.times',
      indicators: ['N-2-7'],
      source: SRC,
      type: 'number',
      prompt: `${a} × ${b} = ?`,
      speak: `${a} 乘以 ${b} 等於多少？`,
      answer: a * b,
      difficulty: level,
      explain: `${a} 的乘法：${a} × ${b} = ${a * b}。`,
    };
  });

/** 兩步驟問題（乘與加減） */
export const genTwoStep: QuestionGenerator = (opts) =>
  generateUnique('math.two-step', opts, (rng, level) => {
    const maxFactor = level === 1 ? 5 : 9;
    const c = rng.int(2, maxFactor);
    const g = rng.int(2, maxFactor);
    const p = rng.pick(PEOPLE);
    const base = { subject: 'math', skill: 'math.two-step', indicators: ['N-2-8'], source: SRC, type: 'number', difficulty: level } as const;
    const kind = rng.pick(['box-plus', 'change', 'left', 'chairs'] as const);
    if (kind === 'box-plus') {
      const x = rng.int(1, 9);
      return { ...base, id: `math.two-step:box:${c}:${g}:${x}`, prompt: `一盒蛋有 ${c} 顆，${p}買了 ${g} 盒，又多買了 ${x} 顆，一共買了幾顆蛋？`, unit: '顆', answer: c * g + x, explain: `先算 ${c} × ${g} = ${c * g}，再加 ${x}，等於 ${c * g + x}。` };
    }
    if (kind === 'change') {
      const pay = c * g <= 50 ? 50 : 100;
      return { ...base, id: `math.two-step:change:${c}:${g}`, prompt: `一包餅乾 ${c} 元，${p}買了 ${g} 包，付了 ${pay} 元，要找回幾元？`, unit: '元', answer: pay - c * g, explain: `先算 ${c} × ${g} = ${c * g} 元，再算 ${pay} − ${c * g} = ${pay - c * g}。` };
    }
    if (kind === 'left') {
      const have = c * g + rng.int(1, 30);
      return { ...base, id: `math.two-step:left:${c}:${g}:${have}`, prompt: `${p}有 ${have} 元，買了 ${g} 枝一枝 ${c} 元的鉛筆，還剩下幾元？`, unit: '元', answer: have - c * g, explain: `先算 ${c} × ${g} = ${c * g} 元，再算 ${have} − ${c * g} = ${have - c * g}。` };
    }
    const x = rng.int(1, c * g - 1);
    return { ...base, id: `math.two-step:chairs:${c}:${g}:${x}`, prompt: `一排有 ${c} 張椅子，排了 ${g} 排，又搬走 ${x} 張，還剩下幾張？`, unit: '張', answer: c * g - x, explain: `先算 ${c} × ${g} = ${c * g}，再算 ${c * g} − ${x} = ${c * g - x}。` };
  });

/** 分裝與平分（除法前置經驗，不含餘數） */
export const genShare: QuestionGenerator = (opts) =>
  generateUnique('math.share', opts, (rng, level) => {
    const divisors: Record<Level, number[]> = { 1: [2, 5], 2: [2, 3, 4, 5, 6], 3: [2, 3, 4, 5, 6, 7, 8, 9] };
    const k = rng.pick(divisors[level]);
    const q = rng.int(2, level === 1 ? 6 : 9);
    const n = k * q;
    const base = { subject: 'math', skill: 'math.share', indicators: ['N-2-9'], source: SRC, type: 'number', difficulty: level } as const;
    if (rng.chance(0.5)) {
      return {
        ...base,
        id: `math.share:equal:${n}/${k}`,
        prompt: `有 ${n} 顆糖果，平分給 ${k} 個小朋友，每人分到幾顆？`,
        unit: '顆',
        answer: q,
        visual: level === 1 ? { kind: 'emoji', emoji: '🍬', count: n } : undefined,
        explain: `想想看：${k} × ? = ${n}，${k} × ${q} = ${n}，所以每人 ${q} 顆。`,
      };
    }
    return {
      ...base,
      id: `math.share:pack:${n}/${k}`,
      prompt: `有 ${n} 個橘子，每 ${k} 個裝成一袋，可以裝成幾袋？`,
      unit: '袋',
      answer: q,
      visual: level === 1 ? { kind: 'emoji', emoji: '🍊', count: n } : undefined,
      explain: `${k} 個一袋，${k} × ${q} = ${n}，所以可以裝 ${q} 袋。`,
    };
  });
