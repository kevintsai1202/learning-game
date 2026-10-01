/**
 * 挑選朗讀聲音的純函式（不碰瀏覽器 API，方便單元測試）。
 *
 * 排序原則：
 * 1. 語系是硬條件：台灣國語一律排在其他地區的中文前面（注音例字、破音字都依台灣讀音）。
 * 2. 同語系內依音質：自然／神經語音 > Apple 高品質 > Apple 增強 > 雲端語音（如 Google 國語）> 本機一般語音 > 舊版桌面語音。
 * 3. 離線或連網語音失敗過時，只用本機聲音。
 */

/** 聲音的最小欄位（相容 SpeechSynthesisVoice，測試可用一般物件） */
export interface VoiceLike {
  name: string;
  lang: string;
  /** true＝裝置本機合成；false＝要連網（Edge 線上自然語音、Chrome 的 Google 語音） */
  localService: boolean;
  voiceURI?: string;
}

/** 挑選條件 */
export interface PickOptions {
  /** 可以用連網語音（裝置在線上，且這次沒有失敗過） */
  allowRemote: boolean;
  /** 家長在設定裡選的聲音 id（voiceURI，沒有時是 name） */
  preferred?: string | null;
}

/** Windows 舊版桌面語音（SAPI）：發音最機械，排在其他本機語音後面 */
const SAPI_DESKTOP = /^Microsoft (Hanhan|Yating|Zhiwei|Huihui|Yaoyao|Kangkang|Tracy|Danny|David|Zira|Mark|Hazel|George|Susan)\b/i;

/** 語系代碼正規化：小寫、底線改連字號，台灣中文的各種寫法統一成 zh-tw */
export function normLang(lang: string): string {
  const l = lang.replace(/_/g, '-').toLowerCase();
  if (/^(zh|cmn)(-hant)?-tw$/.test(l)) return 'zh-tw';
  return l;
}

/** 主要語言（cmn 視同 zh） */
function primary(lang: string): string {
  const p = normLang(lang).split('-')[0];
  return p === 'cmn' ? 'zh' : p;
}

/** 語系分數：完全相同 2、同一種語言 1、不同語言 0（不採用） */
function localeTier(voiceLang: string, lang: string): number {
  if (normLang(voiceLang) === normLang(lang)) return 2;
  if (primary(voiceLang) === primary(lang)) return 1;
  return 0;
}

/** 音質分數（同語系內比較用） */
function quality(v: VoiceLike): number {
  const id = `${v.name} ${v.voiceURI ?? ''}`;
  if (/natural|neural/i.test(id)) return 50;
  if (/premium/i.test(id)) return 45;
  if (/enhanced/i.test(id)) return 40;
  if (!v.localService) return 30;
  if (SAPI_DESKTOP.test(v.name)) return 5;
  return 10;
}

/** 聲音的識別碼：存設定、比對家長選擇都用它 */
export function voiceId(v: VoiceLike): string {
  return v.voiceURI || v.name;
}

/** 是不是「基本語音」（本機一般或舊版桌面語音，聽起來比較機械） */
export function isBasicVoice(v: VoiceLike): boolean {
  return quality(v) <= 10;
}

/** 是不是自然／神經語音 */
export function isNaturalVoice(v: VoiceLike): boolean {
  return quality(v) >= 40;
}

/** 家長選單上顯示的標籤 */
export function voiceTag(v: VoiceLike): string {
  if (isNaturalVoice(v)) return v.localService ? '自然語音' : '自然語音・需連網';
  if (!v.localService) return '需連網';
  return '基本語音';
}

/** 依語系與音質排序可用的聲音（最好的在前面）；不改動傳入的陣列 */
export function orderVoices<T extends VoiceLike>(voices: readonly T[], lang: string, opts: Pick<PickOptions, 'allowRemote'>): T[] {
  return voices
    .map((v) => ({ v, tier: localeTier(v.lang, lang) }))
    .filter(({ v, tier }) => tier > 0 && (opts.allowRemote || v.localService))
    .map(({ v, tier }) => ({ v, score: tier * 100 + quality(v) }))
    .sort((a, b) => b.score - a.score)
    .map(({ v }) => v);
}

/** 挑一個聲音：家長選的（這台裝置有、而且現在能用）優先，否則用排序第一的 */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: string, opts: PickOptions): T | undefined {
  const ordered = orderVoices(voices, lang, opts);
  if (opts.preferred) {
    const chosen = ordered.find((v) => voiceId(v) === opts.preferred || v.name === opts.preferred);
    if (chosen) return chosen;
  }
  return ordered[0];
}

/**
 * 朗讀錯誤要不要改用本機聲音重唸。
 * interrupted／canceled 是被下一句打斷（每次朗讀前都會 cancel），not-allowed 是瀏覽器的自動播放限制，
 * 這些都不是聲音本身的問題；把它們當成失敗的話，孩子連點兩下就會整場退回機械聲。
 */
export function isFallbackError(code: string): boolean {
  return FALLBACK_ERRORS.has(code);
}

const FALLBACK_ERRORS = new Set(['network', 'synthesis-failed', 'synthesis-unavailable', 'voice-unavailable', 'language-unavailable']);

/** 句末標點後面可以接的結尾引號、括號 */
const CLOSERS = '」』）)"\'】》';

/** 英文稱謂縮寫：後面的句點不是句子結尾（例如 Good morning, Ms. Wang.） */
const ABBREVIATION = /\b(Mr|Mrs|Ms|Dr)$/;

/**
 * 依句子切開長文字，一句一個 utterance：句間停頓比較自然，也避開雲端語音唸太長會中斷的問題。
 * 中文句末「。！？」與半形「!?」直接切；半形句點只在後面接空白、而且不是稱謂縮寫時切（避免切到 3.5 這種小數或 Mr. Lee）。
 */
export function splitSentences(text: string): string[] {
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const before = cur;
    cur += ch;
    const end = '。！？!?'.includes(ch) || (ch === '.' && /\s/.test(text[i + 1] ?? '') && !ABBREVIATION.test(before));
    if (!end) continue;
    while (i + 1 < text.length && CLOSERS.includes(text[i + 1])) cur += text[++i];
    parts.push(cur);
    cur = '';
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}
