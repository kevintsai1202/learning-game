/**
 * 自己的家第一期：院子（純資料與純函式，前端與伺服器共用；規格見 docs/plans/home.md 第 3 節）。
 * - 院子的格子：小屋周圍的空地，格子 1 公尺見方，用相對小屋的整數座標 (gx, gz)。
 * - 擺放檢查：只留下擁有的家具、在院子裡、不重複的格子，最多 YARD_MAX_ITEMS 個。
 * - 佈置模式的狀態（選家具、放下、轉方向、移動、收起來），畫面只呼叫 editYard。
 * 伺服器會 import 這個檔，不能 import 畫面、音訊或 3D 的程式；存檔只用 type import（save.ts 會 import 這裡）。
 */
import { z } from 'zod';
import type { Profile } from './save';
import { findItem } from './catalog';
import { HOUSE, WALK_RADIUS, ZONES } from '../world/layout';
import { PLAZA, pathSegments } from '../world/scenery';

/** 院子的半徑（公尺，以小屋為中心） */
export const YARD_RADIUS = 6;
/** 院子最多擺幾個家具（效能） */
export const YARD_MAX_ITEMS = 60;
/** 每種家具最多擁有幾個 */
export const DECOR_MAX_OWNED = 20;
/** 格子的大小（公尺） */
const CELL = 1;
/** 家具離建築邊緣至少多遠（公尺；種樹用的 1.6 太寬，會吃掉百寶屋那一側的院子） */
const ZONE_MARGIN = 0.6;
/** 步道兩側多寬不能擺（公尺） */
const PATH_HALF_WIDTH = 1;
/** 小屋門口往前的走道多寬不能擺（公尺，離走道中線的距離） */
const DOOR_HALF_WIDTH = 0.75;

/** 方向：轉了幾個 90 度 */
export type YardRot = 0 | 1 | 2 | 3;

/** 院子裡的一個家具：哪一種、在哪一格、轉了幾個 90 度 */
export interface YardItem {
  id: string;
  gx: number;
  gz: number;
  rot: YardRot;
}

/** 院子裡一個家具的格式（存檔與 yard 操作共用；座標範圍比院子寬一點，合不合法由 cleanYard 判斷） */
export const yardItemSchema = z.object({
  id: z.string().min(1).max(40),
  gx: z.number().int().min(-10).max(10),
  gz: z.number().int().min(-10).max(10),
  rot: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

/** 院子的一格（相對小屋的整數座標） */
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

/** 這一格能不能擺家具：院子範圍內，避開小屋、門口走道、建築、步道、廣場與草地外緣 */
function cellAllowed(gx: number, gz: number): boolean {
  const r = Math.hypot(gx, gz) * CELL;
  if (r > YARD_RADIUS || r < HOUSE.radius + 0.6) return false;
  const { x, z } = cellToWorld(gx, gz);
  if (Math.hypot(x, z) > WALK_RADIUS - 0.8) return false;
  // 門口往前（朝出生點）的走道
  const dir = { x: Math.sin(HOUSE.rotY), z: Math.cos(HOUSE.rotY) };
  const door = { x: HOUSE.x + dir.x * HOUSE.radius, z: HOUSE.z + dir.z * HOUSE.radius };
  const far = { x: HOUSE.x + dir.x * (YARD_RADIUS + 1), z: HOUSE.z + dir.z * (YARD_RADIUS + 1) };
  if (distToSegment(x, z, door.x, door.z, far.x, far.z) < DOOR_HALF_WIDTH) return false;
  if (ZONES.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius + ZONE_MARGIN)) return false;
  if (pathSegments().some((s) => distToSegment(x, z, s.ax, s.az, s.bx, s.bz) < PATH_HALF_WIDTH)) return false;
  return Math.hypot(x - PLAZA.x, z - PLAZA.z) >= PLAZA.radius;
}

/** 院子的格子（第一次算完就記住） */
let cells: readonly YardCell[] | null = null;

/** 院子的全部格子 */
export function yardCells(): readonly YardCell[] {
  if (!cells) {
    const out: YardCell[] = [];
    const n = Math.ceil(YARD_RADIUS / CELL);
    for (let gz = -n; gz <= n; gz++) for (let gx = -n; gx <= n; gx++) if (cellAllowed(gx, gz)) out.push({ gx, gz });
    cells = out;
  }
  return cells;
}

/** 這一格是不是院子 */
export function isYardCell(gx: number, gz: number): boolean {
  return yardCells().some((c) => c.gx === gx && c.gz === gz);
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
 * 擺放檢查：拿掉不是家具、不在院子裡、格子重複、超過擁有數量的項目，最多 YARD_MAX_ITEMS 個（前面的優先）。
 * 不合法的只拿掉那一個，其餘照存（院子形狀以後小改時，舊的擺放大多還在）
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

// ---------- 佈置模式 ----------

/** 佈置模式的狀態：院子裡的家具、從家具包選著要放的家具、選起來的家具（items 的索引）、正在移動 */
export interface YardEdit {
  items: YardItem[];
  picking: string | null;
  selected: number | null;
  moving: boolean;
}

/**
 * 佈置模式的動作：pick 從家具包選一樣（null 是不選）、tap 點一格、rotate 轉方向、move 開始移動選起來的家具、
 * putAway 收起來、deselect 全部取消選取
 */
export type YardEditAction =
  | { t: 'pick'; id: string | null }
  | { t: 'tap'; gx: number; gz: number }
  | { t: 'rotate' }
  | { t: 'move' }
  | { t: 'putAway' }
  | { t: 'deselect' };

/** 開始佈置（從目前的院子） */
export function startEdit(items: readonly YardItem[]): YardEdit {
  return { items: items.map((it) => ({ ...it })), picking: null, selected: null, moving: false };
}

/** 家具包裡每種家具還能擺幾個（擁有的減掉擺了的） */
export function remainingDecor(s: Pick<YardEdit, 'items'>, owned: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...owned };
  for (const it of s.items) if (it.id in out) out[it.id] = Math.max(0, out[it.id] - 1);
  return out;
}

/** 某一格上的家具（items 的索引；沒有是 -1） */
function itemAt(items: readonly YardItem[], gx: number, gz: number): number {
  return items.findIndex((it) => it.gx === gx && it.gz === gz);
}

/**
 * 佈置模式的一個動作（純函式）：
 * - 選著家具時點空格子：放下（可以連續放，放完了就不再選著）；
 * - 移動中點空格子：搬過去；
 * - 都沒有時點擺好的家具：選起來；點空地：取消選取
 */
export function editYard(s: YardEdit, a: YardEditAction, owned: Record<string, number>): YardEdit {
  switch (a.t) {
    case 'pick': {
      if (a.id === null || !isDecor(a.id) || (remainingDecor(s, owned)[a.id] ?? 0) <= 0) return { ...s, picking: null };
      return { ...s, picking: a.id, selected: null, moving: false };
    }
    case 'tap': {
      const at = itemAt(s.items, a.gx, a.gz);
      const free = at < 0 && isYardCell(a.gx, a.gz);
      if (s.moving && s.selected !== null) {
        if (!free) return s;
        const items = s.items.map((it, i) => (i === s.selected ? { ...it, gx: a.gx, gz: a.gz } : it));
        return { ...s, items, moving: false };
      }
      if (s.picking) {
        if (!free || s.items.length >= YARD_MAX_ITEMS) return s;
        const items = [...s.items, { id: s.picking, gx: a.gx, gz: a.gz, rot: 0 as YardRot }];
        const left = remainingDecor({ items }, owned)[s.picking] ?? 0;
        return { ...s, items, picking: left > 0 ? s.picking : null };
      }
      return { ...s, selected: at >= 0 ? at : null, moving: false };
    }
    case 'rotate': {
      if (s.selected === null) return s;
      const items = s.items.map((it, i) => (i === s.selected ? { ...it, rot: ((it.rot + 1) % 4) as YardRot } : it));
      return { ...s, items };
    }
    case 'move':
      return s.selected === null ? s : { ...s, moving: true };
    case 'putAway': {
      if (s.selected === null) return s;
      return { ...s, items: s.items.filter((_, i) => i !== s.selected), selected: null, moving: false };
    }
    case 'deselect':
      return { ...s, picking: null, selected: null, moving: false };
  }
}

// ---------- 島上畫院子 ----------

/** 擋路的家具碰撞半徑（公尺） */
const SOLID_RADIUS = 0.45;

/** 要畫的家具：不認得的跳過（別人的院子可能是比較新的版本）、最多 YARD_MAX_ITEMS 個，不丟例外 */
export function visibleYard(items: readonly YardItem[]): YardItem[] {
  return items.filter((it) => isDecor(it.id)).slice(0, YARD_MAX_ITEMS);
}

/** 院子裡擋路的家具（碰撞）：格子中心、半徑 SOLID_RADIUS；花草、石板路、小池塘可以走過去 */
export function yardObstacles(items: readonly YardItem[]): { x: number; z: number; r: number }[] {
  return visibleYard(items)
    .filter((it) => !findItem(it.id)?.walkable)
    .map((it) => ({ ...cellToWorld(it.gx, it.gz), r: SOLID_RADIUS }));
}
