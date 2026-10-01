/**
 * 英文字母的出題器：字母描寫、大小寫配對、聽字母。
 * 純函式：相同種子、相同難度永遠產生相同的一組題目。
 */
import type { Rng } from '../../core/rng';
import type { QuestionGenerator } from '../../core/types';
import { CONFUSABLE_SHAPE, CONFUSABLE_SOUND, LOWER_LETTERS, UPPER_LETTERS } from '../../content/en/phonics';
import { generateUnique, shuffleChoices, type Level } from '../util';
import { EN_LANG, SRC, choiceQuestion, enOption, letterOption, pickMany } from './util';

/** 字母描寫的課綱代碼 */
export const WRITE_CODES = ['Aa-Ⅱ-2', '4-Ⅱ-1', 'TPE-W1-1', 'NTPC-4-Ⅰ-1'];
/** 大小寫配對的課綱代碼 */
export const CASE_CODES = ['Aa-Ⅱ-2', '3-Ⅱ-1', 'TPE-R1-1', 'NTPC-3-Ⅰ-1'];
/** 聽字母的課綱代碼 */
export const LISTEN_CODES = ['Aa-Ⅱ-1', '1-Ⅱ-1', 'TPE-L1-1', 'NTPC-1-Ⅰ-1'];

/** 看起來太像、不能同時出現的字母（大寫 I 與小寫 l） */
const LOOKALIKE: Record<string, string> = { I: 'l', l: 'I' };

/** 字母是大寫嗎 */
const isUpper = (ch: string) => ch === ch.toUpperCase();

/** 依難度決定字母描寫的字母範圍：1 大寫、2 小寫、3 大小寫混合 */
function writePool(level: Level): string[] {
  return level === 1 ? UPPER_LETTERS : level === 2 ? LOWER_LETTERS : [...UPPER_LETTERS, ...LOWER_LETTERS];
}

/**
 * 字母描寫：照筆順描出一個字母。每回合只出 6 題（課綱重質不重量，由活動定義 count）。
 * 不設 difficulty：描寫元件會依 difficulty 決定要不要顯示淡色字形，
 * 二年級是臨摹，一律保留淡色字形可以描。
 */
export const genLetterWrite: QuestionGenerator = (opts) =>
  generateUnique('en.letter-write', opts, (rng, level) => {
    const ch = rng.pick(writePool(level));
    const upper = isUpper(ch);
    const kind = upper ? '大寫' : '小寫';
    const prompt = rng.pick([`照著筆順，描出${kind}字母 ${ch}`, `一筆一畫描${kind} ${ch}`, `跟著描一描，寫出${kind}的 ${ch}`]);
    return {
      id: `en.letter-write:${ch}`,
      subject: 'en',
      skill: 'en.letter-write',
      indicators: WRITE_CODES,
      source: SRC,
      type: 'write',
      prompt,
      speak: ch.toUpperCase(),
      speakLang: EN_LANG,
      target: ch,
      script: 'latin',
      explain: `${kind} ${ch} 要照筆順從起點開始寫；大寫頂天立地，小寫寫在第二、三線之間。`,
    };
  });

/** 從字母池挑誘答字母：困難時優先取「長得像」的字母，再用隨機字母補滿 */
function letterDistractors(rng: Rng, target: string, pool: string[], groups: string[][], hard: boolean, banned: string[] = []): string[] {
  const key = target.toLowerCase();
  const group = groups.find((g) => g.some((x) => x.toLowerCase() === key)) ?? [];
  // 長得像的字母群用小寫或大寫都可能登錄，統一轉成誘答字母池的大小寫
  const near = group.map((x) => (isUpper(pool[0]) ? x.toUpperCase() : x.toLowerCase())).filter((x) => x.toLowerCase() !== key);
  // 誘答之間也不能是同一個字母的大小寫
  return pickMany(rng, hard ? [near, pool] : [pool], 3, (c, chosen) => c.toLowerCase() !== key && !banned.includes(c) && c !== LOOKALIKE[target] && !chosen.some((x) => x.toLowerCase() === c.toLowerCase()));
}

/** 把字母轉成指定大小寫 */
const asCase = (ch: string, upper: boolean) => (upper ? ch.toUpperCase() : ch.toLowerCase());

/**
 * 大小寫配對：看大寫選小寫、看小寫選大寫；困難再加「哪一組是同一個字母」。
 * 誘答：簡單、普通用隨機字母，困難用長得像的字母（b d p q、n h u 等）。
 */
export const genCaseMatch: QuestionGenerator = (opts) =>
  generateUnique('en.case-match', opts, (rng, level) => {
    const base = rng.pick(UPPER_LETTERS);
    const form = rng.pick(level === 3 ? (['pair', 'up2low', 'low2up', 'isUpper', 'isLower'] as const) : (['up2low', 'low2up', 'isUpper', 'isLower'] as const));
    const hard = level === 3;
    if (form === 'pair') {
      // 哪一組是同一個字母的大寫與小寫？誘答把小寫換成長得像的字母
      const correct = `${base} – ${base.toLowerCase()}`;
      const wrongs = letterDistractors(rng, base.toLowerCase(), LOWER_LETTERS, CONFUSABLE_SHAPE, true).map((l) => `${base} – ${l}`);
      const { options, answer } = shuffleChoices(rng, enOption(correct, undefined, base), wrongs.map((text) => enOption(text, undefined, base)));
      return choiceQuestion({
        id: `en.case-match:pair:${base}`,
        skill: 'en.case-match',
        indicators: CASE_CODES,
        prompt: rng.pick(['哪一組是同一個字母的大寫和小寫？', '請找出「大小寫配成一對」的那一組。']),
        options,
        answer,
        difficulty: level,
        explain: `${base} 的小寫是 ${base.toLowerCase()}。`,
      });
    }
    if (form === 'isUpper' || form === 'isLower') {
      // 辨認大小寫：四個字母裡只有一個是大寫（或小寫），其餘是另一種寫法，且不與答案同字母
      const wantUpper = form === 'isUpper';
      const answerLetter = asCase(base, wantUpper);
      const wrongs = letterDistractors(rng, answerLetter, wantUpper ? LOWER_LETTERS : UPPER_LETTERS, CONFUSABLE_SHAPE, hard, LOOKALIKE[answerLetter] ? [LOOKALIKE[answerLetter]] : []);
      const { options, answer } = shuffleChoices(rng, letterOption(answerLetter), wrongs.map(letterOption));
      return choiceQuestion({
        id: `en.case-match:${form}:${base}`,
        skill: 'en.case-match',
        indicators: CASE_CODES,
        prompt: wantUpper ? rng.pick(['哪一個是大寫字母？', '下面四個字母，只有一個是大寫，找找看。']) : rng.pick(['哪一個是小寫字母？', '下面四個字母，只有一個是小寫，找找看。']),
        options,
        answer,
        difficulty: level,
        explain: `${answerLetter} 是${wantUpper ? '大寫' : '小寫'}字母，它的${wantUpper ? '小寫' : '大寫'}是 ${asCase(base, !wantUpper)}。`,
      });
    }
    const shownUpper = form === 'up2low';
    const shown = asCase(base, shownUpper);
    const answerLetter = asCase(base, !shownUpper);
    const pool = shownUpper ? LOWER_LETTERS : UPPER_LETTERS;
    const banned = LOOKALIKE[shown] ? [LOOKALIKE[shown]] : [];
    const wrongs = letterDistractors(rng, answerLetter, pool, CONFUSABLE_SHAPE, hard, banned);
    const { options, answer } = shuffleChoices(rng, letterOption(answerLetter), wrongs.map(letterOption));
    const target = shownUpper ? '小寫' : '大寫';
    const prompt = shownUpper
      ? rng.pick([`大寫的 ${shown}，它的小寫是哪一個？`, `找出和大寫 ${shown} 配成一對的小寫字母。`, `哪一個是 ${shown} 的小寫？`])
      : rng.pick([`小寫的 ${shown}，它的大寫是哪一個？`, `找出和小寫 ${shown} 配成一對的大寫字母。`, `哪一個是 ${shown} 的大寫？`]);
    return choiceQuestion({
      id: `en.case-match:${form}:${base}`,
      skill: 'en.case-match',
      indicators: CASE_CODES,
      prompt,
      visual: { kind: 'bigtext', text: shown, lang: EN_LANG },
      speak: base,
      speakLang: EN_LANG,
      options,
      answer,
      difficulty: level,
      explain: `${shown} 的${target}是 ${answerLetter}。`,
    });
  });

/**
 * 聽字母：
 * - hear：朗讀一個字母，選出它（1 大寫、2 小寫、3 大小寫其中之一，且誘答是發音相近的字母）；
 * - next／prev：字母順序，問某個字母的下一個、上一個是哪一個字母。
 */
export const genLetterListen: QuestionGenerator = (opts) =>
  generateUnique('en.letter-listen', opts, (rng, level) => {
    const form = rng.pick(['hear', 'hear', 'next', 'prev', 'between'] as const);
    const upper = level === 1 ? true : level === 2 ? false : rng.chance(0.5);
    const hard = level === 3;
    if (form === 'hear') {
      const base = rng.pick(UPPER_LETTERS);
      const target = asCase(base, upper);
      const pool = upper ? UPPER_LETTERS : LOWER_LETTERS;
      // 困難：誘答用發音相近的字母（B D P T V…）；其他難度用隨機字母
      const wrongs = hard ? letterDistractors(rng, base, UPPER_LETTERS, CONFUSABLE_SOUND, true).map((l) => asCase(l, upper)) : letterDistractors(rng, target, pool, [], false);
      const { options, answer } = shuffleChoices(rng, letterOption(target), wrongs.map(letterOption));
      return choiceQuestion({
        id: `en.letter-listen:hear:${target}`,
        skill: 'en.letter-listen',
        indicators: LISTEN_CODES,
        prompt: rng.pick(['聽一聽，唸的是哪一個字母？', '請聽，老師唸的字母是哪一個？', '點喇叭聽字母，再選出來。']),
        speak: base,
        speakLang: EN_LANG,
        options,
        answer,
        difficulty: level,
        explain: `唸的是字母 ${target}。`,
      });
    }
    if (form === 'between') {
      // 缺哪個字母：A、_、C
      const mid = UPPER_LETTERS[rng.int(1, 24)];
      const i = UPPER_LETTERS.indexOf(mid);
      const [a, c] = [UPPER_LETTERS[i - 1], UPPER_LETTERS[i + 1]];
      const correct = asCase(mid, upper);
      const near = [-3, -2, 2, 3].map((d) => UPPER_LETTERS[i + d]).filter((x): x is string => !!x);
      const wrongs = pickMany(rng, [near, UPPER_LETTERS], 3, (x) => ![a, mid, c].includes(x)).map((l) => asCase(l, upper));
      const { options, answer } = shuffleChoices(rng, letterOption(correct), wrongs.map(letterOption));
      return choiceQuestion({
        id: `en.letter-listen:between:${mid}`,
        skill: 'en.letter-listen',
        indicators: LISTEN_CODES,
        prompt: `字母接龍：${asCase(a, upper)}、＿、${asCase(c, upper)}，中間缺的是哪一個字母？`,
        speak: `${a}, ${c}`,
        speakLang: EN_LANG,
        options,
        answer,
        difficulty: level,
        explain: `字母順序是 ${a} ${mid} ${c}，缺的是 ${correct}。`,
      });
    }
    // 字母順序：下一個（A～Y）或上一個（B～Z）
    const idx = form === 'next' ? rng.int(0, 24) : rng.int(1, 25);
    const from = UPPER_LETTERS[idx];
    const to = UPPER_LETTERS[form === 'next' ? idx + 1 : idx - 1];
    const correct = asCase(to, upper);
    // 誘答：離答案不遠的字母
    const near = [-2, -1, 1, 2, 3].map((d) => UPPER_LETTERS[UPPER_LETTERS.indexOf(to) + d]).filter((x): x is string => !!x && x !== from && x !== to);
    const rest = UPPER_LETTERS.filter((x) => x !== to && x !== from);
    const wrongs = pickMany(rng, [near, rest], 3, () => true).map((l) => asCase(l, upper));
    const { options, answer } = shuffleChoices(rng, letterOption(correct), wrongs.map(letterOption));
    const dir = form === 'next' ? '後面' : '前面';
    const ask = asCase(from, upper);
    return choiceQuestion({
      id: `en.letter-listen:${form}:${from}`,
      skill: 'en.letter-listen',
      indicators: LISTEN_CODES,
      prompt: rng.pick([`照字母順序，${ask} ${dir}緊接著的是哪一個字母？`, `字母歌裡，${ask} 的${form === 'next' ? '下' : '上'}一個字母是誰？`]),
      speak: from,
      speakLang: EN_LANG,
      options,
      answer,
      difficulty: level,
      explain: `字母順序是 A B C D E F G…，${ask} ${dir}是 ${correct}。`,
    });
  });

