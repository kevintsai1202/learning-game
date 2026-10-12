/**
 * 班級島大型設施的聲音排程（docs/plans/grand-rides.md 第 11.2 節；純函式，不碰音訊）：
 * 每一格（從上一格的牆上時間 prevWall 到這一格 wall）算出「循環的聲音各多大聲、播多快」與「這一格要響哪些一次的聲音、多大聲」。
 * - 時間一律用牆上的時間（wallSec，和班次同一個時鐘），重新連線改了對時、e2e 撥時間都對得上；一下跳超過 1 秒不補響。
 * - 自己在設施上：照自己那一班與時間軸；站在島上：附近的設施越近越大聲（遠的聽不到），雲霄飛車上有人才有尖叫，海邊有海浪。
 * - 聲音檔在 public/audio/sfx/rides/（真實錄音，CREDITS.md），播放在 src/audio/rideAudio.ts；介紹影片的剪接也用這裡算的結果。
 */
import { COASTER_BOARD, MAST, SHIP, SHIP_CYCLE, STATION, WHEEL, carPose, coaster, coasterRun, shipState } from './grandRides';
import type { GrandRide } from './grandKinds';

/** 循環的聲音 */
export const RIDE_LOOPS = ['coaster-chain', 'coaster-roll', 'coaster-wind', 'wheel-wind', 'ship-propeller', 'sea-waves'] as const;
export type RideLoop = (typeof RIDE_LOOPS)[number];
/** 一次的聲音 */
export const RIDE_SHOTS = [
  'bell',
  'coaster-brake',
  'coaster-pass',
  'scream-1',
  'scream-2',
  'scream-3',
  'scream-4',
  'yell-ya',
  'yell-high-1',
  'yell-high-2',
  'yell-fun-1',
  'yell-fun-2',
  'ship-burner',
  'ship-horn',
  'seagull-1',
  'seagull-2',
] as const;
export type RideShot = (typeof RIDE_SHOTS)[number];

/** 排程的輸入：聽的人在哪（自己的角色）、上一格與這一格的牆上時間、自己在玩哪一樣（哪一班、上車的時間）、雲霄飛車上有沒有人 */
export interface SoundInput {
  listener: { x: number; y: number; z: number };
  prevWall: number;
  wall: number;
  own: { ride: GrandRide; run: number; w0: number } | null;
  coasterRiders: boolean;
}

/** 排程的結果：循環的聲音（音量 0～1、播放速度倍率）與這一格要響的一次的聲音 */
export interface SoundPlan {
  loops: Record<RideLoop, { gain: number; rate: number }>;
  shots: { name: RideShot; gain: number }[];
}

/** 0～1 之間 */
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 距離衰減：r 公尺外聽不到，越近越大聲（平方，近的時候變化明顯） */
const att = (d: number, r: number) => clamp01(1 - d / r) ** 2;
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y?: number; z: number }) => Math.hypot(a.x - b.x, a.y - (b.y ?? 0), a.z - b.z);

/** 雲霄飛車的時間點（出發後幾秒）：最高點、進迴圈（尖叫）、開始煞車；與那一刻列車頭的位置（站在島上的人照距離聽） */
export interface CoasterMarks {
  crest: number;
  loop: number;
  brake: number;
  duration: number;
  crestAt: { x: number; y: number; z: number };
  loopAt: { x: number; y: number; z: number };
}
let marksCache: CoasterMarks | null = null;
export function coasterMarks(): CoasterMarks {
  if (marksCache) return marksCache;
  const { track, timeline } = coaster();
  let crest = 0;
  for (let i = 0; i < track.pos.length; i++) if (track.pos[i].y > track.pos[crest].y) crest = i;
  let top = 0;
  for (let i = 0; i < track.up.length; i++) if (track.up[i].y < track.up[top].y) top = i;
  let brake = crest;
  while (brake < track.pos.length && track.tag[brake] !== 'brake') brake++;
  marksCache = {
    crest: timeline.time[crest],
    loop: timeline.time[top] - 1.0,
    brake: timeline.time[brake],
    duration: timeline.duration,
    crestAt: track.pos[crest],
    loopAt: track.pos[top],
  };
  return marksCache;
}

/** 列車頭在 s 公尺處的速度（公尺／秒）與是不是在爬坡的鏈條上 */
function coasterMotion(s: number): { v: number; climbing: boolean } {
  const { track, timeline } = coaster();
  const n = track.pos.length;
  const i = Math.min(n - 1, Math.max(0, Math.round((s / track.length) * n)));
  return { v: timeline.speed[i], climbing: track.tag[i] === 'lift' && track.fwd[i].y > 0.1 };
}

/** 從 prevWall 到 wall 經過了 t 這一刻（一下跳超過 1 秒不算） */
const crossed = (i: SoundInput, t: number) => i.wall - i.prevWall <= 1 && i.prevWall < t && t <= i.wall;

export function ridePlan(i: SoundInput): SoundPlan {
  const loops = Object.fromEntries(RIDE_LOOPS.map((k) => [k, { gain: 0, rate: 1 }])) as SoundPlan['loops'];
  const shots: SoundPlan['shots'] = [];
  const shot = (name: RideShot, gain: number) => {
    if (gain > 0.01) shots.push({ name, gain: Math.min(1, gain) });
  };
  const own = i.own;
  const L = i.listener;

  // ---------- 雲霄飛車 ----------
  const { cycle } = coaster();
  const m = coasterMarks();
  const cr = coasterRun(i.wall);
  const onCoaster = own?.ride === 'coaster';
  if (!cr.boarding) {
    const mo = coasterMotion(cr.s);
    if (onCoaster) {
      loops['coaster-roll'] = { gain: 0.25 + 0.75 * clamp01(mo.v / 15), rate: 0.8 + 0.5 * clamp01(mo.v / 17) };
      loops['coaster-wind'].gain = 0.9 * clamp01((mo.v - 6) / 9);
      loops['coaster-chain'].gain = mo.climbing ? 0.9 : 0;
    } else {
      const d = dist(L, carPose(cr.s, 0).p);
      loops['coaster-roll'] = { gain: (0.15 + 0.85 * clamp01(mo.v / 15)) * att(d, 40), rate: 0.8 + 0.5 * clamp01(mo.v / 17) };
      loops['coaster-chain'].gain = mo.climbing ? 0.7 * att(d, 30) : 0;
    }
  }
  // 這一格與上一格那一班的時間點（跨班的那一格兩班都看）
  for (const run of new Set([Math.floor(i.prevWall / cycle), Math.floor(i.wall / cycle)])) {
    const go = run * cycle + COASTER_BOARD;
    const mine = onCoaster && own!.run === run;
    const near = (p: { x: number; y: number; z: number }, r: number) => (mine ? 1 : att(dist(L, p), r));
    if (crossed(i, go - 2)) shot('bell', 0.7 * near({ x: STATION.exit.x, y: 1, z: STATION.z }, 25));
    if (mine && crossed(i, go + m.crest - 2.5)) shot(run % 2 === 0 ? 'yell-high-1' : 'yell-high-2', 0.9);
    if (i.coasterRiders && crossed(i, go + m.crest + 0.5)) {
      if (mine) shot(`scream-${(run % 4) + 1}` as RideShot, 1);
      else shot('coaster-pass', 0.9 * att(dist(L, m.crestAt), 55));
    }
    if (i.coasterRiders && crossed(i, go + m.loop)) {
      if (mine) {
        shot(`scream-${((run + 2) % 4) + 1}` as RideShot, 1);
        shot('yell-ya', 0.7);
      } else shot(`scream-${((run + 2) % 4) + 1}` as RideShot, 0.8 * att(dist(L, m.loopAt), 45));
    }
    if (crossed(i, go + m.brake)) shot('coaster-brake', 0.8 * near({ x: STATION.x1, y: 1, z: STATION.z }, 30));
    if (mine && crossed(i, go + m.duration - 1.2)) shot(run % 2 === 0 ? 'yell-fun-1' : 'yell-fun-2', 0.9);
  }

  // ---------- 摩天輪（自己在上面：越高風越大） ----------
  if (own?.ride === 'wheel') {
    loops['wheel-wind'].gain = 0.1 + 0.9 * clamp01((L.y - 1) / 18) ** 1.3;
    if (crossed(i, own.w0 + 0.05)) shot('bell', 0.7);
    if (crossed(i, own.w0 + WHEEL.period / 2 - 1.5)) shot(Math.floor(own.w0) % 2 === 0 ? 'yell-high-1' : 'yell-high-2', 0.9);
  }

  // ---------- 飛船 ----------
  const ship = shipState(i.wall);
  const onShip = own?.ride === 'ship';
  if (onShip) {
    loops['ship-propeller'].gain = ship.docked ? 0.2 : 0.75;
    loops['sea-waves'].gain = 0.3;
  } else if (!ship.docked) loops['ship-propeller'].gain = 0.8 * att(dist(L, ship), 45);
  for (const run of new Set([Math.floor(i.prevWall / SHIP_CYCLE), Math.floor(i.wall / SHIP_CYCLE)])) {
    const base = run * SHIP_CYCLE;
    const go = base + SHIP.board;
    const mine = onShip && own!.run === run;
    const mast = { x: MAST.x, y: 8, z: MAST.z };
    for (const t of [go - 0.5, base + SHIP_CYCLE - 7]) if (crossed(i, t)) shot('ship-horn', mine ? 0.8 : 0.8 * att(dist(L, mast), 60));
    for (let t = go + 4; t < base + SHIP_CYCLE - 8; t += 14) if (crossed(i, t)) shot('ship-burner', mine ? 0.75 : 0.7 * att(dist(L, shipState(t)), 40));
    if (mine) for (let t = go + 9, k = 0; t < base + SHIP_CYCLE - 6; t += 13, k++) if (crossed(i, t)) shot(k % 2 === 0 ? 'seagull-1' : 'seagull-2', 0.5);
  }

  // ---------- 海浪：站在海邊（不在設施上） ----------
  if (!own && L.y < 3) loops['sea-waves'].gain = 0.35 * clamp01((Math.hypot(L.x, L.z) - 17) / 4);

  return { loops, shots };
}
