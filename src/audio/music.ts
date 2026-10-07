/**
 * 背景配樂：播放 public/audio/music/ 下的 CC0 音樂檔（授權見同資料夾 CREDITS.md）。
 * - 依畫面切換曲目，交叉淡入淡出
 * - 語音朗讀時自動壓低音量（ducking），唸完再恢復
 * - 音樂經過 Web Audio 的 GainNode，iOS Safari 才能調整音量（iOS 不理會 audio.volume）
 * - 檔案不存在或載入失敗時靜默略過，遊戲照常進行
 */
import { sharedAudio } from './sfx';

/** 曲目：home 是有班級的孩子在自己的島（L5，和班級島的 island 分得出來） */
export type Track = 'island' | 'home' | 'quiz' | 'result' | 'shop';

/** 各曲目的基本音量（0～1）：答題時壓低，避免蓋過朗讀 */
const BASE_VOLUME: Record<Track, number> = { island: 0.32, home: 0.32, quiz: 0.16, result: 0.45, shop: 0.28 };
/** 只播一次的曲目 */
const ONE_SHOT: Track[] = ['result'];
/** 朗讀時音量剩幾成 */
const DUCK_RATIO = 0.3;
const FADE_OUT = 0.6;
const FADE_IN = 1.0;

interface Channel {
  track: Track;
  el: HTMLAudioElement;
  gain: GainNode;
}

let enabled = true;
let current: Channel | null = null;
let wanted: Track | null = null;
let ducked = false;
/** 載入失敗過的曲目（不再重試） */
const missing = new Set<Track>();
/** 曲目缺檔時改用的曲目（答題缺檔就保持安靜，避免干擾） */
const FALLBACK: Partial<Record<Track, Track>> = { shop: 'island', home: 'island' };

/** 把想播的曲目換成實際可播的曲目 */
function resolve(t: Track | null): Track | null {
  if (!t || !missing.has(t)) return t;
  const f = FALLBACK[t];
  return f && !missing.has(f) ? f : null;
}

/** 曲目網址（相對 base，部署在子路徑也能用） */
const urlOf = (t: Track) => `${import.meta.env.BASE_URL}audio/music/${t}.mp3`;

/** 目前應有的音量 */
function targetVolume(t: Track): number {
  return BASE_VOLUME[t] * (ducked ? DUCK_RATIO : 1);
}

/** 平滑調整音量 */
function rampTo(gain: GainNode, value: number, seconds: number): void {
  const ctx = gain.context;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(value, now + seconds);
}

/** 淡出並停止一個聲道 */
function stopChannel(ch: Channel): void {
  rampTo(ch.gain, 0, FADE_OUT);
  setTimeout(() => {
    ch.el.pause();
    ch.el.removeAttribute('src');
    ch.el.load();
    ch.gain.disconnect();
  }, FADE_OUT * 1000 + 100);
}

/** 建立並開始播放一個聲道；失敗回傳 null */
function startChannel(t: Track): Channel | null {
  const ctx = sharedAudio();
  if (!ctx || missing.has(t)) return null;
  const el = new Audio();
  el.src = urlOf(t);
  el.loop = !ONE_SHOT.includes(t);
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  const gain = ctx.createGain();
  gain.gain.value = 0;
  try {
    ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);
  } catch {
    return null;
  }
  el.addEventListener('error', () => {
    missing.add(t);
    if (current?.el === el) {
      current = null;
      apply();
    }
  });
  const ch: Channel = { track: t, el, gain };
  void el
    .play()
    .then(() => rampTo(gain, targetVolume(t), FADE_IN))
    .catch(() => {
      // 還沒有使用者手勢（自動播放限制）：等下一次 ensurePlaying 再試
      if (current === ch) current = null;
    });
  return ch;
}

/** 依目前狀態決定要不要換曲 */
function apply(): void {
  const t = enabled && document.visibilityState === 'visible' ? resolve(wanted) : null;
  if (current && current.track === t) return;
  if (current) {
    stopChannel(current);
    current = null;
  }
  if (t) current = startChannel(t);
}

/** 除錯用（e2e 透過 window.__game.music 讀）：現在想播的曲目，與實際在播的曲目（還沒有使用者手勢或缺檔時是 null） */
export const musicDebug = {
  get wanted(): Track | null {
    return wanted;
  },
  get playing(): Track | null {
    return current?.track ?? null;
  },
};

/** 切換到指定曲目（null 表示安靜） */
export function playMusic(t: Track | null): void {
  wanted = t;
  apply();
}

/** 設定開關 */
export function setMusicEnabled(on: boolean): void {
  enabled = on;
  apply();
}

/** 朗讀開始／結束時呼叫，壓低或恢復音量 */
export function duckMusic(on: boolean): void {
  ducked = on;
  if (current) rampTo(current.gain, targetVolume(current.track), on ? 0.25 : 0.8);
}

/** 使用者點擊後（解除自動播放限制）若應該有音樂卻沒在播，就重試 */
export function ensurePlaying(): void {
  if (!current) apply();
}

if (typeof document !== 'undefined') {
  // 切到背景分頁時停止，回來再播
  document.addEventListener('visibilitychange', apply);
}
