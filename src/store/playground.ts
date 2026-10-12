/**
 * 班級島遊樂場（docs/plans/playground.md）：4 個位置、八種大型遊樂器材的座位與動法（純函式）。
 * - 器材的局部座標以位置中心為原點、正面朝 +z（不轉方向）。角色原比例（約 2.05 公尺高、身體底部 0.17）。
 * - 一直在動的器材（旋轉木馬、翹翹板、彈跳床、摩天輪、咖啡杯、小火車）照牆上的時間（clock.wall，秒）算：
 *   同一台裝置上大家的位置一致；鞦韆組與溜滑梯城堡照坐上去之後幾秒（clock.since）算。
 * - 模型（src/world/Playground.tsx）也用這裡的角度與尺寸，器材和坐在上面的角色才會一起動。
 * - 座位的樣子用和家具一樣的 ActFrame（位置、抬高、朝向、姿勢、繞樞軸的傾斜）。
 * 不 import 畫面、音訊、3D 的程式。
 */
import type { ActFrame } from './furnitureUse';
import { SWING_PIVOT, swingAngle } from './furnitureUse';
import type { Playground, RideKind } from './rideKinds';

/** 位置的半徑（公尺；器材都在這個圓裡） */
export const SPOT_RADIUS = 2.6;
/**
 * 班級島上的 4 個遊樂場位置：廣場西邊、東邊、西南海灘旁、東南海灘旁
 * （掃描過不碰到建築、門口、步道、廣場、出生點、噴水池；數學城堡比文字森林大，西邊往廣場靠一點；
 * tests/store/playground.test.ts）
 */
export const PLAYGROUND_SPOTS: readonly { x: number; z: number }[] = [
  { x: -9.5, z: -1 },
  { x: 10, z: -1.5 },
  { x: -14, z: 10 },
  { x: 14, z: 10 },
];

/** 一種器材：名字、圖示、按鈕的字、座位數、照哪個時鐘、玩的途中能不能起來、一趟多久（溜滑梯城堡） */
export interface RideSpec {
  name: string;
  emoji: string;
  label: string;
  seats: number;
  clock: 'wall' | 'since';
  /** 途中不能起來（溜完自己站起來） */
  locked?: boolean;
  /** 一趟多久（秒；做完自己站起來） */
  duration?: number;
}

/** 溜滑梯城堡的時間軸（秒）：爬梯子、走到滑道口坐下、溜、站起來走到出口 */
const CASTLE_CLIMB = 1.4;
const CASTLE_TURN = 0.3;
const CASTLE_SLIDE = 1.5;
const CASTLE_OUT = 0.3;

/** 八種器材 */
export const RIDES: Record<RideKind, RideSpec> = {
  carousel: { name: '旋轉木馬', emoji: '🎠', label: '🎠 騎木馬', seats: 6, clock: 'wall' },
  seesaw: { name: '翹翹板', emoji: '⚖️', label: '⚖️ 玩翹翹板', seats: 4, clock: 'wall' },
  swingset: { name: '大鞦韆組', emoji: '🪢', label: '🪢 盪鞦韆', seats: 4, clock: 'since' },
  trampoline: { name: '彈跳床', emoji: '🤸', label: '🤸 跳彈跳床', seats: 6, clock: 'wall' },
  slidecastle: {
    name: '溜滑梯城堡',
    emoji: '🏰',
    label: '🏰 溜滑梯',
    seats: 2,
    clock: 'since',
    locked: true,
    duration: CASTLE_CLIMB + CASTLE_TURN + CASTLE_SLIDE + CASTLE_OUT,
  },
  ferris: { name: '摩天輪', emoji: '🎡', label: '🎡 坐摩天輪', seats: 6, clock: 'wall' },
  teacups: { name: '咖啡杯', emoji: '☕', label: '☕ 坐咖啡杯', seats: 6, clock: 'wall' },
  train: { name: '小火車', emoji: '🚂', label: '🚂 坐小火車', seats: 6, clock: 'wall' },
};

/** 兩個時鐘：wall 是牆上的時間（秒），since 是坐上去之後幾秒 */
export interface RideClock {
  wall: number;
  since: number;
}

/** 碰撞圓（局部座標） */
interface Circle {
  x: number;
  z: number;
  r: number;
}

// ---------- 每一種器材的尺寸與動法（模型也用） ----------

/** 旋轉木馬：平台半徑、木馬離中心多遠、轉的快慢（弧度／秒）、木馬上下的幅度與快慢 */
export const CAROUSEL = { platformR: 2.3, horseR: 1.55, spin: 0.45, bob: 0.15, bobRate: 2.2, platformTop: 0.3, saddle: 0.55 };
/** 旋轉木馬轉到的角度（第 i 匹木馬的方向；heading 的方向，0 是 +z） */
export function carouselAngle(wall: number, i: number): number {
  return CAROUSEL.spin * wall + (i * Math.PI) / 3;
}
/** 第 i 匹木馬的上下起伏（公尺） */
export function horseBob(wall: number, i: number): number {
  return CAROUSEL.bob * Math.sin(CAROUSEL.bobRate * wall + (i * Math.PI) / 3);
}

/** 翹翹板：兩座在 z ±0.7，座位在 x ±1.35；支點高度、最大傾斜、上下的快慢 */
export const SEESAW = { boardZ: [-0.7, 0.7], seatX: 1.35, pivotH: 0.55, maxTilt: 0.3, rate: 2.0, seatTop: 0.08, half: 1.5 };
/**
 * 第 board 座翹翹板的傾斜（弧度；正的是 −x 那一端往下）：兩邊都有人才上下；只有一邊有人，那邊沉下去；沒人是平的
 */
export function seesawTilt(board: number, occupied: readonly boolean[], wall: number): number {
  const left = !!occupied[board * 2];
  const right = !!occupied[board * 2 + 1];
  if (left && right) return SEESAW.maxTilt * Math.sin(SEESAW.rate * wall + board * 1.3);
  if (left) return SEESAW.maxTilt;
  if (right) return -SEESAW.maxTilt;
  return 0;
}

/** 大鞦韆組：4 個鞦韆的 x、柱子的 x（橫桿高度照單人鞦韆 SWING_PIVOT，盪的角度照 swingAngle） */
export const SWINGSET = { seatX: [-1.65, -0.55, 0.55, 1.65], postX: 2.25, postZ: 0.45 };

/** 彈跳床：床的半徑與高度、站的位置離中心多遠、彈的高度與快慢 */
export const TRAMPOLINE = { bedR: 2.2, bedH: 0.6, spotR: 1.15, jump: 0.85, rate: 3.0 };
/** 第 i 個位置彈到的高度（離床面，公尺；每個位置錯開） */
export function trampolineJump(wall: number, i: number): number {
  return TRAMPOLINE.jump * Math.abs(Math.sin(TRAMPOLINE.rate * wall + i * 1.1));
}

/** 溜滑梯城堡：塔的中心與半寬、平台高度、兩把梯子的 x、直滑道的終點、螺旋滑道的中心與半徑、圈數、出口 */
export const CASTLE = {
  towerZ: -0.9,
  towerHalf: 0.7,
  top: 2.0,
  ladderX: [0.35, -0.35],
  straightEnd: 2.35,
  spiral: { x: -1.5, z: -0.9, r: 0.8, turns: 1.25 },
  bottom: 0.15,
  exits: [
    { x: 2.75, z: 0.2 },
    { x: -1.5, z: 0.95 },
  ],
};
/** 螺旋滑道上 k（0～1）的位置與高度：從塔那一側（+x）開始往下繞，最後在前面（+z）落地 */
export function spiralPoint(k: number): { x: number; z: number; h: number; heading: number } {
  const s = CASTLE.spiral;
  // 角度（heading 的方向）：從 +x（π/2）開始，順著 heading 變小的方向繞 turns 圈，最後停在 +z（0 或 2π 的倍數）
  const start = Math.PI / 2;
  const total = start + Math.PI * 2 * (s.turns - 0.25);
  const a = start - total * k;
  return { x: s.x + s.r * Math.sin(a), z: s.z + s.r * Math.cos(a), h: CASTLE.top + (CASTLE.bottom - CASTLE.top) * k, heading: a - Math.PI / 2 };
}

/**
 * 摩天輪：輪軸的 z 與高度、輪子半徑、轉的快慢、車廂吊在下面多深（車廂比坐著的角色高：座位到頭頂約 1.9 公尺）
 */
export const FERRIS = { hubZ: -0.2, hubH: 4.8, wheelR: 2.4, spin: 0.22, cabinDrop: 2.3, seatZ: 0.15 };
/** 第 i 個車廂的吊點角度（0 在最下面，照轉的方向變大） */
export function ferrisAngle(wall: number, i: number): number {
  return FERRIS.spin * wall + (i * Math.PI) / 3;
}
/** 第 i 個車廂吊點的位置（x 與高度） */
export function ferrisHang(wall: number, i: number): { x: number; y: number } {
  const a = ferrisAngle(wall, i);
  return { x: FERRIS.wheelR * Math.sin(a), y: FERRIS.hubH - FERRIS.wheelR * Math.cos(a) };
}

/** 咖啡杯：平台半徑、杯子繞中心的半徑與快慢、杯子自己轉的快慢、座位離杯子中心多遠 */
export const TEACUPS = { platformR: 2.35, orbitR: 1.3, orbit: 0.5, spin: 1.4, seatR: 0.42, cupR: 0.85, floor: 0.3 };
/** 第 i 個杯子的中心與自己轉到的角度 */
export function teacupPose(wall: number, i: number): { x: number; z: number; spin: number } {
  const a = TEACUPS.orbit * wall + (i * 2 * Math.PI) / 3;
  return { x: TEACUPS.orbitR * Math.sin(a), z: TEACUPS.orbitR * Math.cos(a), spin: TEACUPS.spin * wall + i };
}

/** 小火車：軌道半徑、跑的快慢、每個座位落後多少（弧度；兩個座位一節車廂） */
export const TRAIN = { trackR: 1.75, speed: 0.55, gap: 0.5, seatTop: 0.6 };
/** 第 s 個座位在軌道上的角度 */
export function trainAngle(wall: number, s: number): number {
  return TRAIN.speed * wall - s * TRAIN.gap;
}

/** 每一種器材的碰撞圓（局部座標；站著的人走不進去） */
const SOLIDS: Record<RideKind, Circle[]> = {
  carousel: [{ x: 0, z: 0, r: 2.35 }],
  seesaw: SEESAW.boardZ.flatMap((z) => [-0.9, 0, 0.9].map((x) => ({ x, z, r: 0.55 }))),
  swingset: [
    ...[-1, 1].map((s) => ({ x: s * SWINGSET.postX, z: 0, r: 0.5 })),
    ...SWINGSET.seatX.map((x) => ({ x, z: 0, r: 0.5 })),
  ],
  trampoline: [{ x: 0, z: 0, r: 2.3 }],
  slidecastle: [
    { x: 0, z: CASTLE.towerZ, r: 1.0 },
    { x: 1.3, z: CASTLE.towerZ, r: 0.45 },
    { x: 2.0, z: CASTLE.towerZ, r: 0.4 },
    { x: CASTLE.spiral.x, z: CASTLE.spiral.z, r: 1.05 },
  ],
  ferris: [{ x: 0, z: FERRIS.hubZ, r: 2.45 }],
  teacups: [{ x: 0, z: 0, r: 2.4 }],
  train: [{ x: 0, z: 0, r: 2.3 }],
};

// ---------- 座位的樣子 ----------

/** 坐著時角色抬多高：座位表面高 top（身體底部約在 0.17） */
const sitY = (top: number) => Math.max(0, top - 0.17);

/** 坐、站在器材上的 ActFrame（沒有傾斜、原比例） */
function frame(c: { x: number; z: number }, lx: number, lz: number, y: number, heading: number, pose: ActFrame['pose'], done = false): ActFrame {
  return { x: c.x + lx, z: c.z + lz, y, heading, pose, scale: 1, tiltX: 0, pivotY: 0, done };
}

/** 兩個數之間依比例取值（比例夾在 0～1） */
function lerp(a: number, b: number, k: number): number {
  const t = Math.max(0, Math.min(1, k));
  return a + (b - a) * t;
}

/** 溜滑梯城堡第 seat 條滑道的時間軸（局部座標）：爬梯子 → 走到滑道口坐下 → 溜下來 → 站起來走到出口 */
function castleLocal(seat: number, since: number): { x: number; z: number; y: number; heading: number; pose: ActFrame['pose']; done: boolean } {
  const lx = CASTLE.ladderX[seat];
  const ladderZ = CASTLE.towerZ + CASTLE.towerHalf + 0.45;
  const sitTop = CASTLE.top - 0.17;
  /** 滑道口：直滑道在塔的 +x 邊、螺旋滑道在 −x 邊 */
  const startX = seat === 0 ? CASTLE.towerHalf + 0.05 : -CASTLE.towerHalf - 0.05;
  const exit = CASTLE.exits[seat];
  let t = since;
  if (t < CASTLE_CLIMB) return { x: lx, z: ladderZ, y: lerp(0, CASTLE.top, t / CASTLE_CLIMB), heading: Math.PI, pose: 'climb', done: false };
  t -= CASTLE_CLIMB;
  const slideHeading = seat === 0 ? Math.PI / 2 : -Math.PI / 2;
  if (t < CASTLE_TURN) {
    const k = t / CASTLE_TURN;
    return { x: lerp(lx, startX, k), z: lerp(ladderZ, CASTLE.towerZ, k), y: lerp(CASTLE.top, sitTop, k), heading: slideHeading, pose: 'sit', done: false };
  }
  t -= CASTLE_TURN;
  if (t < CASTLE_SLIDE) {
    const k = t / CASTLE_SLIDE;
    if (seat === 0) return { x: lerp(startX, CASTLE.straightEnd, k), z: CASTLE.towerZ, y: lerp(sitTop, sitY(CASTLE.bottom + 0.05), k), heading: slideHeading, pose: 'sit', done: false };
    const p = spiralPoint(k);
    return { x: p.x, z: p.z, y: sitY(p.h + 0.05), heading: p.heading, pose: 'sit', done: false };
  }
  t -= CASTLE_SLIDE;
  /** 滑道的終點 */
  const end = seat === 0 ? { x: CASTLE.straightEnd, z: CASTLE.towerZ } : spiralPoint(1);
  if (t < CASTLE_OUT) {
    const k = t / CASTLE_OUT;
    return { x: lerp(end.x, exit.x, k), z: lerp(end.z, exit.z, k), y: 0, heading: Math.atan2(exit.x - end.x, exit.z - end.z), pose: 'stand', done: false };
  }
  return { x: exit.x, z: exit.z, y: 0, heading: Math.atan2(exit.x - end.x, exit.z - end.z), pose: 'stand', done: true };
}

/**
 * 某一刻坐在第 seat 個座位上的樣子（c 是位置中心；occupied 是這一座的每個座位有沒有人，翹翹板用）。
 * 器材的模型照同一組函式動，角色和器材一起動
 */
export function rideFrame(kind: RideKind, seat: number, c: { x: number; z: number }, clock: RideClock, occupied: readonly boolean[]): ActFrame {
  const w = clock.wall;
  switch (kind) {
    case 'carousel': {
      const a = carouselAngle(w, seat);
      const r = CAROUSEL.horseR;
      return frame(c, r * Math.sin(a), r * Math.cos(a), sitY(CAROUSEL.platformTop + CAROUSEL.saddle + horseBob(w, seat)), a + Math.PI / 2, 'sit');
    }
    case 'seesaw': {
      const board = Math.floor(seat / 2);
      const side = seat % 2 === 0 ? -1 : 1;
      const tilt = seesawTilt(board, occupied, w);
      const x = side * SEESAW.seatX;
      const top = SEESAW.pivotH + x * Math.sin(tilt) + SEESAW.seatTop;
      // 面向翹翹板的中間
      return frame(c, x * Math.cos(tilt), SEESAW.boardZ[board], sitY(top), side < 0 ? Math.PI / 2 : -Math.PI / 2, 'sit');
    }
    case 'swingset':
      // 和單人鞦韆一樣：繞橫桿前後盪（照坐上去之後幾秒）
      return { ...frame(c, SWINGSET.seatX[seat], 0, 0.28, 0, 'sit'), tiltX: swingAngle(clock.since), pivotY: SWING_PIVOT };
    case 'trampoline': {
      const a = (seat * Math.PI) / 3;
      const r = TRAMPOLINE.spotR;
      return frame(c, r * Math.sin(a), r * Math.cos(a), TRAMPOLINE.bedH + trampolineJump(w, seat), a + Math.PI, 'stand');
    }
    case 'slidecastle': {
      const s = castleLocal(seat, clock.since);
      return frame(c, s.x, s.z, s.y, s.heading, s.pose, s.done);
    }
    case 'ferris': {
      const h = ferrisHang(w, seat);
      return frame(c, h.x, FERRIS.seatZ, sitY(h.y - FERRIS.cabinDrop + 0.35), 0, 'sit');
    }
    case 'teacups': {
      const cup = teacupPose(w, Math.floor(seat / 2));
      const a = cup.spin + (seat % 2) * Math.PI;
      // 面向杯子的中間
      return frame(c, cup.x + TEACUPS.seatR * Math.sin(a), cup.z + TEACUPS.seatR * Math.cos(a), sitY(TEACUPS.floor + 0.25), a + Math.PI, 'sit');
    }
    case 'train': {
      const a = trainAngle(w, seat);
      return frame(c, TRAIN.trackR * Math.sin(a), TRAIN.trackR * Math.cos(a), sitY(TRAIN.seatTop), a + Math.PI / 2, 'sit');
    }
  }
}

/** 下車點：器材外面、碰撞圓外（from 是角色現在的位置；圓形的器材往角色那個方向走出去） */
export function rideExit(kind: RideKind, seat: number, c: { x: number; z: number }, from: { x: number; z: number }): { x: number; z: number } {
  /** 從中心往 from 的方向，走到半徑 r 的圓外面 */
  const radial = (r: number, oz = 0) => {
    const dx = from.x - c.x;
    const dz = from.z - (c.z + oz);
    const len = Math.hypot(dx, dz);
    const ux = len < 0.1 ? 0 : dx / len;
    const uz = len < 0.1 ? 1 : dz / len;
    return { x: c.x + ux * (r + 0.65), z: c.z + oz + uz * (r + 0.65) };
  };
  switch (kind) {
    case 'carousel':
    case 'trampoline':
    case 'teacups':
    case 'train':
      return radial(SOLIDS[kind][0].r);
    case 'ferris':
      return { x: c.x, z: c.z + FERRIS.hubZ + SOLIDS.ferris[0].r + 0.65 };
    case 'seesaw': {
      const board = Math.floor(seat / 2);
      const side = seat % 2 === 0 ? -1 : 1;
      return { x: c.x + side * (SEESAW.half + 0.9), z: c.z + SEESAW.boardZ[board] };
    }
    case 'swingset':
      return { x: c.x + SWINGSET.seatX[seat], z: c.z + 1.6 };
    case 'slidecastle':
      return { x: c.x + CASTLE.exits[seat].x, z: c.z + CASTLE.exits[seat].z };
  }
}

/** 全部座位都空著（選座位時算位置用） */
const NONE: readonly boolean[] = Array(8).fill(false);

/** 選離角色（pos）最近的空位；taken 是已經有人的座位；坐滿了是 null。照坐上去之後算的器材看剛坐上去的位置 */
export function freeSeat(kind: RideKind, taken: ReadonlySet<number>, c: { x: number; z: number }, pos: { x: number; z: number }, clock: RideClock): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (let seat = 0; seat < RIDES[kind].seats; seat++) {
    if (taken.has(seat)) continue;
    const f = rideFrame(kind, seat, c, { wall: clock.wall, since: 0 }, NONE);
    const d = Math.hypot(f.x - pos.x, f.z - pos.z);
    if (d < bestD) {
      best = seat;
      bestD = d;
    }
  }
  return best;
}

/** 一個人坐在哪一座（位置編號）的哪個座位 */
export interface Rider {
  id: string;
  slot: number;
  seat: number;
}

/** 誰坐在哪裡："slot:seat" → 那個人的 id；bumped 是搶輸的人（同一個位子 id 小的留著） */
export interface SeatMap {
  seats: Map<string, string>;
  bumped: string[];
}

/** 算誰坐在哪裡：同一個位子有好幾個人時 id 小的留著，其他人被擠掉（每台裝置算的一樣，和收到的順序無關） */
export function seatMap(riders: readonly Rider[]): SeatMap {
  const byKey = new Map<string, string[]>();
  for (const r of riders) {
    const key = `${r.slot}:${r.seat}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r.id]);
  }
  const seats = new Map<string, string>();
  const bumped: string[] = [];
  for (const key of [...byKey.keys()].sort()) {
    const ids = [...byKey.get(key)!].sort();
    seats.set(key, ids[0]);
    bumped.push(...ids.slice(1));
  }
  return { seats, bumped: bumped.sort() };
}

/** 某一座（位置編號）有人的座位 */
export function takenSeats(m: SeatMap, slot: number): Set<number> {
  const out = new Set<number>();
  for (const key of m.seats.keys()) {
    const [s, seat] = key.split(':').map(Number);
    if (s === slot) out.add(seat);
  }
  return out;
}

/**
 * 自己的座位要不要換（每一格畫面算）：別人也坐同一個位子時 id 小的留著；自己被擠掉就換到最近的空位，
 * 沒有空位是 null（起來）。others 是別人（同一座或別座都可以，只看同一座的）
 */
export function resolveSeat(kind: RideKind, self: Rider, others: readonly Rider[]): { seat: number | null } {
  const same = others.filter((r) => r.slot === self.slot);
  const m = seatMap([...same, self]);
  if (!m.bumped.includes(self.id)) return { seat: self.seat };
  const taken = new Set(same.map((r) => r.seat));
  const c = PLAYGROUND_SPOTS[self.slot];
  // 被擠掉：換到離原本座位最近的空位
  const at = rideFrame(kind, self.seat, c, { wall: 0, since: 0 }, NONE);
  return { seat: freeSeat(kind, taken, c, at, { wall: 0, since: 0 }) };
}

/** 角色旁邊（器材外圍 max 公尺內）最近的那一座器材的位置編號；空的位置不算；沒有是 null */
export function slotNear(pg: Playground, pos: { x: number; z: number }, max = 1.5): number | null {
  let best: number | null = null;
  let bestD = max;
  pg.forEach((kind, i) => {
    if (!kind) return;
    const s = PLAYGROUND_SPOTS[i];
    const d = Math.hypot(pos.x - s.x, pos.z - s.z) - SPOT_RADIUS;
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** 遊樂場的碰撞（世界座標）：選了器材的位置才有 */
export function rideObstacles(pg: Playground): { x: number; z: number; r: number }[] {
  return pg.flatMap((kind, i) => {
    if (!kind) return [];
    const s = PLAYGROUND_SPOTS[i];
    return SOLIDS[kind].map((o) => ({ x: s.x + o.x, z: s.z + o.z, r: o.r }));
  });
}
