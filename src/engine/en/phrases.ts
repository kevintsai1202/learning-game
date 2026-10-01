/**
 * 生活用語、教室用語與簡易句型的出題器。
 * 用語：S 中文情境選英文說法、H 聽英文選意思、R 看英文選意思（三種輪流）。
 * 句型：What's this? It's a ___.（看圖回答、聽句選圖、Is this a ___? 是非）、What's your name?、Who is he/she?。
 * 都不要求拼寫，只做「指認、圈選、配合」。
 */
import type { QuestionGenerator } from '../../core/types';
import { PHRASES, NAMES, type EnPhrase } from '../../content/en/phrases';
import { WORDS, clashes, withArticle, type EnWord } from '../../content/en/words';
import { generateUnique, shuffleChoices, type Level } from '../util';
import { EN_LANG, choiceQuestion, enOption, pickMany, picOption } from './util';

/** 意思相同或情境相近、不能同時當正解與誘答的用語（以英文為鍵分組） */
const RELATED: string[][] = [
  ['Hello!', 'Hi!'],
  ['Thank you.', 'Thanks.'],
  ['Very good.', 'Good job!'],
  ['Look!', 'Look here!'],
  ['Listen!', 'Listen carefully!'],
  ['Good morning.', 'Good morning, Ms. Wang.'],
  ['Good afternoon.', 'Good afternoon, Mr. Lee.'],
  ['Repeat.', 'Repeat after me, please.'],
  ['Goodbye.', 'See you later.'],
  ['Be quiet.', 'Listen carefully!'],
  ['Yes, I am.', 'OK.'],
  ["I'm fine.", 'OK.'],
];

/** 兩句用語是否相近 */
function related(a: EnPhrase, b: EnPhrase): boolean {
  return a.en === b.en || a.zh === b.zh || RELATED.some((g) => g.includes(a.en) && g.includes(b.en));
}

/** 是不是打招呼用語（要加上「招呼方式」的課綱代碼） */
const isGreeting = (p: EnPhrase) => /^(Good (morning|afternoon)|Hello|Hi|Goodbye|See you|How are you)/.test(p.en);

/** 用語題的課綱代碼：教室／生活、題型、是否為招呼 */
function phraseCodes(p: EnPhrase, form: 'S' | 'H' | 'R' | 'Z'): string[] {
  const room = p.kind === 'classroom';
  const codes = [room ? 'Ac-Ⅱ-1' : 'Ac-Ⅱ-2'];
  if (form === 'S') codes.push(room ? '2-Ⅱ-4' : '2-Ⅱ-5', 'TPE-S1-3');
  if (form === 'H' || form === 'Z') codes.push(room ? '1-Ⅱ-8' : '1-Ⅱ-9', 'TPE-L1-3');
  if (form === 'R') codes.push('3-Ⅱ-3', 'TPE-R1-3');
  if (isGreeting(p)) codes.push('C-Ⅱ-1', '8-Ⅱ-1');
  return codes;
}

/** 用語活動可能用到的所有代碼（供活動定義與測試） */
export const PHRASE_CODES = [...new Set(PHRASES.flatMap((p) => (['S', 'H', 'R', 'Z'] as const).flatMap((f) => phraseCodes(p, f))))];

/** 生活用語與教室用語 */
export const genPhrases: QuestionGenerator = (opts) =>
  generateUnique('en.phrases', opts, (rng, level) => {
    const pool = PHRASES.filter((p) => p.lv <= level);
    const wide = PHRASES.filter((p) => p.lv > level);
    const t = rng.pick(pool);
    const form = rng.pick(['S', 'H', 'R', 'Z'] as const);
    // 誘答優先取同類（教室對教室、生活對生活）
    const same = pool.filter((p) => p.kind === t.kind);
    const groups = [same, pool, wide];
    const base = { skill: 'en.phrases', indicators: phraseCodes(t, form), difficulty: level as Level };
    if (form === 'S') {
      const wrongs = pickMany(rng, groups, 3, (c) => !related(c, t));
      const { options, answer } = shuffleChoices(rng, enOption(t.en, t.emoji), wrongs.map((c) => enOption(c.en, c.emoji)));
      return choiceQuestion({
        ...base,
        id: `en.phrases:S:${t.en}`,
        prompt: rng.pick([`${t.scene}，英文要怎麼說？`, `${t.scene}。這時候可以說哪一句？`]),
        options,
        answer,
        explain: `${t.zh}：${t.en}`,
      });
    }
    const wrongs = pickMany(rng, groups, 3, (c, chosen) => !related(c, t) && !chosen.some((x) => related(x, c)));
    if (form === 'Z') {
      // 聽英文，選出「什麼時候說」的情境
      const sceneOpt = (p: EnPhrase) => ({ text: p.scene, emoji: p.emoji });
      const { options, answer } = shuffleChoices(rng, sceneOpt(t), wrongs.map(sceneOpt));
      return choiceQuestion({
        ...base,
        id: `en.phrases:Z:${t.en}`,
        prompt: rng.pick(['聽一聽，這句英文是什麼時候說的？', '點喇叭聽英文，哪一個情境會說這句話？']),
        speak: t.en,
        speakLang: EN_LANG,
        options,
        answer,
        explain: `${t.en}（${t.zh}）：${t.scene}。`,
      });
    }
    const zhOpt = (p: EnPhrase) => ({ text: p.zh, emoji: p.emoji });
    const { options, answer } = shuffleChoices(rng, zhOpt(t), wrongs.map(zhOpt));
    if (form === 'H') {
      return choiceQuestion({
        ...base,
        id: `en.phrases:H:${t.en}`,
        prompt: rng.pick(['聽一聽，這句英文是什麼意思？', '點喇叭聽英文，選出意思。', '老師說了一句英文，是什麼意思呢？']),
        speak: t.en,
        speakLang: EN_LANG,
        options,
        answer,
        explain: `${t.en} 的意思是「${t.zh}」。`,
      });
    }
    return choiceQuestion({
      ...base,
      id: `en.phrases:R:${t.en}`,
      // 句子太長時（bigtext 上限 20 字）改放在題幹裡
      prompt: t.en.length <= 20 ? rng.pick(['看這句英文，它的意思是什麼？', '讀一讀，這句話是什麼意思？']) : `讀一讀：${t.en} 這句話是什麼意思？`,
      ...(t.en.length <= 20 ? { visual: { kind: 'bigtext' as const, text: t.en, lang: EN_LANG } } : {}),
      speak: t.en,
      speakLang: EN_LANG,
      options,
      answer,
      explain: `${t.en} 的意思是「${t.zh}」。`,
    });
  });

/** 句型題的課綱代碼 */
export const PATTERN_CODES = ['B-Ⅱ-1', '1-Ⅱ-10', '3-Ⅱ-3', 'TPE-L1-4', 'TPE-R1-3'];

/** 句型用的名詞：可數單數、有貼切 emoji、依難度取範圍 */
function nounPool(level: Level): EnWord[] {
  return WORDS.filter((w) => w.pic && w.countable && w.lv <= level);
}

/** 「他／她是我的…」：家人的代名詞（依難度加入祖父母） */
const WHO: { en: string; rel: string; pronoun: 'he' | 'she'; lv: 1 | 2 | 3 }[] = [
  { en: 'dad', rel: 'dad', pronoun: 'he', lv: 1 },
  { en: 'mom', rel: 'mom', pronoun: 'she', lv: 1 },
  { en: 'grandpa', rel: 'grandpa', pronoun: 'he', lv: 2 },
  { en: 'grandma', rel: 'grandma', pronoun: 'she', lv: 2 },
];

/** 簡易句型：What's this? It's a ___. 等 */
export const genPatterns: QuestionGenerator = (opts) =>
  generateUnique('en.patterns', opts, (rng, level) => {
    const nouns = nounPool(level);
    const form = rng.pick(['what', 'hear', 'yesno', 'what', 'hear', 'yesno', 'name', 'who'] as const);
    const base = { skill: 'en.patterns', indicators: PATTERN_CODES, difficulty: level as Level };
    if (form === 'name') {
      const name = rng.pick(NAMES);
      const wrongs = ['I\'m fine.', 'Thank you.', 'Goodbye.', 'Hello!', 'Yes, I am.', "It's a book."];
      const { options, answer } = shuffleChoices(rng, enOption(`My name is ${name}.`), rng.shuffle(wrongs).map((x) => enOption(x)));
      return choiceQuestion({
        ...base,
        id: `en.patterns:name:${name}`,
        prompt: rng.pick(['有人問你的名字，這時候要怎麼回答？', '聽到 What\'s your name?，要選哪一句回答？']),
        speak: "What's your name?",
        speakLang: EN_LANG,
        options,
        answer,
        explain: `What's your name? 是在問「你叫什麼名字」，回答 My name is ${name}.`,
      });
    }
    if (form === 'who') {
      // 看圖問 Who is he/she?：選項是「代名詞 × 家人」的組合，只有性別與家人都對才是正解
      const rels = WHO.filter((x) => x.lv <= level);
      const t = rng.pick(rels);
      const w = WORDS.find((x) => x.en === t.en)!;
      const sentence = (pronoun: string, rel: string) => `${pronoun === 'he' ? 'He' : 'She'} is my ${rel}.`;
      const combos = rels.flatMap((r) => (['he', 'she'] as const).map((pr) => ({ pr, rel: r.rel }))).filter((c) => !(c.pr === t.pronoun && c.rel === t.rel));
      const wrongs = pickMany(rng, [combos], 3, () => true);
      const { options, answer } = shuffleChoices(rng, enOption(sentence(t.pronoun, t.rel)), wrongs.map((c) => enOption(sentence(c.pr, c.rel))));
      return choiceQuestion({
        ...base,
        id: `en.patterns:who:${t.rel}`,
        prompt: `看圖，${t.pronoun === 'he' ? '他' : '她'}是誰？選出對的句子。`,
        speak: `Who is ${t.pronoun}?`,
        speakLang: EN_LANG,
        visual: { kind: 'emoji', emoji: w.emoji, count: 1 },
        options,
        answer,
        explain: `Who is ${t.pronoun}? 是在問「${t.pronoun === 'he' ? '他' : '她'}是誰」，回答 ${sentence(t.pronoun, t.rel)}`,
      });
    }
    const t = rng.pick(nouns);
    const others = (c: EnWord) => c.emoji !== t.emoji && !clashes(c.en, t.en);
    const a = withArticle(t.en);
    if (form === 'what') {
      const wrongs = pickMany(rng, [nouns], 3, others);
      const { options, answer } = shuffleChoices(rng, enOption(`It's ${a}.`), wrongs.map((c) => enOption(`It's ${withArticle(c.en)}.`)));
      return choiceQuestion({
        ...base,
        id: `en.patterns:what:${t.en}`,
        prompt: rng.pick(["看圖回答：What's this?", "老師指著圖問 What's this?，要選哪一句回答？"]),
        speak: "What's this?",
        speakLang: EN_LANG,
        visual: { kind: 'emoji', emoji: t.emoji, count: 1 },
        options,
        answer,
        explain: `${t.emoji} 是 ${t.en}（${t.zh}），回答 It's ${a}.`,
      });
    }
    if (form === 'hear') {
      const wrongs = pickMany(rng, [nouns], 3, others);
      const { options, answer } = shuffleChoices(rng, picOption(t.emoji, t.en), wrongs.map((c) => picOption(c.emoji, c.en)));
      return choiceQuestion({
        ...base,
        id: `en.patterns:hear:${t.en}`,
        prompt: rng.pick(['聽句子，它說的是哪一張圖？', '點喇叭聽句子，選出圖。']),
        speak: `It's ${a}.`,
        speakLang: EN_LANG,
        options,
        answer,
        explain: `It's ${a}. 是「它是${t.zh}」。`,
      });
    }
    // yesno：Is this a ___? 圖片相符答 Yes，不相符答 No
    const isYes = rng.chance(0.5);
    const asked = isYes ? t : pickMany(rng, [nouns], 1, others)[0];
    const sentence = `Is this ${withArticle(asked.en)}?`;
    return choiceQuestion({
      ...base,
      id: `en.patterns:yesno:${t.en}:${isYes ? 'y' : asked.en}`,
      prompt: rng.pick([`看圖回答：${sentence}`, `老師問 ${sentence} 圖片是這個嗎？`]),
      speak: sentence,
      speakLang: EN_LANG,
      visual: { kind: 'emoji', emoji: t.emoji, count: 1 },
      // 選項順序固定（Yes 在前），孩子比較好找
      options: [enOption('Yes, it is.'), enOption("No, it's not.")],
      answer: isYes ? 0 : 1,
      explain: isYes ? `${t.emoji} 就是 ${t.en}，所以答 Yes, it is.` : `${t.emoji} 是 ${t.en}，不是 ${asked.en}，所以答 No, it's not.`,
    });
  });
