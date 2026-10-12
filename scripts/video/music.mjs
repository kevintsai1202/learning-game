/**
 * 介紹影片的配樂：原創的歡樂兒童樂園曲（程式合成，沒有用到任何外部音檔，沒有授權問題）。
 * 風格：遊樂園的風琴（calliope）主旋律、碰恰碰恰的低音與和弦、鐵琴亮音、輕快的鼓；C 大調、每分鐘約 134 拍，
 * 一小節 1.792 秒（影片的 56 格，一格 32 毫秒），40 小節共 71.68 秒（剪接照小節切鏡頭，scripts/video/edit.mjs）。
 * 段落：前奏 4 小節 → A 8 → B 8 → A 8 → B 8 → 尾奏 4。
 * 用法（PowerShell 7）：node scripts/video/music.mjs [輸出檔，預設 video-out/music.wav]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** 取樣率、拍子、小節數 */
const SR = 44100;
const BAR = 1.792;
const BEAT = BAR / 4;
const BARS = 40;
const LEN = Math.round(BARS * BAR * SR);

/** 左右聲道 */
const L = new Float32Array(LEN);
const R = new Float32Array(LEN);
/** 殘響的送出（風琴、鐵琴、和弦） */
const SEND = new Float32Array(LEN);

/** 固定種子的亂數（噪音用，每次產生的一樣） */
let seed = 20261012;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

/** 音名 → MIDI 編號（C4 = 60，可帶 #） */
function midi(name) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`音名不對：${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  return base + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
}
const freq = (n) => 440 * 2 ** ((midi(n) - 69) / 12);

/** 把一段聲音加到混音（pan：-1 左、1 右；send 是送殘響的比例） */
function mix(start, buf, gain, pan = 0, send = 0) {
  const i0 = Math.round(start * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < buf.length; i++) {
    const j = i0 + i;
    if (j < 0 || j >= LEN) continue;
    L[j] += buf[i] * gl;
    R[j] += buf[i] * gr;
    if (send) SEND[j] += buf[i] * gain * send;
  }
}

/** 風琴（遊樂園的 calliope）：幾個泛音加顫音，起音快、放開時收掉 */
function organ(f, dur, bright = 1) {
  const n = Math.round((dur + 0.08) * SR);
  const out = new Float32Array(n);
  const parts = [
    [1, 1],
    [2, 0.35 * bright],
    [3, 0.42 * bright],
    [4, 0.1 * bright],
    [5, 0.18 * bright],
    [6, 0.05 * bright],
  ];
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.8 * t) * Math.min(1, t / 0.15);
    ph += (2 * Math.PI * f * vib) / SR;
    let s = 0;
    for (const [k, a] of parts) s += a * Math.sin(k * ph);
    const att = Math.min(1, t / 0.015);
    const dec = 0.82 + 0.18 * Math.exp(-t / 0.06);
    const rel = t > dur ? Math.max(0, 1 - (t - dur) / 0.08) : 1;
    out[i] = s * att * dec * rel * 0.5;
  }
  return out;
}

/** 鐵琴：正弦加不和諧的泛音，敲下去慢慢消失 */
function glock(f, decay = 0.4) {
  const n = Math.round(decay * 4 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const s = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * 2.76 * f * t) * Math.exp(-t / 0.08) + 0.12 * Math.sin(2 * Math.PI * 5.4 * f * t) * Math.exp(-t / 0.04);
    out[i] = s * Math.min(1, t / 0.002) * Math.exp(-t / decay);
  }
  return out;
}

/** 低音（像低音號的「碰」）：短短的、有一點泛音 */
function tuba(f, dur) {
  const n = Math.round((dur + 0.05) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const s = Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.22 * Math.sin(6 * Math.PI * f * t);
    const env = Math.min(1, t / 0.02) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.05) : 1) * (0.75 + 0.25 * Math.exp(-t / 0.1));
    out[i] = s * env * 0.5;
  }
  return out;
}

/** 大鼓：頻率往下掉的正弦 */
function kick() {
  const n = Math.round(0.35 * SR);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (50 + 80 * Math.exp(-t / 0.04))) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t / 0.13);
  }
  return out;
}

/** 小鼓：噪音加一點鼓皮的音 */
function snare() {
  const n = Math.round(0.3 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = (rand() * 2 - 1) * Math.exp(-t / 0.07) * 0.8 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.05) * 0.5;
  }
  return out;
}

/** 高音的噪音（減掉平滑過的噪音＝高通）：鈸 len 長、hat 短 */
function hiss(decay, len) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const w = rand() * 2 - 1;
    lp += (w - lp) * 0.35;
    out[i] = (w - lp) * Math.exp(-t / decay);
  }
  return out;
}

// ---------- 樂譜 ----------

/** 和弦（中音區的「恰」）與低音的根音、五度 */
const CHORDS = {
  C: { notes: ['C4', 'E4', 'G4'], bass: ['C2', 'G2'] },
  G: { notes: ['B3', 'D4', 'G4'], bass: ['G2', 'D2'] },
  G7: { notes: ['B3', 'D4', 'F4', 'G4'], bass: ['G2', 'D2'] },
  Am: { notes: ['A3', 'C4', 'E4'], bass: ['A2', 'E2'] },
  F: { notes: ['A3', 'C4', 'F4'], bass: ['F2', 'C3'] },
  D7: { notes: ['F#3', 'A3', 'C4', 'D4'], bass: ['D2', 'A2'] },
};

/** 每一小節的和弦（兩個的是前半、後半） */
const INTRO_CH = ['C', 'F', 'G', 'G7'];
const A_CH = ['C', 'G', 'Am', 'F', 'C', 'G', ['F', 'G'], 'C'];
const B_CH = ['F', 'C', 'G', 'C', 'F', 'C', 'D7', 'G'];
const OUTRO_CH = ['F', 'G7', 'C', 'C'];
const PLAN = [...INTRO_CH, ...A_CH, ...B_CH, ...A_CH, ...B_CH, ...OUTRO_CH];

/** 主旋律：每小節一串 [音名, 拍數]（null 是休止） */
const A_MEL = [
  [['G4', 0.5], ['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['E5', 1], ['C5', 1]],
  [['D5', 0.5], ['G5', 0.5], ['B5', 0.5], ['G5', 0.5], ['D5', 1], ['B4', 1]],
  [['C5', 0.5], ['E5', 0.5], ['A5', 0.5], ['G5', 0.5], ['E5', 1], ['C5', 1]],
  [['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 2]],
  [['E5', 0.5], ['F5', 0.5], ['G5', 1], ['G5', 0.5], ['A5', 0.5], ['G5', 1]],
  [['F5', 0.5], ['E5', 0.5], ['D5', 1], ['G5', 1], ['B4', 1]],
  [['A5', 0.5], ['G5', 0.5], ['F5', 1], ['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['D5', 0.5]],
  [['E5', 1], ['D5', 0.5], ['B4', 0.5], ['C5', 2]],
];
const B_MEL = [
  [['A5', 0.75], ['A5', 0.25], ['C6', 1], ['A5', 1], ['F5', 1]],
  [['G5', 0.75], ['G5', 0.25], ['E5', 1], ['C5', 1], ['E5', 1]],
  [['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['G5', 0.5], ['B5', 1], ['G5', 1]],
  [['C6', 1.5], ['B5', 0.5], ['C6', 2]],
  [['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['A5', 0.5], ['C6', 1], ['A5', 1]],
  [['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['G5', 0.5], ['C6', 2]],
  [['F#5', 0.5], ['A5', 0.5], ['C6', 0.5], ['A5', 0.5], ['F#5', 1], ['D5', 1]],
  [['G5', 1], ['A5', 0.5], ['B5', 0.5], ['D6', 2]],
];
const OUTRO_MEL = [
  [['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['A5', 0.5], ['C6', 2]],
  [['B5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['D5', 1], ['G5', 1]],
  [['G5', 0.5], ['A5', 0.5], ['B5', 0.5], ['D6', 0.5], ['C6', 2]],
  [['C6', 3], [null, 1]],
];

/** 段落：第幾小節開始、哪一種 */
const SECTIONS = [
  { from: 0, kind: 'intro' },
  { from: 4, kind: 'A' },
  { from: 12, kind: 'B' },
  { from: 20, kind: 'A2' },
  { from: 28, kind: 'B2' },
  { from: 36, kind: 'outro' },
];
const sectionOf = (bar) => [...SECTIONS].reverse().find((s) => bar >= s.from);

/** 某一小節某一拍的和弦 */
function chordAt(bar, beat) {
  const c = PLAN[bar];
  return CHORDS[Array.isArray(c) ? c[beat < 2 ? 0 : 1] : c];
}

// ---------- 編曲 ----------

const kickBuf = kick();
const snareBuf = snare();
const hatBuf = hiss(0.025, 0.12);
const crashBuf = hiss(0.9, 2.5);

for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  const sec = sectionOf(bar);
  const local = bar - sec.from;
  const last = bar === BARS - 1;

  // 段落開頭的鈸
  if (local === 0 && sec.kind !== 'intro') mix(t0, crashBuf, 0.16, 0.3);
  if (last) {
    // 最後一小節：一下全體的重音，和弦拉長
    mix(t0, kickBuf, 0.55);
    for (const n of CHORDS.C.notes) mix(t0, organ(freq(n), BEAT * 3), 0.1, -0.3, 0.3);
    mix(t0, tuba(freq('C2'), BEAT * 3), 0.34);
  }

  for (let beat = 0; beat < 4 && !last; beat++) {
    const t = t0 + beat * BEAT;
    const ch = chordAt(bar, beat);
    // 碰（1、3 拍低音）恰（2、4 拍和弦）
    if (beat % 2 === 0) mix(t, tuba(freq(ch.bass[beat === 0 ? 0 : 1]), BEAT * 0.8), 0.34);
    else for (const n of ch.notes) mix(t, organ(freq(n), BEAT * 0.35, 0.7), 0.075, -0.35, 0.25);
    // 鼓：前奏只有 hat，第 4 小節小鼓漸強
    if (sec.kind === 'intro') {
      if (bar === 3) for (let k = 0; k < 4; k++) mix(t + (k * BEAT) / 4, snareBuf, 0.06 + 0.03 * (beat * 4 + k) / 4, 0.1);
      else mix(t, hatBuf, 0.06, 0.4);
      if (bar === 3 && beat === 0) mix(t, kickBuf, 0.45);
      continue;
    }
    if (beat % 2 === 0) mix(t, kickBuf, 0.5);
    else mix(t, snareBuf, 0.2, 0.1);
    const sixteenth = sec.kind === 'B2';
    for (let k = 0; k < (sixteenth ? 4 : 2); k++) mix(t + (k * BEAT) / (sixteenth ? 4 : 2), hatBuf, k % 2 === 1 ? 0.075 : 0.05, 0.4);
  }

  // 主旋律（風琴）與鐵琴
  const mel = sec.kind === 'A' || sec.kind === 'A2' ? A_MEL[local] : sec.kind === 'B' || sec.kind === 'B2' ? B_MEL[local] : sec.kind === 'outro' ? OUTRO_MEL[local] : null;
  if (mel) {
    let b = 0;
    for (const [n, len] of mel) {
      if (n) {
        mix(t0 + b * BEAT, organ(freq(n), len * BEAT * 0.9), 0.21, 0, 0.35);
        // B 段鐵琴高八度跟著唱
        if (sec.kind === 'B' || sec.kind === 'B2') mix(t0 + b * BEAT, glock(freq(n) * 2, 0.3), 0.06, 0.45, 0.4);
      }
      b += len;
    }
  }
  // 鐵琴的琶音：前奏與第二次 A 段（八分音符，高兩個八度）
  if (sec.kind === 'intro' || sec.kind === 'A2') {
    for (let k = 0; k < 8; k++) {
      const ch = chordAt(bar, k / 2);
      const n = ch.notes[k % ch.notes.length];
      mix(t0 + (k * BEAT) / 2, glock(freq(n) * 4, 0.35), sec.kind === 'intro' ? 0.11 : 0.05, 0.5, 0.4);
    }
  }
  // 第一次 A 段：每小節第 4 拍一下亮音
  if (sec.kind === 'A') mix(t0 + 3 * BEAT, glock(freq(chordAt(bar, 3).notes[2]) * 4, 0.5), 0.07, 0.5, 0.4);
  // 尾奏最後一小節：鐵琴往上滑
  if (last) for (let k = 0; k < 8; k++) mix(t0 + (k * BEAT) / 4, glock(freq(['C6', 'E6', 'G6', 'C7', 'E7', 'G7', 'C7', 'C7'][k]), 0.5), 0.07, 0.5, 0.4);
}

// ---------- 殘響（簡單的 Schroeder：4 個梳狀＋2 個全通） ----------

function reverb(input) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  const aps = [225, 556].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  const out = new Float32Array(input.length);
  for (let n = 0; n < input.length; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.buf[c.i] = input[n] + y * 0.78;
      c.i = (c.i + 1) % c.d;
      s += y;
    }
    s /= 4;
    for (const a of aps) {
      const y = a.buf[a.i];
      const x = s + y * -0.5;
      a.buf[a.i] = x;
      a.i = (a.i + 1) % a.d;
      s = y + x * 0.5;
    }
    out[n] = s;
  }
  return out;
}
const wet = reverb(SEND);
for (let i = 0; i < LEN; i++) {
  L[i] += wet[i] * 0.5;
  R[i] += wet[Math.max(0, i - 220)] * 0.5;
}

// ---------- 收尾：最後 0.8 秒淡出、峰值調到 -1 dBFS、寫成 16 位元 WAV ----------

const fade = Math.round(0.8 * SR);
for (let i = 0; i < fade; i++) {
  const g = 1 - i / fade;
  L[LEN - fade + i] *= g;
  R[LEN - fade + i] *= g;
}
let peak = 0;
for (let i = 0; i < LEN; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = 10 ** (-1 / 20) / peak;
const data = Buffer.alloc(LEN * 4);
for (let i = 0; i < LEN; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
const out = process.argv[2] ?? 'video-out/music.wav';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, data]));
console.log(`配樂：${out}（${(LEN / SR).toFixed(2)} 秒，${BARS} 小節，每小節 ${BAR.toFixed(2)} 秒）`);
