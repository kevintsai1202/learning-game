/**
 * 自己的家第 10.3 節（第 ② 批）：家具依實物大小佔多格（src/store/yard.ts，前端與伺服器共用）。
 * - 尺寸表在 src/store/catalog.ts 的 size（寬 × 深，格）。
 * - 基準格 (gx, gz) 不動，轉了奇數次寬深互換；奇數尺寸基準格在正中間，偶數往 +x、+z 多一格。
 * - 放：從角色面前那一格往面向的方向展開；整塊都要能擺、不壓到別的家具佔的格子。
 * - 轉方向：轉過去壓到別的或超出就不轉（不算自己）。
 * - 存檔與伺服器的清理照舊只看基準格（舊的擺設變大後重疊也保留）。
 * 用房間的格子（HOME_SPACE，0～9 都能擺，只有門口四格不行）測，座標好算。
 */
import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../../src/store/catalog';
import { HOME_SPACE, homeCellToWorld } from '../../src/store/home';
import {
  ROTATE_BLOCKED,
  canPlace,
  canRotate,
  cellToWorld,
  cleanItems,
  decorObstacles,
  decorSize,
  facingOf,
  itemCells,
  itemCenter,
  nearestItem,
  placeAnchor,
  placeItem,
  rotateItem,
  type YardCell,
  type YardItem,
  type YardRot,
} from '../../src/store/yard';

const item = (id: string, gx: number, gz: number, rot: YardRot = 0): YardItem => ({ id, gx, gz, rot });
/** 格子清單排好、變成字串（比較同一塊用） */
const key = (cells: readonly YardCell[]) =>
  cells
    .map((c) => `${c.gx},${c.gz}`)
    .sort()
    .join(' ');
const ROTS: YardRot[] = [0, 1, 2, 3];
/** 四個方向的單位向量（0 南 +z、1 東 +x、2 北 -z、3 西 -x） */
const DIR = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
];

describe('尺寸表', () => {
  it('2×1 長椅、沙發、鋼琴、書桌、餐桌；1×2 床；3×1 溜滑梯；2×2 野餐桌、沙坑、小池塘、地毯、鞦韆；其他 1×1', () => {
    const sizes = Object.fromEntries(FURNITURE.map((f) => [f.id, `${decorSize(f.id).w}x${decorSize(f.id).d}`]));
    const expected: Record<string, string> = {
      'decor.bench': '2x1',
      'decor.sofa': '2x1',
      'decor.piano': '2x1',
      'decor.desk': '2x1',
      'decor.table': '2x1',
      'decor.bed': '1x2',
      'decor.slide': '3x1',
      'decor.picnic': '2x2',
      'decor.sandbox': '2x2',
      'decor.pond': '2x2',
      'decor.rug': '2x2',
      'decor.swing': '2x2',
    };
    for (const f of FURNITURE) expect(sizes[f.id], f.id).toBe(expected[f.id] ?? '1x1');
    // 不認得的 id 當成 1×1（別人的島可能是比較新的版本）
    expect(decorSize('decor.rocket')).toEqual({ w: 1, d: 1 });
  });
});

describe('佔的格子（itemCells）與正中間（itemCenter）', () => {
  it('1×1 就是基準格；每一種家具的基準格都是它佔的格子（舊存檔的位置一定還在家具裡）', () => {
    expect(itemCells(item('decor.chair', 3, 4))).toEqual([{ gx: 3, gz: 4 }]);
    for (const f of FURNITURE)
      for (const rot of ROTS) {
        const cells = itemCells(item(f.id, 5, 5, rot));
        const { w, d } = decorSize(f.id);
        expect(cells, `${f.id} rot ${rot}`).toHaveLength(w * d);
        expect(cells.some((c) => c.gx === 5 && c.gz === 5), `${f.id} rot ${rot}`).toBe(true);
      }
  });

  it('2×2 轉四個方向都是同一塊（轉方向不會跳）', () => {
    const base = key(itemCells(item('decor.sandbox', 3, 3, 0)));
    expect(base).toBe('3,3 3,4 4,3 4,4');
    for (const rot of ROTS) expect(key(itemCells(item('decor.sandbox', 3, 3, rot)))).toBe(base);
  });

  it('2×1 轉一次寬深互換、轉兩次回到原樣；1×2 的床同理', () => {
    expect(key(itemCells(item('decor.bench', 3, 3, 0)))).toBe('3,3 4,3');
    expect(key(itemCells(item('decor.bench', 3, 3, 1)))).toBe('3,3 3,4');
    expect(key(itemCells(item('decor.bench', 3, 3, 2)))).toBe('3,3 4,3');
    expect(key(itemCells(item('decor.bench', 3, 3, 3)))).toBe('3,3 3,4');
    expect(key(itemCells(item('decor.bed', 2, 2, 0)))).toBe('2,2 2,3');
    expect(key(itemCells(item('decor.bed', 2, 2, 1)))).toBe('2,2 3,2');
  });

  it('3×1 的溜滑梯基準格在中間、繞中間轉', () => {
    expect(key(itemCells(item('decor.slide', 5, 5, 0)))).toBe('4,5 5,5 6,5');
    expect(key(itemCells(item('decor.slide', 5, 5, 1)))).toBe('5,4 5,5 5,6');
    expect(itemCenter(item('decor.slide', 5, 5, 1), HOME_SPACE)).toEqual(homeCellToWorld(5, 5));
  });

  it('itemCenter：佔的格子的正中間（房間的座標；島上一樣）', () => {
    expect(itemCenter(item('decor.bench', 3, 3, 0), HOME_SPACE)).toEqual({ x: -1, z: -1.5 });
    expect(itemCenter(item('decor.bench', 3, 3, 1), HOME_SPACE)).toEqual({ x: -1.5, z: -1 });
    expect(itemCenter(item('decor.sandbox', 3, 3, 2), HOME_SPACE)).toEqual({ x: -1, z: -1 });
    expect(itemCenter(item('decor.chair', 3, 3, 0), HOME_SPACE)).toEqual(homeCellToWorld(3, 3));
    expect(itemCenter(item('decor.bench', 3, 3, 0))).toEqual({ x: cellToWorld(3, 3).x + 0.5, z: cellToWorld(3, 3).z });
  });
});

describe('放在角色面前（placeAnchor、facingOf）', () => {
  it('facingOf：角色的面向換成四個方向（0 南、1 東、2 北、3 西）', () => {
    expect(facingOf(0)).toBe(0);
    expect(facingOf(Math.PI / 2)).toBe(1);
    expect(facingOf(Math.PI)).toBe(2);
    expect(facingOf(-Math.PI / 2)).toBe(3);
    expect(facingOf((3 * Math.PI) / 2)).toBe(3);
    expect(facingOf(2 * Math.PI + 0.3)).toBe(0);
  });

  it('從面前那一格往面向的方向展開：一定蓋到面前那一格、不會往角色這邊長（四個方向、四種轉法、每一種家具）', () => {
    const front = { gx: 5, gz: 5 };
    for (const f of FURNITURE)
      for (const rot of ROTS)
        for (const facing of ROTS) {
          const a = placeAnchor(front, facing, f.id, rot);
          const cells = itemCells(item(f.id, a.gx, a.gz, rot));
          const where = `${f.id} rot ${rot} facing ${facing}`;
          expect(cells.some((c) => c.gx === 5 && c.gz === 5), where).toBe(true);
          const dir = DIR[facing];
          for (const c of cells) expect((c.gx - 5) * dir.x + (c.gz - 5) * dir.z, where).toBeGreaterThanOrEqual(0);
        }
  });

  it('例：面向北方放床（直的）往北長；面向東方放長椅往東長；溜滑梯橫著放以面前那一格為中間', () => {
    const front = { gx: 5, gz: 5 };
    const at = (id: string, facing: YardRot, rot: YardRot) => {
      const a = placeAnchor(front, facing, id, rot);
      return key(itemCells(item(id, a.gx, a.gz, rot)));
    };
    expect(at('decor.bed', 2, 0)).toBe('5,4 5,5');
    expect(at('decor.bed', 0, 0)).toBe('5,5 5,6');
    expect(at('decor.bench', 1, 0)).toBe('5,5 6,5');
    expect(at('decor.bench', 3, 0)).toBe('4,5 5,5');
    expect(at('decor.slide', 2, 0)).toBe('4,5 5,5 6,5');
    expect(at('decor.slide', 1, 0)).toBe('5,5 6,5 7,5');
  });
});

describe('能不能放（canPlace、placeItem）', () => {
  const owned = { 'decor.bench': 3, 'decor.chair': 3, 'decor.bed': 2, 'decor.sandbox': 2 };

  it('整塊都要在能擺的格子：長椅放在最右邊那一格會突出房間；放在門口前面也不行', () => {
    expect(canPlace([], 8, 3, 'decor.bench', owned, HOME_SPACE, 0)).toBeNull();
    expect(canPlace([], 9, 3, 'decor.bench', owned, HOME_SPACE, 0)).toBe('這裡不能擺');
    expect(canPlace([], 9, 3, 'decor.bench', owned, HOME_SPACE, 1)).toBeNull();
    expect(canPlace([], 3, 7, 'decor.bed', owned, HOME_SPACE, 1)).toBeNull();
    expect(canPlace([], 4, 7, 'decor.bed', owned, HOME_SPACE, 0)).toBe('這裡不能擺');
  });

  it('不能壓到別的家具佔的格子（舊的、新的都算）', () => {
    const bed = [item('decor.bed', 2, 2, 0)];
    expect(canPlace(bed, 2, 3, 'decor.chair', owned, HOME_SPACE, 0)).toBe('這裡已經有東西了');
    expect(canPlace(bed, 1, 3, 'decor.bench', owned, HOME_SPACE, 0)).toBe('這裡已經有東西了');
    expect(canPlace(bed, 3, 3, 'decor.bench', owned, HOME_SPACE, 0)).toBeNull();
  });

  it('placeItem 用同一個判斷（方向照預覽）；不能放時原樣回傳', () => {
    const items = placeItem([], 8, 3, 'decor.bench', 0, owned, HOME_SPACE);
    expect(items).toEqual([item('decor.bench', 8, 3, 0)]);
    expect(placeItem(items, 9, 4, 'decor.bench', 2, owned, HOME_SPACE)).toBe(items);
    expect(placeItem(items, 9, 4, 'decor.bench', 1, owned, HOME_SPACE)).toEqual([...items, item('decor.bench', 9, 4, 1)]);
  });
});

describe('轉方向（canRotate、rotateItem）', () => {
  it('轉過去突出房間或壓到別的家具就不轉，說「旁邊太擠了，轉不過去」', () => {
    const wall = [item('decor.bench', 9, 3, 1)];
    expect(canRotate(wall, 9, 3, HOME_SPACE)).toBe(ROTATE_BLOCKED);
    expect(rotateItem(wall, 9, 3, HOME_SPACE)).toBe(wall);
    const crowded = [item('decor.bench', 5, 3, 1), item('decor.chair', 6, 3)];
    expect(canRotate(crowded, 5, 3, HOME_SPACE)).toBe(ROTATE_BLOCKED);
    expect(rotateItem(crowded, 5, 3, HOME_SPACE)).toBe(crowded);
    expect(ROTATE_BLOCKED).toBe('旁邊太擠了，轉不過去');
  });

  it('轉得動就轉 90 度；1×1 與 2×2 一定轉得動（不算自己）', () => {
    const ok = [item('decor.bench', 5, 3, 1)];
    expect(canRotate(ok, 5, 3, HOME_SPACE)).toBeNull();
    expect(rotateItem(ok, 5, 3, HOME_SPACE)).toEqual([item('decor.bench', 5, 3, 2)]);
    const packed = [item('decor.sandbox', 3, 3, 3), item('decor.chair', 5, 3), item('decor.chair', 2, 3), item('decor.chair', 3, 2), item('decor.chair', 3, 5)];
    expect(rotateItem(packed, 3, 3, HOME_SPACE)[0]).toEqual(item('decor.sandbox', 3, 3, 0));
    expect(rotateItem([item('decor.chair', 9, 0, 3)], 9, 0, HOME_SPACE)).toEqual([item('decor.chair', 9, 0, 0)]);
  });
});

describe('旁邊的家具、碰撞、存檔的清理', () => {
  it('nearestItem：到家具佔的格子中心連成的長方形的距離（大家具不用走到正中間）', () => {
    const items = [item('decor.bench', 3, 3, 0)];
    // 長椅佔 (3,3)(4,3)：格子中心 x = -1.5～-0.5、z = -1.5；站在右邊那格的右邊 1.4 公尺（到正中間 1.9 公尺）
    expect(nearestItem(items, { x: -0.5 + 1.4, z: -1.5 }, HOME_SPACE)).toEqual(items[0]);
    expect(nearestItem(items, { x: -0.5 + 1.6, z: -1.5 }, HOME_SPACE)).toBeNull();
  });

  it('decorObstacles：家具佔的每一格一個圓（半徑 0.45）；可以走過去的照舊不擋', () => {
    expect(decorObstacles([item('decor.bench', 3, 3, 0)], HOME_SPACE)).toEqual([
      { x: -1.5, z: -1.5, r: 0.45 },
      { x: -0.5, z: -1.5, r: 0.45 },
    ]);
    expect(decorObstacles([item('decor.rug', 3, 3, 0)], HOME_SPACE)).toEqual([]);
  });

  it('cleanItems 照舊只看基準格：舊的大家具變大後重疊或突出也保留', () => {
    const old = [item('decor.bench', 2, 5, 0), item('decor.chair', 3, 5), item('decor.bench', 9, 1, 0)];
    expect(cleanItems(old, { 'decor.bench': 2, 'decor.chair': 1 }, HOME_SPACE)).toEqual(old);
  });
});
