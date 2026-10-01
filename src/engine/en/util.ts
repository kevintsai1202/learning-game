/**
 * 英語出題器共用工具：題目依據文字、英文選項、挑誘答、課綱代碼組合。
 */
import type { Rng } from '../../core/rng';
import type { ChoiceOption, ChoiceQuestion } from '../../core/types';

/** 題目依據說明 */
export const SRC = '依 108 課綱與臺北市國小英語課綱自編';

/** 英文朗讀語言 */
export const EN_LANG = 'en-US' as const;

/** 英文選項（文字、可選的 emoji；朗讀文字預設為 text） */
export function enOption(text: string, emoji?: string, speak?: string): ChoiceOption {
  return { text, ...(emoji ? { emoji } : {}), speak: speak ?? text, speakLang: EN_LANG };
}

/** 只有圖的選項（聽單字選圖用）：點下去可以聽到該圖的英文 */
export function picOption(emoji: string, speak: string): ChoiceOption {
  return { emoji, speak, speakLang: EN_LANG };
}

/** 字母選項：朗讀一律用大寫字母，避免裝置把小寫 a 讀成冠詞 */
export function letterOption(letter: string): ChoiceOption {
  return { text: letter, speak: letter.toUpperCase(), speakLang: EN_LANG };
}

/**
 * 從候選清單挑出最多 n 個符合條件的誘答（先打散，保持同種子同結果）。
 * 候選順序決定優先度：想讓「同主題」的字優先，就把它們排在前面，再各自打散後串接。
 * ok 的第二個參數是已經選上的誘答，可以用來避免誘答之間互相衝突。
 */
export function pickMany<T>(rng: Rng, groups: T[][], n: number, ok: (c: T, chosen: T[]) => boolean): T[] {
  const out: T[] = [];
  for (const g of groups) {
    for (const c of rng.shuffle(g)) {
      if (out.length >= n) return out;
      if (ok(c, out) && !out.includes(c)) out.push(c);
    }
  }
  return out;
}

/** 合成選擇題（把共同欄位補齊） */
export function choiceQuestion(q: Omit<ChoiceQuestion, 'type' | 'subject' | 'source'>): ChoiceQuestion {
  return { ...q, type: 'choice', subject: 'en', source: SRC };
}
