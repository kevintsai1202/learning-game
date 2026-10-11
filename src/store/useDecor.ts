/**
 * 在島上與屋裡直接佈置（自己的家改版，docs/plans/home.md 第 7、8 節）的狀態與動作：動森做法。
 * - 家具包打開、選著要放的家具（picking）、預覽的方向（ghostRot）。
 * - 角色面前的那一格（front）與角色旁邊最靠近的家具（near）：場景每一格畫面算，有變才更新。
 * - 放下、轉方向、收起來都直接存：在自己的屋裡存房間（useGame.saveHome），其他時候存島上（useGame.saveYard）；
 *   雲端角色的待送佇列只留最新的一份。
 * - 每種家具的數量島上加屋裡一起算（current 的 owned 已經扣掉另一邊擺的）。
 * - 壁紙地板面板（第二期）：只在自己的屋裡，和家具包互斥。
 * 規則在 src/store/yard.ts、src/store/home.ts。e2e 透過 window.__game.yard 操作。
 */
import { create } from 'zustand';
import { useGame } from './useGame';
import {
  YARD_SPACE,
  budgetAfter,
  canPlace,
  cellToWorld,
  nearestItem,
  ownedDecor,
  placeItem,
  remainingDecor,
  removeItem,
  rotateItem,
  yardCells,
  type DecorSpace,
  type YardCell,
  type YardItem,
  type YardRot,
} from './yard';
import { HOME_SPACE, homeOf } from './home';
import { FLOORS, WALLPAPERS, owns, type CatalogItem } from './catalog';
import { isInsideHome, useHome } from './useHome';
import { useHostYard } from '../online/useHostYard';

interface DecorState {
  /** 家具包打開了 */
  bagOpen: boolean;
  /** 壁紙地板面板打開了（只在自己的屋裡） */
  surfaceOpen: boolean;
  /** 選著要放的家具（null 是沒選） */
  picking: string | null;
  /** 預覽的方向 */
  ghostRot: YardRot;
  /** 角色面前的那一格（不在自己的島或屋裡是 null） */
  front: YardCell | null;
  /** 角色旁邊最靠近的家具（可以轉方向、收起來） */
  near: YardItem | null;
}

export const useDecor = create<DecorState>(() => ({ bagOpen: false, surfaceOpen: false, picking: null, ghostRot: 0, front: null, near: null }));

/** 在自己的屋裡佈置（不是熊熊老師、不是別人的家） */
function inOwnHome(): boolean {
  return isInsideHome() && useHome.getState().houseKey === 'mine';
}

/**
 * 現在在哪裡佈置：擺設（items）、另一邊的擺設（other）、這一邊能擺的數量（owned，已扣掉另一邊）、
 * 擺放的地方（space）、存檔的方法（save）。在自己的屋裡是房間，其他時候是島上
 */
function current(): { items: readonly YardItem[]; owned: Record<string, number>; space: DecorSpace; save: (items: YardItem[]) => void } | null {
  const p = useGame.getState().profile();
  if (!p) return null;
  const home = homeOf(p);
  const yard = p.yard ?? [];
  const g = useGame.getState();
  if (inOwnHome()) return { items: home.items, owned: budgetAfter(ownedDecor(p), yard), space: HOME_SPACE, save: (items) => g.saveHome({ ...home, items }) };
  return { items: yard, owned: budgetAfter(ownedDecor(p), home.items), space: YARD_SPACE, save: (items) => g.saveYard(items) };
}

/** 每一格畫面用的輕量版：只拿擺設與擺放的地方（不算擁有的數量） */
function currentItems(): { items: readonly YardItem[]; space: DecorSpace } | null {
  const p = useGame.getState().profile();
  if (!p) return null;
  return inOwnHome() ? { items: homeOf(p).items, space: HOME_SPACE } : { items: p.yard ?? [], space: YARD_SPACE };
}

/** 家具包裡每種家具還能擺幾個（擁有的減掉島上加屋裡擺了的） */
export function remainingAll(): Record<string, number> {
  const p = useGame.getState().profile();
  if (!p) return {};
  return remainingDecor({ items: [...(p.yard ?? []), ...homeOf(p).items] }, ownedDecor(p));
}

/** 打開或關上家具包（關上時不再選著家具；和壁紙地板面板互斥） */
export function toggleBag(open = !useDecor.getState().bagOpen): void {
  useDecor.setState(open ? { bagOpen: true, surfaceOpen: false } : { bagOpen: false, picking: null, ghostRot: 0 });
}

/** 打開或關上壁紙地板面板（和家具包互斥） */
export function toggleSurface(open = !useDecor.getState().surfaceOpen): void {
  useDecor.setState(open ? { surfaceOpen: true, bagOpen: false, picking: null, ghostRot: 0 } : { surfaceOpen: false });
}

/** 從家具包選一樣（再點一次同一樣就不選）；沒有剩的不能選 */
export function pickDecor(id: string | null): void {
  const s = useDecor.getState();
  if (id === null || id === s.picking || (remainingAll()[id] ?? 0) <= 0) {
    useDecor.setState({ picking: null, ghostRot: 0 });
    return;
  }
  useDecor.setState({ picking: id, ghostRot: 0 });
}

/** 預覽轉 90 度 */
export function rotateGhost(): void {
  useDecor.setState((s) => ({ ghostRot: ((s.ghostRot + 1) % 4) as YardRot }));
}

/** 角色面前那一格能不能放選著的家具（null 是可以，不行回傳原因；沒選家具也是 null）。預覽薄板的顏色也用這個 */
export function frontProblem(): string | null {
  const { picking, front } = useDecor.getState();
  const c = current();
  if (!picking || !c) return null;
  if (!front) return '這裡不能擺';
  return canPlace(c.items, front.gx, front.gz, picking, c.owned, c.space);
}

/** 放在角色面前那一格；放完了這一樣就不再選著。放成功回傳 true */
export function placeFront(): boolean {
  const { picking, front, ghostRot } = useDecor.getState();
  const c = current();
  if (!picking || !front || !c) return false;
  const items = placeItem(c.items, front.gx, front.gz, picking, ghostRot, c.owned, c.space);
  if (items === c.items) return false;
  c.save([...items]);
  if ((remainingAll()[picking] ?? 0) <= 0) useDecor.setState({ picking: null, ghostRot: 0 });
  return true;
}

/** 旁邊的家具轉 90 度 */
export function rotateNear(): void {
  const { near } = useDecor.getState();
  const c = current();
  if (!near || !c) return;
  const items = rotateItem(c.items, near.gx, near.gz);
  if (items !== c.items) c.save([...items]);
}

/** 旁邊的家具收起來（回到家具包） */
export function pickUpNear(): void {
  const { near } = useDecor.getState();
  const c = current();
  if (!near || !c) return;
  const items = removeItem(c.items, near.gx, near.gz);
  if (items !== c.items) {
    c.save([...items]);
    useDecor.setState({ near: null });
  }
}

/** 角色移動後更新面前的格子與旁邊的家具（場景每一格畫面呼叫；有變才更新；pos 是島上或房間的座標） */
export function updateDecorSpot(front: YardCell | null, pos: { x: number; z: number } | null): void {
  const s = useDecor.getState();
  const c = currentItems();
  const near = pos && c ? nearestItem(c.items, pos, c.space) : null;
  const sameFront = s.front === front || (s.front && front && s.front.gx === front.gx && s.front.gz === front.gz);
  const sameNear = s.near === near || (s.near && near && s.near.gx === near.gx && s.near.gz === near.gz && s.near.rot === near.rot && s.near.id === near.id);
  if (sameFront && sameNear) return;
  useDecor.setState({ front, near });
}

/** 離開自己的島或屋子、換畫面：關上家具包與壁紙地板面板、清掉面前與旁邊 */
export function resetDecor(): void {
  useDecor.setState({ bagOpen: false, surfaceOpen: false, picking: null, ghostRot: 0, front: null, near: null });
}

/** 壁紙地板面板的選項：擁有的壁紙與地板（預設款本來就有），和現在房間用的 */
export function surfaceChoices(): { walls: CatalogItem[]; floors: CatalogItem[]; wall: string; floor: string } {
  const p = useGame.getState().profile();
  if (!p) return { walls: [], floors: [], wall: '', floor: '' };
  const home = homeOf(p);
  return { walls: WALLPAPERS.filter((w) => owns(p, w.id)), floors: FLOORS.filter((f) => owns(p, f.id)), wall: home.wall, floor: home.floor };
}

/** 換房間的壁紙或地板（存房間；伺服器照擁有的清理） */
export function chooseSurface(id: string): void {
  const p = useGame.getState().profile();
  if (!p || !inOwnHome()) return;
  const home = homeOf(p);
  const slot = WALLPAPERS.some((w) => w.id === id) ? 'wall' : FLOORS.some((f) => f.id === id) ? 'floor' : null;
  if (!slot || !owns(p, id)) return;
  useGame.getState().saveHome({ ...home, [slot]: id });
}

/** e2e 用（window.__game.yard）：格子與世界座標、佈置的狀態與動作、別人的島的擺設 */
export const yardDebug = {
  cells: yardCells,
  world: cellToWorld,
  host: useHostYard,
  store: useDecor,
  toggleBag,
  pick: pickDecor,
  rotateGhost,
  place: placeFront,
  rotateNear,
  pickUpNear,
};
