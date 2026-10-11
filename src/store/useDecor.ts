/**
 * 在島上與屋裡直接佈置（自己的家改版，docs/plans/home.md 第 7、8 節）的狀態與動作：動森做法。
 * - 家具包打開、選著要放的家具（picking）、預覽的方向（ghostRot）。
 * - 角色面前的那一格（front）與角色旁邊最靠近的家具（near）：場景每一格畫面算，有變才更新。
 * - 放下、轉方向、收起來都直接存：在自己的屋裡存房間（useGame.saveHome），其他時候存島上（useGame.saveYard）；
 *   雲端角色的待送佇列只留最新的一份。
 * - 每種家具的數量島上加屋裡一起算（current 的 owned 已經扣掉另一邊擺的）。
 * - 壁紙地板面板（第二期）：只在自己的屋裡，和家具包互斥。
 * - 多格的家具（第 10.3 節）：記下角色面向的四個方向（facing），放的時候從面前那一格往面向展開（placeAnchor）；
 *   旁邊的家具轉不過去時顯示提示（notice），走開或過一下子就消失。
 * 規則在 src/store/yard.ts、src/store/home.ts。e2e 透過 window.__game.yard 操作。
 */
import { create } from 'zustand';
import { useGame } from './useGame';
import {
  YARD_SPACE,
  budgetAfter,
  itemCenter,
  canPlace,
  canRotate,
  cellToWorld,
  nearestItem,
  ownedDecor,
  placeAnchor,
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
  /** 角色面向的四個方向（0 南、1 東、2 北、3 西；多格的家具往這個方向展開） */
  facing: YardRot;
  /** 角色旁邊最靠近的家具（可以轉方向、收起來） */
  near: YardItem | null;
  /** 旁邊的家具轉不過去時的提示（只顯示，不唸；走開或過一下子就消失） */
  notice: string | null;
}

export const useDecor = create<DecorState>(() => ({ bagOpen: false, surfaceOpen: false, picking: null, ghostRot: 0, front: null, facing: 0, near: null, notice: null }));

/** 提示顯示多久（毫秒） */
const NOTICE_MS = 2500;
/** 剛轉過方向後，角色走開多遠才照距離重找旁邊的家具（公尺） */
const TURN_HOLD = 0.3;
/** 角色上一次的位置（updateDecorSpot 記下，轉方向時用） */
let lastPos: { x: number; z: number } | null = null;
/**
 * 剛轉過方向的家具（基準格）與當時角色的位置：角色沒走開就一直算「旁邊的家具」。
 * 長的家具（床、長椅）在一端轉了以後會離角色變遠，不這樣按鈕會不見，孩子沒辦法再按一次轉方向（第 10.3 節）
 */
let turned: { gx: number; gz: number; x: number; z: number } | null = null;
/** 提示消失的計時器 */
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

/** 顯示或清掉提示 */
function setNotice(text: string | null): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = text ? setTimeout(() => useDecor.setState({ notice: null }), NOTICE_MS) : null;
  useDecor.setState({ notice: text });
}

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

/** 選著的家具放下去的基準格：從面前那一格往角色面向展開（多格的家具；1×1 就是面前那一格）。沒選或沒有面前是 null */
export function frontAnchor(): YardCell | null {
  const { picking, front, facing, ghostRot } = useDecor.getState();
  if (!picking || !front) return null;
  return placeAnchor(front, facing, picking, ghostRot);
}

/** 角色面前那一格能不能放選著的家具（null 是可以，不行回傳原因；沒選家具也是 null）。預覽薄板的顏色也用這個 */
export function frontProblem(): string | null {
  const { picking, ghostRot } = useDecor.getState();
  const c = current();
  if (!picking || !c) return null;
  const a = frontAnchor();
  if (!a) return '這裡不能擺';
  return canPlace(c.items, a.gx, a.gz, picking, c.owned, c.space, ghostRot);
}

/** 放在角色面前（多格的家具往面向展開）；放完了這一樣就不再選著。放成功回傳 true */
export function placeFront(): boolean {
  const { picking, ghostRot } = useDecor.getState();
  const c = current();
  const a = frontAnchor();
  if (!picking || !a || !c) return false;
  const items = placeItem(c.items, a.gx, a.gz, picking, ghostRot, c.owned, c.space);
  if (items === c.items) return false;
  c.save([...items]);
  if ((remainingAll()[picking] ?? 0) <= 0) useDecor.setState({ picking: null, ghostRot: 0 });
  return true;
}

/** 旁邊的家具轉 90 度；轉過去會壓到別的或超出（canRotate）就不轉、顯示提示。轉了回傳 true */
export function rotateNear(): boolean {
  const { near } = useDecor.getState();
  const c = current();
  if (!near || !c) return false;
  const problem = canRotate(c.items, near.gx, near.gz, c.space);
  if (problem) {
    setNotice(problem);
    return false;
  }
  const items = rotateItem(c.items, near.gx, near.gz, c.space);
  if (items === c.items) return false;
  setNotice(null);
  c.save([...items]);
  // 轉了以後基準格不變：角色沒走開就還是旁邊的家具
  if (lastPos) turned = { gx: near.gx, gz: near.gz, ...lastPos };
  return true;
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

/**
 * 角色移動後更新面前的格子、面向與旁邊的家具（場景每一格畫面呼叫；有變才更新；pos 是島上或房間的座標）。
 * 旁邊換了一件（或走開）時清掉轉不過去的提示
 */
export function updateDecorSpot(front: YardCell | null, pos: { x: number; z: number } | null, facing: YardRot = useDecor.getState().facing): void {
  const s = useDecor.getState();
  const c = currentItems();
  lastPos = pos;
  let near = pos && c ? nearestItem(c.items, pos, c.space) : null;
  // 剛轉過方向的家具：角色沒走開就還是它（轉了以後可能離角色變遠）
  if (turned && pos && c && Math.hypot(pos.x - turned.x, pos.z - turned.z) <= TURN_HOLD) {
    const held = turned;
    near = c.items.find((it) => it.gx === held.gx && it.gz === held.gz) ?? near;
  } else turned = null;
  const sameFront = s.front === front || (s.front && front && s.front.gx === front.gx && s.front.gz === front.gz);
  const sameItem = s.near === near || (s.near && near && s.near.gx === near.gx && s.near.gz === near.gz && s.near.id === near.id);
  const sameNear = sameItem && (s.near === near || s.near?.rot === near?.rot);
  if (sameFront && sameNear && s.facing === facing) return;
  useDecor.setState({ front, near, facing });
  if (!sameItem && s.notice) setNotice(null);
}

/** 離開自己的島或屋子、換畫面：關上家具包與壁紙地板面板、清掉面前、旁邊與提示 */
export function resetDecor(): void {
  setNotice(null);
  turned = null;
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

/** e2e 用（window.__game.yard）：格子與世界座標、家具佔的格子的正中間、佈置的狀態與動作、別人的島的擺設 */
export const yardDebug = {
  cells: yardCells,
  world: cellToWorld,
  center: (it: YardItem) => itemCenter(it),
  host: useHostYard,
  store: useDecor,
  toggleBag,
  pick: pickDecor,
  rotateGhost,
  place: placeFront,
  rotateNear,
  pickUpNear,
};
