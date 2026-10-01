/**
 * 國語「注音拼讀、語詞、句子與閱讀」的出題器（純函式：相同種子、相同題材永遠產生相同的一組題目）。
 * 每個活動一個 make 函式；題目 id 由「活動 id ＋ 題型 ＋ 題材內容」組成，同一題永遠得到同一個 id。
 * 同一個概念會用不同題型、不同說法出題（例如量詞有「一（　）書」「一隻（　）」兩種問法）。
 */
import { createRng, hashString, type Rng } from '../../../core/rng';
import type { ChoiceOption, GenerateOptions, Question } from '../../../core/types';
import {
  ANTONYM_PAIRS,
  BOPOMOFO_ONLY,
  CHAR_CHOICE_ITEMS,
  CONNECTIVES,
  CONNECTIVE_ITEMS,
  LIGHT_TONE_SETS,
  MEASURE_ITEMS,
  ORDER_ITEMS,
  PUNCT_ITEMS,
  PUNCT_NAMES,
  QUOTE_ITEMS,
  READING_PASSAGES,
  REDUPLICATION_ITEMS,
  SYNONYM_ITEMS,
  TONE_NAMES,
  WRONG_CHAR_ITEMS,
  ZHUYIN_ENTRIES,
  baseOf,
  toneOf,
  type Lv,
  type ZhuyinEntry,
} from '../../../content/zh/language';
import { generateUnique, shuffleChoices } from '../../util';

export { BOPOMOFO_ONLY };

/** 活動 id（也是題目的 skill） */
export const ZH_LANG_IDS = {
  zhuyin: 'zh.zhuyin',
  tone: 'zh.tone',
  measure: 'zh.measure',
  antonym: 'zh.antonym',
  homophone: 'zh.homophone',
  cloze: 'zh.cloze',
  order: 'zh.order',
  punct: 'zh.punct',
  reading: 'zh.reading',
} as const;

/** 題目共同欄位 */
function base(skill: string, level: Lv, indicators: string[]) {
  return { subject: 'zh' as const, skill, indicators, difficulty: level, source: '依課綱自編' };
}

/** 選項簡寫 */
const opt = (text: string, speak?: string): ChoiceOption => ({ text, ...(speak ? { speak } : {}) });

/** 把題幹裡的（　）唸成「空格」 */
const speakBlank = (s: string): string => s.replace(/（　）/g, '空格');

/**
 * 依難度加權抽題材：難度相同權重 3、差 1 級權重 2、差 2 級權重 1，
 * 所有題材都有機會出現（讓題目池夠大），但優先出符合難度的。
 */
function pickByLevel<T extends { level: Lv }>(rng: Rng, items: readonly T[], level: Lv): T {
  const weights = items.map((it) => (Math.abs(it.level - level) === 0 ? 3 : Math.abs(it.level - level) === 1 ? 2 : 1));
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** 把一個答案與干擾字串組成單選題的選項（文字選項，朗讀文字由 speakOf 決定） */
function textChoice(rng: Rng, right: string, wrong: string[], speakOf?: (t: string) => string | undefined) {
  return shuffleChoices(
    rng,
    opt(right, speakOf?.(right)),
    wrong.map((w) => opt(w, speakOf?.(w))),
    4,
  );
}

// ───────────────────────── 1. 注音拼讀 ─────────────────────────

/** 注音拼讀各難度可用的拼音類型：1 只出二拼、2 加三拼、3 以三拼與結合韻為主 */
const ZHUYIN_POOL: Record<Lv, ZhuyinEntry[]> = {
  1: ZHUYIN_ENTRIES.filter((z) => z.kind === 'two'),
  2: ZHUYIN_ENTRIES.filter((z) => z.kind !== 'combo'),
  3: ZHUYIN_ENTRIES.filter((z) => z.kind !== 'two'),
};

/**
 * 找與 entry 讀音相近的干擾例字：同音節本體（只差聲調）優先，其次同聲符，再其次同拼音類型。
 * 干擾字的注音一定與 entry 不同，且彼此注音不同，所以選項只會有一個正解。
 */
function similarEntries(rng: Rng, entry: ZhuyinEntry, pool: readonly ZhuyinEntry[], need: number, onlyEmoji = false): ZhuyinEntry[] {
  const score = (z: ZhuyinEntry): number => (baseOf(z.zhuyin) === baseOf(entry.zhuyin) ? 3 : 0) + (baseOf(z.zhuyin)[0] === baseOf(entry.zhuyin)[0] ? 2 : 0) + (z.kind === entry.kind ? 1 : 0);
  const cands = rng.shuffle(pool.filter((z) => z.zhuyin !== entry.zhuyin && z.char !== entry.char && (!onlyEmoji || z.emoji)));
  cands.sort((a, b) => score(b) - score(a));
  const out: ZhuyinEntry[] = [];
  const seen = new Set([entry.zhuyin]);
  // 先從分數最高的前 8 個隨機挑，避免每次都是同樣的干擾字
  for (const z of rng.shuffle(cands.slice(0, 8)).concat(cands.slice(8))) {
    if (out.length >= need) break;
    if (seen.has(z.zhuyin)) continue;
    seen.add(z.zhuyin);
    out.push(z);
  }
  return out;
}

/**
 * 注音拼讀：看注音選國字、看注音選圖、看國字選注音。
 * 注音的聲音用例字代替朗讀（裝置語音唸不準單獨的注音）；看注音的題目不唸出答案。
 */
export function makeZhuyin(opts: GenerateOptions): Question[] {
  const level = opts.level;
  const pool = ZHUYIN_POOL[level];
  return generateUnique(ZH_LANG_IDS.zhuyin, opts, (rng) => {
    const entry = rng.pick(pool);
    const types = level === 1 ? ['z2c', 'z2c', 'z2pic'] : ['z2c', 'char2zh', 'z2pic', 'char2zh'];
    let type = rng.pick(types);
    if (type === 'z2pic' && !entry.emoji) type = 'z2c';
    const indicators = [entry.kind === 'combo' ? 'Aa-Ⅰ-4' : 'Aa-Ⅰ-3', '3-Ⅰ-2'];
    const common = base(ZH_LANG_IDS.zhuyin, level, indicators);
    const explain = `「${entry.zhuyin}」唸起來是「${entry.char}」。`;
    const visualZhuyin = { kind: 'bigtext' as const, text: entry.zhuyin };
    if (type === 'z2pic') {
      const wrong = similarEntries(rng, entry, ZHUYIN_ENTRIES, 3, true);
      const { options, answer } = shuffleChoices(
        rng,
        { emoji: entry.emoji, speak: entry.char },
        wrong.map((z) => ({ emoji: z.emoji, speak: z.char })),
        4,
      );
      const tp = rng.int(0, 1);
      const prompt = ['看注音，哪一張圖是這個字？', '這個注音唸起來，是下面哪一張圖？'][tp];
      return { ...common, id: `${ZH_LANG_IDS.zhuyin}:pic:${entry.char}:${tp}`, type: 'choice', prompt, speak: prompt, explain, visual: visualZhuyin, options, answer };
    }
    if (type === 'z2c') {
      const wrong = similarEntries(rng, entry, pool, 3);
      const { options, answer } = textChoice(rng, entry.char, wrong.map((z) => z.char), (t) => t);
      const tp = rng.int(0, 2);
      const prompt = ['看注音，選出對的字。', '這個注音是下面哪一個字？', '哪一個字的注音是這個？'][tp];
      return { ...common, id: `${ZH_LANG_IDS.zhuyin}:z2c:${entry.char}:${tp}`, type: 'choice', prompt, speak: prompt, explain, visual: visualZhuyin, options, answer };
    }
    // 看國字選注音：選項是注音，朗讀用各注音的例字
    const wrong = similarEntries(rng, entry, pool, 3);
    const exampleOf = new Map([entry, ...wrong].map((z) => [z.zhuyin, z.char]));
    const { options, answer } = textChoice(rng, entry.zhuyin, wrong.map((z) => z.zhuyin), (t) => exampleOf.get(t));
    const tp = rng.int(0, 1);
    const prompt = ['這個字的注音是哪一個？', '哪一個注音是這個字的唸法？'][tp];
    return {
      ...common,
      id: `${ZH_LANG_IDS.zhuyin}:c2z:${entry.char}:${tp}`,
      type: 'choice',
      prompt,
      speak: `這個字是「${entry.char}」。${prompt}`,
      explain,
      visual: { kind: 'bigtext' as const, text: entry.char, lang: 'zh-TW' as const },
      options,
      answer,
    };
  });
}

// ───────────────────────── 2. 聲調 ─────────────────────────

/** 聲調家族：同一個音節本體、至少三種不同聲調（一～四聲）的例字 */
const TONE_FAMILIES: ZhuyinEntry[][] = (() => {
  const groups = new Map<string, ZhuyinEntry[]>();
  for (const z of ZHUYIN_ENTRIES) {
    if (toneOf(z.zhuyin) === 5) continue;
    const key = baseOf(z.zhuyin);
    groups.set(key, [...(groups.get(key) ?? []), z]);
  }
  return [...groups.values()].filter((g) => new Set(g.map((z) => toneOf(z.zhuyin))).size >= 3);
})();

/** 聲調符號的說明（解說用） */
const TONE_HINT: Record<number, string> = {
  1: '沒有聲調符號，是一聲',
  2: '符號是 ˊ，是二聲',
  3: '符號是 ˇ，是三聲',
  4: '符號是 ˋ，是四聲',
  5: '符號是 ˙（在注音前面），是輕聲',
};

/**
 * 聲調：這個注音是第幾聲、哪一個是第幾聲、哪一個是輕聲。
 * 難度 1 只出「第幾聲」，2 加「哪一個是第幾聲」，3 以「哪一個」與輕聲為主。
 */
export function makeTone(opts: GenerateOptions): Question[] {
  const level = opts.level;
  const withTone = ZHUYIN_ENTRIES.filter((z) => toneOf(z.zhuyin) !== 5);
  return generateUnique(ZH_LANG_IDS.tone, opts, (rng) => {
    const types = level === 1 ? ['num'] : level === 2 ? ['num', 'pick', 'pick'] : ['pick', 'pick', 'pick', 'pick', 'pick', 'pick', 'light', 'lightWord'];
    const type = rng.pick(types);
    const common = base(ZH_LANG_IDS.tone, level, ['Aa-Ⅰ-2', '3-Ⅰ-1']);
    if (type === 'num') {
      const z = rng.pick(withTone);
      const tone = toneOf(z.zhuyin);
      const t = rng.int(0, 2);
      const prompt = [`「${z.zhuyin}」是第幾聲？`, `這個注音的聲調是第幾聲？`, `「${z.zhuyin}」唸第幾聲？`][t];
      return {
        ...common,
        id: `${ZH_LANG_IDS.tone}:num:${z.char}:${t}`,
        type: 'choice',
        prompt,
        speak: `「${z.char}」這個字是第幾聲？`,
        explain: `「${z.zhuyin}」${TONE_HINT[tone]}。`,
        visual: { kind: 'bigtext', text: z.zhuyin },
        options: [1, 2, 3, 4].map((n) => opt(TONE_NAMES[n])),
        answer: tone - 1,
      };
    }
    if (type === 'pick') {
      const fam = rng.pick(TONE_FAMILIES);
      const target = rng.pick(fam.filter((z) => toneOf(z.zhuyin) !== 5));
      const tone = toneOf(target.zhuyin);
      // 干擾：同家族其他聲調；不足三個時，用別的音節補（聲調要和題目問的不同）
      const others = fam.filter((z) => toneOf(z.zhuyin) !== tone);
      const fillers = rng.shuffle(withTone.filter((z) => toneOf(z.zhuyin) !== tone && !fam.includes(z)));
      const wrong = [...rng.shuffle(others), ...fillers].filter((z, i, arr) => arr.findIndex((y) => toneOf(y.zhuyin) === toneOf(z.zhuyin) && baseOf(y.zhuyin) === baseOf(z.zhuyin)) === i).slice(0, 3);
      const exampleOf = new Map([target, ...wrong].map((z) => [z.zhuyin, z.char]));
      const { options, answer } = textChoice(rng, target.zhuyin, wrong.map((z) => z.zhuyin), (t) => exampleOf.get(t));
      const tp = rng.int(0, 1);
      const prompt = [`哪一個是${TONE_NAMES[tone]}？`, `下面哪一個注音唸${TONE_NAMES[tone]}？`][tp];
      return { ...common, id: `${ZH_LANG_IDS.tone}:pick:${target.char}:${tp}`, type: 'choice', prompt, speak: prompt, explain: `「${target.zhuyin}」${TONE_HINT[tone]}。`, options, answer };
    }
    // 輕聲：輕聲的小圓點寫在注音前面
    const set = rng.pick(LIGHT_TONE_SETS);
    const light = set.light;
    const exampleOf = new Map<string, string>([[light.zhuyin, light.speak], ...set.others.map((o): [string, string] => [o.zhuyin, o.char])]);
    const { options, answer } = textChoice(rng, light.zhuyin, set.others.map((o) => o.zhuyin), (t) => exampleOf.get(t));
    const explain = `輕聲要在注音前面點一個小圓點，所以「${light.phrase}」的「${light.char}」是「${light.zhuyin}」。`;
    if (type === 'light') {
      const prompt = '哪一個是輕聲？（輕聲的小圓點寫在注音的前面）';
      return { ...common, id: `${ZH_LANG_IDS.tone}:light:${light.char}`, type: 'choice', prompt, speak: '哪一個是輕聲？輕聲的小圓點，寫在注音的前面。', explain, options, answer };
    }
    const prompt = `「${light.phrase}」的「${light.char}」要唸輕聲，注音怎麼寫？`;
    return { ...common, id: `${ZH_LANG_IDS.tone}:lightword:${light.char}`, type: 'choice', prompt, speak: `${light.phrase}。這裡的「${light.char}」要唸輕聲，注音怎麼寫？`, explain, options, answer };
  });
}

// ───────────────────────── 3. 量詞 ─────────────────────────

/** 量詞：一（　）書 → 本；也有「一隻（　）」接哪個名詞的反向問法 */
export function makeMeasure(opts: GenerateOptions): Question[] {
  return generateUnique(ZH_LANG_IDS.measure, opts, (rng, level) => {
    const item = pickByLevel(rng, MEASURE_ITEMS, level);
    const common = base(ZH_LANG_IDS.measure, level, ['Ab-Ⅰ-6', 'Ac-Ⅰ-2']);
    const visual = item.emoji ? ({ kind: 'emoji', emoji: item.emoji, count: 1 } as const) : undefined;
    // 反向：一＋量詞後面，接哪一個名詞？干擾名詞的「不適合量詞」清單都含這個量詞，保證說不通；
    // 只有一個量詞的名詞太少（干擾名詞不足 3 個）時，這個量詞不出反向題
    const wrongNouns = rng.shuffle(MEASURE_ITEMS.filter((m) => m.wrong.includes(item.right))).map((m) => m.noun);
    const kind = rng.pick(['fill', 'fill', 'sent', 'rev']);
    if (kind === 'rev' && wrongNouns.length >= 3) {
      const { options, answer } = textChoice(rng, item.noun, wrongNouns, (t) => t);
      const prompt = `一${item.right}（　），空格要填哪一個詞？`;
      return { ...common, id: `${ZH_LANG_IDS.measure}:rev:${item.noun}`, type: 'choice', prompt, speak: `一${item.right}，空格。空格要填哪一個詞？`, explain: `一${item.right}${item.noun}。`, options, answer };
    }
    const { options, answer } = textChoice(rng, item.right, item.wrong, (t) => t);
    const t = kind === 'sent' ? 1 : rng.pick([0, 2, 3]);
    const prompt = [`一（　）${item.noun}，要用哪一個量詞？`, `「我看到一（　）${item.noun}。」哪一個量詞最適合？`, `數一數，一（　）${item.noun}，空格要填哪一個字？`, `「${item.noun}」前面要加哪一個量詞？`][t];
    return {
      ...common,
      id: `${ZH_LANG_IDS.measure}:fill:${item.noun}:${t}`,
      type: 'choice',
      prompt,
      speak: speakBlank(prompt).replace('一空格', '一，空格，'),
      explain: `一${item.right}${item.noun}。`,
      ...(visual ? { visual } : {}),
      options,
      answer,
    };
  });
}

// ───────────────────────── 4. 相反詞 ─────────────────────────

/** 所有相反詞的詞（干擾項的來源） */
const ANTONYM_WORDS = ANTONYM_PAIRS.flatMap((p) => [p.a, p.b]);

/** 相反詞：兩個方向、四種問法；干擾詞優先選字數相同的 */
export function makeAntonym(opts: GenerateOptions): Question[] {
  return generateUnique(ZH_LANG_IDS.antonym, opts, (rng, level) => {
    const pair = pickByLevel(rng, ANTONYM_PAIRS, level);
    const [w, opp] = rng.chance(0.5) ? [pair.a, pair.b] : [pair.b, pair.a];
    const others = ANTONYM_WORDS.filter((x) => x !== w && x !== opp);
    const sameLen = rng.shuffle(others.filter((x) => x.length === opp.length));
    const wrong = [...sameLen, ...rng.shuffle(others.filter((x) => x.length !== opp.length))].slice(0, 3);
    const { options, answer } = textChoice(rng, opp, wrong);
    const t = rng.int(0, 3);
    const prompt = [`「${w}」的相反詞是哪一個？`, `哪一個詞和「${w}」的意思相反？`, `和「${w}」是一組相反詞的是哪一個？`, `「${w}」和（　）是相反詞，空格要填哪一個？`][t];
    return {
      ...base(ZH_LANG_IDS.antonym, level, ['Ab-Ⅰ-5', 'Ab-Ⅰ-6']),
      id: `${ZH_LANG_IDS.antonym}:${w}>${opp}:${t}`,
      type: 'choice',
      prompt,
      speak: speakBlank(prompt),
      explain: `「${w}」和「${opp}」是一組相反詞。`,
      options,
      answer,
    };
  });
}

// ───────────────────────── 5. 同音字與形近字 ─────────────────────────

/** 同音字與形近字：選字填進句子，或找出句子裡的錯字 */
export function makeHomophone(opts: GenerateOptions): Question[] {
  return generateUnique(ZH_LANG_IDS.homophone, opts, (rng, level) => {
    if (rng.chance(0.65)) {
      const item = pickByLevel(rng, CHAR_CHOICE_ITEMS, level);
      const { options, answer } = textChoice(rng, item.right, item.wrong, (t) => t);
      const t = rng.int(0, 2);
      const prompt = [`空格要填哪一個字？「${item.sentence}」`, `「${item.sentence}」哪一個字放進去，句子才正確？`, `下面哪一個字可以填進空格？「${item.sentence}」`][t];
      return {
        ...base(ZH_LANG_IDS.homophone, level, ['Ab-Ⅰ-1', '4-Ⅰ-1']),
        id: `${ZH_LANG_IDS.homophone}:fill:${item.sentence}:${t}`,
        type: 'choice',
        prompt,
        speak: speakBlank(prompt),
        explain: `${item.explain}正確的句子是「${item.sentence.replace('（　）', item.right)}」`,
        options,
        answer,
      };
    }
    const item = pickByLevel(rng, WRONG_CHAR_ITEMS, level);
    // 其他選項取自句子裡的正確用字（不含錯字與標點）
    const chars = [...new Set([...item.sentence].filter((c) => /[一-鿿]/.test(c) && c !== item.wrong))];
    const { options, answer } = textChoice(rng, item.wrong, rng.shuffle(chars), (t) => t);
    const t = rng.int(0, 2);
    const prompt = [`「${item.sentence}」這句話有一個錯字，是哪一個字？`, `找一找錯字：「${item.sentence}」`, `「${item.sentence}」哪一個字寫錯了？`][t];
    return {
      ...base(ZH_LANG_IDS.homophone, level, ['Ab-Ⅰ-1', '6-Ⅰ-5']),
      id: `${ZH_LANG_IDS.homophone}:wrong:${item.sentence}:${t}`,
      type: 'choice',
      prompt,
      speak: `下面這句話有一個錯字，請找出來。${item.sentence}`,
      explain: `「${item.wrong}」要改成「${item.right}」，正確的句子是「${item.sentence.replace(item.wrong, item.right)}」`,
      options,
      answer,
    };
  });
}

// ───────────────────────── 6. 選詞填空 ─────────────────────────

/** 選詞填空：近義詞、疊詞、關聯詞 */
export function makeCloze(opts: GenerateOptions): Question[] {
  return generateUnique(ZH_LANG_IDS.cloze, opts, (rng, level) => {
    const kind = rng.pick(['syn', 'syn', 'redup', 'conn']);
    if (kind === 'syn') {
      const item = pickByLevel(rng, SYNONYM_ITEMS, level);
      const [x, y] = rng.chance(0.5) ? [item.a, item.b] : [item.b, item.a];
      const { options, answer } = textChoice(rng, y, item.wrong, (t) => t);
      const t = rng.int(0, 1);
      const prompt = [`「${x}」和哪一個詞的意思最接近？`, `哪一個詞和「${x}」的意思差不多？`][t];
      return {
        ...base(ZH_LANG_IDS.cloze, level, ['Ab-Ⅰ-5', 'Ab-Ⅰ-6']),
        id: `${ZH_LANG_IDS.cloze}:syn:${x}>${y}:${t}`,
        type: 'choice',
        prompt,
        explain: `「${x}」和「${y}」的意思很接近。`,
        options,
        answer,
      };
    }
    if (kind === 'redup') {
      const item = pickByLevel(rng, REDUPLICATION_ITEMS, level);
      const { options, answer } = textChoice(rng, item.right, item.wrong, (t) => t);
      const t = rng.int(0, 1);
      const prompt = [`哪一個詞放進空格最通順？「${item.sentence}」`, `選出適合的疊詞：「${item.sentence}」`][t];
      return {
        ...base(ZH_LANG_IDS.cloze, level, ['Ab-Ⅰ-6', 'Ac-Ⅰ-3']),
        id: `${ZH_LANG_IDS.cloze}:redup:${item.sentence}:${t}`,
        type: 'choice',
        prompt,
        speak: speakBlank(prompt),
        explain: `正確的句子是「${item.sentence.replace('（　）', item.right)}」`,
        options,
        answer,
      };
    }
    const item = pickByLevel(rng, CONNECTIVE_ITEMS, level);
    const pairSpeak = (t: string): string => t.replace('…', '，');
    const wrongPairs = rng.shuffle(CONNECTIVES.filter((_, i) => i !== item.right && !item.exclude?.includes(i)));
    const { options, answer } = textChoice(rng, CONNECTIVES[item.right], wrongPairs, pairSpeak);
    const t = rng.int(0, 1);
    const prompt = [`選出適合的關聯詞：「${item.sentence}」`, `哪一組關聯詞可以放進兩個空格？「${item.sentence}」`][t];
    return {
      ...base(ZH_LANG_IDS.cloze, level, ['Ac-Ⅰ-2', 'Ac-Ⅰ-3']),
      id: `${ZH_LANG_IDS.cloze}:conn:${item.sentence}:${t}`,
      type: 'choice',
      prompt,
      speak: speakBlank(prompt),
      explain: `「${CONNECTIVES[item.right]}」是一組好朋友，要一起用。`,
      options,
      answer,
    };
  });
}

// ───────────────────────── 7. 句子排序 ─────────────────────────

/** 句子排序：把詞卡排成通順的句子（詞卡打散後一定不等於正解） */
export function makeSentenceOrder(opts: GenerateOptions): Question[] {
  return generateUnique(ZH_LANG_IDS.order, opts, (rng, level) => {
    const item = pickByLevel(rng, ORDER_ITEMS, level);
    let tokens = rng.shuffle(item.steps);
    for (let i = 0; i < 20 && tokens.every((t, k) => t === item.steps[k]); i++) tokens = rng.shuffle(item.steps);
    const tp = rng.int(0, 1);
    const prompt = ['把詞卡排成一句通順的話。', '照順序排排看，讓句子讀起來通順。'][tp];
    return {
      ...base(ZH_LANG_IDS.order, level, ['Ac-Ⅰ-2', '6-Ⅰ-3']),
      id: `${ZH_LANG_IDS.order}:${item.id}:${tp}`,
      type: 'order',
      prompt,
      speak: prompt,
      explain: `正確的句子是「${item.steps.join('')}」。`,
      tokens,
      answer: [...item.steps],
    };
  });
}

// ───────────────────────── 8. 標點符號 ─────────────────────────

/** 各標點的使用說明（解說用） */
const PUNCT_HINT: Record<string, string> = {
  '。': '一句話說完了，句尾用句號。',
  '？': '在問問題，句尾用問號。',
  '，': '話還沒說完，中間停一下，用逗號。',
  '、': '一個一個列出來的詞語中間，用頓號。',
  '！': '表示驚訝、高興或大聲喊，用驚嘆號。',
};

/** 標點符號：句子空格選標點，或選出標點用對的句子（含引號） */
export function makePunct(opts: GenerateOptions): Question[] {
  return generateUnique(ZH_LANG_IDS.punct, opts, (rng, level) => {
    const common = base(ZH_LANG_IDS.punct, level, ['Ac-Ⅰ-1', '5-Ⅰ-2', '6-Ⅰ-1']);
    if (rng.chance(level === 3 ? 0.3 : 0.1)) {
      const idx = rng.int(0, QUOTE_ITEMS.length - 1);
      const item = QUOTE_ITEMS[idx];
      const { options, answer } = textChoice(rng, item.right, item.wrong);
      const tq = rng.int(0, 1);
      const prompt = ['哪一句話的標點符號用對了？', '下面哪一句話，引號和標點符號都用得對？'][tq];
      return { ...common, id: `${ZH_LANG_IDS.punct}:q:${idx + 1}:${tq}`, type: 'choice', prompt, speak: prompt, explain: item.explain, options, answer };
    }
    const item = pickByLevel(rng, PUNCT_ITEMS, level);
    const label = (s: string): string => `${s}${PUNCT_NAMES[s]}`;
    const { options, answer } = shuffleChoices(
      rng,
      opt(label(item.right), PUNCT_NAMES[item.right]),
      item.options.filter((s) => s !== item.right).map((s) => opt(label(s), PUNCT_NAMES[s])),
      4,
    );
    const t = rng.int(0, 2);
    const prompt = [`空格要放哪一個標點符號？「${item.sentence}」`, `這句話的空格，應該用哪一個標點符號？「${item.sentence}」`, `「${item.sentence}」空格裡放哪一個標點符號才對？`][t];
    return {
      ...common,
      id: `${ZH_LANG_IDS.punct}:a:${item.sentence}:${t}`,
      type: 'choice',
      prompt,
      speak: speakBlank(prompt),
      explain: PUNCT_HINT[item.right],
      options,
      answer,
    };
  });
}

// ───────────────────────── 9. 閱讀小短文 ─────────────────────────

/** 各題型對應的課綱代碼（童詩的非因果題改掛「故事、童詩」） */
function readingIndicators(type: 'fact' | 'cause' | 'main' | 'mood', genre: string): string[] {
  if (type === 'cause') return ['5-Ⅰ-3', '5-Ⅰ-7'];
  if (genre === 'poem') return ['5-Ⅰ-3', 'Ad-Ⅰ-3'];
  if (type === 'main') return ['5-Ⅰ-3', 'Ad-Ⅰ-2'];
  if (type === 'mood') return ['5-Ⅰ-4', 'Bb-Ⅰ-1'];
  return ['5-Ⅰ-3', '5-Ⅰ-4'];
}

/**
 * 閱讀小短文：同一篇短文的題目連在一起出。每回合 10 題＝4 篇短文（3、3、2、2 題），
 * 每篇從 3～5 題的題庫中隨機取題。短文依難度優先挑選，但每一篇都有機會被挑到。
 */
export function makeReading(opts: GenerateOptions): Question[] {
  const rng = createRng((opts.seed ^ hashString(ZH_LANG_IDS.reading)) >>> 0);
  // 先洗牌再用穩定排序，同難度距離的短文順序由種子決定；用「距離 + 隨機抖動」讓其他難度的短文也常入選（短文只有十幾篇，太偏重難度會一直重複同幾篇）
  const order = rng
    .shuffle(READING_PASSAGES)
    .map((p) => ({ p, key: Math.abs(p.level - opts.level) * 0.1 + rng.next() * 1.4 }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.p);
  const out: Question[] = [];
  // 題數平均分給 ceil(count/3) 篇短文（10 題 → 3、3、2、2），每篇從題庫（3～5 題）隨機取，維持短文裡原本的順序
  const n = Math.ceil(opts.count / 3);
  order.slice(0, n).forEach((p, i) => {
    const quota = Math.floor(opts.count / n) + (i < opts.count % n ? 1 : 0);
    const picked = rng.shuffle(p.questions.map((_, k) => k)).slice(0, quota).sort((a, b) => a - b);
    for (const k of picked) {
      const rq = p.questions[k];
      const { options, answer } = textChoice(rng, rq.right, rq.wrong);
      out.push({
        ...base(ZH_LANG_IDS.reading, opts.level, readingIndicators(rq.type, p.genre)),
        id: `${ZH_LANG_IDS.reading}:${p.id}:${k + 1}`,
        type: 'choice',
        prompt: rq.prompt,
        explain: rq.explain,
        visual: { kind: 'passage', title: p.title, text: p.text },
        options,
        answer,
      });
    }
  });
  return out;
}
