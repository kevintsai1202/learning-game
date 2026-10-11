/**
 * 音效：全部用 Web Audio 即時合成，不需要音檔，離線也能用。
 * 瀏覽器要求使用者點擊後才能發聲，所以第一次點擊時才建立 AudioContext。
 */

let ctx: AudioContext | null = null;
/** 主音量節點 */
let master: GainNode | null = null;
let enabled = true;

/** 取得（必要時建立）AudioContext；尚未有使用者手勢時可能是 suspended */
function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** 共用的 AudioContext 與主音量（配樂模組也接在這裡，iOS 才能調整音量） */
export function sharedAudio(): AudioContext | null {
  return audio();
}

/** 在使用者第一次點擊時呼叫，解除自動播放限制（不等待 resume，避免無手勢時卡住） */
export function unlockAudio(): void {
  const a = audio();
  if (a && a.state === 'suspended') void a.resume();
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
}

/** 播一個音：頻率、開始時間（相對現在，秒）、長度、波形、音量 */
function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.6): void {
  const a = audio();
  if (!a || !master || !enabled) return;
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** 滑音：頻率從 f0 滑到 f1（咻、嘎） */
function glide(f0: number, f1: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.5): void {
  const a = audio();
  if (!a || !master || !enabled) return;
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** 白噪音的音源（第一次用到才做一份，大家共用） */
let noiseBuffer: AudioBuffer | null = null;

/** 一段濾過的雜音（沙沙聲、電視開機的雜訊）：中心頻率 freq、長度 dur */
function noise(at: number, dur: number, freq: number, vol = 0.4): void {
  const a = audio();
  if (!a || !master || !enabled) return;
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = a.currentTime + at;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** 小星星（公有領域的童謠）前兩句：[頻率, 拍數] */
const TWINKLE: [number, number][] = [
  [262, 1], [262, 1], [392, 1], [392, 1], [440, 1], [440, 1], [392, 2],
  [349, 1], [349, 1], [330, 1], [330, 1], [294, 1], [294, 1], [262, 2],
];

/** 音效清單 */
export const sfx = {
  /** 坐在鋼琴前彈一段小星星（自己的家第 9 節優化） */
  piano: () => {
    let at = 0;
    for (const [f, beats] of TWINKLE) {
      tone(f, at, 0.28 * beats + 0.1, 'triangle', 0.4);
      tone(f * 2, at, 0.12, 'sine', 0.12);
      at += 0.3 * beats;
    }
  },
  /** 開關（燈）：開是高一點的喀，關是低一點的喀 */
  toggle: (on = true) => tone(on ? 1100 : 700, 0, 0.05, 'square', 0.15),
  // ---------- 家具（自己的家第 10 節第 ① 批：家具要有音效） ----------
  /** 放下家具：咚一聲 */
  place: () => {
    tone(220, 0, 0.12, 'triangle', 0.5);
    tone(330, 0.05, 0.12, 'sine', 0.3);
  },
  /** 轉方向：喀 */
  rotate: () => tone(1320, 0, 0.04, 'square', 0.12),
  /** 收起來：往上咻 */
  pickup: () => glide(400, 900, 0, 0.18, 'triangle', 0.35),
  /** 坐下：坐墊噗 */
  sit: () => glide(260, 140, 0, 0.18, 'sine', 0.5),
  /** 躺下：打哈欠（往下的兩個音） */
  lie: () => {
    glide(500, 300, 0, 0.4, 'sine', 0.35);
    glide(420, 260, 0.35, 0.45, 'sine', 0.3);
  },
  /** 爬梯子：踩一步 */
  step: () => tone(520, 0, 0.05, 'triangle', 0.25),
  /** 溜滑梯：咻～（往上再往下） */
  whee: () => {
    glide(500, 1100, 0, 0.35, 'triangle', 0.35);
    glide(1100, 400, 0.35, 0.5, 'triangle', 0.3);
  },
  /** 溜到底：咚 */
  land: () => tone(160, 0, 0.15, 'sine', 0.5),
  /** 鞦韆：嘎 */
  creak: () => glide(950, 760, 0, 0.12, 'sawtooth', 0.06),
  /** 電視：開機的雜訊加一聲嗶；關機是往下的嗡 */
  tv: (on = true) => {
    if (on) {
      noise(0, 0.25, 1800, 0.3);
      tone(1000, 0.22, 0.12, 'sine', 0.25);
    } else glide(600, 120, 0, 0.2, 'sine', 0.3);
  },
  /** 堆沙堡：沙沙聲加一聲叮；推倒是比較低的沙沙聲 */
  sand: (build = true) => {
    noise(0, 0.35, build ? 900 : 500, 0.45);
    if (build) tone(1568, 0.32, 0.2, 'triangle', 0.25);
  },
  /** 按鈕點擊 */
  tap: () => tone(660, 0, 0.08, 'triangle', 0.3),
  /** 答對：上行琶音 */
  correct: () => {
    tone(784, 0, 0.18, 'triangle');
    tone(988, 0.08, 0.18, 'triangle');
    tone(1319, 0.16, 0.3, 'triangle');
  },
  /** 答錯：輕柔的下行兩音（不要嚇到孩子） */
  oops: () => {
    tone(392, 0, 0.18, 'sine', 0.4);
    tone(330, 0.14, 0.26, 'sine', 0.4);
  },
  /** 拿到金幣 */
  coin: () => {
    tone(1568, 0, 0.08, 'square', 0.18);
    tone(2093, 0.07, 0.18, 'square', 0.18);
  },
  /** 星星（結算畫面每顆星一次） */
  star: (i = 0) => tone(880 * Math.pow(1.26, i), 0, 0.35, 'triangle', 0.5),
  /** 完成一回合的小號角 */
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.45));
    tone(1047, 0.5, 0.6, 'triangle', 0.4);
  },
  /** 走進建築 */
  door: () => {
    tone(523, 0, 0.12, 'triangle', 0.35);
    tone(698, 0.1, 0.2, 'triangle', 0.35);
  },
  /** 寫對一筆 */
  stroke: () => tone(1046, 0, 0.07, 'sine', 0.25),
};
