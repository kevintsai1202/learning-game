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

/** 音效清單 */
export const sfx = {
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
