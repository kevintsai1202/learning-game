/**
 * 語音朗讀（Web Speech API）：題目、選項、鼓勵語都會唸出來，
 * 二年級的孩子不一定讀得懂所有字，聽得到才玩得下去。
 * 裝置沒有中文語音時靜默略過，畫面上的文字仍可閱讀。
 *
 * 聲音挑選（src/audio/voices.ts）：自然語音優先（Edge 的「Online (Natural)」、Chrome 的 Google 國語），
 * 連網語音失敗或離線時改用本機聲音；家長可以在設定裡指定聲音，選擇只存在這台裝置。
 *
 * 預錄語音（src/audio/clips.ts、clipPlayer.ts）：一段話的每一句都有音檔時播音檔，缺任何一句就整段用裝置語音，
 * 避免同一段話中途換聲音。家長可以在設定關掉「優先使用預錄語音」。
 */
import type { SpeakLang } from '../core/types';
import { duckMusic } from './music';
import { isBasicVoice, isFallbackError, orderVoices, pickVoice, splitSentences } from './voices';
import { clipsFor, ttsParts } from './clips';
import { loadManifest, playClips, prefetchClips, stopClips } from './clipPlayer';

/** 朗讀設定（由 App 依存檔設定同步）；clips＝優先使用預錄語音 */
const config = { enabled: true, rate: 0.9, clips: true };

/** 一次朗讀的紀錄（e2e 透過 window.__game.speech 讀取，確認用的是預錄語音還是裝置語音） */
export interface SpeechRecord {
  mode: 'clip' | 'tts';
  text: string;
  lang: SpeakLang;
  files?: string[];
}

/** 除錯用：最近的朗讀紀錄（最多 30 筆） */
export const speechDebug: { log: SpeechRecord[] } = { log: [] };

/** 記錄這次朗讀的方式 */
function record(r: SpeechRecord): void {
  speechDebug.log.push(r);
  if (speechDebug.log.length > 30) speechDebug.log.shift();
}

/** 最近一次朗讀的內容（給「再聽一次」按鈕） */
let lastSpoken: { text: string; lang: SpeakLang } | null = null;

/** 家長指定的聲音（依語言存 voiceId）；存在 localStorage 而不是存檔，因為每台裝置的聲音清單不同 */
const PREF_KEY = 'learning-island-voice-prefs';
let prefs: Partial<Record<SpeakLang, string>> = loadPrefs();

/** 連網語音最近一次失敗的時間；之後一段時間內只用本機聲音，避免每句都先卡住再改用本機聲音 */
let remoteFailedAt = 0;
/** 連網語音失敗後，多久再試一次 */
const REMOTE_RETRY_MS = 120_000;
/** 連網語音多久沒開始唸就當作失敗（有些瀏覽器離線時不觸發 onerror，只是沒有聲音） */
const REMOTE_START_TIMEOUT_MS = 4000;

/** 朗讀序號：每次新的朗讀（或停止）都會加一，被取消的舊 utterance 事件看到序號不同就忽略 */
let generation = 0;
/** 目前這次朗讀的 utterance；留住參考，避免 Chrome 在唸完前回收物件而收不到 onend */
let live: SpeechSynthesisUtterance[] = [];
/** 連網語音的開始逾時計時器 */
let startTimer: ReturnType<typeof setTimeout> | undefined;

/** 預設試聽句子 */
const SAMPLES: Record<SpeakLang, string> = {
  'zh-TW': '小朋友好！我們一起來學習吧。',
  'en-US': "Hello! Let's learn together.",
};

/** 讀取家長指定的聲音（讀不到時當作沒有指定） */
function loadPrefs(): Partial<Record<SpeakLang, string>> {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<SpeakLang, string>>) : {};
  } catch {
    return {};
  }
}

/** 這台裝置目前的聲音清單 */
function allVoices(): SpeechSynthesisVoice[] {
  return typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices();
}

/** 現在可不可以用連網語音：裝置在線上，而且最近沒有失敗過 */
function remoteAllowed(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return Date.now() - remoteFailedAt > REMOTE_RETRY_MS;
}

/** 依目前狀態挑聲音；preferred 為 null 表示自動 */
function chooseVoice(lang: SpeakLang, preferred: string | null): SpeechSynthesisVoice | undefined {
  return pickVoice(allVoices(), lang, { allowRemote: remoteAllowed(), preferred });
}

/** 套用朗讀設定 */
export function configureSpeech(opts: { enabled: boolean; rate: number; clips?: boolean }): void {
  config.enabled = opts.enabled;
  config.rate = opts.rate;
  config.clips = opts.clips ?? true;
  if (!opts.enabled) stopSpeaking();
}

/**
 * 去掉 emoji 與不該唸出來的符號（例如「○」「?」）。
 * 數字鍵帽（1️⃣）要先轉成數字本身：組合字元 U+20E3 留著的話，語音合成會亂唸（實測產生 50 秒以上的音檔）。
 * 破折號（A – a）改成頓號，唸成短暫停頓。
 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/([0-9#*])️?⃣/g, '$1')
    .replace(/⃣/g, '')
    .replace(/\s*[–—]\s*/g, '、')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[️‍]/g, '')
    .replace(/[○□]/g, '空格')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 朗讀一段文字；會先停掉正在唸的內容 */
export function speak(text: string, lang: SpeakLang = 'zh-TW'): void {
  lastSpoken = { text, lang };
  if (!config.enabled) return;
  say(text, lang, prefs[lang] ?? null, config.clips);
}

/**
 * 所有朗讀的共同入口：先依句子切開，每一句都有預錄音檔就播音檔；
 * 沒有對照表、缺任何一句、音訊還沒解鎖或下載失敗時，整段改用裝置語音（一句一個 utterance）。
 * 對照表還在下載時會等它載完（標題畫面的歡迎詞是第一句），等待期間有新的朗讀就放棄這一次。
 */
function say(text: string, lang: SpeakLang, preferred: string | null, useClips: boolean): void {
  const parts = splitSentences(cleanForSpeech(text));
  if (!parts.length) return;
  restart();
  const gen = generation;
  const isCurrent = () => gen === generation;
  if (!useClips) return speakTts(parts, lang, preferred, gen, text);
  void loadManifest().then(async (manifest) => {
    if (!isCurrent()) return;
    const files = manifest ? clipsFor(manifest, parts, lang) : null;
    if (files) {
      record({ mode: 'clip', text, lang, files });
      const result = await playClips(files, isCurrent, { onStart: () => duckMusic(true), onEnd: () => duckMusic(false) });
      if (result === 'played' || !isCurrent()) return;
    }
    speakTts(parts, lang, preferred, gen, text);
  });
}

/** 用裝置語音唸（略過只有注音符號的句子，裝置語音唸不準單獨的注音） */
function speakTts(parts: string[], lang: SpeakLang, preferred: string | null, gen: number, text: string): void {
  record({ mode: 'tts', text, lang });
  if (typeof speechSynthesis === 'undefined') return;
  const tts = ttsParts(parts);
  if (tts.length) speakParts(tts, 0, lang, preferred, gen);
}

/** 停掉正在唸的內容（預錄語音與裝置語音）並開始新的一次朗讀序號 */
function restart(): void {
  generation++;
  clearTimeout(startTimer);
  live = [];
  stopClips();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/** 從第 from 句開始排入朗讀佇列；連網語音失敗時改用本機聲音，從失敗的那一句重唸 */
function speakParts(parts: string[], from: number, lang: SpeakLang, preferred: string | null, gen: number): void {
  const voice = chooseVoice(lang, preferred);
  const remote = !!voice && !voice.localService;

  /** 改用本機聲音重唸（只有連網語音才會走到這裡，本機聲音失敗不再重試，避免無限循環） */
  const fallback = (at: number) => {
    remoteFailedAt = Date.now();
    restart();
    speakParts(parts, at, lang, preferred, generation);
  };

  parts.slice(from).forEach((part, k) => {
    const i = from + k;
    const u = new SpeechSynthesisUtterance(part);
    u.lang = lang;
    u.rate = lang === 'en-US' ? Math.min(config.rate, 0.85) : config.rate;
    u.pitch = 1.05;
    if (voice) u.voice = voice;
    u.onstart = () => {
      if (gen !== generation) return;
      if (i === from) {
        clearTimeout(startTimer);
        // 朗讀時壓低配樂，最後一句唸完才恢復（每句都切換的話配樂會忽大忽小）
        duckMusic(true);
      }
    };
    u.onend = () => {
      if (gen === generation && i === parts.length - 1) duckMusic(false);
    };
    u.onerror = (e) => {
      if (gen !== generation) return;
      if (remote && isFallbackError(e.error)) return fallback(i);
      duckMusic(false);
    };
    live.push(u);
    speechSynthesis.speak(u);
  });

  // 連網語音一直沒開始唸（離線時可能不會觸發 onerror），就改用本機聲音
  if (remote) startTimer = setTimeout(() => gen === generation && fallback(from), REMOTE_START_TIMEOUT_MS);
}

/** 再唸一次最近的內容 */
export function repeatSpeech(): void {
  if (lastSpoken) speak(lastSpoken.text, lastSpoken.lang);
}

/** 停止朗讀 */
export function stopSpeaking(): void {
  restart();
  duckMusic(false);
}

/** 預先下載並解碼一批朗讀內容的預錄音檔（題目出現時先載選項的音檔，點 🔊 才不會延遲） */
export function prefetchSpeech(items: readonly { text: string; lang: SpeakLang }[]): void {
  if (!config.enabled || !config.clips) return;
  void loadManifest().then((manifest) => {
    if (!manifest) return;
    for (const it of items) {
      const files = clipsFor(manifest, splitSentences(cleanForSpeech(it.text)), it.lang);
      if (files) prefetchClips(files);
    }
  });
}

/** 瀏覽器有沒有指定語言的聲音（設定頁提示用） */
export function hasVoice(lang: SpeakLang): boolean {
  return !!chooseVoice(lang, null);
}

/** 家長選單用：這台裝置上某語言可用的聲音（最好的在前面，連網語音也列出） */
export function listVoices(lang: SpeakLang): SpeechSynthesisVoice[] {
  return orderVoices(allVoices(), lang, { allowRemote: true });
}

/** 現在朗讀會用的聲音（含家長指定與失敗退回本機的情況） */
export function currentVoice(lang: SpeakLang): SpeechSynthesisVoice | undefined {
  return chooseVoice(lang, prefs[lang] ?? null);
}

/** 自動挑選時最好的聲音是不是基本語音（是的話設定頁提示改用 Edge 或 Chrome） */
export function onlyBasicVoice(lang: SpeakLang): boolean {
  const best = pickVoice(allVoices(), lang, { allowRemote: true });
  return !best || isBasicVoice(best);
}

/** 家長指定的聲音 id；null 表示自動 */
export function getVoicePref(lang: SpeakLang): string | null {
  return prefs[lang] ?? null;
}

/** 設定家長指定的聲音（null 表示改回自動），存在這台裝置 */
export function setVoicePref(lang: SpeakLang, id: string | null): void {
  const next = { ...prefs };
  if (id) next[lang] = id;
  else delete next[lang];
  prefs = next;
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // 私密瀏覽或儲存空間被封鎖：這次開啟期間仍有效，只是不會記住
  }
}

/** 試聽：用指定的聲音（null＝自動）唸一句範例；家長按的，所以朗讀關閉時也會唸 */
export function previewVoice(lang: SpeakLang, id: string | null): void {
  // 試聽是為了挑裝置語音，所以不用預錄語音
  say(SAMPLES[lang], lang, id, false);
}

/** 聲音清單變動時通知（Chrome 系列是非同步載入）；回傳取消訂閱的函式 */
export function onVoicesChanged(cb: () => void): () => void {
  if (typeof speechSynthesis === 'undefined' || !speechSynthesis.addEventListener) return () => {};
  speechSynthesis.addEventListener('voiceschanged', cb);
  return () => speechSynthesis.removeEventListener('voiceschanged', cb);
}

// 部分瀏覽器的聲音清單是非同步載入的，先觸發一次
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices());
}
// 網路恢復時，連網語音可以再試；瀏覽器裡一載入就開始下載預錄語音對照表
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (remoteFailedAt = 0));
  void loadManifest();
}
