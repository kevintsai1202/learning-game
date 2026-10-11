/**
 * 自己的家第二期：進屋（docs/plans/home.md 第 8 節）。房間的格子、室內家具與壁紙地板的目錄、
 * 房間的擺設清理、島上與屋裡共用每種家具的數量、房間裡放在角色面前。這些規則前端與伺服器共用。
 */
import { describe, expect, it } from 'vitest';
import { FLOORS, FURNITURE, WALLPAPERS, findItem, owns } from '../../src/store/catalog';
import { giftPrice } from '../../src/store/gifts';
import { addProfile, buyItem, createEmptySave, parseProfile, setHome, setYard, type Profile, type SaveData } from '../../src/store/save';
import { budgetAfter, canPlace, decorObstacles, frontCell, isDecor, nearestItem, placeItem, remainingDecor, yardCells, type YardItem } from '../../src/store/yard';
import {
  DEFAULT_FLOOR,
  DEFAULT_WALL,
  HOME_CLEAR_CELLS,
  HOME_DOOR_CELLS,
  HOME_MAX_ITEMS,
  HOME_SIZE,
  HOME_SPACE,
  cleanHome,
  homeCellToWorld,
  homeCells,
  homeOf,
  isHomeCell,
} from '../../src/store/home';

const NOW = new Date('2026-10-11T10:00:00+08:00');

/** 一位小朋友（coins 枚金幣、收藏 inventory） */
function kidSave(coins = 500, inventory: string[] = []): SaveData {
  const s = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW);
  return { ...s, profiles: [{ ...s.profiles[0], coins, inventory }] };
}
const pid = (s: SaveData) => s.profiles[0].id;
const prof = (s: SaveData): Profile => s.profiles[0];
const item = (id: string, gx: number, gz: number, rot: 0 | 1 | 2 | 3 = 0): YardItem => ({ id, gx, gz, rot });

describe('房間的格子（10×10，門口與門口前面不能擺）', () => {
  it('10×10 減掉門口兩格與門口前面兩格（96 格）；都在 0～9、不重複', () => {
    const cells = homeCells();
    expect(HOME_SIZE).toBe(10);
    expect(HOME_CLEAR_CELLS).toHaveLength(4);
    expect(cells).toHaveLength(96);
    expect(new Set(cells.map((c) => `${c.gx},${c.gz}`)).size).toBe(cells.length);
    for (const c of cells) {
      expect(c.gx).toBeGreaterThanOrEqual(0);
      expect(c.gx).toBeLessThan(HOME_SIZE);
      expect(c.gz).toBeGreaterThanOrEqual(0);
      expect(c.gz).toBeLessThan(HOME_SIZE);
    }
  });

  it('門口在前緣（gz = 9）的中間', () => {
    expect(HOME_DOOR_CELLS.length).toBeGreaterThanOrEqual(1);
    for (const d of HOME_DOOR_CELLS) {
      expect(d.gz).toBe(HOME_SIZE - 1);
      expect(Math.abs(homeCellToWorld(d.gx, d.gz).x)).toBeLessThan(1);
      expect(isHomeCell(d.gx, d.gz)).toBe(false);
    }
    for (const c of HOME_CLEAR_CELLS) expect(isHomeCell(c.gx, c.gz)).toBe(false);
    expect(isHomeCell(0, 0)).toBe(true);
    expect(isHomeCell(9, 0)).toBe(true);
    expect(isHomeCell(-1, 0)).toBe(false);
    expect(isHomeCell(0, 10)).toBe(false);
  });

  it('房間的座標以房間中心為原點：格子中心在 ±4.5，前緣（門口）在 +z', () => {
    expect(homeCellToWorld(0, 0)).toEqual({ x: -4.5, z: -4.5 });
    expect(homeCellToWorld(9, 9)).toEqual({ x: 4.5, z: 4.5 });
    expect(HOME_SPACE.toCell(-4.4, -4.6)).toEqual({ gx: 0, gz: 0 });
    expect(HOME_SPACE.toWorld(3, 7)).toEqual(homeCellToWorld(3, 7));
  });
});

describe('目錄：室內家具、壁紙、地板', () => {
  const indoor = FURNITURE.filter((f) => f.indoor);

  it('室內家具 15 種：是家具、20～150 枚、地毯可以走過去', () => {
    expect(indoor).toHaveLength(15);
    for (const f of indoor) {
      expect(f.slot).toBe('decor');
      expect(isDecor(f.id)).toBe(true);
      expect(f.price).toBeGreaterThanOrEqual(20);
      expect(f.price).toBeLessThanOrEqual(150);
    }
    expect(indoor.filter((f) => f.walkable).map((f) => f.id)).toEqual(['decor.rug']);
  });

  it('全部家具的 id 不重複（島上的 21 種加室內的 15 種）', () => {
    expect(FURNITURE).toHaveLength(36);
    expect(new Set(FURNITURE.map((f) => f.id)).size).toBe(36);
  });

  it('壁紙與地板各 6 種，各有一種免費的預設款；不是家具、不能當禮物', () => {
    for (const [list, slot, def] of [
      [WALLPAPERS, 'wall', DEFAULT_WALL],
      [FLOORS, 'floor', DEFAULT_FLOOR],
    ] as const) {
      expect(list).toHaveLength(6);
      expect(list.filter((i) => i.free).map((i) => i.id)).toEqual([def]);
      for (const i of list) {
        expect(i.slot).toBe(slot);
        expect(i.id.startsWith(`${slot}.`)).toBe(true);
        expect(isDecor(i.id)).toBe(false);
        expect(giftPrice(i.id)).toBeNull();
        expect(findItem(i.id)).toBe(i);
        if (!i.free) expect(i.price).toBeGreaterThan(0);
      }
    }
  });

  it('預設款不用買就擁有；其他的要買', () => {
    const p = prof(kidSave());
    expect(owns(p, DEFAULT_WALL)).toBe(true);
    expect(owns(p, DEFAULT_FLOOR)).toBe(true);
    const paid = WALLPAPERS.find((w) => !w.free)!;
    expect(owns(p, paid.id)).toBe(false);
  });

  it('壁紙買一次就有，再買不扣金幣', () => {
    const paid = WALLPAPERS.find((w) => !w.free)!;
    let s = kidSave(500);
    s = buyItem(s, pid(s), paid.id, paid.price!);
    s = buyItem(s, pid(s), paid.id, paid.price!);
    expect(prof(s).coins).toBe(500 - paid.price!);
    expect(prof(s).inventory.filter((v) => v === paid.id)).toHaveLength(1);
  });
});

describe('島上與屋裡共用每種家具的數量', () => {
  const [c1, c2] = yardCells();

  it('budgetAfter：擁有的減掉另一邊擺了的（不會小於 0）', () => {
    const owned = { 'decor.bench': 2, 'decor.bed': 1 };
    expect(budgetAfter(owned, [item('decor.bench', 1, 1), item('decor.bed', 2, 2), item('decor.bed', 3, 3)])).toEqual({ 'decor.bench': 1, 'decor.bed': 0 });
    expect(budgetAfter(owned, [])).toEqual(owned);
  });

  it('remainingDecor 把島上與屋裡加在一起算', () => {
    const owned = { 'decor.bench': 3 };
    expect(remainingDecor({ items: [item('decor.bench', c1.gx, c1.gz), item('decor.bench', 2, 2)] }, owned)).toEqual({ 'decor.bench': 1 });
  });

  it('setYard 扣掉屋裡已經擺的；setHome 扣掉島上已經擺的', () => {
    let s = kidSave(0, ['decor.bench', 'decor.bench']);
    s = setHome(s, pid(s), { items: [item('decor.bench', 1, 1)], wall: DEFAULT_WALL, floor: DEFAULT_FLOOR });
    s = setYard(s, pid(s), [item('decor.bench', c1.gx, c1.gz), item('decor.bench', c2.gx, c2.gz)]);
    expect(prof(s).yard).toEqual([item('decor.bench', c1.gx, c1.gz)]);
    s = setHome(s, pid(s), { items: [item('decor.bench', 1, 1), item('decor.bench', 2, 2)], wall: DEFAULT_WALL, floor: DEFAULT_FLOOR });
    expect(prof(s).home?.items).toEqual([item('decor.bench', 1, 1)]);
  });
});

describe('房間的擺設（cleanHome、setHome）', () => {
  const paidWall = WALLPAPERS.find((w) => !w.free)!;
  const paidFloor = FLOORS.find((f) => !f.free)!;

  it('舊存檔沒有房間：homeOf 給空房間與預設的壁紙地板', () => {
    const p = prof(kidSave());
    expect(p.home).toBeUndefined();
    expect(homeOf(p)).toEqual({ items: [], wall: DEFAULT_WALL, floor: DEFAULT_FLOOR });
  });

  it('合法的照存（島上的家具也能擺進屋）', () => {
    const p = prof(kidSave(0, ['decor.bed', 'decor.fence', paidWall.id, paidFloor.id]));
    const home = { items: [item('decor.bed', 0, 0, 1), item('decor.fence', 9, 8)], wall: paidWall.id, floor: paidFloor.id };
    expect(cleanHome(home, p)).toEqual(home);
  });

  it('拿掉：不是家具、不在房間裡、門口、格子重複、超過擁有的數量', () => {
    const p = prof(kidSave(0, ['decor.bed', 'decor.sofa']));
    const [door] = HOME_DOOR_CELLS;
    const items = [
      item('decor.bed', 0, 0),
      item('hat.crown', 1, 0),
      item('decor.sofa', 10, 0),
      item('decor.sofa', door.gx, door.gz),
      item('decor.sofa', 0, 0),
      item('decor.bed', 2, 0),
      item('decor.sofa', 3, 0),
    ];
    expect(cleanHome({ items, wall: DEFAULT_WALL, floor: DEFAULT_FLOOR }, p).items).toEqual([item('decor.bed', 0, 0), item('decor.sofa', 3, 0)]);
  });

  it(`最多 ${HOME_MAX_ITEMS} 個（房間 96 格，填滿也不會超過）`, () => {
    const p = prof(kidSave(0, Array(200).fill('decor.rug')));
    const items = homeCells().map((c) => item('decor.rug', c.gx, c.gz));
    expect(cleanHome({ items, wall: DEFAULT_WALL, floor: DEFAULT_FLOOR }, p).items.length).toBeLessThanOrEqual(HOME_MAX_ITEMS);
  });

  it('沒買的壁紙地板、種類不對的換回預設款', () => {
    const p = prof(kidSave(0, [paidWall.id]));
    expect(cleanHome({ items: [], wall: paidWall.id, floor: paidFloor.id }, p)).toEqual({ items: [], wall: paidWall.id, floor: DEFAULT_FLOOR });
    expect(cleanHome({ items: [], wall: paidFloor.id, floor: paidWall.id }, p)).toEqual({ items: [], wall: DEFAULT_WALL, floor: DEFAULT_FLOOR });
    expect(cleanHome({ items: [], wall: 'wall.rocket', floor: 'hat.crown' }, p)).toEqual({ items: [], wall: DEFAULT_WALL, floor: DEFAULT_FLOOR });
  });

  it('setHome 清理後存進角色', () => {
    let s = kidSave(0, ['decor.bed']);
    s = setHome(s, pid(s), { items: [item('decor.bed', 4, 4), item('decor.bed', 5, 5)], wall: paidWall.id, floor: DEFAULT_FLOOR });
    expect(prof(s).home).toEqual({ items: [item('decor.bed', 4, 4)], wall: DEFAULT_WALL, floor: DEFAULT_FLOOR });
  });
});

describe('房間裡放在角色面前（動森做法，同一套函式換成房間的格子）', () => {
  it('frontCell：房間座標裡角色面前的那一格', () => {
    const w = homeCellToWorld(3, 3);
    expect(frontCell({ x: w.x, z: w.z + 1.2 }, Math.PI, HOME_SPACE)).toEqual({ gx: 3, gz: 3 });
  });

  it('canPlace：門口不能擺；擺滿 100 個說屋裡擺滿了', () => {
    const [door] = HOME_DOOR_CELLS;
    expect(canPlace([], door.gx, door.gz, 'decor.bed', { 'decor.bed': 1 }, HOME_SPACE)).toBe('這裡不能擺');
    expect(canPlace([], 0, 0, 'decor.bed', { 'decor.bed': 1 }, HOME_SPACE)).toBeNull();
    // 房間只有 96 格，合法的擺法到不了 100 個；用格子外的假項目湊滿，檢查上限的提示
    const full = Array.from({ length: HOME_MAX_ITEMS }, (_, i) => item('decor.rug', 20 + i, 20));
    expect(canPlace(full, 0, 0, 'decor.bed', { 'decor.bed': 1 }, HOME_SPACE)).toBe('屋裡已經擺滿了');
  });

  it('placeItem 用房間的格子；島上的格子規則不影響', () => {
    expect(placeItem([], 0, 0, 'decor.bed', 1, { 'decor.bed': 1 }, HOME_SPACE)).toEqual([item('decor.bed', 0, 0, 1)]);
  });

  it('nearestItem、decorObstacles 用房間的座標（床 1×2 佔兩格，第 10.3 節）', () => {
    const items = [item('decor.bed', 2, 2), item('decor.rug', 6, 6)];
    const w = homeCellToWorld(2, 2);
    expect(nearestItem(items, { x: w.x + 0.8, z: w.z }, HOME_SPACE)).toEqual(items[0]);
    expect(nearestItem(items, { x: w.x + 0.8, z: w.z })).toBeNull();
    expect(decorObstacles(items, HOME_SPACE)).toEqual([
      { x: w.x, z: w.z, r: 0.45 },
      { x: w.x, z: w.z + 1, r: 0.45 },
    ]);
  });
});

describe('存檔格式', () => {
  it(`房間最多 ${HOME_MAX_ITEMS} 個、壁紙地板是字串`, () => {
    const p = prof(kidSave());
    const one = { id: 'decor.bed', gx: 1, gz: 2, rot: 0 };
    expect(parseProfile({ ...p, home: { items: Array(HOME_MAX_ITEMS).fill(one), wall: DEFAULT_WALL, floor: DEFAULT_FLOOR } })).not.toBeNull();
    expect(parseProfile({ ...p, home: { items: Array(HOME_MAX_ITEMS + 1).fill(one), wall: DEFAULT_WALL, floor: DEFAULT_FLOOR } })).toBeNull();
    expect(parseProfile({ ...p, home: { items: [], wall: 3, floor: DEFAULT_FLOOR } })).toBeNull();
    expect(parseProfile({ ...p, home: { items: [{ ...one, rot: 4 }], wall: DEFAULT_WALL, floor: DEFAULT_FLOOR } })).toBeNull();
  });
});
