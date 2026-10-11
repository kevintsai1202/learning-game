/**
 * 自己的家第二期：進屋（純資料與純函式，前端與伺服器共用；規格見 docs/plans/home.md 第 8 節）。
 * - 房間 10×10 格（一格 1 公尺），格子座標 0～9；房間的座標以房間中心為原點，後牆在 -z、門口在前緣 +z 的中間。
 * - 房間的擺設（items）、壁紙（wall）與地板（floor）；舊存檔沒有房間就是空房間加預設款。
 * - 每種家具的數量島上加屋裡一起算：存房間時扣掉島上已經擺的（yard.ts 的 budgetAfter）。
 * 伺服器會 import 這個檔，不能 import 畫面、音訊或 3D 的程式；存檔只用 type import（save.ts 會 import 這裡）。
 */
import { z } from 'zod';
import type { Profile } from './save';
import { findItem, owns } from './catalog';
import { budgetAfter, cleanItems, ownedDecor, yardItemSchema, type DecorSpace, type YardCell, type YardItem } from './yard';

/** 房間的邊長（格） */
export const HOME_SIZE = 10;
/** 屋裡最多擺幾個家具（房間只有 98 格，這是存檔格式的上限） */
export const HOME_MAX_ITEMS = 100;
/** 門口的腳踏墊（前緣中間兩格，不能擺；房間邊長是偶數，兩格才會在正中間） */
export const HOME_DOOR_CELLS: readonly YardCell[] = [
  { gx: HOME_SIZE / 2 - 1, gz: HOME_SIZE - 1 },
  { gx: HOME_SIZE / 2, gz: HOME_SIZE - 1 },
];
/** 預設的壁紙與地板（不用買就擁有） */
export const DEFAULT_WALL = 'wall.cream';
export const DEFAULT_FLOOR = 'floor.wood';

/** 房間：擺設、壁紙、地板 */
export interface HomeState {
  items: YardItem[];
  wall: string;
  floor: string;
}

/** 房間的格式（存檔與 home 操作共用；格子合不合法由 cleanHome 判斷） */
export const homeSchema = z.object({
  items: z.array(yardItemSchema).max(HOME_MAX_ITEMS),
  wall: z.string().min(1).max(40),
  floor: z.string().min(1).max(40),
});

/** 房間格子的中心（房間的座標，原點在房間中心） */
export function homeCellToWorld(gx: number, gz: number): { x: number; z: number } {
  return { x: gx - (HOME_SIZE - 1) / 2, z: gz - (HOME_SIZE - 1) / 2 };
}

/** 房間的座標落在哪一格（可能在房間外，由 isHomeCell 判斷；+ 0 把 -0 變成 0） */
function homeWorldToCell(x: number, z: number): YardCell {
  return { gx: Math.round(x + (HOME_SIZE - 1) / 2) + 0, gz: Math.round(z + (HOME_SIZE - 1) / 2) + 0 };
}

/** 是不是門口的格子 */
function isDoorCell(gx: number, gz: number): boolean {
  return HOME_DOOR_CELLS.some((d) => d.gx === gx && d.gz === gz);
}

/** 這一格能不能擺家具：房間裡、不是門口 */
export function isHomeCell(gx: number, gz: number): boolean {
  return Number.isInteger(gx) && Number.isInteger(gz) && gx >= 0 && gx < HOME_SIZE && gz >= 0 && gz < HOME_SIZE && !isDoorCell(gx, gz);
}

/** 房間裡可以擺的格子（固定的，算一次記住） */
let cells: readonly YardCell[] | null = null;
export function homeCells(): readonly YardCell[] {
  if (!cells) {
    const out: YardCell[] = [];
    for (let gz = 0; gz < HOME_SIZE; gz++) for (let gx = 0; gx < HOME_SIZE; gx++) if (isHomeCell(gx, gz)) out.push({ gx, gz });
    cells = out;
  }
  return cells;
}

/** 屋裡（房間的座標） */
export const HOME_SPACE: DecorSpace = {
  isCell: isHomeCell,
  max: HOME_MAX_ITEMS,
  full: '屋裡已經擺滿了',
  toWorld: homeCellToWorld,
  toCell: homeWorldToCell,
};

/** 角色的房間；舊存檔沒有就是空房間加預設的壁紙地板 */
export function homeOf(p: Pick<Profile, 'home'>): HomeState {
  return p.home ?? { items: [], wall: DEFAULT_WALL, floor: DEFAULT_FLOOR };
}

/** 壁紙或地板：種類相符而且擁有才用，否則換回預設款 */
function pickSurface(p: Pick<Profile, 'inventory' | 'badges'>, id: string, slot: 'wall' | 'floor', fallback: string): string {
  return findItem(id)?.slot === slot && owns(p, id) ? id : fallback;
}

/**
 * 房間的擺放檢查：家具照房間的格子與能擺的數量（擁有的扣掉島上已經擺的）清理；
 * 壁紙地板沒買的、種類不對的換回預設款
 */
export function cleanHome(home: HomeState, p: Pick<Profile, 'inventory' | 'badges' | 'yard'>): HomeState {
  return {
    items: cleanItems(home.items, budgetAfter(ownedDecor(p), p.yard ?? []), HOME_SPACE),
    wall: pickSurface(p, home.wall, 'wall', DEFAULT_WALL),
    floor: pickSurface(p, home.floor, 'floor', DEFAULT_FLOOR),
  };
}
