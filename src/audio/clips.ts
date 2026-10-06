/**
 * 預錄語音的查詢規則（純函式，不碰瀏覽器 API）。
 * 對照表 public/audio/voice/manifest.json 由 scripts/voice/generate.mjs 產生，鍵是「語言|句子」，
 * 句子是 speech.ts 對朗讀文字做 cleanForSpeech + splitSentences 之後的結果。
 */
import type { SpeakLang } from '../core/types';

/** 對照表格式版本（產生腳本與執行端要一致） */
export const MANIFEST_VERSION = 1;

/** 一個預錄音檔：f 是檔名（在 audio/voice/ 底下），v 是 voices 陣列的索引（記錄是哪個聲音產生的） */
export interface ClipEntry {
  f: string;
  v: number;
}

/** 預錄語音對照表 */
export interface ClipManifest {
  version: number;
  /** 產生各音檔的聲音（引擎、模型、聲音、語速），方便日後追查與重產 */
  voices?: { id: string; engine: string; model?: string; voice: string; speed: number }[];
  clips: Record<string, ClipEntry>;
}

/** 只有一個注音符號（ㄅ～ㄩ），可以帶一個句末標點 */
const SYMBOL_SENTENCE = /^[ㄅ-ㄩ][。！？!?.]?$/u;

/** 這一句是不是只有一個注音符號（例如注音描寫題開頭的「ㄅ。」） */
export function isSymbolSentence(sentence: string): boolean {
  return SYMBOL_SENTENCE.test(sentence.trim());
}

/** 對照表的鍵：注音符號一律用 zh-TW 加不帶標點的符號，其他句子是「語言|句子」 */
export function clipKey(lang: SpeakLang, sentence: string): string {
  const s = sentence.trim();
  if (isSymbolSentence(s)) return `zh-TW|${s[0]}`;
  return `${lang}|${s}`;
}

/** 每一句都有音檔時依序回傳檔名；缺任何一句（或沒有句子）回傳 null，整段改用裝置語音 */
export function clipsFor(manifest: ClipManifest, parts: readonly string[], lang: SpeakLang): string[] | null {
  if (!parts.length) return null;
  const files: string[] = [];
  for (const part of parts) {
    const entry = manifest.clips[clipKey(lang, part)];
    if (!entry) return null;
    files.push(entry.f);
  }
  return files;
}

/**
 * 裝置語音的同音字替代：只影響改用裝置語音時唸的文字（查預錄對照表仍用原句；預錄音檔的讀音修正在 scripts/voice/rules.mjs）。
 * - 乘以 → 成以：Windows 內建的 Microsoft Hanhan 把「乘以」唸成 ㄕㄥˋ 以（2026-10-06 合成後用 Whisper 聽寫確認）；
 *   Edge 的自然語音、Chrome 的 Google 國語本來就唸對，寫成「成以」五種聲音都唸 ㄔㄥˊ 以。「乘法」「乘客」Hanhan 唸對，不替代。
 */
export const TTS_SUBSTITUTE: readonly (readonly [string, string])[] = [['乘以', '成以']];

/** 改用裝置語音時要唸的句子：略過只有注音符號的句子（裝置語音唸不準單獨的注音），並套用裝置語音的同音字替代 */
export function ttsParts(parts: readonly string[]): string[] {
  return parts.filter((p) => !isSymbolSentence(p)).map((p) => TTS_SUBSTITUTE.reduce((s, [word, sub]) => s.split(word).join(sub), p));
}

/** 解析對照表；不是 JSON、版本不對或格式錯誤時回傳 null（執行端就全部用裝置語音） */
export function parseManifest(raw: string): ClipManifest | null {
  try {
    const data = JSON.parse(raw) as ClipManifest;
    if (!data || data.version !== MANIFEST_VERSION || typeof data.clips !== 'object' || data.clips === null) return null;
    for (const entry of Object.values(data.clips)) if (!entry || typeof entry.f !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}
