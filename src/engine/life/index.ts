/**
 * 生活與健康科的出題器：把種子題庫打散取題，選項順序也由種子決定。
 * 純函式：相同種子、相同題庫永遠產生相同的一組題目。
 */
import { createRng, hashString, type Rng } from '../../core/rng';
import type { ChoiceOption, GenerateOptions, Question } from '../../core/types';
import { LIFE_TOPICS, type LifeItem, type LifeTopic } from '../../content/life';
import { shuffleChoices } from '../util';

/** 是非題固定的選項（順序不打散，孩子才不會每次找不到「對」在哪） */
const TF_OPTIONS: ChoiceOption[] = [
  { text: '對', emoji: '⭕' },
  { text: '錯', emoji: '❌' },
];

/** 抓出 emoji 與其修飾字元的規則（朗讀時要去掉） */
const EMOJI_RE = /[\p{Extended_Pictographic}️‍⃣]/gu;

/** 這段文字有沒有 emoji */
export function hasEmoji(text: string): boolean {
  return /\p{Extended_Pictographic}/u.test(text);
}

/** 去掉 emoji 後的朗讀文字 */
function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * 把一題種子題目轉成 Question。
 * id 由活動 id 與題庫順序組成（同一題永遠相同）；選擇題的選項用 rng 打散並更新答案索引。
 */
export function buildLifeQuestion(topic: LifeTopic, index: number, rng: Rng): Question {
  const item: LifeItem = topic.items[index];
  const base = {
    id: `${topic.id}:${String(index + 1).padStart(2, '0')}`,
    subject: 'life' as const,
    skill: topic.id,
    indicators: item.indicators,
    prompt: item.prompt,
    explain: item.explain,
    source: item.source,
    ...(item.visual ? { visual: item.visual } : {}),
    // 題目有 emoji 時沒有指定朗讀文字，就自動去掉 emoji 後朗讀
    ...(item.speak ? { speak: item.speak } : hasEmoji(item.prompt) ? { speak: stripEmoji(item.prompt) } : {}),
  };
  switch (item.kind) {
    case 'choice': {
      const { options, answer } = shuffleChoices(rng, item.right, item.wrong, 4);
      return { ...base, type: 'choice', options, answer };
    }
    case 'tf':
      return { ...base, type: 'choice', options: TF_OPTIONS.map((o) => ({ ...o })), answer: item.truth ? 0 : 1 };
    case 'order': {
      // 詞卡打散後若剛好與答案相同，重新打散（最多 10 次）
      let tokens = rng.shuffle(item.steps);
      for (let i = 0; i < 10 && tokens.every((t, k) => t === item.steps[k]); i++) tokens = rng.shuffle(item.steps);
      return { ...base, type: 'order', tokens, answer: [...item.steps] };
    }
  }
}

/** 產生整個題庫的所有題目（測試與題庫檢查用；選項順序用固定種子打散） */
export function allLifeQuestions(topic: LifeTopic): Question[] {
  const rng = createRng(hashString(topic.id));
  return topic.items.map((_, i) => buildLifeQuestion(topic, i, rng));
}

/**
 * 一個活動的出題器：用種子打散題庫後取前 count 題（題庫不足時只回傳題庫有的題數）。
 * 亂數種子混入活動 id，不同活動用同一個種子也不會得到相同的排列。
 */
export function makeLifeQuestions(topic: LifeTopic, opts: Pick<GenerateOptions, 'seed' | 'count'>): Question[] {
  const rng = createRng((opts.seed ^ hashString(topic.id)) >>> 0);
  const picked = rng.shuffle(topic.items.map((_, i) => i)).slice(0, opts.count);
  return picked.map((i) => buildLifeQuestion(topic, i, rng));
}

export { LIFE_TOPICS };
