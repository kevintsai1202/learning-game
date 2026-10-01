/**
 * 語音朗讀（Web Speech API）：題目、選項、鼓勵語都會唸出來，
 * 二年級的孩子不一定讀得懂所有字，聽得到才玩得下去。
 * 裝置沒有中文語音時靜默略過，畫面上的文字仍可閱讀。
 */
import type { SpeakLang } from '../core/types';
import { duckMusic } from './music';

/** 朗讀設定（由 App 依存檔設定同步） */
const config = { enabled: true, rate: 0.9 };

/** 最近一次朗讀的內容（給「再聽一次」按鈕） */
let lastSpoken: { text: string; lang: SpeakLang } | null = null;

/** 依語言挑選最合適的聲音：zh-TW 優先，其次 zh-* */
function pickVoice(lang: SpeakLang): SpeechSynthesisVoice | undefined {
  if (typeof speechSynthesis === 'undefined') return undefined;
  const voices = speechSynthesis.getVoices();
  const exact = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  if (exact.length) {
    // 微軟的 Hanhan/Yating 與 Google 國語（臺灣）都比較清楚，優先選本機（離線也能用）的聲音
    return exact.find((v) => v.localService) ?? exact[0];
  }
  const prefix = lang.slice(0, 2).toLowerCase();
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
}

/** 套用朗讀設定 */
export function configureSpeech(opts: { enabled: boolean; rate: number }): void {
  config.enabled = opts.enabled;
  config.rate = opts.rate;
  if (!opts.enabled) stopSpeaking();
}

/** 去掉 emoji 與不該唸出來的符號（例如「○」「?」） */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[️‍]/g, '')
    .replace(/[○□]/g, '空格')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 朗讀一段文字；會先停掉正在唸的內容 */
export function speak(text: string, lang: SpeakLang = 'zh-TW'): void {
  lastSpoken = { text, lang };
  if (!config.enabled || typeof speechSynthesis === 'undefined') return;
  const cleaned = cleanForSpeech(text);
  if (!cleaned) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleaned);
  u.lang = lang;
  u.rate = lang === 'en-US' ? Math.min(config.rate, 0.85) : config.rate;
  u.pitch = 1.05;
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  // 朗讀時壓低配樂，唸完恢復
  u.onstart = () => duckMusic(true);
  u.onend = () => duckMusic(false);
  u.onerror = () => duckMusic(false);
  speechSynthesis.speak(u);
}

/** 再唸一次最近的內容 */
export function repeatSpeech(): void {
  if (lastSpoken) speak(lastSpoken.text, lastSpoken.lang);
}

/** 停止朗讀 */
export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/** 瀏覽器有沒有指定語言的聲音（設定頁提示用） */
export function hasVoice(lang: SpeakLang): boolean {
  return !!pickVoice(lang);
}

// 部分瀏覽器的聲音清單是非同步載入的，先觸發一次
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices());
}
