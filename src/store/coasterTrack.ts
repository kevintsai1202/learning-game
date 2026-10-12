/**
 * 班級島雲霄飛車的軌道與時間表（docs/plans/grand-rides.md 第 2.1 節；純函式，不用 three）：
 * - 軌道用一段一段的「曲線」拼起來（像模擬樂園的軌道塊）：Hermite 曲線（給終點與方向）、垂直迴圈、螺旋，
 *   最後一段接回起點，整圈封閉、位置與方向都連續。
 * - 取樣成每 SAMPLE 公尺一點：位置、前進方向、車廂的「上」（過彎往內傾、迴圈時朝迴圈中心）。
 * - 速度照高低算：出站與爬坡是固定速度（輪胎、鏈條），之後照重力加速、有摩擦與風阻，最後減速進站；
 *   換算成「出發後幾秒在軌道上哪裡」的表（列車的位置每台裝置照牆上的時間查表）。
 * 座標：x 向東、z 向南、y 向上（公尺）；朝向 yaw 0 是 +z（和角色的 heading 一樣）。
 * 模型（src/world/GrandRides.tsx）與座位（src/store/grandRides.ts）都用這裡的取樣。
 */

/** 三維向量 */
export interface V3 {
  x: number;
  y: number;
  z: number;
}

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: V3, k: number): V3 => v3(a.x * k, a.y * k, a.z * k);
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
const norm = (a: V3): V3 => {
  const l = len(a);
  return l < 1e-9 ? v3(0, 1, 0) : mul(a, 1 / l);
};
const UP = v3(0, 1, 0);

/** 朝向（yaw，0 是 +z）與仰角（pitch，往上為正）的單位方向 */
export function dirOf(yaw: number, pitch = 0): V3 {
  return v3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

/** 軌道的種類標記：station 出站（輪胎推）、lift 固定速度（爬坡的鏈條、平路的輪胎）、brake 減速段（最後進站）、free 自由滑行 */
export type TrackTag = 'station' | 'lift' | 'brake' | 'free';

/** 一段軌道 */
export type Piece =
  /** Hermite 曲線到 p，終點方向 yaw／pitch；k 是兩端切線的長度倍率（越大越圓） */
  | { kind: 'to'; p: V3; yaw: number; pitch?: number; k?: number; tag?: TrackTag }
  /** 垂直迴圈：半徑 r，出口往左邊（前進方向的左手邊）偏 shift 公尺（進出口才不會重疊） */
  | { kind: 'loop'; r: number; shift: number }
  /** 螺旋：半徑 r，往左轉 turn 弧度（負的是往右），途中下降 drop 公尺 */
  | { kind: 'helix'; r: number; turn: number; drop: number };

/** 取樣的間隔（公尺） */
export const SAMPLE = 0.25;

/** 原始的密集點（還沒等距取樣）：位置、迴圈裡的「上」（其他地方 null，之後照彎度算）、標記 */
interface RawPt {
  p: V3;
  up: V3 | null;
  tag: TrackTag;
}

/** 三次 Hermite 曲線上 t 的位置 */
function hermite(p0: V3, m0: V3, p1: V3, m1: V3, t: number): V3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return add(add(mul(p0, 2 * t3 - 3 * t2 + 1), mul(m0, t3 - 2 * t2 + t)), add(mul(p1, -2 * t3 + 3 * t2), mul(m1, t3 - t2)));
}

/** 把一段軌道展開成密集點（不含起點，含終點）；回傳終點與終點方向 */
function expand(piece: Piece, p0: V3, d0: V3, out: RawPt[]): { p: V3; d: V3 } {
  if (piece.kind === 'to') {
    const d1 = dirOf(piece.yaw, piece.pitch ?? 0);
    const L = len(sub(piece.p, p0)) * (piece.k ?? 1);
    const n = Math.max(8, Math.ceil(L / 0.05));
    for (let i = 1; i <= n; i++) out.push({ p: hermite(p0, mul(d0, L), piece.p, mul(d1, L), i / n), up: null, tag: piece.tag ?? 'free' });
    return { p: piece.p, d: d1 };
  }
  if (piece.kind === 'loop') {
    // 迴圈要從水平的軌道進去
    const f = norm(v3(d0.x, 0, d0.z));
    const left = cross(UP, f);
    const { r, shift } = piece;
    const n = Math.ceil((2 * Math.PI * r) / 0.05);
    for (let i = 1; i <= n; i++) {
      const th = (2 * Math.PI * i) / n;
      // 往左偏用 (θ − sinθ)/2π：進出口的切線都正好朝前
      const side = (shift * (th - Math.sin(th))) / (2 * Math.PI);
      const p = add(add(p0, mul(f, r * Math.sin(th))), add(mul(UP, r * (1 - Math.cos(th))), mul(left, side)));
      out.push({ p, up: add(mul(f, -Math.sin(th)), mul(UP, Math.cos(th))), tag: 'free' });
    }
    return { p: add(p0, mul(left, shift)), d: f };
  }
  // 螺旋：水平的圓，往左轉（turn > 0）時圓心在左手邊；高度用 (1 − cos) 緩進緩出
  const f = norm(v3(d0.x, 0, d0.z));
  const left = cross(UP, f);
  const s = Math.sign(piece.turn) || 1;
  const center = add(p0, mul(left, s * piece.r));
  const arc = Math.abs(piece.turn) * piece.r;
  const n = Math.max(8, Math.ceil(arc / 0.05));
  let last = { p: p0, d: f };
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const a = piece.turn * k;
    // 從圓心看起點的方向是 −s·left；轉 a 之後
    const radial = add(mul(left, -s * Math.cos(a)), mul(f, s * Math.sin(a)));
    const drop = (piece.drop * (1 - Math.cos(Math.PI * k))) / 2;
    const p = add(add(center, mul(radial, piece.r)), v3(0, -drop, 0));
    out.push({ p, up: null, tag: 'free' });
    last = { p, d: norm(add(mul(f, Math.cos(a)), mul(left, Math.sin(a)))) };
  }
  return last;
}

/** 等距取樣後的軌道 */
export interface Track {
  /** 整圈長度（公尺） */
  length: number;
  /** 第 i 點（每 SAMPLE 公尺）：位置、前進方向、車廂的上、標記 */
  pos: V3[];
  fwd: V3[];
  up: V3[];
  tag: TrackTag[];
}

/** 過彎的傾斜：水平彎度（1/公尺）乘這個倍率，夾在 ±BANK_MAX 弧度 */
const BANK_K = 3.2;
const BANK_MAX = 0.85;

/** 從起點 start（位置與 yaw）照 pieces 拼出一整圈（最後一段要回到起點），等距取樣 */
export function buildTrack(start: { p: V3; yaw: number }, pieces: readonly Piece[]): Track {
  const raw: RawPt[] = [{ p: start.p, up: null, tag: 'station' }];
  let cur = { p: start.p, d: dirOf(start.yaw) };
  for (const piece of pieces) cur = expand(piece, cur.p, cur.d, raw);
  // 等距取樣（最後一點就是起點，不重複放）
  const cum: number[] = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + len(sub(raw[i].p, raw[i - 1].p)));
  const length = cum[cum.length - 1];
  const n = Math.round(length / SAMPLE);
  const pos: V3[] = [];
  const loopUp: (V3 | null)[] = [];
  const tag: TrackTag[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i * length) / n;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j];
    const k = seg > 0 ? (s - cum[j]) / seg : 0;
    const a = raw[j];
    const b = raw[j + 1];
    pos.push(add(a.p, mul(sub(b.p, a.p), k)));
    loopUp.push(a.up && b.up ? norm(add(mul(a.up, 1 - k), mul(b.up, k))) : (b.up ?? a.up));
    tag.push(b.tag);
  }
  // 前進方向：前後兩點的差
  const fwd = pos.map((_, i) => norm(sub(pos[(i + 1) % n], pos[(i - 1 + n) % n])));
  // 水平彎度 → 傾斜（往彎的內側倒），前後各 2 公尺平均，傾斜不會一下子跳過去
  const yaw = fwd.map((f) => Math.atan2(f.x, f.z));
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const rawBank = fwd.map((f, i) => {
    const horiz = Math.hypot(f.x, f.z);
    if (horiz < 0.3) return 0;
    const curv = wrap(yaw[(i + 1) % n] - yaw[(i - 1 + n) % n]) / (2 * SAMPLE);
    return Math.max(-BANK_MAX, Math.min(BANK_MAX, curv * BANK_K));
  });
  const W = Math.round(2 / SAMPLE);
  const bank = rawBank.map((_, i) => {
    let sum = 0;
    for (let d = -W; d <= W; d++) sum += rawBank[(i + d + n) % n];
    return sum / (2 * W + 1);
  });
  const up = fwd.map((f, i) => {
    const lu = loopUp[i];
    if (lu) return norm(sub(lu, mul(f, dot(lu, f))));
    // 世界的上去掉前進方向的分量，再繞前進方向轉 bank（左轉時往左倒）
    const u0 = norm(sub(UP, mul(f, dot(UP, f))));
    const l0 = cross(u0, f);
    return norm(add(mul(u0, Math.cos(bank[i])), mul(l0, Math.sin(bank[i]))));
  });
  return { length, pos, fwd, up, tag };
}

/** 軌道上 s 公尺處（會繞圈）的位置、前進方向、上（相鄰兩個取樣點之間線性內插） */
export function trackAt(t: Track, s: number): { p: V3; f: V3; u: V3 } {
  const n = t.pos.length;
  const x = (((s % t.length) + t.length) % t.length) / (t.length / n);
  const i = Math.floor(x) % n;
  const j = (i + 1) % n;
  const k = x - Math.floor(x);
  const f = norm(add(mul(t.fwd[i], 1 - k), mul(t.fwd[j], k)));
  const u0 = norm(add(mul(t.up[i], 1 - k), mul(t.up[j], k)));
  const u = norm(sub(u0, mul(f, dot(u0, f))));
  return { p: add(mul(t.pos[i], 1 - k), mul(t.pos[j], k)), f, u };
}

// ---------- 速度與時間表 ----------

/** 速度規則：站上與出站、鏈條爬坡的速度、最低速度、摩擦、風阻、減速段的減速度（公尺、秒） */
export const SPEED = { station: 2.5, lift: 3.2, min: 2.2, g: 9.8, friction: 0.012, drag: 0.0012, brake: 5 };

/** 時間表：每個取樣點的速度與「出發後幾秒到這裡」（time[n] 是回到起點的時間，也就是一趟多久） */
export interface Timeline {
  speed: number[];
  time: number[];
  duration: number;
}

/** 照軌道的高低與標記算速度，換算成時間表（純函式，結果每台裝置一樣） */
export function buildTimeline(t: Track): Timeline {
  const n = t.pos.length;
  const ds = t.length / n;
  const speed: number[] = [];
  let v = SPEED.station;
  for (let i = 0; i < n; i++) {
    const tag = t.tag[i];
    // 出站（輪胎推）與爬坡（鏈條拉）是固定速度
    if (tag === 'station') v = SPEED.station;
    if (tag === 'lift') v = SPEED.lift;
    speed.push(v);
    if (tag === 'station' || tag === 'lift') continue;
    // 自由滑行：能量守恆扣掉摩擦與風阻；減速段再加上剎車（最慢到站上的速度，輪胎會推著進站）
    const y0 = t.pos[i].y;
    const y1 = t.pos[(i + 1) % n].y;
    let v2 = v * v + 2 * SPEED.g * (y0 - y1) - 2 * (SPEED.friction * SPEED.g + SPEED.drag * v * v) * ds;
    if (tag === 'brake') v2 = Math.min(v2, v * v - 2 * SPEED.brake * ds);
    v = Math.max(tag === 'brake' ? SPEED.station : SPEED.min, Math.sqrt(Math.max(0, v2)));
  }
  const time: number[] = [0];
  for (let i = 0; i < n; i++) time.push(time[i] + ds / ((speed[i] + speed[(i + 1) % n]) / 2));
  return { speed, time, duration: time[n] };
}

/** 出發後 sec 秒列車頭在軌道上的哪裡（公尺；0～length，超過一趟的時間停在終點） */
export function sAtTime(t: Track, tl: Timeline, sec: number): number {
  const n = t.pos.length;
  if (sec <= 0) return 0;
  if (sec >= tl.duration) return t.length;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tl.time[mid] <= sec) lo = mid;
    else hi = mid;
  }
  const k = (sec - tl.time[lo]) / (tl.time[lo + 1] - tl.time[lo]);
  return (lo + k) * (t.length / n);
}

/** 由三個互相垂直的單位向量（角色的左、上、前）算四元數 [x, y, z, w]（three 的 makeBasis 同樣的算法） */
export function quatFromBasis(left: V3, up: V3, fwd: V3): [number, number, number, number] {
  const m11 = left.x, m12 = up.x, m13 = fwd.x;
  const m21 = left.y, m22 = up.y, m23 = fwd.y;
  const m31 = left.z, m32 = up.z, m33 = fwd.z;
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}

/** 四元數轉一個向量 */
export function rotateByQuat(q: readonly [number, number, number, number], v: V3): V3 {
  const [qx, qy, qz, qw] = q;
  // t = 2 · (q.xyz × v)
  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);
  return v3(v.x + qw * tx + (qy * tz - qz * ty), v.y + qw * ty + (qz * tx - qx * tz), v.z + qw * tz + (qx * ty - qy * tx));
}

export { add as addV3, mul as mulV3, sub as subV3, cross as crossV3, norm as normV3, len as lenV3 };
