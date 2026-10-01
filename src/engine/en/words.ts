/**
 * 單字圖卡出題器：同一個字用五種方式考，輪流出現——
 * A 聽單字選圖、B 看圖選單字、C 聽單字選中文意思、D 看中文選單字、E 分類（哪一個是水果／動物…）。
 * 沒有貼切 emoji 的字（pic=false）只出 C、D、E。
 * 難度控制範圍：1＝臺北市低年段與新北市代表字、2＝加中年段字、3＝主表全部。
 * 指定主題的活動（數字、顏色、動物…）至少保留 10 個字，不足時依資料順序補上較基本的字。
 */
import type { QuestionGenerator } from '../../core/types';
import { TOPIC_LABEL, WORDS, clashes, type EnWord, type WordTopic } from '../../content/en/words';
import { generateUnique, shuffleChoices, type Level } from '../util';
import { EN_LANG, choiceQuestion, enOption, pickMany, picOption } from './util';

/** 聽、讀單字題的課綱代碼 */
export const WORD_HEAR_CODES = ['Ac-Ⅱ-3', '1-Ⅱ-7', 'TPE-L1-2'];
export const WORD_READ_CODES = ['Ac-Ⅱ-3', '3-Ⅱ-2', 'TPE-R1-2'];
export const WORD_SORT_CODES = ['D-Ⅱ-1', '9-Ⅱ-1'];

/** 主題活動最少的字數（不足時往上補） */
export const MIN_POOL = 10;

/** 分類題把意思相近的主題併成一組（水果也是食物、家人也是人物），避免選項有兩個正確答案 */
const SORT_GROUP: Partial<Record<WordTopic, { key: string; label: string }>> = {
  num: { key: 'num', label: TOPIC_LABEL.num! },
  color: { key: 'color', label: TOPIC_LABEL.color! },
  animal: { key: 'animal', label: TOPIC_LABEL.animal! },
  fruit: { key: 'food', label: '食物、飲料或水果' },
  food: { key: 'food', label: '食物、飲料或水果' },
  family: { key: 'people', label: '家人或人物' },
  people: { key: 'people', label: '家人或人物' },
  body: { key: 'body', label: TOPIC_LABEL.body! },
  vehicle: { key: 'vehicle', label: TOPIC_LABEL.vehicle! },
  cloth: { key: 'cloth', label: TOPIC_LABEL.cloth! },
  toy: { key: 'toy', label: TOPIC_LABEL.toy! },
  weather: { key: 'weather', label: TOPIC_LABEL.weather! },
};

/** 不適合出分類題的字（雨傘不是「天氣」，但歸在天氣主題裡） */
const NO_SORT = new Set(['umbrella']);

/** 選項文字附 emoji（有貼切 emoji 的字才附） */
const wordOpt = (w: EnWord, withEmoji = true) => enOption(w.en, withEmoji && w.pic ? w.emoji : undefined);

/** 某難度、某些主題的可出題字詞 */
export function wordPool(level: Level, topics?: WordTopic[]): EnWord[] {
  const base = topics ? WORDS.filter((w) => topics.includes(w.topic)) : WORDS;
  const pool = base.filter((w) => w.lv <= level);
  if (!topics || pool.length >= MIN_POOL) return pool;
  // 依「難度由低到高、同難度依資料順序」補到 MIN_POOL 個
  return [...base].sort((a, b) => a.lv - b.lv).slice(0, MIN_POOL);
}

/**
 * 建立單字圖卡出題器。
 * @param skillId 技能 id（題目 id 的前綴）
 * @param topics 限定主題；省略代表所有主題
 */
export function makeWordGenerator(skillId: string, topics?: WordTopic[]): QuestionGenerator {
  return (opts) => {
    /** 每個難度的字池只算一次 */
    const pools = new Map<Level, EnWord[]>();
    const poolOf = (level: Level) => {
      if (!pools.has(level)) pools.set(level, wordPool(level, topics));
      return pools.get(level)!;
    };
    return generateUnique(skillId, opts, (rng, level) => {
      const pool = poolOf(level);
      const t = rng.pick(pool);
      // 誘答優先取同一回合字池內的字，不夠再用同難度的全部字詞補
      const wide = WORDS.filter((w) => w.lv <= level && !pool.includes(w));
      const sorted = !!SORT_GROUP[t.topic] && !NO_SORT.has(t.en);
      const forms = [...(t.pic ? (['A', 'B'] as const) : []), 'C', 'D', ...(sorted ? (['E'] as const) : [])];
      const form = rng.pick(forms);
      const base = { skill: skillId, indicators: WORD_HEAR_CODES, difficulty: level as Level };
      switch (form) {
        case 'A': {
          const wrongs = pickMany(rng, [pool, wide], 3, (c) => c.pic && c.emoji !== t.emoji && !clashes(c.en, t.en));
          const { options, answer } = shuffleChoices(rng, picOption(t.emoji, t.en), wrongs.map((c) => picOption(c.emoji, c.en)));
          return choiceQuestion({
            ...base,
            id: `${skillId}:A:${t.en}`,
            prompt: rng.pick(['聽單字，選出對的圖。', '點喇叭聽一聽，哪一張圖是它？', '這個英文單字，是哪一張圖？']),
            speak: t.en,
            speakLang: EN_LANG,
            options,
            answer,
            explain: `${t.en} 是「${t.zh}」。`,
          });
        }
        case 'B': {
          const wrongs = pickMany(rng, [pool, wide], 3, (c) => c.pic && c.emoji !== t.emoji && !clashes(c.en, t.en));
          const { options, answer } = shuffleChoices(rng, wordOpt(t, false), wrongs.map((c) => wordOpt(c, false)));
          return choiceQuestion({
            ...base,
            indicators: WORD_READ_CODES,
            id: `${skillId}:B:${t.en}`,
            prompt: rng.pick(['看圖，選出正確的英文單字。', '這張圖的英文怎麼說？', '哪一個英文單字是這張圖？']),
            speak: t.en,
            speakLang: EN_LANG,
            visual: { kind: 'emoji', emoji: t.emoji, count: 1 },
            options,
            answer,
            explain: `${t.emoji} 的英文是 ${t.en}（${t.zh}）。`,
          });
        }
        case 'C': {
          const wrongs = pickMany(rng, [pool, wide], 3, (c) => c.zh !== t.zh && c.en !== t.en);
          const zhOpt = (w: EnWord) => ({ text: w.zh, ...(w.pic ? { emoji: w.emoji } : {}) });
          const { options, answer } = shuffleChoices(rng, zhOpt(t), wrongs.map(zhOpt));
          return choiceQuestion({
            ...base,
            id: `${skillId}:C:${t.en}`,
            prompt: rng.pick(['聽單字，它是什麼意思？', '點喇叭聽英文，選出中文意思。', '你聽到的單字，意思是哪一個？']),
            speak: t.en,
            speakLang: EN_LANG,
            options,
            answer,
            explain: `${t.en} 是「${t.zh}」。`,
          });
        }
        case 'D': {
          const wrongs = pickMany(rng, [pool, wide], 3, (c) => c.zh !== t.zh && c.en !== t.en);
          const { options, answer } = shuffleChoices(rng, wordOpt(t, false), wrongs.map((c) => wordOpt(c, false)));
          return choiceQuestion({
            ...base,
            indicators: WORD_READ_CODES,
            id: `${skillId}:D:${t.en}`,
            prompt: rng.pick([`「${t.zh}」的英文是哪一個？`, `哪一個英文單字的意思是「${t.zh}」？`, `「${t.zh}」用英文怎麼說？`]),
            options,
            answer,
            explain: `${t.zh} 的英文是 ${t.en}。`,
          });
        }
        default: {
          // E：分類。答案取自這個主題，誘答取自不同組的主題
          const g = SORT_GROUP[t.topic]!;
          const eligible = (c: EnWord) => !!SORT_GROUP[c.topic] && SORT_GROUP[c.topic]!.key !== g.key;
          const wrongs = pickMany(rng, [pool, wide], 3, eligible);
          const { options, answer } = shuffleChoices(rng, wordOpt(t), wrongs.map((c) => wordOpt(c)));
          return choiceQuestion({
            ...base,
            indicators: WORD_SORT_CODES,
            id: `${skillId}:E:${t.en}`,
            prompt: rng.pick([`哪一個是「${g.label}」？`, `下面哪一個英文單字屬於「${g.label}」？`]),
            options,
            answer,
            explain: `${t.en}（${t.zh}）屬於「${g.label}」。`,
          });
        }
      }
    });
  };
}

/** 聽、讀單字題與分類題用到的課綱代碼聯集 */
export const WORD_CODES = [...new Set([...WORD_HEAR_CODES, ...WORD_READ_CODES, ...WORD_SORT_CODES])];
