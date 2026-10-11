/**
 * 自己的家：在島上直接佈置全島（docs/plans/home.md 第 7 節）。全島的格子、家具目錄、擺放檢查、重複購買、
 * 放在角色面前、轉方向、收起來、最靠近的家具。這些規則前端與伺服器共用。
 */
import { describe, expect, it } from 'vitest';
import { FOUNTAIN, HOUSE, PLATE, SPAWN, TEACHER_POS, WALK_RADIUS, ZONES, doorOf } from '../../src/world/layout';
import { PLAZA, pathSegments } from '../../src/world/scenery';
import { FURNITURE, ITEMS, SLOTS, equippedOf, findItem } from '../../src/store/catalog';
import { addProfile, buyItem, createEmptySave, parseProfile, setYard, type Profile, type SaveData } from '../../src/store/save';
import {
  DECOR_MAX_OWNED,
  YARD_MAX_ITEMS,
  canPlace,
  cellToWorld,
  cleanYard,
  frontCell,
  isDecor,
  isYardCell,
  islandTrees,
  nearestItem,
  ownedDecor,
  placeItem,
  remainingDecor,
  removeItem,
  rotateItem,
  visibleYard,
  yardCells,
  yardObstacles,
  type YardItem,
} from '../../src/store/yard';

const NOW = new Date('2026-10-11T10:00:00+08:00');

/** 一位小朋友（coins 枚金幣） */
function kidSave(coins = 500): SaveData {
  const s = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW);
  return { ...s, profiles: [{ ...s.profiles[0], coins }] };
}
const pid = (s: SaveData) => s.profiles[0].id;
const prof = (s: SaveData): Profile => s.profiles[0];

describe('全島的格子', () => {
  const cells = yardCells();

  it('幾百格（400～1200），格子不重複', () => {
    expect(cells.length).toBeGreaterThanOrEqual(400);
    expect(cells.length).toBeLessThanOrEqual(1200);
    expect(new Set(cells.map((c) => `${c.gx},${c.gz}`)).size).toBe(cells.length);
  });

  it('都在草地上、不碰到建築與門口、噴水池、熊熊老師站的位置、出生點與門牌、小屋與門口、不在樹上', () => {
    const trees = islandTrees();
    for (const c of cells) {
      const w = cellToWorld(c.gx, c.gz);
      expect(Math.hypot(w.x, w.z)).toBeLessThanOrEqual(WALK_RADIUS - 0.8);
      for (const z of ZONES) {
        expect(Math.hypot(w.x - z.x, w.z - z.z)).toBeGreaterThan(z.radius + 0.6);
        const d = doorOf(z);
        expect(Math.hypot(w.x - d.x, w.z - d.z)).toBeGreaterThanOrEqual(1.5);
      }
      expect(Math.hypot(w.x - FOUNTAIN.x, w.z - FOUNTAIN.z)).toBeGreaterThan(FOUNTAIN.radius + 0.5);
      expect(Math.hypot(w.x - TEACHER_POS.x, w.z - TEACHER_POS.z)).toBeGreaterThanOrEqual(1.5);
      expect(Math.hypot(w.x - SPAWN.x, w.z - SPAWN.z)).toBeGreaterThanOrEqual(3.5);
      expect(Math.hypot(w.x - PLATE.x, w.z - PLATE.z)).toBeGreaterThanOrEqual(1.2);
      expect(Math.hypot(w.x - HOUSE.x, w.z - HOUSE.z)).toBeGreaterThan(HOUSE.radius + 0.5);
      for (const t of trees) expect(Math.hypot(w.x - t.x, w.z - t.z)).toBeGreaterThanOrEqual(1);
    }
  });

  it('原本小屋院子（6 公尺內）的格子大多還在：舊的擺設改版後大多留著', () => {
    const near = cells.filter((c) => Math.hypot(c.gx, c.gz) <= 6);
    expect(near.length).toBeGreaterThanOrEqual(45);
  });

  /** 離某一點 0.5 公尺內有沒有可以擺的格子 */
  const cellNear = (x: number, z: number) => cells.some((c) => Math.hypot(cellToWorld(c.gx, c.gz).x - x, cellToWorld(c.gx, c.gz).z - z) < 0.5);

  it('小屋門口空著（門口前 1.5 公尺內；再往前是百寶屋）', () => {
    const dir = { x: Math.sin(HOUSE.rotY), z: Math.cos(HOUSE.rotY) };
    for (const d of [2.6, 3.2, 4]) expect(cellNear(HOUSE.x + dir.x * d, HOUSE.z + dir.z * d), `門口 ${d}`).toBe(false);
  });

  it('廣場與步道上可以擺（第 10.3 節，使用者 2026-10-11：中間區域也要能佈置）', () => {
    // 廣場：噴水池與熊熊老師站的位置以外
    const plaza = cells.filter((c) => Math.hypot(cellToWorld(c.gx, c.gz).x - PLAZA.x, cellToWorld(c.gx, c.gz).z - PLAZA.z) < PLAZA.radius);
    expect(plaza.length).toBeGreaterThanOrEqual(40);
    // 每條步道的中段
    for (const s of pathSegments()) expect(cellNear((s.ax + s.bx) / 2, (s.az + s.bz) / 2), `步道 ${s.bx},${s.bz}`).toBe(true);
  });

  it('isYardCell 和清單一致', () => {
    for (const c of cells) expect(isYardCell(c.gx, c.gz)).toBe(true);
    expect(isYardCell(0, 0)).toBe(false);
    expect(isYardCell(99, 99)).toBe(false);
  });
});

describe('家具目錄', () => {
  it('島上的 21 種加室內的 15 種家具，id 開頭 decor.，都有價格，格子是 decor', () => {
    expect(FURNITURE.filter((f) => !f.indoor)).toHaveLength(21);
    expect(FURNITURE).toHaveLength(36);
    for (const f of FURNITURE) {
      expect(f.id.startsWith('decor.')).toBe(true);
      expect(f.slot).toBe('decor');
      expect(f.price).toBeGreaterThan(0);
      expect(isDecor(f.id)).toBe(true);
      expect(findItem(f.id)).toBe(f);
    }
    expect(ITEMS).toEqual(expect.arrayContaining([...FURNITURE]));
    expect(isDecor('hat.crown')).toBe(false);
    expect(isDecor('decor.nope')).toBe(false);
  });

  it('花草、石板路、小池塘、地毯可以走過去，其他擋路', () => {
    const walkable = FURNITURE.filter((f) => f.walkable).map((f) => f.id);
    expect(walkable.sort()).toEqual(['decor.bed-red', 'decor.bed-yellow', 'decor.grass', 'decor.mushroom', 'decor.pond', 'decor.rug', 'decor.stone', 'decor.tulip'].sort());
  });

  it('家具不是穿戴的格子：外觀不受影響', () => {
    expect(SLOTS).not.toContain('decor');
    const before = kidSave();
    const s = buyItem(before, pid(before), 'decor.bench', 40);
    expect(equippedOf(prof(s))).toEqual(equippedOf(prof(before)));
  });
});

describe('家具一個一個買（同一種可以買很多個）', () => {
  it('買兩次就有兩個、扣兩次金幣；帽子照舊只能買一次', () => {
    let s = kidSave(100);
    s = buyItem(s, pid(s), 'decor.fence', 6);
    s = buyItem(s, pid(s), 'decor.fence', 6);
    expect(ownedDecor(prof(s))).toEqual({ 'decor.fence': 2 });
    expect(prof(s).coins).toBe(88);
    s = buyItem(s, pid(s), 'hat.party', 20);
    s = buyItem(s, pid(s), 'hat.party', 20);
    expect(prof(s).coins).toBe(68);
  });

  it(`每種最多 ${DECOR_MAX_OWNED} 個，再買不扣錢`, () => {
    let s = kidSave(1000);
    for (let i = 0; i < DECOR_MAX_OWNED + 3; i++) s = buyItem(s, pid(s), 'decor.grass', 5);
    expect(ownedDecor(prof(s))['decor.grass']).toBe(DECOR_MAX_OWNED);
    expect(prof(s).coins).toBe(1000 - DECOR_MAX_OWNED * 5);
  });

  it('金幣不夠丟出錯誤', () => {
    const s = kidSave(10);
    expect(() => buyItem(s, pid(s), 'decor.slide', 150)).toThrow();
  });
});

describe('擺放檢查（cleanYard、setYard）', () => {
  const [c1, c2, c3] = yardCells();
  const item = (id: string, c: { gx: number; gz: number }, rot: 0 | 1 | 2 | 3 = 0): YardItem => ({ id, gx: c.gx, gz: c.gz, rot });

  it('合法的照存', () => {
    const items = [item('decor.bench', c1, 1), item('decor.fence', c2)];
    expect(cleanYard(items, { 'decor.bench': 1, 'decor.fence': 1 })).toEqual(items);
  });

  it('拿掉：不是家具、不在可以擺的格子、格子重複、超過擁有的數量', () => {
    const items = [
      item('decor.bench', c1),
      item('hat.crown', c2),
      { id: 'decor.fence', gx: 0, gz: 0, rot: 0 } as YardItem,
      item('decor.fence', c1),
      item('decor.fence', c2),
      item('decor.fence', c3),
    ];
    expect(cleanYard(items, { 'decor.bench': 1, 'decor.fence': 1 })).toEqual([item('decor.bench', c1), item('decor.fence', c2)]);
  });

  it(`最多 ${YARD_MAX_ITEMS} 個`, () => {
    const many = yardCells().map((c) => item('decor.grass', c));
    expect(many.length).toBeGreaterThan(YARD_MAX_ITEMS);
    expect(cleanYard(many, { 'decor.grass': 9999 })).toHaveLength(YARD_MAX_ITEMS);
  });

  it('setYard 照擁有的家具清理後存進角色；舊存檔沒有擺設', () => {
    let s = kidSave(100);
    expect(prof(s).yard).toBeUndefined();
    s = buyItem(s, pid(s), 'decor.bench', 40);
    s = setYard(s, pid(s), [item('decor.bench', c1), item('decor.bench', c2)]);
    expect(prof(s).yard).toEqual([item('decor.bench', c1)]);
  });
});

describe('放在角色面前（動森做法）', () => {
  /** 一格可以擺的格子中心，角色站在它南邊 1.2 公尺、面向北方（heading = π） */
  const target = yardCells()[Math.floor(yardCells().length / 2)];
  const w = cellToWorld(target.gx, target.gz);
  const stand = { x: w.x, z: w.z + 1.2 };

  it('frontCell：角色面前約 1.2 公尺的那一格', () => {
    expect(frontCell(stand, Math.PI)).toEqual({ gx: target.gx, gz: target.gz });
    expect(frontCell({ x: w.x - 1.2, z: w.z }, Math.PI / 2)).toEqual({ gx: target.gx, gz: target.gz });
  });

  it('canPlace：可以擺的空格子、還有剩才行；不行時說原因', () => {
    const owned = { 'decor.bench': 1 };
    expect(canPlace([], target.gx, target.gz, 'decor.bench', owned)).toBe(null);
    expect(canPlace([], 0, 0, 'decor.bench', owned)).toBe('這裡不能擺');
    const taken = [{ id: 'decor.bench', gx: target.gx, gz: target.gz, rot: 0 as const }];
    expect(canPlace(taken, target.gx, target.gz, 'decor.bench', { 'decor.bench': 2 })).toBe('這裡已經有東西了');
    const [other] = yardCells().filter((c) => c.gx !== target.gx || c.gz !== target.gz);
    expect(canPlace(taken, other.gx, other.gz, 'decor.bench', owned)).toBe('這個家具都擺出去了');
  });

  it('placeItem：放下（方向照預覽）；不能擺時不變', () => {
    const owned = { 'decor.bench': 1 };
    const items = placeItem([], target.gx, target.gz, 'decor.bench', 2, owned);
    expect(items).toEqual([{ id: 'decor.bench', gx: target.gx, gz: target.gz, rot: 2 }]);
    expect(placeItem(items, target.gx, target.gz, 'decor.bench', 0, { 'decor.bench': 5 })).toBe(items);
    expect(remainingDecor({ items }, owned)).toEqual({ 'decor.bench': 0 });
  });

  it('rotateItem、removeItem：對某一格的家具轉方向、收起來', () => {
    const items: YardItem[] = [{ id: 'decor.bench', gx: target.gx, gz: target.gz, rot: 3 }];
    expect(rotateItem(items, target.gx, target.gz)).toEqual([{ id: 'decor.bench', gx: target.gx, gz: target.gz, rot: 0 }]);
    expect(removeItem(items, target.gx, target.gz)).toEqual([]);
    expect(removeItem(items, 0, 0)).toBe(items);
  });

  it('nearestItem：1.5 公尺內最靠近的家具；太遠沒有', () => {
    const [a, b] = yardCells();
    const items: YardItem[] = [
      { id: 'decor.bench', gx: a.gx, gz: a.gz, rot: 0 },
      { id: 'decor.fence', gx: b.gx, gz: b.gz, rot: 0 },
    ];
    const wa = cellToWorld(a.gx, a.gz);
    expect(nearestItem(items, { x: wa.x - 0.9, z: wa.z - 0.3 })).toEqual(items[0]);
    expect(nearestItem(items, { x: wa.x + 30, z: wa.z })).toBeNull();
  });
});

describe('島上畫擺設（別人的島可能是比較新的版本）', () => {
  const [c1, c2, c3] = yardCells();
  it('visibleYard：不認得的家具跳過、最多畫 300 個，不丟例外', () => {
    const items = [
      { id: 'decor.bench', gx: c1.gx, gz: c1.gz, rot: 0 as const },
      { id: 'decor.rocket', gx: c2.gx, gz: c2.gz, rot: 0 as const },
      { id: 'hat.crown', gx: c3.gx, gz: c3.gz, rot: 0 as const },
    ];
    expect(visibleYard(items)).toEqual([items[0]]);
    expect(visibleYard(Array(400).fill(items[0]))).toHaveLength(YARD_MAX_ITEMS);
  });

  it('yardObstacles：擋路的家具在格子中心、半徑 0.45；花草、石板路、小池塘可以走過去（多格的家具見 footprint.test.ts）', () => {
    const items = [
      { id: 'decor.crate', gx: c1.gx, gz: c1.gz, rot: 0 as const },
      { id: 'decor.grass', gx: c2.gx, gz: c2.gz, rot: 0 as const },
      { id: 'decor.pond', gx: c3.gx, gz: c3.gz, rot: 0 as const },
    ];
    const w = cellToWorld(c1.gx, c1.gz);
    expect(yardObstacles(items)).toEqual([{ x: w.x, z: w.z, r: 0.45 }]);
  });
});

describe('存檔格式', () => {
  it(`整份存檔的擺設最多 ${YARD_MAX_ITEMS} 個、座標 ±40（整份上傳的路徑不經過 yard 操作）`, () => {
    const p = prof(kidSave());
    const one = { id: 'decor.grass', gx: 30, gz: -12, rot: 0 };
    expect(parseProfile({ ...p, yard: Array(YARD_MAX_ITEMS).fill(one) })).not.toBeNull();
    expect(parseProfile({ ...p, yard: Array(YARD_MAX_ITEMS + 1).fill(one) })).toBeNull();
    expect(parseProfile({ ...p, yard: [{ ...one, rot: 5 }] })).toBeNull();
    expect(parseProfile({ ...p, yard: [{ ...one, gx: 41 }] })).toBeNull();
  });
});
