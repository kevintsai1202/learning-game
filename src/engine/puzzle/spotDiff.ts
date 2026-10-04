/**
 * 找不同的規則（純函式）：用種子產生島上風景（物件清單），右圖改幾處，點擊判定、星數、機器人的速度。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。畫面在 src/puzzle/spot/（SVG 依物件清單畫圖）。
 *
 * 不同處的種類：顏色（color）、少一樣（missing）、大小（size，普通以上）、左右翻轉（flip，厲害才有）。
 * 每一處的點擊範圍互不重疊，點一下最多只算一處。
 */
import { createRng, type Rng } from '../../core/rng';
import type { BotLevel } from './common';

/** 風景的座標範圍（SVG viewBox） */
export const SCENE_W = 400;
export const SCENE_H = 300;
/** 各難度幾處不同 */
export const DIFFS_BY_LEVEL: Record<BotLevel, number> = { 1: 3, 2: 5, 3: 7 };
/** 各難度的限時（秒） */
export const SPOT_SECONDS: Record<BotLevel, number> = { 1: 90, 2: 120, 3: 150 };
/** 自己玩時點錯扣幾秒（避免一直亂點） */
export const MISS_PENALTY_SECONDS = 3;
/** 各難度畫幾個物件 */
const OBJECTS_BY_LEVEL: Record<BotLevel, number> = { 1: 14, 2: 18, 3: 22 };

/** 物件的種類 */
export type SceneKind = 'sun' | 'cloud' | 'bird' | 'balloon' | 'boat' | 'fish' | 'house' | 'tree' | 'pine' | 'flower' | 'mushroom' | 'butterfly' | 'rock';

/** 風景裡的一個物件 */
export interface SceneObject {
  id: number;
  kind: SceneKind;
  /** 中心位置 */
  x: number;
  y: number;
  /** 大小倍率 */
  s: number;
  /** 主色 */
  color: string;
  /** 左右翻轉 */
  flip: boolean;
}

/** 不同處的種類 */
export type DiffChange = 'color' | 'missing' | 'size' | 'flip';

/** 一處不同：改了哪個物件、怎麼改、點擊範圍（圓） */
export interface SpotDiff {
  objectId: number;
  change: DiffChange;
  x: number;
  y: number;
  r: number;
}

/** 一組題目：左圖、右圖、不同處 */
export interface SpotScene {
  left: SceneObject[];
  right: SceneObject[];
  diffs: SpotDiff[];
}

/** 鮮明的顏色（花、氣球、屋頂……） */
const PALETTE = ['#ff6b4a', '#2f6fde', '#ffc93c', '#8b5cf6', '#e8457c', '#ff8a3d'];
const GREENS = ['#3fbf7f', '#2f8f5b'];

/** 區域的範圍：天空、海、草地 */
const ZONES = { sky: { y0: 22, y1: 100 }, sea: { y0: 132, y1: 152 }, land: { y0: 182, y1: 280 } } as const;

/** 每種物件：在哪一區、基本半徑、左圖的顏色、改顏色時用的顏色（省略就用左圖的其他顏色）、是否左右不對稱、最多幾個 */
const KINDS: Record<SceneKind, { zone: keyof typeof ZONES; r: number; colors: string[]; alt?: string[]; asym: boolean; max: number }> = {
  sun: { zone: 'sky', r: 20, colors: ['#ffc93c'], alt: ['#ff6b4a'], asym: false, max: 1 },
  cloud: { zone: 'sky', r: 22, colors: ['#ffffff'], alt: ['#c9a7ff'], asym: true, max: 3 },
  bird: { zone: 'sky', r: 11, colors: PALETTE, asym: true, max: 2 },
  balloon: { zone: 'sky', r: 12, colors: PALETTE, asym: false, max: 1 },
  boat: { zone: 'sea', r: 20, colors: PALETTE, asym: true, max: 1 },
  fish: { zone: 'sea', r: 12, colors: PALETTE, asym: true, max: 2 },
  house: { zone: 'land', r: 25, colors: PALETTE, asym: true, max: 2 },
  tree: { zone: 'land', r: 21, colors: GREENS, alt: ['#ff8a3d', '#ffc93c'], asym: false, max: 3 },
  pine: { zone: 'land', r: 19, colors: GREENS, alt: ['#ff8a3d', '#ffc93c'], asym: false, max: 2 },
  flower: { zone: 'land', r: 10, colors: PALETTE, asym: false, max: 4 },
  mushroom: { zone: 'land', r: 11, colors: ['#ff6b4a', '#8b5cf6', '#ffc93c'], asym: false, max: 2 },
  butterfly: { zone: 'land', r: 11, colors: PALETTE, asym: false, max: 1 },
  rock: { zone: 'land', r: 12, colors: ['#8a8aa0'], alt: ['#c9864a'], asym: true, max: 1 },
};

/** 各難度可以用的不同處種類 */
const CHANGES_BY_LEVEL: Record<BotLevel, DiffChange[]> = { 1: ['color', 'missing'], 2: ['color', 'missing', 'size'], 3: ['color', 'missing', 'size', 'flip'] };

/** 依種類的上限擺物件：先放太陽，其他的打散後依序嘗試，和已經放好的物件不重疊 */
function placeObjects(count: number, rng: Rng): SceneObject[] {
  const slots: SceneKind[] = [];
  for (const kind of Object.keys(KINDS) as SceneKind[]) if (kind !== 'sun') for (let i = 0; i < KINDS[kind].max; i++) slots.push(kind);
  const order: SceneKind[] = ['sun', ...rng.shuffle(slots)];
  const out: SceneObject[] = [];
  for (const kind of order) {
    if (out.length >= count) break;
    const k = KINDS[kind];
    const zone = ZONES[k.zone];
    for (let tries = 0; tries < 60; tries++) {
      const s = 0.85 + rng.next() * 0.3;
      const r = k.r * s;
      const x = 20 + r + rng.next() * (SCENE_W - 40 - 2 * r);
      const y = zone.y0 + rng.next() * (zone.y1 - zone.y0);
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < (KINDS[o.kind].r * o.s + r) * 0.95 + 4)) continue;
      out.push({ id: out.length, kind, x: Math.round(x), y: Math.round(y), s: Math.round(s * 100) / 100, color: rng.pick(k.colors), flip: rng.chance(0.5) });
      break;
    }
  }
  // 依 y 排序：遠的（上面的）先畫，近的蓋在上面
  return out.sort((a, b) => a.y - b.y || a.id - b.id);
}

/** 改大小的倍率：普通變化明顯，厲害比較細微 */
function sizeFactor(level: BotLevel, rng: Rng): number {
  const big = rng.chance(0.5);
  return level === 3 ? (big ? 1.4 : 0.68) : big ? 1.55 : 0.6;
}

/** 試著用這個亂數產生一組題目；不同處不夠時回傳 null */
function tryScene(rng: Rng, level: BotLevel): SpotScene | null {
  const left = placeObjects(OBJECTS_BY_LEVEL[level], rng);
  const want = DIFFS_BY_LEVEL[level];
  const allowed = CHANGES_BY_LEVEL[level];
  /** 各種不同處用了幾次（盡量平均，一局裡的變化比較多樣） */
  const used: Record<DiffChange, number> = { color: 0, missing: 0, size: 0, flip: 0 };
  const diffs: SpotDiff[] = [];
  const changed = new Map<number, SceneObject | null>();
  for (const o of rng.shuffle(left)) {
    if (diffs.length >= want) break;
    const k = KINDS[o.kind];
    const options = allowed.filter((c) => c !== 'flip' || k.asym);
    const fewest = Math.min(...options.map((c) => used[c]));
    const change = rng.pick(options.filter((c) => used[c] === fewest));
    let after: SceneObject | null = o;
    if (change === 'missing') after = null;
    if (change === 'color') after = { ...o, color: rng.pick((k.alt ?? k.colors).filter((c) => c !== o.color)) };
    if (change === 'size') after = { ...o, s: Math.round(o.s * sizeFactor(level, rng) * 100) / 100 };
    if (change === 'flip') after = { ...o, flip: !o.flip };
    const r = Math.max(18, k.r * Math.max(o.s, after?.s ?? 0) + 8);
    if (diffs.some((d) => Math.hypot(d.x - o.x, d.y - o.y) <= d.r + r)) continue;
    used[change] += 1;
    diffs.push({ objectId: o.id, change, x: o.x, y: o.y, r: Math.round(r) });
    changed.set(o.id, after);
  }
  if (diffs.length < want) return null;
  const right = left.flatMap((o) => (changed.has(o.id) ? (changed.get(o.id) ? [changed.get(o.id)!] : []) : [o]));
  return { left, right, diffs };
}

/** 產生一組找不同（同一個種子出同一組圖） */
export function makeSpotScene(seed: number, level: BotLevel): SpotScene {
  const rng = createRng(seed ^ 0x5b0);
  for (let attempt = 0; attempt < 20; attempt++) {
    const scene = tryScene(rng, level);
    if (scene) return scene;
  }
  throw new Error(`找不同：種子 ${seed} 產生不出 ${DIFFS_BY_LEVEL[level]} 處不同`);
}

/** 點在 (x, y)：回傳點到的不同處索引；沒點到或那一處已經找到（found）時回傳 −1 */
export function hitDiff(scene: SpotScene, found: readonly number[], x: number, y: number): number {
  return scene.diffs.findIndex((d, i) => !found.includes(i) && Math.hypot(d.x - x, d.y - y) <= d.r);
}

/** 點一下的結果：找到新的一處、點在已經圈起來的地方（不算點錯）、點錯 */
export type SpotTap = { kind: 'hit'; index: number } | { kind: 'again' } | { kind: 'miss' };

/** 判斷點在 (x, y) 的結果；found 是已經找到的不同處索引 */
export function spotTap(scene: SpotScene, found: readonly number[], x: number, y: number): SpotTap {
  const index = hitDiff(scene, found, x, y);
  if (index >= 0) return { kind: 'hit', index };
  const again = found.some((k) => Math.hypot(scene.diffs[k].x - x, scene.diffs[k].y - y) <= scene.diffs[k].r);
  return again ? { kind: 'again' } : { kind: 'miss' };
}

/** 自己玩的星數：全部找到而且剩四成以上的時間 3 星、全部找到 2 星、沒找完 1 星 */
export function spotStars(found: number, total: number, secondsLeft: number, limit: number): 1 | 2 | 3 {
  if (found < total) return 1;
  return secondsLeft >= limit * 0.4 ? 3 : 2;
}

/** 機器人每隔多久找到一處（毫秒）：簡單 12～16 秒、普通 8～12 秒、厲害 5～8 秒；偶爾點錯，多花 2 秒 */
export function botFindDelay(level: BotLevel, rng: Rng): number {
  const [lo, hi] = level === 1 ? [12000, 16000] : level === 2 ? [8000, 12000] : [5000, 8000];
  return Math.round(lo + rng.next() * (hi - lo) + (rng.chance(0.2) ? 2000 : 0));
}
