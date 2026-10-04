/**
 * 七巧板的規則（純函式）：板子的形狀與姿勢、放置判定、完成判定、星數、機器人。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。畫面在 src/puzzle/tangram/，剪影題庫在 tangramShapes.ts，
 * 設計新剪影的工具（解題器、文字預覽）在 scripts/puzzle/tangram-design.test.ts。
 *
 * 座標用整數格點（y 往下，和 SVG 相同），整副板子拼成 4×4 的正方形（面積 16）。
 * 板子只轉 90 度與翻面，頂點都在格點上；每個單位正方形被兩條對角線切成上、右、下、左四個小三角形（四分之一格），
 * 每塊板子剛好由幾個四分之一格組成。放置、重疊、蓋滿都用四分之一格判定，沒有浮點誤差。
 */
import type { Rng } from '../../core/rng';
import type { BotLevel } from './common';

/** 平面上的點 [x, y]（y 往下） */
export type Pt = [number, number];

/** 板子的種類：大三角形、中三角形、小三角形、正方形、平行四邊形 */
export type PieceType = 'big' | 'medium' | 'small' | 'square' | 'para';

/** 七塊板子（id、種類、顏色） */
export const TANGRAM_PIECES: { id: string; type: PieceType; color: string }[] = [
  { id: 'big1', type: 'big', color: '#ff6b4a' },
  { id: 'big2', type: 'big', color: '#2f6fde' },
  { id: 'medium', type: 'medium', color: '#ffc93c' },
  { id: 'small1', type: 'small', color: '#3fbf7f' },
  { id: 'small2', type: 'small', color: '#8b5cf6' },
  { id: 'square', type: 'square', color: '#e8457c' },
  { id: 'para', type: 'para', color: '#ff8a3d' },
];

/** 各種板子的基本形狀（整數頂點）：4×4 正方形切出來的大小 */
const BASE: Record<PieceType, Pt[]> = {
  big: [
    [0, 0],
    [4, 0],
    [2, 2],
  ],
  medium: [
    [0, 0],
    [2, 0],
    [0, 2],
  ],
  small: [
    [0, 0],
    [2, 0],
    [1, 1],
  ],
  square: [
    [1, 0],
    [2, 1],
    [1, 2],
    [0, 1],
  ],
  para: [
    [0, 0],
    [2, 0],
    [3, 1],
    [1, 1],
  ],
};

/** 板子的姿勢：轉幾個 90 度（0～3，順時針）、是否翻面（左右鏡像） */
export interface Pose {
  rot: number;
  flip: boolean;
}

/** 放好的一塊：哪一塊、姿勢、平移量 */
export interface Placed {
  piece: string;
  pose: Pose;
  dx: number;
  dy: number;
}

/** 依 id 找板子的種類 */
export function pieceType(id: string): PieceType {
  const p = TANGRAM_PIECES.find((v) => v.id === id);
  if (!p) throw new Error(`沒有這塊板子：${id}`);
  return p.type;
}

/** 板子在某個姿勢、平移 (dx, dy) 之後的頂點（先翻面、再轉、再平移） */
export function piecePolygon(type: PieceType, pose: Pose, dx: number, dy: number): Pt[] {
  return BASE[type].map(([x0, y0]) => {
    let x = pose.flip ? -x0 : x0;
    let y = y0;
    for (let i = 0; i < ((pose.rot % 4) + 4) % 4; i++) [x, y] = [-y, x];
    return [x + dx, y + dy];
  });
}

/** 多邊形的重心（畫面上轉動、翻面時讓板子留在原地用） */
export function polygonCentroid(poly: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** 多邊形面積（鞋帶公式） */
export function polygonArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** 點是否在多邊形裡（射線法；呼叫端只用不會落在邊上的點） */
function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** 四分之一格的代表點（在小三角形裡面，不會落在任何格線或對角線上） */
const QUARTERS: [string, number, number][] = [
  ['T', 0.5, 0.25],
  ['R', 0.75, 0.5],
  ['B', 0.5, 0.75],
  ['L', 0.25, 0.5],
];

/** 多邊形蓋住的四分之一格（鍵為 "i,j,方位"） */
export function outlineCells(poly: Pt[]): Set<string> {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const out = new Set<string>();
  for (let i = Math.floor(Math.min(...xs)); i < Math.ceil(Math.max(...xs)); i++) {
    for (let j = Math.floor(Math.min(...ys)); j < Math.ceil(Math.max(...ys)); j++) {
      for (const [q, ox, oy] of QUARTERS) if (inside(poly, i + ox, j + oy)) out.add(`${i},${j},${q}`);
    }
  }
  return out;
}

/** 板子在某個姿勢、平移之後蓋住的四分之一格 */
export function cellsOf(type: PieceType, pose: Pose, dx: number, dy: number): Set<string> {
  return outlineCells(piecePolygon(type, pose, dx, dy));
}

/** 已經放好的板子蓋住的格子 */
function coveredBy(placed: Placed[], except?: string): Set<string> {
  const out = new Set<string>();
  for (const p of placed) if (p.piece !== except) for (const c of cellsOf(pieceType(p.piece), p.pose, p.dx, p.dy)) out.add(c);
  return out;
}

/**
 * 這塊板子放在 (dx, dy) 可不可以：整塊都在剪影裡，而且不和其他已經放好的板子重疊（同一塊原本的位置不算）。
 */
export function placeAt(target: Set<string>, placed: Placed[], piece: string, pose: Pose, dx: number, dy: number): boolean {
  const used = coveredBy(placed, piece);
  for (const c of cellsOf(pieceType(piece), pose, dx, dy)) if (!target.has(c) || used.has(c)) return false;
  return true;
}

/** 剪影是否被蓋滿（七塊都放好、不重疊、剛好填滿） */
export function isComplete(target: Set<string>, placed: Placed[]): boolean {
  const used = coveredBy(placed);
  if (used.size !== target.size) return false;
  for (const c of target) if (!used.has(c)) return false;
  return true;
}

// ---------- 星數與機器人 ----------

/** 自己玩的星數：沒用提示 3 星、用一次 2 星、兩次以上 1 星 */
export function tangramStars(hints: number): 1 | 2 | 3 {
  return hints <= 0 ? 3 : hints === 1 ? 2 : 1;
}

/** 機器人每放好一塊要多久（毫秒）：簡單 10～14 秒、普通 7～10 秒、厲害 4～7 秒 */
export function botPieceDelay(level: BotLevel, rng: Rng): number {
  const [lo, hi] = level === 1 ? [10000, 14000] : level === 2 ? [7000, 10000] : [4000, 7000];
  return Math.round(lo + rng.next() * (hi - lo));
}
