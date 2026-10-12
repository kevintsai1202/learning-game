/**
 * 班級島大型設施的音效播放（docs/plans/grand-rides.md 第 11 節）：真實錄音（public/audio/sfx/rides/，授權見 CREDITS.md）。
 * 什麼時候響、多大聲由 src/store/rideSound.ts 的 ridePlan 每一格算好，這裡只負責播：
 * - 循環的聲音（鏈條、滾動、風、螺旋槳、海浪）：一直在播，音量與速度有變才調，用 0.1 秒的直線過渡（直接改值會有喀喀聲）。
 *   每次調之前先清掉舊的排程（rampTo）：以前每一格都加一筆 setTargetAtTime、從不清掉，一分鐘就累積上萬筆，
 *   音訊與畫面越跑越慢（2026-10-13 e2e 坐完旋轉木馬走不動才發現）。
 *   MP3 編碼前後會補一點靜音，循環時跳過頭尾的靜音（loopStart／loopEnd），接縫才不會頓一下。
 * - 一次的聲音（鈴、煞車、尖叫、喊聲、汽笛、噴火、海鷗）：每響一次開一個音源。
 * - 接在音效的主音量（src/audio/sfx.ts），設定關掉音效時全部靜音；分頁切到背景時循環的聲音降到 0（畫面不更新，不然會一直響）。
 * 只在班級島（GrandRidesLayer 掛上時 start、卸下時 stop）。音檔第一次用到才下載。
 */
import { sfxEnabled, sfxOutput, sharedAudio } from './sfx';
import { RIDE_LOOPS, RIDE_SHOTS, type RideLoop, type SoundPlan } from '../store/rideSound';

/** 循環聲音的整體音量、一次聲音的整體音量（和遊戲其他音效、配樂的相對大小） */
const LOOP_VOL = 0.9;
const SHOT_VOL = 1.0;

/** 下載並解碼好的音檔（名稱 → 音訊；下載中是 Promise） */
const buffers = new Map<string, AudioBuffer | Promise<AudioBuffer | null> | null>();
/** 正在播的循環聲音 */
const loops = new Map<RideLoop, { src: AudioBufferSourceNode; gain: GainNode; last: { gain: number; rate: number } }>();
let active = false;
/** 第幾次開始（換島太快時，上一次還在下載的循環聲音下載完不要再開：世代不同就不開） */
let generation = 0;

/** 音檔的網址 */
const urlOf = (name: string) => `${import.meta.env.BASE_URL}audio/sfx/rides/${name}.mp3`;

/** 下載並解碼一個音檔（失敗是 null，不丟錯：沒有聲音也不影響玩） */
function load(name: string): Promise<AudioBuffer | null> | AudioBuffer | null {
  const cur = buffers.get(name);
  if (cur !== undefined) return cur;
  const ctx = sharedAudio();
  if (!ctx) return null;
  const p = fetch(urlOf(name))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => ctx.decodeAudioData(b))
    .then((buf) => {
      buffers.set(name, buf);
      return buf;
    })
    .catch(() => {
      buffers.set(name, null);
      return null;
    });
  buffers.set(name, p);
  return p;
}

/** 頭尾的靜音（MP3 編碼補的）：回傳循環要從哪裡開始、到哪裡結束（秒） */
function trimmed(buf: AudioBuffer): { start: number; end: number } {
  const d = buf.getChannelData(0);
  let a = 0;
  while (a < d.length && Math.abs(d[a]) < 1e-4) a++;
  let b = d.length - 1;
  while (b > a && Math.abs(d[b]) < 1e-4) b--;
  return { start: a / buf.sampleRate, end: (b + 1) / buf.sampleRate };
}

/** 開一個循環的聲音（音量從 0 開始） */
async function startLoop(name: RideLoop, gen: number): Promise<void> {
  const buf = await load(name);
  const ctx = sharedAudio();
  const out = sfxOutput();
  if (!buf || !ctx || !out || !active || gen !== generation || loops.has(name)) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const t = trimmed(buf);
  src.loopStart = t.start;
  src.loopEnd = t.end;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(out);
  src.start(0, t.start);
  loops.set(name, { src, gain, last: { gain: 0, rate: 1 } });
}

/** 把一個參數在 0.1 秒內直線過渡到 target：先清掉所有舊的排程，排程永遠只有「現在的值 → 目標」兩筆 */
function rampTo(p: AudioParam, target: number, now: number): void {
  const cur = p.value;
  p.cancelScheduledValues(0);
  p.setValueAtTime(cur, now);
  p.linearRampToValueAtTime(target, now + 0.1);
}

/** 分頁切到背景：循環的聲音降到 0 */
function onVisibility(): void {
  if (document.visibilityState !== 'hidden') return;
  const ctx = sharedAudio();
  if (!ctx) return;
  for (const l of loops.values()) {
    rampTo(l.gain.gain, 0, ctx.currentTime);
    l.last.gain = 0;
  }
}

/** 進班級島：開始（音檔在背景下載，一次的聲音也先下載好） */
export function startRideAudio(): void {
  if (active) return;
  active = true;
  generation++;
  for (const name of RIDE_LOOPS) void startLoop(name, generation);
  for (const name of RIDE_SHOTS) void load(name);
  document.addEventListener('visibilitychange', onVisibility);
}

/** 離開班級島：循環的聲音淡出後停掉 */
export function stopRideAudio(): void {
  if (!active) return;
  active = false;
  document.removeEventListener('visibilitychange', onVisibility);
  const ctx = sharedAudio();
  for (const l of loops.values()) {
    if (ctx) {
      rampTo(l.gain.gain, 0, ctx.currentTime);
      l.src.stop(ctx.currentTime + 0.3);
    } else l.src.stop();
  }
  loops.clear();
}

/** 照這一格的排程播：循環的聲音調音量與速度、一次的聲音響一下（音效關掉時全部靜音） */
export function applyRidePlan(plan: SoundPlan): void {
  const ctx = sharedAudio();
  const out = sfxOutput();
  if (!ctx || !out || !active) return;
  const on = sfxEnabled() && document.visibilityState !== 'hidden';
  for (const [name, l] of loops) {
    const p = plan.loops[name];
    const gain = on ? p.gain * LOOP_VOL : 0;
    // 有變才調（每一格都調的話，排程與運算都白費）
    if (Math.abs(gain - l.last.gain) > 0.005) {
      rampTo(l.gain.gain, gain, ctx.currentTime);
      l.last.gain = gain;
    }
    if (Math.abs(p.rate - l.last.rate) > 0.005) {
      rampTo(l.src.playbackRate, p.rate, ctx.currentTime);
      l.last.rate = p.rate;
    }
  }
  if (!on) return;
  for (const s of plan.shots) {
    const buf = buffers.get(s.name);
    if (!(buf instanceof AudioBuffer)) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = s.gain * SHOT_VOL;
    src.connect(gain).connect(out);
    src.start();
  }
}

/**
 * 每一格的排程紀錄（介紹影片的剪接用：錄影時抓不到聲音，照這份紀錄把同一套音檔混成音效軌；平常不記）。
 * record(true) 開始記，drain() 拿走記到現在的（每一格：牆上時間與排程）
 */
const log: { wall: number; plan: SoundPlan }[] = [];
let recording = false;
export function logRidePlan(wall: number, plan: SoundPlan): void {
  if (recording) log.push({ wall, plan });
}

/** e2e 與錄影用（window.__game.rideAudio）：哪些音檔下載好了、哪些循環的聲音在播、排程紀錄 */
export const rideAudioState = {
  loaded: () => [...buffers.entries()].filter(([, b]) => b instanceof AudioBuffer).map(([k]) => k),
  /** 解碼後的長度（秒）與循環跳過頭尾靜音後的範圍（看 MP3 編碼補的靜音有沒有處理好） */
  durations: () =>
    Object.fromEntries(
      [...buffers.entries()].filter((e): e is [string, AudioBuffer] => e[1] instanceof AudioBuffer).map(([k, b]) => [k, { duration: b.duration, ...trimmed(b) }]),
    ),
  loops: () => [...loops.keys()],
  active: () => active,
  record: (on: boolean) => {
    recording = on;
    log.length = 0;
  },
  drain: () => log.splice(0, log.length),
};
