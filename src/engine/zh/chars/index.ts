/**
 * 國語「生字與筆順」的出題器（純函式：相同種子、相同字集永遠產生相同的一組題目）。
 * 題型：生字描寫、注音符號描寫、認字讀音（看字選注音／看注音選字）、部首、筆畫數、造詞。
 * 題目 id 只由「技能＋題型＋題目內容（字、語詞）」組成，同一題永遠得到同一個 id；
 * 同一個概念有多種說法與題型，字集大時題目池遠大於連玩三回合的量。
 * 模組載入時會註冊「課本單元出題器」（registerCharUnitGenerator），課本單元活動才出得了題。
 */
import { createRng, type Rng } from '../../../core/rng';
import type { ChoiceOption, GenerateOptions, Question } from '../../../core/types';
import {
  ALL_CHARS,
  ALL_WORDS,
  CHAR_BY,
  COMMON_RADICALS,
  EXAMPLE_BY_READING,
  WORDS_BY_CHAR,
  WORD_SET,
  ZHUYIN_SYMBOLS,
  type CharInfo,
} from '../../../content/zh/chars';
import { baseOf } from '../../../content/zh/language';
import { generateUnique, shuffleChoices, type Level } from '../../util';
import { registerCharUnitGenerator, type CharUnitInput } from '../charsBridge';

/** 活動 id（也是題目的 skill） */
export const ZH_CHARS_IDS = {
  write: 'zh.chars-write',
  zhuyinWrite: 'zh.zhuyin-write',
  read: 'zh.chars-read',
  radical: 'zh.chars-radical',
  strokes: 'zh.chars-strokes',
  words: 'zh.chars-words',
} as const;

/** 各技能對應的課綱代碼（條文見 src/content/zh/codes-chars.ts） */
const INDICATORS = {
  write: ['4-Ⅰ-5', 'Ab-Ⅰ-3'],
  zhuyinWrite: ['3-Ⅰ-1', 'Aa-Ⅰ-1'],
  read: ['4-Ⅰ-1', 'Ab-Ⅰ-1', '3-Ⅰ-2'],
  radical: ['4-Ⅰ-2', 'Ab-Ⅰ-4'],
  strokes: ['4-Ⅰ-5', 'Ab-Ⅰ-3'],
  words: ['Ab-Ⅰ-2', 'Ab-Ⅰ-6'],
} as const;

/** 題目依據說明 */
const SOURCE = '依課綱自編；字集取自三版本二年級生字';
const SOURCE_WRITE = '依課綱自編；國字筆順為台灣教育部標準（animCJK 繁中，依 CNS11643 驗證）';

/** 出題範圍：字與語詞。unit=true 表示課本單元（造詞題只用本課語詞）。 */
export interface Scope {
  chars: readonly string[];
  words: readonly string[];
  unit: boolean;
}

/** 單題建構器：依範圍做出一題，條件不足時回傳 null */
type Builder = (rng: Rng, level: Level, s: Scope) => Question | null;

/** 全字集範圍 */
const GLOBAL_SCOPE: Scope = { chars: ALL_CHARS, words: ALL_WORDS, unit: false };

/** 題目共同欄位 */
function base(skill: string, level: Level, indicators: readonly string[], source = SOURCE) {
  return { subject: 'zh' as const, skill, indicators: [...indicators], difficulty: level, source };
}

/** 選項簡寫 */
const opt = (text: string, speak?: string): ChoiceOption => ({ text, ...(speak ? { speak } : {}) });

/** 取字資訊（字集內的字一定有） */
const info = (c: string): CharInfo => CHAR_BY.get(c)!;

/** 去重 */
const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/** 字在語詞中只出現一次 */
const onceIn = (w: string, c: string): boolean => w.split(c).length === 2;

/** 範圍內含有某字的語詞（單元範圍只看本課語詞） */
function wordsIn(s: Scope, c: string): string[] {
  return s.words.filter((w) => w.includes(c));
}

/** 給描寫、讀音題當提示的語詞：先用範圍內的，沒有再用三版本全部語詞 */
function hintWords(s: Scope, c: string): readonly string[] {
  const own = wordsIn(s, c);
  return own.length ? own : (WORDS_BY_CHAR.get(c) ?? []);
}

/**
 * 找與目標字相像的干擾字：不與目標字有任何相同讀音（避免干擾字其實也對）。
 * 難度 1 隨機；難度 2、3 優先同部首、筆畫相近，同一課的字加分。
 */
function similarChars(rng: Rng, target: CharInfo, s: Scope, need: number, level: Level, bannedReadings: readonly string[]): string[] {
  const own = new Set(s.chars);
  const cands = ALL_CHARS.filter((ch) => ch !== target.char && !info(ch).readings.some((r) => bannedReadings.includes(r)));
  const shuffled = rng.shuffle(cands);
  if (level === 1) {
    // 難度 1：同一課的字優先（孩子剛學過，比較好認），其餘隨機
    return [...shuffled.filter((c) => own.has(c)), ...shuffled.filter((c) => !own.has(c))].slice(0, need);
  }
  const score = (ch: string): number => {
    const i = info(ch);
    return (i.radical === target.radical ? 3 : 0) + (Math.abs(i.strokeCount - target.strokeCount) <= 1 ? 1 : 0) + (own.has(ch) ? 1 : 0);
  };
  const ranked = [...shuffled].sort((a, b) => score(b) - score(a));
  const top = ranked.slice(0, level === 2 ? Math.max(need * 4, 12) : need * 3);
  return rng.shuffle(top).slice(0, need);
}

// ───────────────────────── 1. 生字描寫 ─────────────────────────

/**
 * 生字描寫：難度 1 有淡字形可描、難度 2 字形更淡（寫字板處理）、難度 3 默寫（題幹不出現這個字）。
 * 只用有台灣教育部筆順檔（writable）的字。
 */
const buildWrite: Builder = (rng, level, s) => {
  const cands = s.chars.filter((c) => CHAR_BY.get(c)?.writable);
  if (!cands.length) return null;
  const c = rng.pick(cands);
  const i = info(c);
  const ws = hintWords(s, c);
  const explain = `「${c}」共 ${i.strokeCount} 畫，部首是「${i.radical}」，讀作 ${i.reading}。`;
  const common = { ...base(ZH_CHARS_IDS.write, level, INDICATORS.write, SOURCE_WRITE), type: 'write' as const, target: c, script: 'hanzi' as const, explain };
  if (level === 3) {
    // 默寫：題幹不放這個字，改用語詞挖空或注音＋筆畫數當線索
    const once = ws.filter((x) => onceIn(x, c));
    if (once.length && rng.chance(0.6)) {
      const w = rng.pick(once);
      return { ...common, id: `${ZH_CHARS_IDS.write}:${c}:L3:${w}`, prompt: `默寫：${w.replace(c, '（　）')}，括號裡的字讀作 ${i.reading}。`, speak: '默寫括號裡的國字。' };
    }
    const hint = i.radical !== c ? `，部首是「${i.radical}」` : '';
    return { ...common, id: `${ZH_CHARS_IDS.write}:${c}:L3`, prompt: `默寫一個字：讀作 ${i.reading}${hint}，共 ${i.strokeCount} 畫。`, speak: '默寫這個國字。' };
  }
  const v = ws.length ? rng.int(0, 2) : rng.int(0, 1);
  if (v === 2) {
    const w = rng.pick(ws);
    return { ...common, id: `${ZH_CHARS_IDS.write}:${c}:L${level}:${w}`, prompt: `「${w}」的「${c}」，照著筆順寫一寫。`, speak: `${w}的${c}，照著筆順寫一寫。` };
  }
  if (v === 1) return { ...common, id: `${ZH_CHARS_IDS.write}:${c}:L${level}:r`, prompt: `「${c}」（${i.reading}），照著筆順描一描。`, speak: `${c}，照著筆順描一描。` };
  return { ...common, id: `${ZH_CHARS_IDS.write}:${c}:L${level}`, prompt: `照著筆順，描寫「${c}」。`, speak: `照著筆順，描寫${c}。` };
};

// ───────────────────────── 2. 注音符號描寫 ─────────────────────────

/** 注音符號描寫（37 個符號）：用一個讀音含該符號的生字當例字 */
const buildZhuyinWrite: Builder = (rng, level) => {
  const sym = rng.pick(ZHUYIN_SYMBOLS);
  const common = { ...base(ZH_CHARS_IDS.zhuyinWrite, level, INDICATORS.zhuyinWrite), type: 'write' as const, target: sym, script: 'zhuyin' as const };
  const exs = ALL_CHARS.filter((c) => baseOf(info(c).reading).includes(sym));
  if (level === 3) {
    // 默寫：沒有淡字形可描；題幹可帶一個例字當線索
    if (exs.length && rng.chance(0.7)) {
      const ex = rng.pick(exs);
      return { ...common, id: `${ZH_CHARS_IDS.zhuyinWrite}:${sym}:L3:${ex}`, prompt: `「${ex}」讀作 ${info(ex).reading}，默寫其中的「${sym}」。`, speak: `${ex}，默寫這個字裡面的注音符號。` };
    }
    return { ...common, id: `${ZH_CHARS_IDS.zhuyinWrite}:${sym}:L3`, prompt: `默寫注音符號「${sym}」。`, speak: '默寫這個注音符號。' };
  }
  const v = exs.length ? rng.int(0, 2) : rng.int(0, 1);
  if (v === 2) {
    const ex = rng.pick(exs);
    return { ...common, id: `${ZH_CHARS_IDS.zhuyinWrite}:${sym}:L${level}:${ex}`, prompt: `「${ex}」讀作 ${info(ex).reading}，把裡面的「${sym}」描一描。`, speak: `${ex}，把這個字裡面的注音符號描一描。` };
  }
  if (v === 1) return { ...common, id: `${ZH_CHARS_IDS.zhuyinWrite}:${sym}:L${level}:s`, prompt: `描一描「${sym}」，一筆一畫慢慢寫。`, speak: '描一描這個注音符號，一筆一畫慢慢寫。' };
  return { ...common, id: `${ZH_CHARS_IDS.zhuyinWrite}:${sym}:L${level}`, prompt: `照著筆順，描寫注音符號「${sym}」。`, speak: '照著筆順，描寫這個注音符號。' };
};

// ───────────────────────── 3. 認字讀音 ─────────────────────────

/** 聲調符號（二、三、四聲）；一聲不標 */
const TONE_MARKS = ['', 'ˊ', 'ˇ', 'ˋ'] as const;

/** 字集內所有主讀音（不重複） */
const ALL_READINGS: readonly string[] = uniq(ALL_CHARS.map((ch) => info(ch).reading));

/**
 * 看字選注音的干擾讀音：絕不含該字的任何讀音。
 * 難度 1 隨機讀音；難度 2 一個同音節不同聲調＋隨機；難度 3 以同音節不同聲調與同聲符為主。
 */
function distractorReadings(rng: Rng, c: CharInfo, level: Level): string[] {
  const banned = new Set(c.readings);
  const mainBase = baseOf(c.reading);
  const allReadings = ALL_READINGS.filter((r) => !banned.has(r));
  const tones = TONE_MARKS.map((t) => mainBase + t).filter((r) => !banned.has(r));
  const initial = (r: string) => baseOf(r)[0];
  const sameInitial = allReadings.filter((r) => initial(r) === initial(c.reading) && baseOf(r) !== mainBase);
  const randoms = rng.shuffle(allReadings);
  if (level === 1) return randoms;
  if (level === 2) return [...rng.shuffle(tones).slice(0, 1), ...randoms];
  return [...rng.shuffle(tones), ...rng.shuffle(sameInitial), ...randoms];
}

/** 看字選注音：「山」的注音是哪一個？ */
const buildCharToZhuyin: Builder = (rng, level, s) => {
  if (!s.chars.length) return null;
  const c = info(rng.pick(s.chars));
  const ws = hintWords(s, c.char);
  // 多音字不放語詞（語詞裡的讀音可能不是主讀音）
  const v = c.readings.length === 1 && ws.length ? rng.int(0, 2) : rng.int(0, 1);
  const w = v === 2 ? rng.pick(ws) : '';
  const prompt = v === 2 ? `「${w}」的「${c.char}」，注音是哪一個？` : v === 1 ? `「${c.char}」要怎麼唸？選出正確的注音。` : `「${c.char}」的注音是哪一個？`;
  const speakOf = (r: string): string | undefined => EXAMPLE_BY_READING.get(r);
  const { options, answer } = shuffleChoices(rng, opt(c.reading, speakOf(c.reading)), distractorReadings(rng, c, level).map((r) => opt(r, speakOf(r))), 4);
  if (options.length < 3) return null;
  return {
    ...base(ZH_CHARS_IDS.read, level, INDICATORS.read),
    id: `${ZH_CHARS_IDS.read}:c2z:${c.char}${w ? ':' + w : ''}:v${v}`,
    type: 'choice',
    prompt,
    // 題幹不唸出這個字（唸出來就等於告訴孩子答案）
    speak: '這個字的注音是哪一個？',
    visual: { kind: 'bigtext', text: c.char },
    options,
    answer,
    explain: `「${c.char}」讀作 ${c.reading}。`,
  };
};

/** 看注音選字：哪一個字的注音是「ㄕㄢ」？（干擾字優先同課或字形相近） */
const buildZhuyinToChar: Builder = (rng, level, s) => {
  if (!s.chars.length) return null;
  const c = info(rng.pick(s.chars));
  const wrong = similarChars(rng, c, s, 6, level, c.readings);
  const { options, answer } = shuffleChoices(rng, opt(c.char), wrong.map((x) => opt(x)), 4);
  if (options.length < 3) return null;
  return {
    ...base(ZH_CHARS_IDS.read, level, INDICATORS.read),
    id: `${ZH_CHARS_IDS.read}:z2c:${c.char}`,
    type: 'choice',
    prompt: rng.chance(0.5) ? `哪一個字的注音是「${c.reading}」？` : `哪一個字唸作「${c.reading}」？`,
    speak: '哪一個字的讀音和上面的注音一樣？',
    visual: { kind: 'bigtext', text: c.reading },
    options,
    answer,
    explain: `「${c.char}」讀作 ${c.reading}。`,
  };
};

// ───────────────────────── 4. 部首 ─────────────────────────

/** 「河」的部首是什麼？干擾部首從常見部首與同課字的部首挑 */
const buildRadicalOf: Builder = (rng, level, s) => {
  if (!s.chars.length) return null;
  const c = info(rng.pick(s.chars));
  const near = level === 1 ? [] : s.chars.map((x) => info(x).radical);
  const pool = uniq([...rng.shuffle(near), ...rng.shuffle(COMMON_RADICALS)]).filter((r) => r !== c.radical && r !== c.radicalKangxi);
  const { options, answer } = shuffleChoices(rng, opt(c.radical), pool.map((r) => opt(r)), 4);
  if (options.length < 3) return null;
  return {
    ...base(ZH_CHARS_IDS.radical, level, INDICATORS.radical),
    id: `${ZH_CHARS_IDS.radical}:of:${c.char}`,
    type: 'choice',
    prompt: rng.chance(0.5) ? `「${c.char}」的部首是什麼？` : `找出「${c.char}」的部首。`,
    speak: `${c.char}的部首是什麼？`,
    visual: { kind: 'bigtext', text: c.char },
    options,
    answer,
    explain: `「${c.char}」的部首是「${c.radical}」。`,
  };
};

/** 哪兩個字的部首相同？（其中一個字取自本次範圍，另一個字從整個字集找） */
const buildRadicalSame: Builder = (rng, level, s) => {
  if (!s.chars.length) return null;
  const a = info(rng.pick(s.chars));
  const mates = ALL_CHARS.filter((x) => x !== a.char && info(x).radical === a.radical);
  if (!mates.length) return null;
  const b = info(rng.pick(mates));
  // 錯誤選項：兩個部首不同的字，而且部首都不是這一題的部首（避免選項本身也「部首相同」）
  const keys = new Set<string>();
  const wrong: ChoiceOption[] = [];
  const fromScope = s.chars.filter((x) => info(x).radical !== a.radical);
  for (let k = 0; k < 400 && wrong.length < 3; k++) {
    // 難度 2、3：其中一個字優先取自本次範圍（孩子剛學的字）
    const x = info(level > 1 && fromScope.length && rng.chance(0.5) ? rng.pick(fromScope) : rng.pick(ALL_CHARS));
    const y = info(rng.pick(ALL_CHARS));
    if (x.char === y.char || x.radical === y.radical || x.radicalKangxi === y.radicalKangxi) continue;
    if ([x, y].some((z) => z.radical === a.radical || z.radicalKangxi === a.radicalKangxi)) continue;
    const key = [x.char, y.char].sort().join('');
    if (keys.has(key)) continue;
    keys.add(key);
    wrong.push(opt(`${x.char}、${y.char}`, `${x.char}和${y.char}`));
  }
  const pair = rng.shuffle([a.char, b.char]);
  const { options, answer } = shuffleChoices(rng, opt(`${pair[0]}、${pair[1]}`, `${pair[0]}和${pair[1]}`), wrong, 4);
  if (options.length < 3) return null;
  return {
    ...base(ZH_CHARS_IDS.radical, level, INDICATORS.radical),
    id: `${ZH_CHARS_IDS.radical}:same:${[a.char, b.char].sort().join('')}`,
    type: 'choice',
    prompt: '哪兩個字的部首相同？',
    options,
    answer,
    explain: `「${a.char}」和「${b.char}」的部首都是「${a.radical}」。`,
  };
};

/** 哪一個字的部首是「氵」？ */
const buildRadicalFind: Builder = (rng, level, s) => {
  if (!s.chars.length) return null;
  const c = info(rng.pick(s.chars));
  const wrong = rng.shuffle(ALL_CHARS.filter((x) => info(x).radical !== c.radical && info(x).radicalKangxi !== c.radicalKangxi));
  const near = level === 1 ? [] : wrong.filter((x) => Math.abs(info(x).strokeCount - c.strokeCount) <= 2);
  const { options, answer } = shuffleChoices(rng, opt(c.char), [...near, ...wrong].map((x) => opt(x)), 4);
  if (options.length < 3) return null;
  return {
    ...base(ZH_CHARS_IDS.radical, level, INDICATORS.radical),
    id: `${ZH_CHARS_IDS.radical}:find:${c.char}`,
    type: 'choice',
    prompt: `哪一個字的部首是「${c.radical}」？`,
    options,
    answer,
    explain: `「${c.char}」的部首是「${c.radical}」。`,
  };
};

// ───────────────────────── 5. 筆畫數 ─────────────────────────

/** 筆畫數題各難度可用的字：難度 1 ≤ 8 畫、難度 2 ≤ 12 畫、難度 3 不限 */
const STROKE_CAP: Record<Level, number> = { 1: 8, 2: 12, 3: 99 };

/** 「山」有幾畫？或比較兩個字哪一個筆畫多（只用有驗證筆順的字，筆畫數才可靠） */
const buildStrokes: Builder = (rng, level, s) => {
  const writable = s.chars.filter((c) => CHAR_BY.get(c)?.writable);
  if (!writable.length) return null;
  const capped = writable.filter((c) => info(c).strokeCount <= STROKE_CAP[level]);
  const c = info(rng.pick(capped.length ? capped : writable));
  const common = { ...base(ZH_CHARS_IDS.strokes, level, INDICATORS.strokes), visual: { kind: 'bigtext' as const, text: c.char } };
  const v = rng.int(0, 3);
  if (v === 3) {
    // 比較兩個字：另一個字的筆畫數差距在難度 1 至少 3 畫
    const gap = level === 1 ? 3 : level === 2 ? 2 : 1;
    const others = ALL_CHARS.filter((x) => info(x).writable && x !== c.char && Math.abs(info(x).strokeCount - c.strokeCount) >= gap && info(x).strokeCount <= Math.max(STROKE_CAP[level], c.strokeCount));
    if (!others.length) return null;
    const d = info(rng.pick(others));
    const more = c.strokeCount > d.strokeCount ? c : d;
    const pair = rng.shuffle([c.char, d.char]);
    const asked = rng.chance(0.5);
    const right = asked ? more : more === c ? d : c;
    return {
      ...base(ZH_CHARS_IDS.strokes, level, INDICATORS.strokes),
      id: `${ZH_CHARS_IDS.strokes}:cmp:${[c.char, d.char].sort().join('')}:${asked ? 'more' : 'less'}`,
      type: 'choice',
      prompt: `「${pair[0]}」和「${pair[1]}」，哪一個字的筆畫${asked ? '比較多' : '比較少'}？`,
      options: pair.map((x) => opt(x)),
      answer: pair.indexOf(right.char),
      explain: `「${c.char}」有 ${c.strokeCount} 畫，「${d.char}」有 ${d.strokeCount} 畫。`,
    };
  }
  const prompts = [`「${c.char}」有幾畫？`, `寫「${c.char}」要寫幾畫？`, `數一數，「${c.char}」一共有幾畫？`];
  return { ...common, id: `${ZH_CHARS_IDS.strokes}:n:${c.char}:v${v}`, type: 'number', prompt: prompts[v], speak: prompts[v].replace(/[「」]/g, ''), answer: c.strokeCount, unit: '畫', explain: `「${c.char}」一共 ${c.strokeCount} 畫。` };
};

// ───────────────────────── 6. 造詞 ─────────────────────────

/** 範圍內可以出造詞題的 (字, 語詞) 組合：語詞含範圍內的字 */
function wordPairs(s: Scope): { c: string; w: string }[] {
  const out: { c: string; w: string }[] = [];
  const own = new Set(s.chars);
  for (const w of s.words) {
    for (const c of uniq([...w])) if (own.has(c) && CHAR_BY.has(c)) out.push({ c, w });
  }
  return out;
}

/** 選出含有「山」字的語詞 */
const buildWordWith: Builder = (rng, level, s) => {
  const pairs = wordPairs(s);
  if (!pairs.length) return null;
  const { c, w } = rng.pick(pairs);
  // 干擾語詞：不含這個字；難度 2、3 優先同字數
  const wrong = rng.shuffle(ALL_WORDS.filter((x) => !x.includes(c) && x !== w));
  const sameLen = level === 1 ? [] : wrong.filter((x) => [...x].length === [...w].length);
  const { options, answer } = shuffleChoices(rng, opt(w, w), [...sameLen, ...wrong].map((x) => opt(x, x)), 4);
  if (options.length < 3) return null;
  return {
    ...base(ZH_CHARS_IDS.words, level, INDICATORS.words),
    id: `${ZH_CHARS_IDS.words}:with:${c}:${w}`,
    type: 'choice',
    prompt: rng.chance(0.5) ? `哪一個語詞裡有「${c}」字？` : `選出有「${c}」的語詞。`,
    options,
    answer,
    explain: `「${w}」裡有「${c}」。`,
  };
};

/** 語詞缺字選填：「（　）水」，括號裡要填哪一個字？ */
const buildWordBlank: Builder = (rng, level, s) => {
  const pairs = wordPairs(s).filter((p) => onceIn(p.w, p.c));
  if (!pairs.length) return null;
  const { c, w } = rng.pick(pairs);
  const target = info(c);
  const blank = w.replace(c, '（　）');
  // 干擾字：填進去後不是課本語詞，而且與目標字沒有相同讀音
  const cands = similarChars(rng, target, s, 24, level, target.readings).filter((x) => !WORD_SET.has(w.replace(c, x)));
  const { options, answer } = shuffleChoices(rng, opt(c), cands.map((x) => opt(x)), 4);
  if (options.length < 3) return null;
  return {
    ...base(ZH_CHARS_IDS.words, level, INDICATORS.words),
    id: `${ZH_CHARS_IDS.words}:blank:${w}:${c}`,
    type: 'choice',
    prompt: `「${blank}」，括號裡要填哪一個字？`,
    speak: `${w.replace(c, '空格')}，空格裡要填哪一個字？`,
    options,
    answer,
    explain: `「${w}」，括號裡是「${c}」。`,
  };
};

// ───────────────────────── 組裝 ─────────────────────────

/**
 * 以建構器清單產生一回合：每題隨機挑一個建構器，條件不足就換下一個。
 * 範圍內完全做不出題目時回傳空陣列（例如課裡沒有可描寫的字）。
 */
function run(skill: string, opts: GenerateOptions, s: Scope, builders: Builder[]): Question[] {
  // 先試做幾次，確認這個範圍真的出得了題，避免 generateUnique 在條件永遠不足時丟出錯誤
  const probe = createRng(opts.seed ^ 0x5eed);
  let ok = false;
  for (let k = 0; k < 20 && !ok; k++) ok = builders.some((b) => b(probe, opts.level, s) !== null);
  if (!ok) return [];
  return generateUnique(skill, opts, (rng, level) => {
    for (const b of rng.shuffle(builders)) {
      const q = b(rng, level, s);
      if (q) return q;
    }
    throw new Error(`${skill}：範圍內做不出題目（${s.chars.length} 字）`);
  });
}

/** 生字描寫（每回合 5 題）：只用有台灣教育部筆順的字；難度 1 有淡字形、2 更淡、3 默寫 */
export function makeCharWrite(opts: GenerateOptions, s: Scope = GLOBAL_SCOPE): Question[] {
  return run(ZH_CHARS_IDS.write, opts, s, [buildWrite]);
}

/** 注音符號描寫（37 個注音符號） */
export function makeZhuyinWrite(opts: GenerateOptions): Question[] {
  return run(ZH_CHARS_IDS.zhuyinWrite, opts, GLOBAL_SCOPE, [buildZhuyinWrite]);
}

/** 認字讀音：看字選注音、看注音選字 */
export function makeCharRead(opts: GenerateOptions, s: Scope = GLOBAL_SCOPE): Question[] {
  return run(ZH_CHARS_IDS.read, opts, s, [buildCharToZhuyin, buildZhuyinToChar]);
}

/** 部首：「河」的部首是？、哪兩個字部首相同、哪一個字的部首是「氵」 */
export function makeCharRadical(opts: GenerateOptions, s: Scope = GLOBAL_SCOPE): Question[] {
  return run(ZH_CHARS_IDS.radical, opts, s, [buildRadicalOf, buildRadicalOf, buildRadicalSame, buildRadicalFind]);
}

/** 筆畫數：「山」有幾畫？、比較兩個字的筆畫 */
export function makeCharStrokes(opts: GenerateOptions, s: Scope = GLOBAL_SCOPE): Question[] {
  return run(ZH_CHARS_IDS.strokes, opts, s, [buildStrokes]);
}

/** 造詞：選出含這個字的語詞、語詞缺字選填 */
export function makeCharWords(opts: GenerateOptions, s: Scope = GLOBAL_SCOPE): Question[] {
  return run(ZH_CHARS_IDS.words, opts, s, [buildWordWith, buildWordBlank]);
}

/** 課本單元混合題的比例（總和 8 題）：描寫 3、認讀 2、部首 1、筆畫 1、造詞 1 */
const UNIT_MIX: { make: (o: GenerateOptions, s: Scope) => Question[]; weight: number }[] = [
  { make: makeCharWrite, weight: 3 },
  { make: makeCharRead, weight: 2 },
  { make: makeCharRadical, weight: 1 },
  { make: makeCharStrokes, weight: 1 },
  { make: makeCharWords, weight: 1 },
];

/**
 * 課本單元出題器：給一課的生字與語詞，產生混合題（描寫、認讀、部首、筆畫、造詞）。
 * 題數依 opts.count 按比例分配（最大餘數法）；某類題目做不出來（沒有可寫的字、沒有語詞）時由其他題型補滿；
 * 最後用種子打散順序。段考模擬會用較小的 count 並丟掉描寫題，所以每種題型都盡量有題。
 */
export function unitQuestions(input: CharUnitInput, opts: GenerateOptions): Question[] {
  const chars = uniq(input.chars).filter((c) => CHAR_BY.has(c));
  if (!chars.length) return [];
  // 本課語詞：只留含本課生字的詞
  const words = uniq(input.words).filter((w) => chars.some((c) => w.includes(c)));
  const scope: Scope = { chars, words, unit: true };
  const total = UNIT_MIX.reduce((a, m) => a + m.weight, 0);
  const exact = UNIT_MIX.map((m) => (opts.count * m.weight) / total);
  const quota = exact.map(Math.floor);
  let left = opts.count - quota.reduce((a, b) => a + b, 0);
  // 最大餘數法：餘數大的先補（同分時照 UNIT_MIX 的順序）
  [...exact.keys()]
    .sort((a, b) => exact[b] - Math.floor(exact[b]) - (exact[a] - Math.floor(exact[a])) || a - b)
    .forEach((k) => {
      if (left > 0) {
        quota[k] += 1;
        left -= 1;
      }
    });
  // 每種題型多要一些當備用，之後依配額取用、不足再由備用補
  const pools = UNIT_MIX.map((m) => m.make({ ...opts, count: opts.count, allowFewer: true }, scope));
  const out: Question[] = [];
  const seen = new Set<string>();
  const take = (q: Question): boolean => {
    if (seen.has(q.id) || out.length >= opts.count) return false;
    seen.add(q.id);
    out.push(q);
    return true;
  };
  pools.forEach((p, k) => p.slice(0, quota[k]).forEach(take));
  // 配額沒滿：輪流從各題型的備用題補
  for (let i = 0; out.length < opts.count && pools.some((p) => i < p.length); i++) {
    pools.forEach((p) => {
      if (i < p.length) take(p[i]);
    });
  }
  return createRng(opts.seed ^ 0x6a09).shuffle(out);
}

// 模組載入時註冊課本單元出題器
registerCharUnitGenerator(unitQuestions);
