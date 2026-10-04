/// <reference types="node" />
/**
 * 預錄語音盤點（A 期）：列出要預錄的每一句，輸出 data-src/voice/inventory.json（進版控，是「錄了哪些句子」的清單）。
 *
 * - 一律用遊戲本身的函式算出朗讀文字：題目／選項／公布答案用 src/quiz/spoken.ts，切句與正規化用 speech.ts 的 cleanForSpeech、
 *   voices.ts 的 splitSentences，鍵用 clips.ts 的 clipKey，和執行端完全相同。
 * - A 期範圍：介面固定句子（src/ui/lines.ts、建築介紹、動物與帽子名稱、選單上的活動名稱）、生活與健康、英語的全部題目，
 *   以及 37 個注音符號與注音描寫題的固定指示句。數學與國語其他題目不預錄（B 期）。
 * - 出題器每個活動一直換種子出題，直到連續 QUIET 個種子都沒有新句子才停（最多 MAX_SEEDS 個），避免漏句。
 *
 * 用法（PowerShell 7，專案根目錄）：npx vitest run --config vitest.voice.config.ts
 */
import { test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALL_ACTIVITIES } from '../../src/activities/registry';
import { examActivities, unitActivities } from '../../src/activities/units';
import type { ActivityDef } from '../../src/activities/types';
import { BUILT_IN_EDITIONS } from '../../src/content/editions/index';
import { ZHUYIN_SYMBOLS } from '../../src/content/zh/chars';
import { ZH_CHARS_IDS } from '../../src/engine/zh/chars';
import type { Question, SpeakLang } from '../../src/core/types';
import { cleanForSpeech } from '../../src/audio/speech';
import { splitSentences } from '../../src/audio/voices';
import { clipKey, isSymbolSentence } from '../../src/audio/clips';
import { answerLine, optionSpeech, questionSpeech } from '../../src/quiz/spoken';
import * as LINES from '../../src/ui/lines';
import { ZONES } from '../../src/world/layout';
import { PUZZLE_GAMES } from '../../src/puzzle/catalog';
import { ITEMS } from '../../src/store/catalog';
import { ANIMALS } from '../../src/ui/screens/ProfilesScreen';
import { BADGES } from '../../src/store/badges';
import { STICKERS, giftName } from '../../src/store/gifts';

/** 連續幾個種子沒有新句子就停 */
const QUIET = 40;
/** 每個活動最多跑幾個種子 */
const MAX_SEEDS = 1500;
/** 注音描寫題的指示句至少出現在幾個不同符號的題目才算固定句型 */
const TEMPLATE_MIN = 10;

/** 要用哪個聲音產生：zh＝中文（詩涵）、en＝英文（詩涵）、zhuyin＝注音符號（Azure 曉臻） */
type VoiceKind = 'zh' | 'en' | 'zhuyin';

/** 盤點結果的一句 */
interface Item {
  key: string;
  lang: SpeakLang;
  voice: VoiceKind;
  /** 要合成的文字（注音符號是不帶標點的符號本身） */
  text: string;
  /** 出處（活動 id 或介面類別），最多記 3 個 */
  sources: string[];
}

const items = new Map<string, Item>();

/** 把一段朗讀文字依執行端的規則切句後加入清單 */
function addSpoken(text: string, lang: SpeakLang, source: string): void {
  for (const sentence of splitSentences(cleanForSpeech(text))) {
    const key = clipKey(lang, sentence);
    const symbol = isSymbolSentence(sentence);
    const it = items.get(key) ?? {
      key,
      lang: symbol ? 'zh-TW' : lang,
      voice: symbol ? 'zhuyin' : lang === 'en-US' ? 'en' : 'zh',
      text: symbol ? sentence.trim()[0] : sentence,
      sources: [],
    };
    if (it.sources.length < 3 && !it.sources.includes(source)) it.sources.push(source);
    items.set(key, it);
  }
}

/** 一題會唸到的所有內容：題目、選項的 🔊、公布答案 */
function speechOfQuestion(q: Question): { text: string; lang: SpeakLang }[] {
  const out = [questionSpeech(q), answerLine(q)];
  if (q.type === 'choice') for (const o of q.options) out.push(optionSpeech(q, o));
  return out.filter((s) => s.text);
}

/** 對一個活動一直換種子出題，回呼每一題；回傳用了幾個種子 */
function harvest(a: ActivityDef, onQuestion: (q: Question) => void, size: () => number): number {
  let quiet = 0;
  let seed = 0;
  while (quiet < QUIET && seed < MAX_SEEDS) {
    seed++;
    const before = size();
    for (const level of a.levels ? ([1, 2, 3] as const) : ([1] as const)) {
      let qs: Question[] = [];
      try {
        qs = a.make({ seed: seed * 7919 + level, count: a.count, level, allowFewer: true });
      } catch {
        continue;
      }
      qs.forEach(onQuestion);
    }
    quiet = size() === before ? quiet + 1 : 0;
  }
  return seed;
}

test('盤點 A 期預錄語音', { timeout: 30 * 60_000 }, () => {
  // ---------- 介面固定句子 ----------
  addSpoken(LINES.WELCOME_LINE, 'zh-TW', 'ui:welcome');
  LINES.PRAISE.forEach((t) => addSpoken(t, 'zh-TW', 'ui:praise'));
  addSpoken(LINES.RETRY_LINE, 'zh-TW', 'ui:retry');
  LINES.RESULT_MESSAGES.filter(Boolean).forEach((t) => addSpoken(t, 'zh-TW', 'ui:result'));
  addSpoken(LINES.RESULT_DONE, 'zh-TW', 'ui:result');
  addSpoken(LINES.REST_LINE, 'zh-TW', 'ui:rest');
  LINES.TEACHER_TIPS.forEach((t) => addSpoken(t, 'zh-TW', 'ui:teacher'));
  // 百寶屋買到道具（獎章專屬道具不能買，不用預錄）
  ITEMS.filter((i) => i.price !== undefined).forEach((i) => addSpoken(LINES.boughtLine(i.name), 'zh-TW', 'ui:shop'));
  ANIMALS.forEach((a) => addSpoken(a.name, 'zh-TW', 'ui:animal'));
  // 公頻短句盤：點了先唸出來（只有表情的句子清掉後是空的，不會列入）
  LINES.CHAT_PHRASES.forEach((p) => addSpoken(p.text, 'zh-TW', 'ui:chat'));
  // 獎章簿點獎章唸名稱；結算畫面唸「得到新獎章：○○！」
  BADGES.forEach((b) => {
    addSpoken(b.name, 'zh-TW', 'ui:badge');
    addSpoken(LINES.newBadgeLine(b.name), 'zh-TW', 'ui:badge');
  });
  // 送禮物：固定提示；貼紙簿點貼紙唸名稱（卡片上有暱稱的句子用裝置語音，不收）
  Object.values(LINES.GIFT_LINES).forEach((t) => addSpoken(t, 'zh-TW', 'ui:gift'));
  STICKERS.forEach((st) => addSpoken(giftName(st.id), 'zh-TW', 'ui:gift'));
  ZONES.forEach((z) => addSpoken(z.intro, 'zh-TW', 'ui:zone'));
  Object.values(LINES.PUZZLE_LINES).forEach((t) => addSpoken(t, 'zh-TW', 'ui:puzzle'));
  PUZZLE_GAMES.forEach((g) => addSpoken(g.title, 'zh-TW', 'ui:puzzle'));
  // 選單上的活動名稱（含三家版本的課本單元與期中期末模擬）
  const menu: ActivityDef[] = [...ALL_ACTIVITIES];
  for (const e of BUILT_IN_EDITIONS) for (const v of e.volumes) menu.push(...unitActivities(e, v), ...examActivities(e, v));
  menu.forEach((a) => addSpoken(a.title, 'zh-TW', 'ui:menu'));
  const uiCount = items.size;

  // ---------- 生活與健康、英語的題目 ----------
  const report: string[] = [];
  for (const a of ALL_ACTIVITIES.filter((x) => x.subject === 'life' || x.subject === 'en')) {
    const seeds = harvest(a, (q) => speechOfQuestion(q).forEach((s) => addSpoken(s.text, s.lang, a.id)), () => items.size);
    report.push(`${a.id}：${seeds} 個種子`);
  }

  // ---------- 注音符號與注音描寫題的固定指示句 ----------
  ZHUYIN_SYMBOLS.forEach((s) => addSpoken(`${s}。`, 'zh-TW', 'zhuyin:symbol'));
  // 指示句裡有的含例字（動態，B 期才預錄）。固定句型會出現在幾乎所有符號的題目裡，含例字的句子最多出現在
  // 例字含有的幾個符號（例如「介」含 ㄐㄧㄝ），所以只收出現在至少 TEMPLATE_MIN 個不同符號題目的句子
  const zw = ALL_ACTIVITIES.find((x) => x.id === ZH_CHARS_IDS.zhuyinWrite);
  if (!zw) throw new Error('找不到注音描寫活動');
  const targets = new Map<string, Set<string>>();
  let seen = 0;
  harvest(
    zw,
    (q) => {
      if (q.type !== 'write') return;
      const s = questionSpeech(q);
      for (const sentence of splitSentences(cleanForSpeech(s.text))) {
        if (isSymbolSentence(sentence)) continue;
        const set = targets.get(sentence) ?? new Set<string>();
        if (!set.has(q.target)) seen++;
        set.add(q.target);
        targets.set(sentence, set);
      }
    },
    () => seen,
  );
  for (const [sentence, set] of targets) if (set.size >= TEMPLATE_MIN) addSpoken(sentence, 'zh-TW', ZH_CHARS_IDS.zhuyinWrite);

  // ---------- 輸出 ----------
  const list = [...items.values()].sort((a, b) => (a.voice === b.voice ? a.key.localeCompare(b.key) : a.voice.localeCompare(b.voice)));
  const counts = { 介面: uiCount, 全部: list.length, zh: 0, en: 0, zhuyin: 0 } as Record<string, number>;
  for (const it of list) counts[it.voice]++;
  const chars = list.reduce((n, it) => n + it.text.length, 0);
  mkdirSync('data-src/voice', { recursive: true });
  writeFileSync(
    'data-src/voice/inventory.json',
    JSON.stringify({ _說明: '預錄語音 A 期的句子清單（scripts/voice/collect.test.ts 產生，勿手改）', counts, chars, items: list }, null, 1) + '\n',
  );
  process.stdout.write(`${report.join('\n')}\n共 ${list.length} 句（${JSON.stringify(counts)}），${chars} 字\n`);
});
