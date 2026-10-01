/**
 * 字母開頭音（phonics）出題器：
 * - first：看字與圖／只看圖／只聽單字，選出開頭的字母；
 * - pick：給一個字母（看或聽），從四張圖裡選出開頭是這個字母的那一張。
 * 難度：1 單字與圖都看得到（含新北市 26 組字母代表字）；2 只看圖；3 只聽單字或只聽字母，誘答是發音相近的字母。
 */
import type { QuestionGenerator } from '../../core/types';
import { PHONICS_LETTERS, SAME_SOUND_PAIRS, CONFUSABLE_SOUND, UPPER_LETTERS, phonicsWords } from '../../content/en/phonics';
import { generateUnique, shuffleChoices } from '../util';
import { EN_LANG, choiceQuestion, letterOption, pickMany, picOption } from './util';

/** phonics 題的課綱代碼 */
export const PHONICS_CODES = ['Ab-Ⅱ-1', 'Ab-Ⅱ-4', '1-Ⅱ-2', 'NTPC-1-Ⅰ-2', 'NTPC-Ab-Ⅰ-1'];

/** 兩個字母的開頭音是否相同（c 與 k 的硬音都是 /k/），選項裡不能一起出現 */
function sameSound(a: string, b: string): boolean {
  return a === b || SAME_SOUND_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

/** 字母的顯示文字，例如 Bb */
const both = (l: string) => `${l}${l.toLowerCase()}`;

/** 字母選項：顯示「Bb」，朗讀字母名稱 */
function phonicsLetterOption(l: string) {
  return { ...letterOption(l), text: both(l) };
}

/** 依難度挑得出題的示範字 */
function wordsFor(level: 1 | 2 | 3, needPic: boolean) {
  return phonicsWords().filter((w) => (!needPic || w.pic) && (level !== 2 || w.pic));
}

export const genPhonics: QuestionGenerator = (opts) =>
  generateUnique('en.phonics', opts, (rng, level) => {
    // pick 型只有「圖」可選，所以需要 pic；first 型在難度 2 也只看圖，難度 1、3 可用沒有圖的字（有字或有聲音）
    const form = rng.chance(0.65) ? 'first' : 'pick';
    if (form === 'first') {
      const w = rng.pick(wordsFor(level, false));
      const hard = level === 3;
      // 誘答字母：開頭音不能和答案相同；困難時優先挑發音相近的字母
      const group = CONFUSABLE_SOUND.find((g) => g.includes(w.letter)) ?? [];
      const wrongs = pickMany(rng, hard ? [group, PHONICS_LETTERS, UPPER_LETTERS] : [PHONICS_LETTERS, UPPER_LETTERS], 3, (c, chosen) => !sameSound(c, w.letter) && !chosen.some((x) => sameSound(x, c)));
      const { options, answer } = shuffleChoices(rng, phonicsLetterOption(w.letter), wrongs.map(phonicsLetterOption));
      const base = { id: `en.phonics:first:${w.en}`, skill: 'en.phonics', indicators: PHONICS_CODES, speak: w.en, speakLang: EN_LANG, options, answer, difficulty: level, explain: `${w.en} 的第一個字母是 ${w.letter}，開頭唸起來像 ${w.letter} 的聲音。` } as const;
      if (level === 1) {
        // 看得到單字與圖：找出單字的第一個字母
        return choiceQuestion({
          ...base,
          prompt: rng.pick([`「${w.en}」的第一個字母是哪一個？`, `${w.emoji} ${w.en} 是從哪個字母開始的？`]),
          visual: { kind: 'emoji', emoji: w.emoji, count: 1 },
        });
      }
      if (level === 2) {
        // 只看圖：想一想這個東西的英文，開頭是哪個字母
        return choiceQuestion({
          ...base,
          prompt: rng.pick(['看圖，它的英文單字是從哪個字母開頭？', '點喇叭聽聽看，這張圖的英文開頭是哪個字母？']),
          visual: { kind: 'emoji', emoji: w.emoji, count: 1 },
        });
      }
      // 只聽單字
      return choiceQuestion({ ...base, prompt: rng.pick(['聽單字，它是從哪個字母開頭？', '點喇叭聽一聽，這個字的第一個聲音是哪個字母？']) });
    }
    // pick：給字母，選開頭是這個字母的圖
    const w = rng.pick(wordsFor(level === 1 ? 1 : 2, true));
    const others = phonicsWords().filter((x) => x.pic && !sameSound(x.letter, w.letter) && x.emoji !== w.emoji);
    const wrongs = pickMany(rng, [others], 3, (c, chosen) => !chosen.some((x) => sameSound(x.letter, c.letter)) && !chosen.some((x) => x.letter === c.letter));
    const { options, answer } = shuffleChoices(rng, picOption(w.emoji, w.en), wrongs.map((x) => picOption(x.emoji, x.en)));
    const heard = level === 3;
    return choiceQuestion({
      id: `en.phonics:pick:${w.en}`,
      skill: 'en.phonics',
      indicators: PHONICS_CODES,
      prompt: heard
        ? rng.pick(['聽字母，哪一張圖的英文是這個字母開頭？', '點喇叭聽字母，找出開頭是這個字母的圖。'])
        : rng.pick([`哪一張圖的英文是從 ${both(w.letter)} 開頭？`, `找出英文單字以 ${w.letter} 開頭的圖。`]),
      speak: w.letter,
      speakLang: EN_LANG,
      options,
      answer,
      difficulty: level,
      explain: `${w.en} 是從 ${w.letter} 開頭的字。`,
    });
  });
