/**
 * 圖形與資料：平面圖形與立體形體的辨認、邊與角的數量、統計圖表判讀。
 */
import type { ChoiceOption, ShapeId } from '../../core/types';
import type { QuestionGenerator } from '../../core/types';
import { generateUnique, sample, shuffleChoices } from './util';

const SRC = '依 108 課綱自編';

/** 平面圖形的名稱、邊數與角數 */
const PLANE: { id: ShapeId; name: string; sides: number }[] = [
  { id: 'triangle', name: '三角形', sides: 3 },
  { id: 'square', name: '正方形', sides: 4 },
  { id: 'rectangle', name: '長方形', sides: 4 },
  { id: 'circle', name: '圓形', sides: 0 },
];

/** 立體形體的名稱與能不能滾動 */
const SOLID: { id: ShapeId; name: string; rolls: boolean }[] = [
  { id: 'sphere', name: '球', rolls: true },
  { id: 'cylinder', name: '圓柱', rolls: true },
  { id: 'cube', name: '正方體', rolls: false },
  { id: 'cuboid', name: '長方體', rolls: false },
  { id: 'cone', name: '圓錐', rolls: true },
];

/** 生活中的物品像哪一種平面圖形 */
const PLANE_OBJECTS = [
  { emoji: '🍙', name: '飯糰', shape: 'triangle' },
  { emoji: '⚠️', name: '警告標誌', shape: 'triangle' },
  { emoji: '🍪', name: '餅乾', shape: 'circle' },
  { emoji: '💿', name: '光碟', shape: 'circle' },
  { emoji: '🚪', name: '門', shape: 'rectangle' },
  { emoji: '📱', name: '手機', shape: 'rectangle' },
  { emoji: '🖼️', name: '相框', shape: 'square' },
  { emoji: '🧇', name: '鬆餅', shape: 'square' },
] as const;

/** 生活中的物品像哪一種立體形體 */
const SOLID_OBJECTS = [
  { emoji: '⚽', name: '足球', shape: 'sphere' },
  { emoji: '🏀', name: '籃球', shape: 'sphere' },
  { emoji: '🥫', name: '罐頭', shape: 'cylinder' },
  { emoji: '🥁', name: '鼓', shape: 'cylinder' },
  { emoji: '🎲', name: '骰子', shape: 'cube' },
  { emoji: '🧊', name: '冰塊', shape: 'cube' },
  { emoji: '📦', name: '紙箱', shape: 'cuboid' },
  { emoji: '🍦', name: '甜筒', shape: 'cone' },
] as const;

const nameOf = (id: ShapeId): string => [...PLANE, ...SOLID].find((s) => s.id === id)!.name;

/** 圖形：難度 1 平面圖形名稱、難度 2 邊與角、難度 3 立體形體 */
export const genShapes: QuestionGenerator = (opts) =>
  generateUnique('math.shapes', opts, (rng, level) => {
    const planeBase = { subject: 'math', skill: 'math.shapes', indicators: ['S-2-2'], source: SRC, difficulty: level } as const;
    const solidBase = { ...planeBase, indicators: ['S-2-1'] } as const;
    /** 以名稱當選項的單選題 */
    const nameChoice = (pool: { id: ShapeId; name: string }[], correct: ShapeId) =>
      shuffleChoices(
        rng,
        { text: nameOf(correct) },
        rng.shuffle(pool.filter((s) => s.id !== correct)).map((s) => ({ text: s.name })),
      );
    /** 以圖形當選項的單選題 */
    const shapeChoice = (pool: { id: ShapeId }[], correct: ShapeId) =>
      shuffleChoices(
        rng,
        { shape: correct } as ChoiceOption,
        rng.shuffle(pool.filter((s) => s.id !== correct)).map((s) => ({ shape: s.id }) as ChoiceOption),
      );

    if (level === 1) {
      const kind = rng.pick(['name', 'find', 'object'] as const);
      if (kind === 'name') {
        const s = rng.pick(PLANE);
        return { ...planeBase, id: `math.shapes:name:${s.id}`, type: 'choice', prompt: '這是什麼形狀？', visual: { kind: 'shape', shape: s.id }, ...nameChoice(PLANE, s.id) };
      }
      if (kind === 'find') {
        const s = rng.pick(PLANE);
        return { ...planeBase, id: `math.shapes:find:${s.id}`, type: 'choice', prompt: `哪一個是${s.name}？`, ...shapeChoice(PLANE, s.id) };
      }
      const o = rng.pick(PLANE_OBJECTS);
      return { ...planeBase, id: `math.shapes:object:${o.name}`, type: 'choice', prompt: `${o.emoji} ${o.name}的形狀像什麼？`, ...nameChoice(PLANE, o.shape) };
    }
    if (level === 2) {
      const kind = rng.pick(['count', 'count', 'which', 'tf'] as const);
      if (kind === 'count') {
        const s = rng.pick(PLANE);
        const what = rng.pick(['邊', '角'] as const);
        return { ...planeBase, id: `math.shapes:count:${s.id}:${what}`, type: 'number', unit: '個', prompt: `${s.name}有幾個${what}？`, answer: s.sides, visual: { kind: 'shape', shape: s.id }, explain: s.sides === 0 ? '圓形是彎彎的，沒有直直的邊，也沒有角。' : `數一數：${s.name}有 ${s.sides} 個邊、${s.sides} 個角。` };
      }
      if (kind === 'which') {
        const ask = rng.pick([
          { q: '哪一個形狀有 3 個邊？', a: 'triangle' as ShapeId },
          { q: '哪一個形狀沒有角？', a: 'circle' as ShapeId },
        ]);
        return { ...planeBase, id: `math.shapes:which:${ask.a}`, type: 'choice', prompt: ask.q, ...shapeChoice(PLANE, ask.a) };
      }
      const tf = rng.pick([
        { q: '正方形的 4 個邊都一樣長。', ok: true },
        { q: '長方形相對的兩個邊一樣長。', ok: true },
        { q: '三角形有 4 個角。', ok: false },
        { q: '圓形有 1 個角。', ok: false },
        { q: '正方形和長方形都有 4 個角。', ok: true },
      ]);
      return { ...planeBase, id: `math.shapes:tf:${tf.q}`, type: 'choice', prompt: `對還是錯？${tf.q}`, options: [{ text: '對', emoji: '⭕' }, { text: '錯', emoji: '❌' }], answer: tf.ok ? 0 : 1 };
    }
    const kind = rng.pick(['name', 'object', 'roll', 'count', 'flat'] as const);
    if (kind === 'count') {
      // 非嚴格定義的面、邊、頂點（課綱 S-2-1 備註）
      const f = rng.pick([
        { s: 'cube' as ShapeId, what: '面', n: 6 },
        { s: 'cube' as ShapeId, what: '頂點', n: 8 },
        { s: 'cube' as ShapeId, what: '邊', n: 12 },
        { s: 'cuboid' as ShapeId, what: '面', n: 6 },
        { s: 'cuboid' as ShapeId, what: '頂點', n: 8 },
        { s: 'cuboid' as ShapeId, what: '邊', n: 12 },
      ]);
      return {
        ...solidBase,
        id: `math.shapes:solid-count:${f.s}:${f.what}`,
        type: 'number',
        unit: '個',
        prompt: `${nameOf(f.s)}有幾個${f.what}？`,
        answer: f.n,
        visual: { kind: 'shape', shape: f.s },
        explain: `${nameOf(f.s)}有 6 個面、12 個邊、8 個頂點。`,
      };
    }
    if (kind === 'flat') {
      // 哪一個物品沒有平平的面（只有球）
      const others = rng.shuffle(SOLID_OBJECTS.filter((o) => o.shape !== 'sphere')).slice(0, 2);
      const ball = rng.pick(SOLID_OBJECTS.filter((o) => o.shape === 'sphere'));
      const { options, answer } = shuffleChoices(
        rng,
        { text: ball.name, emoji: ball.emoji },
        others.map((o) => ({ text: o.name, emoji: o.emoji })),
      );
      return { ...solidBase, id: `math.shapes:flat:${ball.name}:${others.map((o) => o.name).join(',')}`, type: 'choice', prompt: '哪一個東西沒有平平的面？', options, answer, explain: '球的表面都是彎彎的，沒有平平的面。' };
    }
    if (kind === 'name') {
      const s = rng.pick(SOLID);
      return { ...solidBase, id: `math.shapes:solid:${s.id}`, type: 'choice', prompt: '這是什麼形體？', visual: { kind: 'shape', shape: s.id }, ...nameChoice(SOLID, s.id) };
    }
    if (kind === 'object') {
      const o = rng.pick(SOLID_OBJECTS);
      return { ...solidBase, id: `math.shapes:solid-object:${o.name}`, type: 'choice', prompt: `${o.emoji} ${o.name}的形狀像哪一種形體？`, ...nameChoice(SOLID, o.shape) };
    }
    // 可以滾動的形體：選一個會滾的當正解，其餘從不會滾的挑
    const roller = rng.pick(SOLID.filter((s) => s.rolls));
    const { options, answer } = shuffleChoices(
      rng,
      { shape: roller.id } as ChoiceOption,
      SOLID.filter((s) => !s.rolls).map((s) => ({ shape: s.id }) as ChoiceOption),
    );
    return { ...solidBase, id: `math.shapes:roll:${roller.id}`, type: 'choice', prompt: '哪一個形體放倒後可以滾動？', options, answer, explain: '有彎彎曲面的形體才會滾動。' };
  });

/** 統計圖表的類別 */
const CHART_SETS = [
  [
    { label: '蘋果', emoji: '🍎' },
    { label: '香蕉', emoji: '🍌' },
    { label: '葡萄', emoji: '🍇' },
    { label: '西瓜', emoji: '🍉' },
  ],
  [
    { label: '小狗', emoji: '🐶' },
    { label: '小貓', emoji: '🐱' },
    { label: '兔子', emoji: '🐰' },
    { label: '烏龜', emoji: '🐢' },
  ],
  [
    { label: '公車', emoji: '🚌' },
    { label: '腳踏車', emoji: '🚲' },
    { label: '汽車', emoji: '🚗' },
    { label: '捷運', emoji: '🚇' },
  ],
];

/** 統計圖表：哪一種最多／最少、相差幾個、一共幾個 */
export const genChart: QuestionGenerator = (opts) =>
  generateUnique('math.chart', opts, (rng, level) => {
    const set = rng.pick(CHART_SETS).slice(0, level === 1 ? 3 : 4);
    const counts = sample(
      rng,
      (r) => set.map(() => r.int(1, level === 1 ? 6 : 9)),
      // 最大、最小都要唯一，題目才不會有兩個答案
      (arr) => arr.filter((v) => v === Math.max(...arr)).length === 1 && arr.filter((v) => v === Math.min(...arr)).length === 1,
    );
    const rows = set.map((s, i) => ({ ...s, count: counts[i] }));
    const key = rows.map((r) => `${r.label}${r.count}`).join(',');
    const base = { subject: 'math', skill: 'math.chart', indicators: ['D-2-1'], source: SRC, visual: { kind: 'chart', rows }, difficulty: level } as const;
    const kind = rng.pick(level === 1 ? (['most', 'least', 'total'] as const) : (['most', 'diff', 'total', 'least'] as const));
    if (kind === 'most' || kind === 'least') {
      const target = kind === 'most' ? Math.max(...counts) : Math.min(...counts);
      const row = rows.find((r) => r.count === target)!;
      const { options, answer } = shuffleChoices(
        rng,
        { text: row.label, emoji: row.emoji },
        rows.filter((r) => r !== row).map((r) => ({ text: r.label, emoji: r.emoji })),
      );
      return { ...base, id: `math.chart:${kind}:${key}`, type: 'choice', prompt: `哪一種${kind === 'most' ? '最多' : '最少'}？`, options, answer };
    }
    if (kind === 'total') {
      const total = counts.reduce((s, v) => s + v, 0);
      return { ...base, id: `math.chart:total:${key}`, type: 'number', prompt: '全部一共有幾個？', answer: total, explain: `${counts.join(' + ')} = ${total}。` };
    }
    const [i, j] = sample(rng, (r): [number, number] => [r.int(0, rows.length - 1), r.int(0, rows.length - 1)], ([x, y]) => counts[x] > counts[y]);
    return { ...base, id: `math.chart:diff:${key}:${i}:${j}`, type: 'number', prompt: `${rows[i].label}比${rows[j].label}多幾個？`, answer: counts[i] - counts[j], explain: `${counts[i]} − ${counts[j]} = ${counts[i] - counts[j]}。` };
  });
