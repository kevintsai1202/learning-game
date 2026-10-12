/**
 * 班級島大型設施（docs/plans/grand-rides.md）：雲霄飛車、巨大摩天輪、環島飛船的位置、班次、座位的樣子（純函式）。
 * - 時間一律用校正過的牆上時間（秒，src/store/clockSync.ts 的 wallSec，由呼叫的一方給）。
 * - 雲霄飛車與飛船是固定班次：每 cycle 秒一班（從牆上時間 0 起算），一開始停在站上讓大家上車，時間到一起出發。
 * - 摩天輪一直慢慢轉，上車坐進最靠近底部、還有空位的車廂，轉一圈下車。
 * - 座位的樣子用和家具一樣的 ActFrame；雲霄飛車多帶 quat（角色跟著車廂翻轉）。
 * 模型（src/world/GrandRides.tsx）也用這裡的尺寸與動法，設施和坐在上面的角色才會一起動。
 * 不 import 畫面、音訊、3D 的程式。
 */
import type { ActFrame } from './furnitureUse';
import { COASTER_SEATS, WHEEL_SEATS } from './actCodes';
import { buildTimeline, buildTrack, quatFromBasis, trackAt, sAtTime, crossV3, type Piece, type Track, type Timeline, type V3 } from './coasterTrack';
import type { GrandRide } from './grandKinds';

/** 坐著時角色的原點在座位表面下面多少（身體底部約在 0.17） */
const SIT_DROP = 0.17;

/** 角度換算到 (−π, π] */
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** 點到線段的距離（水平） */
function segDist(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
}

/** 上車的範圍：離月台（或塔下）多近可以按 */
export const BOARD_RANGE = 2.6;

// ---------- 雲霄飛車 ----------

/** 車站：列車停的直線段（列車頭停在 x0，往西出發）、月台（島這一側，上車按鈕的範圍）、下車站的位置 */
export const STATION = { x0: -16, x1: -2, z: 23.4, y: 0.5, platform: { ax: -15, bx: -3, z: 21.9 }, exit: { x: -7, z: 19.6 } };

/**
 * 軌道（docs/plans/grand-rides.md 第 2.1 節）：南邊車站往西出發 → 西岸低低地從停著的飛船底下穿過 →
 * 西北爬坡 → 北邊摩天輪後面的大俯衝 → 東北的垂直大迴圈 → 東邊的螺旋 → 東岸的連續小山丘 → 南邊減速進站。
 * yaw：0 南、π/2 東、−π/2 西、π 北
 */
const P = (x: number, y: number, z: number): V3 => ({ x, y, z });
const E = Math.PI / 2;
const COASTER_PIECES: Piece[] = [
  // 出站（輪胎推）
  { kind: 'to', p: P(-21, 0.6, 23.2), yaw: -E, tag: 'station' },
  // 轉向北，沿西岸從停著的飛船底下穿過（輪胎推著走，固定速度）
  { kind: 'to', p: P(-28.5, 2.0, 12), yaw: Math.PI, tag: 'lift' },
  { kind: 'to', p: P(-29.2, 2.5, -3), yaw: Math.PI, tag: 'lift' },
  // 爬坡（鏈條）
  { kind: 'to', p: P(-27, 3.2, -13), yaw: Math.PI - 0.6, pitch: 0.35, tag: 'lift' },
  { kind: 'to', p: P(-17.5, 13.6, -23), yaw: 3 * Math.PI / 4, pitch: 0.6, tag: 'lift' },
  { kind: 'to', p: P(-11, 16, -26.6), yaw: E, tag: 'lift' },
  // 大俯衝
  { kind: 'to', p: P(2, 1.2, -29.5), yaw: E, k: 1.1 },
  { kind: 'to', p: P(7, 1.2, -29.5), yaw: E },
  // 垂直大迴圈（出口往北偏 2.4 公尺）
  { kind: 'loop', r: 5.2, shift: 2.4 },
  // 迴圈出口先直走離開迴圈底下，再爬上小山頭，接螺旋
  { kind: 'to', p: P(14, 1.2, -31.9), yaw: E },
  { kind: 'to', p: P(21, 6.5, -29.5), yaw: E + 0.5 },
  { kind: 'to', p: P(27, 7.5, -19), yaw: 0 },
  { kind: 'helix', r: 6.5, turn: 2 * Math.PI, drop: 4.5 },
  // 東岸的連續小山丘
  { kind: 'to', p: P(27.6, 4.6, -9), yaw: 0 },
  { kind: 'to', p: P(28.4, 1.6, -3), yaw: 0 },
  { kind: 'to', p: P(28.6, 4.2, 3), yaw: 0 },
  { kind: 'to', p: P(28.2, 1.6, 9), yaw: 0 },
  // 轉向西、減速進站（經過碼頭上方）
  { kind: 'to', p: P(20, 1.8, 24), yaw: -E, tag: 'brake' },
  { kind: 'to', p: P(6, 1.6, 24.4), yaw: -E, tag: 'brake' },
  { kind: 'to', p: P(STATION.x1, STATION.y, STATION.z), yaw: -E, tag: 'brake' },
  { kind: 'to', p: P(STATION.x0, STATION.y, STATION.z), yaw: -E, tag: 'brake' },
];

/** 列車：6 節、每節 2 排 × 2 人；節與節的間距、座位在車廂裡的位置（左右、前後、離軌道中心多高） */
export const TRAIN = { cars: 6, gap: 2.2, seatSide: 0.36, rowFront: 0.45, rowBack: -0.5, seatUp: 0.78 };

/** 雲霄飛車：停站讓大家上車幾秒 */
export const COASTER_BOARD = 20;

/** 軌道與時間表（第一次用到才算，之後共用） */
let coasterCache: { track: Track; timeline: Timeline; cycle: number } | null = null;
export function coaster(): { track: Track; timeline: Timeline; cycle: number } {
  if (!coasterCache) {
    const track = buildTrack({ p: P(STATION.x0, STATION.y, STATION.z), yaw: -E }, COASTER_PIECES);
    const timeline = buildTimeline(track);
    coasterCache = { track, timeline, cycle: COASTER_BOARD + Math.ceil(timeline.duration) };
  }
  return coasterCache;
}

/** 某一刻（牆上時間）的班次：第幾班、這一班開始後幾秒、停站中嗎、列車頭在軌道上的哪裡 */
export function coasterRun(wall: number): { run: number; phase: number; boarding: boolean; s: number } {
  const { track, timeline, cycle } = coaster();
  const run = Math.floor(wall / cycle);
  const phase = wall - run * cycle;
  const boarding = phase < COASTER_BOARD;
  return { run, phase, boarding, s: boarding ? 0 : sAtTime(track, timeline, phase - COASTER_BOARD) };
}

/** 第 k 節車廂中心在軌道上的位置與方向（s 是列車頭） */
export function carPose(s: number, k: number): { p: V3; f: V3; u: V3; left: V3 } {
  const { track } = coaster();
  const t = trackAt(track, s - k * TRAIN.gap);
  return { ...t, left: crossV3(t.u, t.f) };
}

/** 第 seat 個座位（0～23：節 × 4 + 排 × 2 + 左右）在列車頭位於 s 時的樣子 */
export function coasterSeatFrame(seat: number, s: number): ActFrame {
  const car = Math.floor(seat / 4);
  const row = Math.floor((seat % 4) / 2);
  const side = seat % 2 === 0 ? 1 : -1;
  const c = carPose(s, car);
  const along = row === 0 ? TRAIN.rowFront : TRAIN.rowBack;
  const up = TRAIN.seatUp - SIT_DROP;
  const x = c.p.x + c.left.x * side * TRAIN.seatSide + c.f.x * along + c.u.x * up;
  const y = c.p.y + c.left.y * side * TRAIN.seatSide + c.f.y * along + c.u.y * up;
  const z = c.p.z + c.left.z * side * TRAIN.seatSide + c.f.z * along + c.u.z * up;
  return { x, y, z, heading: Math.atan2(c.f.x, c.f.z), pose: 'sit', scale: 1, tiltX: 0, pivotY: 0, done: false, quat: quatFromBasis(c.left, c.u, c.f) };
}

/** 停站中離 pos 最近的空位（taken 是有人的座位；坐滿了是 null） */
export function freeCoasterSeat(taken: ReadonlySet<number>, pos: { x: number; z: number }): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (let seat = 0; seat < COASTER_SEATS; seat++) {
    if (taken.has(seat)) continue;
    const f = coasterSeatFrame(seat, 0);
    const d = Math.hypot(f.x - pos.x, f.z - pos.z);
    if (d < bestD) {
      best = seat;
      bestD = d;
    }
  }
  return best;
}

// ---------- 巨大摩天輪 ----------

/**
 * 巨大摩天輪：輪面朝南（在 z 這個平面上轉）；輪軸、半徑、車廂數、車廂吊在下面多深、一圈幾秒；
 * cabinZ 是車廂掛在輪子前面（南邊）多遠（第一人稱往南看時前面不會有輪框、輻條擋著）；
 * board 是月台上按按鈕的地方、exit 是下車站的位置
 */
export const WHEEL = { x: 0, z: -22.5, hubH: 12.4, r: 9.5, cabins: 12, cabinDrop: 2.3, cabinZ: 1.4, period: 100, board: { x: 0, z: -19.5 }, exit: { x: 1.6, z: -19.1 } };
/** 車廂裡的 4 個座位：北邊的長椅面向南、南邊的長椅面向北（局部座標，車廂地板中心為原點） */
const CABIN_SEATS = [
  { x: 0.38, z: -0.42, heading: 0 },
  { x: -0.38, z: -0.42, heading: 0 },
  { x: 0.38, z: 0.42, heading: Math.PI },
  { x: -0.38, z: 0.42, heading: Math.PI },
];
/** 長椅的高度（離車廂地板） */
const CABIN_BENCH = 0.45;

/** 第 i 個車廂吊點的角度（0 在最下面，越轉越大） */
export function wheelAngle(wall: number, i: number): number {
  return (2 * Math.PI * wall) / WHEEL.period + (i * 2 * Math.PI) / WHEEL.cabins;
}

/** 第 i 個車廂地板中心的世界座標 */
export function cabinFloor(wall: number, i: number): V3 {
  const a = wheelAngle(wall, i);
  return { x: WHEEL.x + WHEEL.r * Math.sin(a), y: WHEEL.hubH - WHEEL.r * Math.cos(a) - WHEEL.cabinDrop, z: WHEEL.z + WHEEL.cabinZ };
}

/** 摩天輪第 seat 個座位（0～47：車廂 × 4 + 位子）在某一刻的樣子 */
export function wheelSeatFrame(seat: number, wall: number): ActFrame {
  const f = cabinFloor(wall, Math.floor(seat / 4));
  const s = CABIN_SEATS[seat % 4];
  return { x: f.x + s.x, y: f.y + CABIN_BENCH - SIT_DROP, z: f.z + s.z, heading: s.heading, pose: 'sit', scale: 1, tiltX: 0, pivotY: 0, done: false };
}

/** 上車：最靠近底部、還有空位的車廂裡的空位（taken 是有人的座位；全滿是 null） */
export function freeWheelSeat(taken: ReadonlySet<number>, wall: number): number | null {
  const cabins = Array.from({ length: WHEEL.cabins }, (_, i) => i).sort((a, b) => Math.abs(wrap(wheelAngle(wall, a))) - Math.abs(wrap(wheelAngle(wall, b))));
  for (const c of cabins) for (let k = 0; k < 4; k++) if (!taken.has(c * 4 + k)) return c * 4 + k;
  return null;
}

// ---------- 環島飛船 ----------

/** 繫留塔：位置、高度、碰撞半徑；board 是塔下按按鈕的地方、exit 是下船站的位置 */
export const MAST = { x: -20.6, z: -4.5, h: 7.5, r: 1.3, board: { x: -19.2, z: -4.3 }, exit: { x: -18.8, z: -3.6 } };

/**
 * 飛船：停靠的位置（甲板中心）、甲板高度、繞島的半徑與高度、班次（停靠、飛行秒數）、甲板的大小（局部座標：
 * +x 是靠島那一側、+z 是船頭）、甲板上的障礙（舵輪）、上船站的位置
 */
export const SHIP = {
  dock: { x: -27.6, z: -4.5 },
  deckY: 7.5,
  cruiseR: 35,
  cruiseY: 18,
  board: 25,
  flight: 95,
  /** 開始與結束時加減速的秒數 */
  ease: 8,
  /** 往外飛、爬升（降落時倒過來）花的秒數，出發後 climbAt 秒開始 */
  climb: 12,
  climbAt: 2,
  halfW: 2.1,
  halfL: 5,
  wheel: { x: 0, z: 4.1, r: 0.45 },
  boardAt: { x: 1.4, z: 0, h: -Math.PI / 2 },
};
/** 飛船一班幾秒 */
export const SHIP_CYCLE = SHIP.board + SHIP.flight;

/** 停靠的角度（從島中心看，heading 的方向）與半徑 */
const DOCK_TH = Math.atan2(SHIP.dock.x, SHIP.dock.z);
const DOCK_R = Math.hypot(SHIP.dock.x, SHIP.dock.z);

/** 平滑的 0→1（a 到 b 之間） */
function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 起飛後 t 秒繞到的角度（梯形速度：加速 ease 秒、等速、減速 ease 秒，總共一圈） */
function shipTheta(t: number): number {
  const T = SHIP.flight;
  const a = SHIP.ease;
  const w = (2 * Math.PI) / (T - a);
  const tt = Math.max(0, Math.min(T, t));
  let d: number;
  if (tt < a) d = (w * tt * tt) / (2 * a);
  else if (tt < T - a) d = (w * a) / 2 + w * (tt - a);
  else d = 2 * Math.PI - (w * (T - tt) * (T - tt)) / (2 * a);
  return DOCK_TH + d;
}

/** 起飛後 t 秒的位置（不含朝向） */
function shipPos(t: number): V3 {
  const out = smooth(SHIP.climbAt, SHIP.climbAt + SHIP.climb, t) * smooth(SHIP.flight - SHIP.climbAt, SHIP.flight - SHIP.climbAt - SHIP.climb, t);
  const r = DOCK_R + (SHIP.cruiseR - DOCK_R) * out;
  const th = shipTheta(t);
  return { x: r * Math.sin(th), y: SHIP.deckY + (SHIP.cruiseY - SHIP.deckY) * out, z: r * Math.cos(th) };
}

/** 某一刻飛船的班次：第幾班、這一班開始後幾秒、停靠中嗎、甲板中心的位置與船頭朝向 */
export function shipState(wall: number): { run: number; phase: number; docked: boolean; x: number; y: number; z: number; heading: number } {
  const run = Math.floor(wall / SHIP_CYCLE);
  const phase = wall - run * SHIP_CYCLE;
  const t = phase - SHIP.board;
  const p = shipPos(t);
  // 朝向：前後一點點的位置差（停著時速度是 0，用繞島的切線方向）
  const a = shipPos(t - 0.25);
  const b = shipPos(t + 0.25);
  const moving = Math.hypot(b.x - a.x, b.z - a.z) > 1e-3;
  const heading = moving ? Math.atan2(b.x - a.x, b.z - a.z) : wrap(shipTheta(t) + Math.PI / 2);
  return { run, phase, docked: t <= 0 || t >= SHIP.flight, ...p, heading };
}

/** 甲板上的局部座標換成世界座標（ship 是 shipState 的結果） */
export function deckToWorld(ship: { x: number; z: number; heading: number }, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  return { x: ship.x + lx * c + lz * s, z: ship.z - lx * s + lz * c };
}

/** 世界座標換成甲板上的局部座標 */
export function worldToDeck(ship: { x: number; z: number; heading: number }, x: number, z: number): { x: number; z: number } {
  const dx = x - ship.x;
  const dz = z - ship.z;
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** 甲板上能走的範圍（角色的半徑 0.35 留在欄杆內）與舵輪的碰撞：把局部座標推回能站的地方 */
export function clampDeck(lx: number, lz: number): { x: number; z: number } {
  const m = 0.35;
  let x = Math.max(-SHIP.halfW + m, Math.min(SHIP.halfW - m, lx));
  let z = Math.max(-SHIP.halfL + m, Math.min(SHIP.halfL - m, lz));
  const w = SHIP.wheel;
  const d = Math.hypot(x - w.x, z - w.z);
  const r = w.r + m;
  if (d < r) {
    const ux = d < 1e-6 ? 1 : (x - w.x) / d;
    const uz = d < 1e-6 ? 0 : (z - w.z) / d;
    x = w.x + ux * r;
    z = w.z + uz * r;
  }
  return { x, z };
}

/** 甲板上的角色（局部位置 x、z，面向 h）在某一刻的樣子 */
export function shipFrame(deck: { x: number; z: number; h: number }, wall: number): ActFrame {
  const ship = shipState(wall);
  const w = deckToWorld(ship, deck.x, deck.z);
  return { x: w.x, y: ship.y, z: w.z, heading: wrap(ship.heading + deck.h), pose: 'stand', scale: 1, tiltX: 0, pivotY: 0, done: false };
}

// ---------- 正在玩的人的樣子 ----------

/**
 * 三樣設施的名字、圖示、按鈕的字（價錢寫在按鈕上；字要短，360 寬的手機上大動作鍵才不會壓到搖桿，
 * 設施的名字在電腦版的卡片與不能上時的提示上）
 */
export const GRAND_LOOK: Record<GrandRide, { name: string; emoji: string; label: string }> = {
  coaster: { name: '雲霄飛車', emoji: '🎢', label: '🎢 上車 5🪙' },
  wheel: { name: '摩天輪', emoji: '🎡', label: '🎡 上車 5🪙' },
  ship: { name: '環島飛船', emoji: '🎈', label: '🎈 上船 5🪙' },
};

/**
 * 自己正在玩的設施在某一刻（牆上時間）的樣子：雲霄飛車照自己那一班（出發前在站上）、摩天輪照座位、
 * 飛船照甲板上的位置；這一趟結束了 done（站到下車站）
 */
export function grandFrame(act: { ride: GrandRide; seat: number; run: number; w0: number; deck: { x: number; z: number; h: number } | null }, wall: number): ActFrame {
  const done = wall >= rideEnd(act.ride, act.run, act.w0);
  let f: ActFrame;
  if (act.ride === 'coaster') {
    const { track, timeline } = coaster();
    const go = act.run * coaster().cycle + COASTER_BOARD;
    f = coasterSeatFrame(act.seat, wall < go ? 0 : done ? 0 : sAtTime(track, timeline, wall - go));
  } else if (act.ride === 'wheel') f = wheelSeatFrame(act.seat, wall);
  else f = shipFrame(act.deck ?? SHIP.boardAt, wall);
  return { ...f, done };
}

/** 別人（看到他的動作代碼）在某一刻的樣子：照本機的時鐘（雲霄飛車看這一班、飛船的位置是他送來的甲板座標） */
export function grandRemoteFrame(ride: GrandRide, seat: number, wall: number, deck: { x: number; z: number; h: number }): ActFrame {
  if (ride === 'coaster') return coasterSeatFrame(seat, coasterRun(wall).s);
  if (ride === 'wheel') return wheelSeatFrame(seat, wall);
  return shipFrame(deck, wall);
}

// ---------- 班次、上車、下車 ----------

/** 現在能不能上車（停站／停靠中，而且離出發至少 1 秒）與還要等幾秒（不能上車時是下一班停站的時間；能上車時是出發的時間） */
export function boardingOf(ride: GrandRide, wall: number): { open: boolean; wait: number } {
  if (ride === 'wheel') return { open: true, wait: 0 };
  const cycle = ride === 'coaster' ? coaster().cycle : SHIP_CYCLE;
  const board = ride === 'coaster' ? COASTER_BOARD : SHIP.board;
  const phase = wall - Math.floor(wall / cycle) * cycle;
  if (phase < board - 1) return { open: true, wait: board - phase };
  return { open: false, wait: cycle - phase };
}

/** 這一趟什麼時候結束（牆上時間）：雲霄飛車與飛船是這一班結束、摩天輪是上車後轉一圈 */
export function rideEnd(ride: GrandRide, run: number, w0: number): number {
  if (ride === 'coaster') return (run + 1) * coaster().cycle;
  if (ride === 'ship') return (run + 1) * SHIP_CYCLE;
  return w0 + WHEEL.period;
}

/** 這一趟出發了沒（雲霄飛車與飛船：停站時間過了；摩天輪一上車就算） */
export function departed(ride: GrandRide, run: number, wall: number): boolean {
  if (ride === 'wheel') return true;
  const start = ride === 'coaster' ? run * coaster().cycle + COASTER_BOARD : run * SHIP_CYCLE + SHIP.board;
  return wall >= start;
}

/** 下車站的位置 */
export function grandExit(ride: GrandRide): { x: number; z: number } {
  return ride === 'coaster' ? STATION.exit : ride === 'wheel' ? WHEEL.exit : MAST.exit;
}

/** 角色旁邊（上車的範圍內）的設施；沒有是 null */
export function grandNear(pos: { x: number; z: number }): GrandRide | null {
  const pf = STATION.platform;
  if (segDist(pos, { x: pf.ax, z: pf.z }, { x: pf.bx, z: pf.z }) <= BOARD_RANGE) return 'coaster';
  if (Math.hypot(pos.x - WHEEL.board.x, pos.z - WHEEL.board.z) <= BOARD_RANGE) return 'wheel';
  if (Math.hypot(pos.x - MAST.board.x, pos.z - MAST.board.z) <= BOARD_RANGE) return 'ship';
  return null;
}

/**
 * 自己的座位要不要換（每一格畫面算；docs/plans/grand-rides.md 第 4 節）：別人也坐同一個位子時 id 小的留著；
 * 自己被擠掉就換到空位（摩天輪先找同一個車廂，雲霄飛車找離原本座位最近的），沒有空位是 null（下來）。飛船沒有座位
 */
export function resolveGrandSeat(ride: GrandRide, self: { id: string; seat: number }, others: readonly { id: string; ride: GrandRide; seat: number }[], wall: number): number | null {
  if (ride === 'ship') return self.seat;
  const same = others.filter((r) => r.ride === ride);
  if (!same.some((r) => r.seat === self.seat && r.id < self.id)) return self.seat;
  const taken = new Set(same.map((r) => r.seat));
  if (ride === 'coaster') {
    const at = coasterSeatFrame(self.seat, 0);
    return freeCoasterSeat(taken, { x: at.x, z: at.z });
  }
  const cabin = Math.floor(self.seat / 4);
  for (let k = 0; k < 4; k++) if (!taken.has(cabin * 4 + k)) return cabin * 4 + k;
  return freeWheelSeat(taken, wall);
}

/** 某樣設施的座位數（飛船沒有座位，甲板上不限人數） */
export function grandSeats(ride: GrandRide): number {
  return ride === 'coaster' ? COASTER_SEATS : ride === 'wheel' ? WHEEL_SEATS : Infinity;
}

/** 設施伸進可以走的範圍裡的碰撞（世界座標）：摩天輪的前腳、繫留塔 */
export function grandObstacles(): { x: number; z: number; r: number }[] {
  return [
    { x: WHEEL.x - 5.5, z: WHEEL.z + 2, r: 0.6 },
    { x: WHEEL.x + 5.5, z: WHEEL.z + 2, r: 0.6 },
    { x: MAST.x, z: MAST.z, r: MAST.r },
  ];
}

/** 班級島上要拿掉樹與花的地方（月台、摩天輪、繫留塔附近） */
export const GRAND_CLEAR: readonly { x: number; z: number; r: number }[] = [
  { x: -9, z: 20.5, r: 5 },
  { x: 0, z: -20.5, r: 7.5 },
  { x: MAST.x, z: MAST.z, r: 4.5 },
];

// ---------- 鏡頭：靠近高的設施時拉遠、往上看 ----------

/**
 * 角色在 pos 時鏡頭要拉遠幾倍（zoom，1 是不變）與看的點抬高幾公尺（lift）：
 * 離摩天輪月台 6 公尺內全開、15 公尺外不變；繫留塔 5 公尺內全開、12 公尺外不變（中間平滑過渡）
 */
export function tallView(pos: { x: number; z: number }): { zoom: number; lift: number } {
  const dw = Math.hypot(pos.x - WHEEL.board.x, pos.z - WHEEL.board.z);
  const dm = Math.hypot(pos.x - MAST.board.x, pos.z - MAST.board.z);
  const kw = 1 - smooth(6, 15, dw);
  const km = 1 - smooth(5, 12, dm);
  return { zoom: 1 + 0.6 * kw + 0.3 * km, lift: 11 * kw + 5 * km };
}
