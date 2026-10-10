/**
 * 自己的家第一期：院子（docs/plans/home.md 第 3 節）。院子的格子、家具目錄、擺放檢查、重複購買、佈置模式的狀態。
 * 這些規則前端與伺服器共用。
 */
import { describe, expect, it } from 'vitest';
import { HOUSE, WALK_RADIUS, ZONES } from '../../src/world/layout';
import { FURNITURE, ITEMS, SLOTS, equippedOf, findItem } from '../../src/store/catalog';
import { addProfile, buyItem, createEmptySave, setYard, type Profile, type SaveData } from '../../src/store/save';
import {
  DECOR_MAX_OWNED,
  YARD_MAX_ITEMS,
  YARD_RADIUS,
  cellToWorld,
  cleanYard,
  editYard,
  isDecor,
  isYardCell,
  ownedDecor,
  remainingDecor,
  startEdit,
  yardCells,
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

describe('院子的格子', () => {
  const cells = yardCells();

  it('大約 50 格（45～60），格子不重複', () => {
    expect(cells.length).toBeGreaterThanOrEqual(45);
    expect(cells.length).toBeLessThanOrEqual(60);
    expect(new Set(cells.map((c) => `${c.gx},${c.gz}`)).size).toBe(cells.length);
  });

  it(`都在小屋 ${YARD_RADIUS} 公尺內、不碰到小屋、都在草地上、離建築至少 0.6 公尺`, () => {
    for (const c of cells) {
      const w = cellToWorld(c.gx, c.gz);
      const d = Math.hypot(w.x - HOUSE.x, w.z - HOUSE.z);
      expect(d).toBeLessThanOrEqual(YARD_RADIUS);
      expect(d).toBeGreaterThan(HOUSE.radius + 0.5);
      expect(Math.hypot(w.x, w.z)).toBeLessThanOrEqual(WALK_RADIUS - 0.8);
      for (const z of ZONES) expect(Math.hypot(w.x - z.x, w.z - z.z)).toBeGreaterThan(z.radius + 0.6);
    }
  });

  it('小屋門口往前的走道空著（門前 3 公尺內沒有格子）', () => {
    const dir = { x: Math.sin(HOUSE.rotY), z: Math.cos(HOUSE.rotY) };
    for (const d of [2.6, 3.2, 4]) {
      const x = HOUSE.x + dir.x * d;
      const z = HOUSE.z + dir.z * d;
      expect(cells.some((c) => Math.hypot(cellToWorld(c.gx, c.gz).x - x, cellToWorld(c.gx, c.gz).z - z) < 0.5)).toBe(false);
    }
  });

  it('isYardCell 和清單一致', () => {
    for (const c of cells) expect(isYardCell(c.gx, c.gz)).toBe(true);
    expect(isYardCell(0, 0)).toBe(false);
    expect(isYardCell(50, 50)).toBe(false);
  });
});

describe('家具目錄', () => {
  it('21 種家具，id 開頭 decor.，都有價格，格子是 decor', () => {
    expect(FURNITURE).toHaveLength(21);
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

  it('花草、石板路、小池塘可以走過去，其他擋路', () => {
    const walkable = FURNITURE.filter((f) => f.walkable).map((f) => f.id);
    expect(walkable.sort()).toEqual(['decor.bed-red', 'decor.bed-yellow', 'decor.grass', 'decor.mushroom', 'decor.pond', 'decor.stone', 'decor.tulip'].sort());
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

  it('拿掉：不是家具、不在院子裡、格子重複、超過擁有的數量', () => {
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
    const cells = yardCells();
    const many = cells.map((c) => item('decor.grass', c));
    expect(many.length).toBeLessThanOrEqual(YARD_MAX_ITEMS);
    const owned = { 'decor.grass': 999 };
    const extra = [...many, ...many.map((c) => ({ ...c, id: 'decor.stone' }))];
    expect(cleanYard(extra, { ...owned, 'decor.stone': 999 }).length).toBeLessThanOrEqual(YARD_MAX_ITEMS);
  });

  it('setYard 照擁有的家具清理後存進角色；舊存檔沒有院子', () => {
    let s = kidSave(100);
    expect(prof(s).yard).toBeUndefined();
    s = buyItem(s, pid(s), 'decor.bench', 40);
    s = setYard(s, pid(s), [item('decor.bench', c1), item('decor.bench', c2)]);
    expect(prof(s).yard).toEqual([item('decor.bench', c1)]);
  });
});

describe('佈置模式（editYard）', () => {
  const [c1, c2, c3] = yardCells();
  const owned = { 'decor.bench': 2, 'decor.fence': 1 };

  it('選家具再點空格子放下，可以連續放；放完了就不再選著', () => {
    let s = startEdit([]);
    s = editYard(s, { t: 'pick', id: 'decor.bench' }, owned);
    expect(s.picking).toBe('decor.bench');
    s = editYard(s, { t: 'tap', ...c1 }, owned);
    s = editYard(s, { t: 'tap', ...c2 }, owned);
    expect(s.items).toEqual([
      { id: 'decor.bench', gx: c1.gx, gz: c1.gz, rot: 0 },
      { id: 'decor.bench', gx: c2.gx, gz: c2.gz, rot: 0 },
    ]);
    expect(s.picking).toBeNull();
    expect(remainingDecor(s, owned)).toEqual({ 'decor.bench': 0, 'decor.fence': 1 });
  });

  it('沒有剩下的家具不能選；點不在院子裡或已經有東西的格子不放', () => {
    let s = startEdit([{ id: 'decor.fence', gx: c1.gx, gz: c1.gz, rot: 0 }]);
    expect(editYard(s, { t: 'pick', id: 'decor.fence' }, owned).picking).toBeNull();
    s = editYard(s, { t: 'pick', id: 'decor.bench' }, owned);
    expect(editYard(s, { t: 'tap', gx: 0, gz: 0 }, owned).items).toHaveLength(1);
    const onTaken = editYard(s, { t: 'tap', ...c1 }, owned);
    expect(onTaken.items).toHaveLength(1);
  });

  it('沒有選家具時點擺好的家具：選起來；轉方向、收起來', () => {
    let s = startEdit([{ id: 'decor.bench', gx: c1.gx, gz: c1.gz, rot: 3 }]);
    s = editYard(s, { t: 'tap', ...c1 }, owned);
    expect(s.selected).toBe(0);
    s = editYard(s, { t: 'rotate' }, owned);
    expect(s.items[0].rot).toBe(0);
    s = editYard(s, { t: 'putAway' }, owned);
    expect(s.items).toEqual([]);
    expect(s.selected).toBeNull();
  });

  it('移動：選起來、按移動、點空格子；點到有東西的格子不動', () => {
    let s = startEdit([
      { id: 'decor.bench', gx: c1.gx, gz: c1.gz, rot: 0 },
      { id: 'decor.fence', gx: c2.gx, gz: c2.gz, rot: 0 },
    ]);
    s = editYard(s, { t: 'tap', ...c1 }, owned);
    s = editYard(s, { t: 'move' }, owned);
    expect(s.moving).toBe(true);
    expect(editYard(s, { t: 'tap', ...c2 }, owned).items[0]).toMatchObject({ gx: c1.gx, gz: c1.gz });
    s = editYard(s, { t: 'tap', ...c3 }, owned);
    expect(s.items[0]).toMatchObject({ gx: c3.gx, gz: c3.gz });
    expect(s.moving).toBe(false);
  });

  it('點空地取消選取；選家具時取消選取擺好的家具', () => {
    let s = startEdit([{ id: 'decor.bench', gx: c1.gx, gz: c1.gz, rot: 0 }]);
    s = editYard(s, { t: 'tap', ...c1 }, owned);
    expect(editYard(s, { t: 'tap', ...c2 }, owned).selected).toBeNull();
    const picked = editYard(s, { t: 'pick', id: 'decor.fence' }, owned);
    expect(picked.selected).toBeNull();
    expect(picked.picking).toBe('decor.fence');
  });
});
