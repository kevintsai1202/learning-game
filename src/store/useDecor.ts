/**
 * 在島上直接佈置（自己的家改版，docs/plans/home.md 第 7 節）的狀態與動作：動森做法。
 * - 家具包打開、選著要放的家具（picking）、預覽的方向（ghostRot）。
 * - 角色面前的那一格（front）與角色旁邊最靠近的家具（near）：島嶼場景每一格畫面算，有變才更新。
 * - 放下、轉方向、收起來都直接存（useGame.saveYard；雲端角色的待送佇列只留最新的一份擺設）。
 * 規則在 src/store/yard.ts。e2e 透過 window.__game.yard 操作。
 */
import { create } from 'zustand';
import { useGame } from './useGame';
import { canPlace, cellToWorld, nearestItem, ownedDecor, placeItem, remainingDecor, removeItem, rotateItem, yardCells, type YardCell, type YardItem, type YardRot } from './yard';
import { useHostYard } from '../online/useHostYard';

interface DecorState {
  /** 家具包打開了 */
  bagOpen: boolean;
  /** 選著要放的家具（null 是沒選） */
  picking: string | null;
  /** 預覽的方向 */
  ghostRot: YardRot;
  /** 角色面前的那一格（不在自己的島上是 null） */
  front: YardCell | null;
  /** 角色旁邊最靠近的家具（可以轉方向、收起來） */
  near: YardItem | null;
}

export const useDecor = create<DecorState>(() => ({ bagOpen: false, picking: null, ghostRot: 0, front: null, near: null }));

/** 目前角色的擺設與擁有的家具 */
function current(): { items: readonly YardItem[]; owned: Record<string, number> } | null {
  const p = useGame.getState().profile();
  return p ? { items: p.yard ?? [], owned: ownedDecor(p) } : null;
}

/** 打開或關上家具包（關上時不再選著家具） */
export function toggleBag(open = !useDecor.getState().bagOpen): void {
  useDecor.setState(open ? { bagOpen: true } : { bagOpen: false, picking: null, ghostRot: 0 });
}

/** 從家具包選一樣（再點一次同一樣就不選）；沒有剩的不能選 */
export function pickDecor(id: string | null): void {
  const c = current();
  if (!c) return;
  const s = useDecor.getState();
  if (id === null || id === s.picking || (remainingDecor({ items: c.items }, c.owned)[id] ?? 0) <= 0) {
    useDecor.setState({ picking: null, ghostRot: 0 });
    return;
  }
  useDecor.setState({ picking: id, ghostRot: 0 });
}

/** 預覽轉 90 度 */
export function rotateGhost(): void {
  useDecor.setState((s) => ({ ghostRot: ((s.ghostRot + 1) % 4) as YardRot }));
}

/** 角色面前那一格能不能放選著的家具（null 是可以，不行回傳原因；沒選家具也是 null） */
export function frontProblem(): string | null {
  const { picking, front } = useDecor.getState();
  const c = current();
  if (!picking || !c) return null;
  if (!front) return '這裡不能擺';
  return canPlace(c.items, front.gx, front.gz, picking, c.owned);
}

/** 放在角色面前那一格；放完了這一樣就不再選著。放成功回傳 true */
export function placeFront(): boolean {
  const { picking, front, ghostRot } = useDecor.getState();
  const c = current();
  if (!picking || !front || !c) return false;
  const items = placeItem(c.items, front.gx, front.gz, picking, ghostRot, c.owned);
  if (items === c.items) return false;
  useGame.getState().saveYard([...items]);
  if ((remainingDecor({ items }, c.owned)[picking] ?? 0) <= 0) useDecor.setState({ picking: null, ghostRot: 0 });
  return true;
}

/** 旁邊的家具轉 90 度 */
export function rotateNear(): void {
  const { near } = useDecor.getState();
  const c = current();
  if (!near || !c) return;
  const items = rotateItem(c.items, near.gx, near.gz);
  if (items !== c.items) useGame.getState().saveYard([...items]);
}

/** 旁邊的家具收起來（回到家具包） */
export function pickUpNear(): void {
  const { near } = useDecor.getState();
  const c = current();
  if (!near || !c) return;
  const items = removeItem(c.items, near.gx, near.gz);
  if (items !== c.items) {
    useGame.getState().saveYard([...items]);
    useDecor.setState({ near: null });
  }
}

/** 角色移動後更新面前的格子與旁邊的家具（島嶼場景每一格畫面呼叫；有變才更新） */
export function updateDecorSpot(front: YardCell | null, pos: { x: number; z: number } | null): void {
  const s = useDecor.getState();
  const c = current();
  const near = pos && c ? nearestItem(c.items, pos) : null;
  const sameFront = s.front === front || (s.front && front && s.front.gx === front.gx && s.front.gz === front.gz);
  const sameNear = s.near === near || (s.near && near && s.near.gx === near.gx && s.near.gz === near.gz && s.near.rot === near.rot && s.near.id === near.id);
  if (sameFront && sameNear) return;
  useDecor.setState({ front, near });
}

/** 離開自己的島、換畫面：關上家具包、清掉面前與旁邊 */
export function resetDecor(): void {
  useDecor.setState({ bagOpen: false, picking: null, ghostRot: 0, front: null, near: null });
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
