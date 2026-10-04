/**
 * 預錄語音的聲音設定與讀音規則：generate.mjs（產生）與 adopt.mjs（把試聽核可的版本設成正式音檔）共用，
 * 兩邊算出的合成文字與檔名一定相同。改了這裡的規則，重跑 generate.mjs 只會重做受影響的句子。
 */
import { hash } from './lib.mjs';

const SHIHAN = '91ec588cf8ef443a9c0d5b21d0c1fa36';
/** 各類句子用的聲音（索引寫進對照表的 v 欄位） */
export const VOICES = [
  { id: 'fish-shihan-zh', engine: 'fish', model: 's2.1-pro-free', voice: SHIHAN, speed: 0.9 },
  { id: 'fish-shihan-en', engine: 'fish', model: 's2.1-pro-free', voice: SHIHAN, speed: 0.85 },
  { id: 'azure-hsiaochen-zhuyin', engine: 'azure', model: 'neural', voice: 'zh-TW-HsiaoChenNeural', speed: 0.7, tailPad: 0.25 },
];

const CJK = /[一-鿿]/;
const DIGIT_ZH = '零一二三四五六七八九';

/** 這一句用哪個聲音：注音符號用 Azure；含中文一律用中文語速（即使鍵是 en-US） */
export function voiceIndex(item) {
  if (item.voice === 'zhuyin') return 2;
  if (CJK.test(item.text)) return 0;
  return item.voice === 'en' ? 1 : 0;
}

/** 緊急與服務電話：在台灣習慣逐字唸（一一九），不唸成一百一十九 */
const PHONE = /(?<!\d)(110|119|113|165|1999|1925|1957|1966|1995)(?!\d)/g;
/** 數字逐字轉國字（110 → 一一零） */
const digitsZh = (s) => [...s].map((d) => DIGIT_ZH[Number(d)]).join('');

/** 1～99 轉國字（序數用：2 → 二，不是兩） */
function numberZh(n) {
  if (n <= 10) return n === 10 ? '十' : DIGIT_ZH[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens === 1 ? '' : DIGIT_ZH[tens]}十${ones ? DIGIT_ZH[ones] : ''}`;
}

/*
 * 讀音修正（使用者試聽後指出唸錯的地方，2026-10-02；比較版本用 scripts/voice/variants.mjs 產生、由使用者挑選）。
 * 經驗：Fish 的讀音標記（<|phoneme_start|>拼音聲調<|phoneme_end|>，標記取代字本身）會在字和字之間造成停頓，
 * 也會蓋掉模型原本的變調（例如「雨傘」的雨要唸二聲，全部標成三聲就錯了）。所以：
 * 能用同音字就用同音字（SUBSTITUTE）；讀音標記只用在使用者聽過沒問題的詞（PRONOUNCE）或指定句子（SENTENCE_FIXES），不要整個字全部套用。
 */
export const phonemeTag = (py) => `<|phoneme_start|>${py}<|phoneme_end|>`;

/** 同音字替代（全部句子）：垃圾用台灣讀音 ㄌㄜˋ ㄙㄜˋ；數數看的兩個數都是動詞 ㄕㄨˇ（使用者 2026-10-04 試聽後選「鼠鼠看」） */
export const SUBSTITUTE = [
  ['垃圾', '樂色'],
  ['數數看', '鼠鼠看'],
];

/** 讀音標記（全部句子） */
export const PRONOUNCE = [['餅乾', ['bing3', 'gan1']]];

/** 指定句子的修正（比對整句，含「正確答案是：」那一句） */
export const SENTENCE_FIXES = [
  // 單獨的「雨」要唸三聲（在詞裡交給模型變調）
  { match: /^(正確答案是：)?雨$/, fix: (s) => s.replace('雨', phonemeTag('yu3')) },
  // 「太陽」的陽要唸二聲
  { match: /下過雨又出太陽$/, fix: (s) => s.replace(/太陽$/, `太${phonemeTag('yang2')}`) },
  // 「雨」接「用」時雨會被唸成二聲，引號後加逗號（使用者比較後選的寫法）
  { match: /^「雨」用英文怎麼說？$/, fix: (s) => s.replace('」用', '」，用') },
  // 靴要唸 ㄒㄩㄝ
  { match: /^(正確答案是：)?雨靴$/, fix: (s) => s.replace('靴', phonemeTag('xue1')) },
  // 鯨要唸 ㄐㄧㄥ（後鼻音）：Whisper 抽查聽成「金魚」，使用者試聽後選了兩個字都標記的版本（2026-10-03）
  { match: /^鯨魚貼紙$/, fix: (s) => s.replace('鯨魚', `${phonemeTag('jing1')}${phonemeTag('yu2')}`) },
];

/**
 * 實際送去合成的文字（含中文的句子，包括鍵是 en-US 的中文題目）：
 * - 序數「第 N」改成國字：Whisper 抽查發現「第 2 課」會被唸成「第兩課」
 * - 緊急與服務電話、只有數字的短句（電話選項 123、000）改成逐字國字
 * - 引號裡的詞以「的」結尾、後面又接「的」（「下雨的」的英文…）：引號後加逗號，兩個「的」才不會連在一起
 * - 指定句子的修正、同音字替代、讀音標記
 * 注音符號（Azure）不經過這裡的修正。
 */
export function synthText(item) {
  if (item.voice === 'zhuyin') return item.text;
  if (item.lang === 'zh-TW' && /^\d{2,4}$/.test(item.text)) return digitsZh(item.text);
  if (!CJK.test(item.text)) return item.text;
  let t = item.text.replace(/第\s*(\d{1,2})(?!\d)\s*/g, (_, n) => `第${numberZh(Number(n))}`).replace(PHONE, (m) => digitsZh(m));
  t = t.replace(/的」的/g, '的」，的');
  for (const f of SENTENCE_FIXES) if (f.match.test(t)) t = f.fix(t);
  for (const [word, sub] of SUBSTITUTE) t = t.split(word).join(sub);
  for (const [word, pys] of PRONOUNCE) t = t.split(word).join(pys.map(phonemeTag).join(''));
  return t;
}

/** 正式音檔的檔名：「引擎｜模型｜聲音｜語速｜語言｜合成文字」的雜湊（public/audio/voice/ 與原始檔 data-src/raw/voice-gen/ 同名） */
export function clipName(item) {
  const v = VOICES[voiceIndex(item)];
  return `${hash(`${v.engine}|${v.model}|${v.voice}|${v.speed}|${item.lang}|${synthText(item)}`, 16)}.mp3`;
}
