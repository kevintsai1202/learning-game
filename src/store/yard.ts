/**
 * 自己的家：在島上直接佈置全島（純資料與純函式，前端與伺服器共用；規格見 docs/plans/home.md 第 3、7 節）。
 * - 全島的格子：自己的島上所有空草地，格子 1 公尺見方，用相對小屋的整數座標 (gx, gz)。
 * - 擺放檢查：只留下擁有的家具、在可以擺的格子、不重複的格子，最多 YARD_MAX_ITEMS 個。
 * - 動森做法：家具放在角色面前那一格（frontCell）、放下／轉方向／收起來、最靠近的家具（nearestItem）。
 * - 第二期進屋：房間的格子在 home.ts。擺放與放法的函式吃「擺放的地方」（DecorSpace，預設島上 YARD_SPACE）；
 *   每種家具的數量島上加屋裡一起算（budgetAfter 扣掉另一邊擺了的）。
 * - 第 10.3 節（第 ② 批）：家具依尺寸佔多格（itemCells、itemCenter）；放的時候從面前那一格往面向展開（placeAnchor），
 *   整塊都要能擺、不壓到別的家具；轉方向轉不過去就不轉（canRotate）。存檔與伺服器的清理照舊只看基準格。
 * 伺服器會 import 這個檔，不能 import 畫面、音訊或 3D 的程式；存檔只用 type import（save.ts 會 import 這裡）。
 */
import { z } from 'zod';
import type { Profile } from './save';
import { findItem } from './catalog';
import { FOUNTAIN, HOUSE, PLATE, SPAWN, TEACHER_POS, WALK_RADIUS, ZONES, doorOf } from '../world/layout';
import { placeTrees, type TreeSpot } from '../world/scenery';

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
/** 建築門口附近多遠不能擺（公尺；不能把門口堵住；小屋的門口一樣） */
const DOOR_CLEAR = 1.5;
/** 小屋的牆到門口那一小段多寬不能擺（公尺；門口在小屋半徑外 1.2 公尺，和建築一樣） */
const HOUSE_DOOR_HALF_WIDTH = 0.75;
const HOUSE_DOOR_OUT = 1.2;
/** 噴水池邊緣外多遠不能擺（公尺；第 10.3 節廣場開放，只留噴水池） */
const FOUNTAIN_MARGIN = 0.6;
/** 熊熊老師站的位置附近多遠不能擺（公尺；老師進島會傳送到這裡） */
const TEACHER_CLEAR = 1.5;
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

/**
 * 擺家具的地方（島上或屋裡）：哪些格子能擺、最多幾個、擺滿時的提示、格子與座標互換。
 * 島上用世界座標（YARD_SPACE），屋裡用房間的座標（home.ts 的 HOME_SPACE）
 */
export interface DecorSpace {
  /** 這一格能不能擺 */
  isCell(gx: number, gz: number): boolean;
  /** 最多擺幾個 */
  max: number;
  /** 擺滿時的提示 */
  full: string;
  /** 格子的中心座標 */
  toWorld(gx: number, gz: number): { x: number; z: number };
  /** 座標落在哪一格 */
  toCell(x: number, z: number): YardCell;
}

/** 自己的島上的樹（小屋周圍 HOUSE_TREE_CLEAR 內的拿掉；畫面與格子用同一份） */
let trees: TreeSpot[] | null = null;
export function islandTrees(): TreeSpot[] {
  trees ??= placeTrees().filter((t) => Math.hypot(t.x - HOUSE.x, t.z - HOUSE.z) >= HOUSE_TREE_CLEAR);
  return trees;
}

/**
 * 這一格能不能擺家具：草地上，避開小屋與門口、建築與門口、噴水池、熊熊老師站的位置、出生點、島門牌、樹。
 * 廣場、步道、小屋前的長走道都能擺（第 10.3 節，使用者 2026-10-11：中間區域也要能佈置）
 */
function cellAllowed(gx: number, gz: number): boolean {
  const { x, z } = cellToWorld(gx, gz);
  if (Math.hypot(x, z) > WALK_RADIUS - 0.8) return false;
  if (Math.hypot(gx, gz) * CELL < HOUSE.radius + 0.6) return false;
  const dir = { x: Math.sin(HOUSE.rotY), z: Math.cos(HOUSE.rotY) };
  const wall = { x: HOUSE.x + dir.x * HOUSE.radius, z: HOUSE.z + dir.z * HOUSE.radius };
  const door = { x: wall.x + dir.x * HOUSE_DOOR_OUT, z: wall.z + dir.z * HOUSE_DOOR_OUT };
  if (distToSegment(x, z, wall.x, wall.z, door.x, door.z) < HOUSE_DOOR_HALF_WIDTH) return false;
  if (Math.hypot(x - door.x, z - door.z) < DOOR_CLEAR) return false;
  for (const zone of ZONES) {
    if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + ZONE_MARGIN) return false;
    const d = doorOf(zone);
    if (Math.hypot(x - d.x, z - d.z) < DOOR_CLEAR) return false;
  }
  if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.radius + FOUNTAIN_MARGIN) return false;
  if (Math.hypot(x - TEACHER_POS.x, z - TEACHER_POS.z) < TEACHER_CLEAR) return false;
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

/** 島上（自己的島，世界座標） */
export const YARD_SPACE: DecorSpace = {
  isCell: isYardCell,
  max: YARD_MAX_ITEMS,
  full: '島上已經擺滿了',
  toWorld: cellToWorld,
  toCell: worldToCell,
};

/** 是不是家具 */
export function isDecor(id: string): boolean {
  return findItem(id)?.slot === 'decor';
}

// ---------- 家具的尺寸與佔的格子（第 10.3 節） ----------

/** 家具的尺寸（格）：寬 w 是局部 x、深 d 是局部 z；沒寫或不認得是 1×1 */
export function decorSize(id: string): { w: number; d: number } {
  const s = findItem(id)?.size;
  return s ? { w: s[0], d: s[1] } : { w: 1, d: 1 };
}

/** 轉了 rot 次以後在島上（或房間）佔的範圍：東西方向 w 格、南北方向 d 格（轉奇數次寬深互換） */
function worldSize(id: string, rot: YardRot): { w: number; d: number } {
  const s = decorSize(id);
  return rot % 2 === 1 ? { w: s.d, d: s.w } : s;
}

/**
 * 家具佔的長方形（格子座標，含兩端）：基準格是東西方向第 ⌊(w−1)/2⌋ 格、南北方向第 ⌊(d−1)/2⌋ 格
 * （奇數在正中間，偶數往 +x、+z 多一格）；轉方向基準格不動，只換寬深
 */
function itemRect(it: Pick<YardItem, 'id' | 'gx' | 'gz' | 'rot'>): { x0: number; x1: number; z0: number; z1: number } {
  const { w, d } = worldSize(it.id, it.rot);
  const x0 = it.gx - Math.floor((w - 1) / 2);
  const z0 = it.gz - Math.floor((d - 1) / 2);
  return { x0, x1: x0 + w - 1, z0, z1: z0 + d - 1 };
}

/** 家具佔的格子（1×1 就是基準格；基準格一定在裡面） */
export function itemCells(it: Pick<YardItem, 'id' | 'gx' | 'gz' | 'rot'>): YardCell[] {
  const r = itemRect(it);
  const out: YardCell[] = [];
  for (let gz = r.z0; gz <= r.z1; gz++) for (let gx = r.x0; gx <= r.x1; gx++) out.push({ gx, gz });
  return out;
}

/** 家具佔的格子的正中間（模型畫的位置；島上的世界座標或房間的座標，兩種都是格子座標的一次函數） */
export function itemCenter(it: Pick<YardItem, 'id' | 'gx' | 'gz' | 'rot'>, space: DecorSpace = YARD_SPACE): { x: number; z: number } {
  const r = itemRect(it);
  return space.toWorld((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
}

/** 某一點到家具的距離：到「家具佔的格子中心連成的長方形」（1×1 就是到格子中心） */
export function itemDistance(it: YardItem, pos: { x: number; z: number }, space: DecorSpace = YARD_SPACE): number {
  const r = itemRect(it);
  const a = space.toWorld(r.x0, r.z0);
  const b = space.toWorld(r.x1, r.z1);
  const dx = Math.max(Math.min(a.x, b.x) - pos.x, 0, pos.x - Math.max(a.x, b.x));
  const dz = Math.max(Math.min(a.z, b.z) - pos.z, 0, pos.z - Math.max(a.z, b.z));
  return Math.hypot(dx, dz);
}

/** 角色的面向換成四個方向：0 南（+z）、1 東（+x）、2 北（-z）、3 西（-x）；heading 0 是南方 */
export function facingOf(heading: number): YardRot {
  return ((((Math.round(heading / (Math.PI / 2)) % 4) + 4) % 4) as YardRot);
}

/**
 * 放在角色面前時的基準格：從面前那一格（front）往角色面向（facing）的方向展開，橫向以面前那一格為準
 * （不會往角色這邊長，不會蓋到角色自己）
 */
export function placeAnchor(front: YardCell, facing: YardRot, id: string, rot: YardRot): YardCell {
  const { w, d } = worldSize(id, rot);
  /** 基準格在長方形裡的位置（東西、南北） */
  const a = Math.floor((w - 1) / 2);
  const b = Math.floor((d - 1) / 2);
  switch (facing) {
    case 0:
      return { gx: front.gx, gz: front.gz + b };
    case 2:
      return { gx: front.gx, gz: front.gz - (d - 1 - b) };
    case 1:
      return { gx: front.gx + a, gz: front.gz };
    default:
      return { gx: front.gx - (w - 1 - a), gz: front.gz };
  }
}

/** 家具佔的格子（"gx,gz"）；skip 是不算的那一個（轉方向時不算自己） */
function occupied(items: readonly YardItem[], skip = -1): Set<string> {
  const out = new Set<string>();
  items.forEach((it, i) => {
    if (i !== skip) for (const c of itemCells(it)) out.add(`${c.gx},${c.gz}`);
  });
  return out;
}

/** 整塊都能擺、不壓到別的家具：可以回傳 null，不行回傳原因 */
function blockProblem(cells: readonly YardCell[], taken: Set<string>, space: DecorSpace): string | null {
  if (cells.some((c) => !space.isCell(c.gx, c.gz))) return '這裡不能擺';
  if (cells.some((c) => taken.has(`${c.gx},${c.gz}`))) return '這裡已經有東西了';
  return null;
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
 * 另一邊（島上或屋裡）擺了以後，這一邊每種家具還能擺幾個：擁有的減掉另一邊擺了的，不會小於 0。
 * 存島上時扣掉屋裡的、存屋裡時扣掉島上的（每次只改一邊，另一邊不動，伺服器與裝置算出來一樣）
 */
export function budgetAfter(owned: Record<string, number>, other: readonly YardItem[]): Record<string, number> {
  const out: Record<string, number> = { ...owned };
  for (const it of other) if (it.id in out) out[it.id] = Math.max(0, out[it.id] - 1);
  return out;
}

/**
 * 擺放檢查：拿掉不是家具、不在可以擺的格子、格子重複、超過能擺數量（owned）的項目，最多 space.max 個（前面的優先）。
 * 不合法的只拿掉那一個，其餘照存（格子的規則以後小改時，舊的擺放大多還在）
 */
export function cleanItems(items: readonly YardItem[], owned: Record<string, number>, space: DecorSpace): YardItem[] {
  const used = new Set<string>();
  const placed: Record<string, number> = {};
  const out: YardItem[] = [];
  for (const it of items) {
    if (out.length >= space.max) break;
    const key = `${it.gx},${it.gz}`;
    if (!isDecor(it.id) || !space.isCell(it.gx, it.gz) || used.has(key)) continue;
    if ((placed[it.id] ?? 0) >= (owned[it.id] ?? 0)) continue;
    used.add(key);
    placed[it.id] = (placed[it.id] ?? 0) + 1;
    out.push({ id: it.id, gx: it.gx, gz: it.gz, rot: (((it.rot % 4) + 4) % 4) as YardRot });
  }
  return out;
}

/** 島上的擺放檢查（cleanItems 用島上的格子；owned 是島上能擺的數量，已經扣掉屋裡擺的） */
export function cleanYard(items: readonly YardItem[], owned: Record<string, number>): YardItem[] {
  return cleanItems(items, owned, YARD_SPACE);
}

/** 家具包裡每種家具還能擺幾個（擁有的減掉擺了的；島上加屋裡一起算時 items 傳兩邊合起來的） */
export function remainingDecor(s: { items: readonly YardItem[] }, owned: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...owned };
  for (const it of s.items) if (it.id in out) out[it.id] = Math.max(0, out[it.id] - 1);
  return out;
}

// ---------- 動森做法：放在角色面前、轉方向、收起來 ----------

/** 角色面前的那一格（pos 是角色位置，heading 是面向的角度，0 = 南方 +z；屋裡傳房間的座標與 HOME_SPACE） */
export function frontCell(pos: { x: number; z: number }, heading: number, space: DecorSpace = YARD_SPACE): YardCell {
  return space.toCell(pos.x + Math.sin(heading) * FRONT_DIST, pos.z + Math.cos(heading) * FRONT_DIST);
}

/** 基準格在某一格的家具（索引；沒有是 -1） */
function itemAt(items: readonly YardItem[], gx: number, gz: number): number {
  return items.findIndex((it) => it.gx === gx && it.gz === gz);
}

/**
 * 能不能把某種家具（轉了 rot 次）放在基準格 (gx, gz)：可以回傳 null，不行回傳原因（畫面上的提示）。
 * 家具佔的整塊都要能擺、不壓到別的家具佔的格子（第 10.3 節）。
 * owned 是這一邊能擺的數量（島上加屋裡共用時先用 budgetAfter 扣掉另一邊）
 */
export function canPlace(
  items: readonly YardItem[],
  gx: number,
  gz: number,
  id: string,
  owned: Record<string, number>,
  space: DecorSpace = YARD_SPACE,
  rot: YardRot = 0,
): string | null {
  const block = blockProblem(itemCells({ id, gx, gz, rot }), occupied(items), space);
  if (block) return block;
  if ((remainingDecor({ items }, owned)[id] ?? 0) <= 0) return '這個家具都擺出去了';
  if (items.length >= space.max) return space.full;
  return null;
}

/** 放下家具（方向照預覽）；不能放時原樣回傳 */
export function placeItem(
  items: readonly YardItem[],
  gx: number,
  gz: number,
  id: string,
  rot: YardRot,
  owned: Record<string, number>,
  space: DecorSpace = YARD_SPACE,
): readonly YardItem[] {
  if (canPlace(items, gx, gz, id, owned, space, rot) !== null) return items;
  return [...items, { id, gx, gz, rot }];
}

/** 轉不過去時的提示（只顯示，不唸） */
export const ROTATE_BLOCKED = '旁邊太擠了，轉不過去';

/** 基準格在 (gx, gz) 的家具能不能轉 90 度：轉過去整塊要能擺、不壓到別的家具（不算自己）；可以回傳 null */
export function canRotate(items: readonly YardItem[], gx: number, gz: number, space: DecorSpace = YARD_SPACE): string | null {
  const i = itemAt(items, gx, gz);
  if (i < 0) return null;
  const it = items[i];
  const turned = { ...it, rot: ((it.rot + 1) % 4) as YardRot };
  return blockProblem(itemCells(turned), occupied(items, i), space) ? ROTATE_BLOCKED : null;
}

/** 基準格在 (gx, gz) 的家具轉 90 度；轉不過去（canRotate）時原樣回傳 */
export function rotateItem(items: readonly YardItem[], gx: number, gz: number, space: DecorSpace = YARD_SPACE): readonly YardItem[] {
  const i = itemAt(items, gx, gz);
  if (i < 0 || canRotate(items, gx, gz, space) !== null) return items;
  return items.map((it, k) => (k === i ? { ...it, rot: ((it.rot + 1) % 4) as YardRot } : it));
}

/** 收起基準格在某一格的家具（回到家具包） */
export function removeItem(items: readonly YardItem[], gx: number, gz: number): readonly YardItem[] {
  const i = itemAt(items, gx, gz);
  return i < 0 ? items : items.filter((_, k) => k !== i);
}

/** 角色旁邊（NEAR_DIST 內，到家具佔的格子的距離 itemDistance）最靠近的家具；沒有是 null */
export function nearestItem(items: readonly YardItem[], pos: { x: number; z: number }, space: DecorSpace = YARD_SPACE, maxDist = NEAR_DIST): YardItem | null {
  let best: YardItem | null = null;
  let bestD = maxDist;
  for (const it of visibleYard(items, space.max)) {
    const d = itemDistance(it, pos, space);
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

/** 要畫的家具：不認得的跳過（別人的島可能是比較新的版本）、最多 max 個（預設島上的上限），不丟例外 */
export function visibleYard(items: readonly YardItem[], max = YARD_MAX_ITEMS): YardItem[] {
  return items.filter((it) => isDecor(it.id)).slice(0, max);
}

/** 擋路的家具（碰撞）：家具佔的每一格中心一個圓、半徑 SOLID_RADIUS；花草、石板路、小池塘、地毯可以走過去 */
export function decorObstacles(items: readonly YardItem[], space: DecorSpace): { x: number; z: number; r: number }[] {
  return visibleYard(items, space.max)
    .filter((it) => !findItem(it.id)?.walkable)
    .flatMap((it) => itemCells(it).map((c) => ({ ...space.toWorld(c.gx, c.gz), r: SOLID_RADIUS })));
}

/** 島上擋路的家具 */
export function yardObstacles(items: readonly YardItem[]): { x: number; z: number; r: number }[] {
  return decorObstacles(items, YARD_SPACE);
}
