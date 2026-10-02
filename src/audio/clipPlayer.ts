/**
 * 預錄語音播放（Web Audio）：載入對照表、下載並解碼音檔、依序播放。
 * 用和音效相同的 AudioContext（sharedAudio），使用者第一次點擊時已解鎖，之後不必在點擊當下也能播放（iPad 也一樣）。
 * 任何一步失敗（音訊未解鎖、下載或解碼失敗）都回報 failed，由 speech.ts 改用裝置語音。
 */
import { sharedAudio } from './sfx';
import { parseManifest, type ClipManifest } from './clips';

/** 音檔與對照表所在的資料夾（相對路徑，部署在子路徑也能用） */
const BASE = `${import.meta.env.BASE_URL}audio/voice/`;

/** 對照表（只載入一次；失敗時為 null，朗讀全部用裝置語音） */
let manifestPromise: Promise<ClipManifest | null> | null = null;

/** 載入對照表；模組載入時就開始下載，第一次朗讀（標題畫面的歡迎詞）才不會因為還沒載完而用裝置語音 */
export function loadManifest(): Promise<ClipManifest | null> {
  if (!manifestPromise) {
    manifestPromise =
      typeof fetch === 'undefined'
        ? Promise.resolve(null)
        : fetch(`${BASE}manifest.json`)
            .then((r) => (r.ok ? r.text() : null))
            .then((t) => (t ? parseManifest(t) : null))
            .catch(() => null);
  }
  return manifestPromise;
}

/** 解碼後的音檔快取（最近用過的 CACHE_LIMIT 個；Map 的順序就是使用順序） */
const cache = new Map<string, Promise<AudioBuffer | null>>();
const CACHE_LIMIT = 120;

/** 取得解碼後的音檔；失敗時回傳 null 並從快取移除，下次可以重試 */
function buffer(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  const hit = cache.get(file);
  if (hit) {
    cache.delete(file);
    cache.set(file, hit);
    return hit;
  }
  const p = fetch(BASE + file)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((b) => ctx.decodeAudioData(b))
    .catch(() => null);
  cache.set(file, p);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  void p.then((b) => {
    if (!b) cache.delete(file);
  });
  return p;
}

/** 預先下載並解碼（例如題目的選項音檔，孩子點 🔊 時馬上有聲音） */
export function prefetchClips(files: readonly string[]): void {
  const ctx = sharedAudio();
  if (!ctx) return;
  for (const f of files) void buffer(ctx, f);
}

/** 正在播放的音檔，以及讓播放迴圈繼續的函式（停止時呼叫，避免迴圈卡住） */
let current: { src: AudioBufferSourceNode; done: () => void } | null = null;
/** 預錄語音的音量節點（不經過音效的主音量） */
let voiceGain: GainNode | null = null;

/** 停止正在播放的預錄語音 */
export function stopClips(): void {
  const c = current;
  current = null;
  if (!c) return;
  c.src.onended = null;
  try {
    c.src.stop();
  } catch {
    // 已經停止
  }
  c.done();
}

/** 播放的回呼：第一個音檔開始時、整段結束時（被新的朗讀打斷時不呼叫 onEnd，由新的朗讀接手配樂音量） */
export interface PlayHooks {
  onStart: () => void;
  onEnd: () => void;
}

/**
 * 依序播放音檔。isCurrent() 變成 false（有新的朗讀或停止）時中途結束。
 * 回傳 'played'（播完或被打斷）或 'failed'（還沒開始播就失敗，呼叫端改用裝置語音）。
 */
export async function playClips(files: readonly string[], isCurrent: () => boolean, hooks: PlayHooks): Promise<'played' | 'failed'> {
  const ctx = sharedAudio();
  if (!ctx || ctx.state !== 'running') return 'failed';
  const buffers = await Promise.all(files.map((f) => buffer(ctx, f)));
  if (!isCurrent()) return 'played';
  if (buffers.some((b) => !b)) return 'failed';
  if (!voiceGain) {
    voiceGain = ctx.createGain();
    voiceGain.gain.value = 1;
    voiceGain.connect(ctx.destination);
  }
  hooks.onStart();
  for (const b of buffers) {
    if (!isCurrent()) return 'played';
    await new Promise<void>((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(voiceGain!);
      const done = () => {
        if (current?.src === src) current = null;
        resolve();
      };
      src.onended = done;
      current = { src, done };
      src.start();
    });
  }
  if (isCurrent()) hooks.onEnd();
  return 'played';
}
