/**
 * 自己的家：在島上直接佈置全島（純資料與純函式，前端與伺服器共用；規格見 docs/plans/home.md 第 3、7 節）。
 * - 全島的格子：自己的島上所有空草地，格子 1 公尺見方，用相對小屋的整數座標 (gx, gz)。
 * - 擺放檢查：只留下擁有的家具、在可以擺的格子、不重複的格子，最多 YARD_MAX_ITEMS 個。
 * - 動森做法：家具放在角色面前那一格（frontCell）、放下／轉方向／收起來、最靠近的家具（nearestItem）。
 * 伺服器會 import 這個檔，不能 import 畫面、音訊或 3D 的程式；存檔只用 type import（save.ts 會 import 這裡）。
 */
import { z } from 'zod';
import type { Profile } from './save';
import { findItem } from './catalog';
import { HOUSE, PLATE, SPAWN, WALK_RADIUS, ZONES, doorOf } from '../world/layout';
import { PLAZA, pathSegments, placeTrees, type TreeSpot } from '../world/scenery';

/** 全島最多擺幾個家具（效能；使用者 2026-10-11 決定 300） */
export const YARD_MAX_ITEMS = 300;
/** 每種家具最多擁有幾個（使用者 2026-10-11 決定 50） */
export const DECOR_MAX_OWNED = 50;
/** 自己的島上，小屋周圍多遠的樹拿掉（公尺；第一期的院子，改版後照舊空出來） */
export const HOUSE_TREE_CLEAR = 6.6;
/** 格子的大小（公尺） */
const CELL = 1;
/** 格子座標的範圍（相對小屋；島的半徑加上小屋離島中心的距離） */
const GRID_RANGE = 40;
/** 家具離建築邊緣至少多遠（公尺；種樹用的 1.6 太寬） */
const ZONE_MARGIN = 0.6;
/** 建築門口附近多遠不能擺（公尺；不能把門口堵住） */
const DOOR_CLEAR = 1.5;
/** 步道兩側多寬不能擺（公尺） */
const PATH_HALF_WIDTH = 1;
/** 小屋門口往前的走道多寬、多長不能擺（公尺） */
const HOUSE_DOOR_HALF_WIDTH = 0.75;
const HOUSE_DOOR_LENGTH = 7;
/** 出生點（上岸處）、島門牌、樹附近多遠不能擺（公尺） */
const SPAWN_CLEAR = 3.5;
const PLATE_CLEAR = 1.2;
const TREE_CLEAR = 1;
/** 角色面前多遠的那一格放家具（公尺；太近會放在自己腳下） */
const FRONT_DIST = 1.2;
/** 走到家具旁邊多近才能轉方向、收起來（公尺） */
const NEAR_DIST = 1.5;

/** 方向：轉了幾個 90 度 */
export type YardRot = 0 | 1 | 2 | 3;

/** 島上的一個家具：哪一種、在哪一格、轉了幾個 90 度 */
export interface YardItem {
  id: string;
  gx: number;
  gz: number;
  rot: YardRot;
}

/** 一個家具的格式（存檔與 yard 操作共用；座標範圍比全島寬一點，合不合法由 cleanYard 判斷） */
export const yardItemSchema = z.object({
  id: z.string().min(1).max(40),
  gx: z.number().int().min(-GRID_RANGE).max(GRID_RANGE),
  gz: z.number().int().min(-GRID_RANGE).max(GRID_RANGE),
  rot: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

/** 一格（相對小屋的整數座標） */
export interface YardCell {
  gx: number;
  gz: number;
}

/** 點到線段的距離 */
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

/** 格子的中心（世界座標） */
export function cellToWorld(gx: number, gz: number): { x: number; z: number } {
  return { x: HOUSE.x + gx * CELL, z: HOUSE.z + gz * CELL };
}

/** 世界座標落在哪一格 */
function worldToCell(x: number, z: number): YardCell {
  return { gx: Math.round((x - HOUSE.x) / CELL), gz: Math.round((z - HOUSE.z) / CELL) };
}

/** 自己的島上的樹（小屋周圍 HOUSE_TREE_CLEAR 內的拿掉；畫面與格子用同一份） */
let trees: TreeSpot[] | null = null;
export function islandTrees(): TreeSpot[] {
  trees ??= placeTrees().filter((t) => Math.hypot(t.x - HOUSE.x, t.z - HOUSE.z) >= HOUSE_TREE_CLEAR);
  return trees;
}

/** 這一格能不能擺家具：草地上，避開小屋與門口走道、建築與門口、步道、廣場、出生點、島門牌、樹 */
function cellAllowed(gx: number, gz: number): boolean {
  const { x, z } = cellToWorld(gx, gz);
  if (Math.hypot(x, z) > WALK_RADIUS - 0.8) return false;
  if (Math.hypot(gx, gz) * CELL < HOUSE.radius + 0.6) return false;
  const dir = { x: Math.sin(HOUSE.rotY), z: Math.cos(HOUSE.rotY) };
  const door = { x: HOUSE.x + dir.x * HOUSE.radius, z: HOUSE.z + dir.z * HOUSE.radius };
  const far = { x: HOUSE.x + dir.x * HOUSE_DOOR_LENGTH, z: HOUSE.z + dir.z * HOUSE_DOOR_LENGTH };
  if (distToSegment(x, z, door.x, door.z, far.x, far.z) < HOUSE_DOOR_HALF_WIDTH) return false;
  for (const zone of ZONES) {
    if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + ZONE_MARGIN) return false;
    const d = doorOf(zone);
    if (Math.hypot(x - d.x, z - d.z) < DOOR_CLEAR) return false;
  }
  if (pathSegments().some((s) => distToSegment(x, z, s.ax, s.az, s.bx, s.bz) < PATH_HALF_WIDTH)) return false;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < SPAWN_CLEAR) return false;
  if (Math.hypot(x - PLATE.x, z - PLATE.z) < PLATE_CLEAR) return false;
  return islandTrees().every((t) => Math.hypot(x - t.x, z - t.z) >= TREE_CLEAR);
}

/** 全島可以擺的格子（第一次算完就記住；查詢用 Set） */
let cells: readonly YardCell[] | null = null;
let cellSet: Set<string> | null = null;

/** 全島可以擺家具的格子 */
export function yardCells(): readonly YardCell[] {
  if (!cells) {
    const out: YardCell[] = [];
    for (let gz = -GRID_RANGE; gz <= GRID_RANGE; gz++) for (let gx = -GRID_RANGE; gx <= GRID_RANGE; gx++) if (cellAllowed(gx, gz)) out.push({ gx, gz });
    cells = out;
    cellSet = new Set(out.map((c) => `${c.gx},${c.gz}`));
  }
  return cells;
}

/** 這一格能不能擺家具 */
export function isYardCell(gx: number, gz: number): boolean {
  yardCells();
  return cellSet!.has(`${gx},${gz}`);
}

/** 是不是家具 */
export function isDecor(id: string): boolean {
  return findItem(id)?.slot === 'decor';
}

/** 擁有幾個這種家具（收藏裡同一個 id 出現幾次） */
export function ownedCount(p: Pick<Profile, 'inventory'>, id: string): number {
  return p.inventory.filter((v) => v === id).length;
}

/** 擁有的家具：id → 幾個 */
export function ownedDecor(p: Pick<Profile, 'inventory'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of p.inventory) if (isDecor(id)) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/**
 * 擺放檢查：拿掉不是家具、不在可以擺的格子、格子重複、超過擁有數量的項目，最多 YARD_MAX_ITEMS 個（前面的優先）。
 * 不合法的只拿掉那一個，其餘照存（格子的規則以後小改時，舊的擺放大多還在）
 */
export function cleanYard(items: readonly YardItem[], owned: Record<string, number>): YardItem[] {
  const used = new Set<string>();
  const placed: Record<string, number> = {};
  const out: YardItem[] = [];
  for (const it of items) {
    if (out.length >= YARD_MAX_ITEMS) break;
    const key = `${it.gx},${it.gz}`;
    if (!isDecor(it.id) || !isYardCell(it.gx, it.gz) || used.has(key)) continue;
    if ((placed[it.id] ?? 0) >= (owned[it.id] ?? 0)) continue;
    used.add(key);
    placed[it.id] = (placed[it.id] ?? 0) + 1;
    out.push({ id: it.id, gx: it.gx, gz: it.gz, rot: (((it.rot % 4) + 4) % 4) as YardRot });
  }
  return out;
}

/** 家具包裡每種家具還能擺幾個（擁有的減掉擺了的） */
export function remainingDecor(s: { items: readonly YardItem[] }, owned: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...owned };
  for (const it of s.items) if (it.id in out) out[it.id] = Math.max(0, out[it.id] - 1);
  return out;
}

// ---------- 動森做法：放在角色面前、轉方向、收起來 ----------

/** 角色面前的那一格（pos 是角色位置，heading 是面向的角度，0 = 南方 +z） */
export function frontCell(pos: { x: number; z: number }, heading: number): YardCell {
  return worldToCell(pos.x + Math.sin(heading) * FRONT_DIST, pos.z + Math.cos(heading) * FRONT_DIST);
}

/** 某一格上的家具（索引；沒有是 -1） */
function itemAt(items: readonly YardItem[], gx: number, gz: number): number {
  return items.findIndex((it) => it.gx === gx && it.gz === gz);
}

/** 能不能把某種家具放在某一格：可以回傳 null，不行回傳原因（畫面上的提示） */
export function canPlace(items: readonly YardItem[], gx: number, gz: number, id: string, owned: Record<string, number>): string | null {
  if (!isYardCell(gx, gz)) return '這裡不能擺';
  if (itemAt(items, gx, gz) >= 0) return '這裡已經有東西了';
  if ((remainingDecor({ items }, owned)[id] ?? 0) <= 0) return '這個家具都擺出去了';
  if (items.length >= YARD_MAX_ITEMS) return '島上已經擺滿了';
  return null;
}

/** 放下家具（方向照預覽）；不能放時原樣回傳 */
export function placeItem(items: readonly YardItem[], gx: number, gz: number, id: string, rot: YardRot, owned: Record<string, number>): readonly YardItem[] {
  if (canPlace(items, gx, gz, id, owned) !== null) return items;
  return [...items, { id, gx, gz, rot }];
}

/** 某一格的家具轉 90 度 */
export function rotateItem(items: readonly YardItem[], gx: number, gz: number): readonly YardItem[] {
  const i = itemAt(items, gx, gz);
  if (i < 0) return items;
  return items.map((it, k) => (k === i ? { ...it, rot: ((it.rot + 1) % 4) as YardRot } : it));
}

/** 收起某一格的家具（回到家具包） */
export function removeItem(items: readonly YardItem[], gx: number, gz: number): readonly YardItem[] {
  const i = itemAt(items, gx, gz);
  return i < 0 ? items : items.filter((_, k) => k !== i);
}

/** 角色旁邊（NEAR_DIST 內）最靠近的家具；沒有是 null */
export function nearestItem(items: readonly YardItem[], pos: { x: number; z: number }, maxDist = NEAR_DIST): YardItem | null {
  let best: YardItem | null = null;
  let bestD = maxDist;
  for (const it of visibleYard(items)) {
    const w = cellToWorld(it.gx, it.gz);
    const d = Math.hypot(w.x - pos.x, w.z - pos.z);
    if (d <= bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

// ---------- 島上畫擺設 ----------

/** 擋路的家具碰撞半徑（公尺） */
const SOLID_RADIUS = 0.45;

/** 要畫的家具：不認得的跳過（別人的島可能是比較新的版本）、最多 YARD_MAX_ITEMS 個，不丟例外 */
export function visibleYard(items: readonly YardItem[]): YardItem[] {
  return items.filter((it) => isDecor(it.id)).slice(0, YARD_MAX_ITEMS);
}

/** 擋路的家具（碰撞）：格子中心、半徑 SOLID_RADIUS；花草、石板路、小池塘可以走過去 */
export function yardObstacles(items: readonly YardItem[]): { x: number; z: number; r: number }[] {
  return visibleYard(items)
    .filter((it) => !findItem(it.id)?.walkable)
    .map((it) => ({ ...cellToWorld(it.gx, it.gz), r: SOLID_RADIUS }));
}
