/**
 * 可以用的家具（第 9 節優化，src/store/furnitureUse.ts）：坐、躺、溜滑梯、盪鞦韆、開關與沙堡。
 * 座位表在家具的局部座標（正面 +z），跟著家具轉方向換成世界座標；起身點在家具的碰撞圓外；
 * 溜滑梯與鞦韆的動作照時間軸（本機與別人看到的同一支函式）。
 */
import { describe, expect, it } from 'vitest';
import { FURNITURE } from '../../src/store/catalog';
import { ACT_CODES } from '../../src/store/actCodes';
import { HOME_SPACE } from '../../src/store/home';
import { itemCells, itemCenter, type YardItem } from '../../src/store/yard';
import {
  ACT_OF_KIND,
  FURNITURE_USE,
  SLIDE_TIME,
  SWING_PIVOT,
  actFrame,
  anchorFor,
  exitPoint,
  headingOf,
  localToWorld,
  nearestUsable,
  swingAngle,
} from '../../src/store/furnitureUse';

const item = (id: string, gx: number, gz: number, rot: 0 | 1 | 2 | 3 = 0): YardItem => ({ id, gx, gz, rot });
/** 家具佔的格子的正中間（模型畫的位置；第 10.3 節） */
const center = (it: YardItem) => itemCenter(it, HOME_SPACE);

describe('可以用的家具的表', () => {
  it('規格列的家具都有：坐（長椅、野餐桌、椅子、沙發）、鋼琴、躺（床）、溜滑梯、鞦韆、開關（電視、路燈、立燈）、沙堡', () => {
    const kinds = Object.fromEntries(Object.entries(FURNITURE_USE).map(([id, s]) => [id, s.kind]));
    expect(kinds).toEqual({
      'decor.bench': 'sit',
      'decor.picnic': 'sit',
      'decor.chair': 'sit',
      'decor.sofa': 'sit',
      'decor.piano': 'piano',
      'decor.bed': 'lie',
      'decor.slide': 'slide',
      'decor.swing': 'swing',
      'decor.tv': 'toggle',
      'decor.lamp': 'toggle',
      'decor.floorlamp': 'toggle',
      'decor.sandbox': 'sandcastle',
    });
    const ids = FURNITURE.map((f) => f.id);
    for (const id of Object.keys(FURNITURE_USE)) expect(ids).toContain(id);
    for (const s of Object.values(FURNITURE_USE)) expect(s.label.length).toBeGreaterThan(0);
  });

  it('會同步的動作代碼：坐、鋼琴是 sit，躺 lie，溜滑梯 slide，鞦韆 swing；開關與沙堡沒有（只在本機）', () => {
    // 後面是班級島遊樂場的座位 ride0～ride7（tests/store/playground.test.ts）
    expect(ACT_CODES.slice(0, 4)).toEqual(['sit', 'lie', 'slide', 'swing']);
    expect(ACT_OF_KIND).toEqual({ sit: 'sit', piano: 'sit', lie: 'lie', slide: 'slide', swing: 'swing' });
  });

  it('坐、躺、盪、溜滑梯都有座位；角色一律原比例（第 10.3 節：家具放大配合角色，不縮小角色）', () => {
    for (const [id, s] of Object.entries(FURNITURE_USE)) {
      if (s.kind === 'toggle' || s.kind === 'sandcastle') continue;
      expect(s.seat, id).toBeDefined();
      expect(s.seat!.scale, id).toBe(1);
    }
  });

  it('座位在家具佔的格子裡（四個方向）', () => {
    for (const [id, s] of Object.entries(FURNITURE_USE)) {
      if (!s.seat) continue;
      for (const rot of [0, 1, 2, 3] as const) {
        const it = item(id, 4, 4, rot);
        const p = localToWorld(it, HOME_SPACE, s.seat.x, s.seat.z);
        const inside = itemCells(it).some((c) => {
          const w = HOME_SPACE.toWorld(c.gx, c.gz);
          return Math.abs(p.x - w.x) <= 0.5 + 1e-9 && Math.abs(p.z - w.z) <= 0.5 + 1e-9;
        });
        expect(inside, `${id} rot ${rot}`).toBe(true);
      }
    }
  });

  it('鞦韆的橫桿比角色坐著的頭頂（2.05 公尺高的角色）加帽子還高', () => {
    const s = FURNITURE_USE['decor.swing'].seat!;
    expect(SWING_PIVOT).toBeGreaterThanOrEqual(s.y + 2.05 + 0.5);
  });
});

describe('局部座標換成世界座標（跟著家具轉方向）', () => {
  it('四個方向：rotation.y = rot × 90°；x′ = x·cos + z·sin、z′ = −x·sin + z·cos', () => {
    const it0 = item('decor.bench', 3, 4, 0);
    const at = (rot: 0 | 1 | 2 | 3) => {
      // 原點是轉了以後家具佔的格子的正中間（2×1 轉奇數次寬深互換，中心移半格）
      const c = center({ ...it0, rot });
      const w = localToWorld({ ...it0, rot }, HOME_SPACE, 0.3, 0.2);
      return { x: +(w.x - c.x).toFixed(6), z: +(w.z - c.z).toFixed(6) };
    };
    expect(at(0)).toEqual({ x: 0.3, z: 0.2 });
    expect(at(1)).toEqual({ x: 0.2, z: -0.3 });
    expect(at(2)).toEqual({ x: -0.3, z: -0.2 });
    expect(at(3)).toEqual({ x: -0.2, z: 0.3 });
  });

  it('朝向：局部朝向加上家具轉的角度', () => {
    expect(headingOf(item('decor.bench', 0, 0, 0), 0)).toBeCloseTo(0);
    expect(headingOf(item('decor.bench', 0, 0, 1), 0)).toBeCloseTo(Math.PI / 2);
    expect(headingOf(item('decor.bench', 0, 0, 2), Math.PI)).toBeCloseTo(2 * Math.PI);
    expect(headingOf(item('decor.bench', 0, 0, 3), 0)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('起身點：四個方向都在家具每一格的碰撞圓外（離家具佔的每一格中心至少 0.9 公尺：碰撞圓 0.45 加角色 0.45）', () => {
    for (const id of Object.keys(FURNITURE_USE)) {
      for (const rot of [0, 1, 2, 3] as const) {
        const it = item(id, 4, 4, rot);
        const e = exitPoint(it, HOME_SPACE);
        for (const c of itemCells(it)) {
          const w = HOME_SPACE.toWorld(c.gx, c.gz);
          expect(Math.hypot(e.x - w.x, e.z - w.z), `${id} rot ${rot} 格 ${c.gx},${c.gz}`).toBeGreaterThanOrEqual(0.9);
        }
      }
    }
  });
});

describe('動作的時間軸（actFrame）', () => {
  it('坐下：在座位上、朝向照家具、姿勢是坐、一直坐著', () => {
    const it = item('decor.bench', 2, 2, 1);
    const s = FURNITURE_USE['decor.bench'].seat!;
    const f = actFrame(it, HOME_SPACE, 'sit', 5);
    const w = localToWorld(it, HOME_SPACE, s.x, s.z);
    expect(f).toMatchObject({ pose: 'sit', y: s.y, scale: 1, done: false });
    expect(f.x).toBeCloseTo(w.x);
    expect(f.z).toBeCloseTo(w.z);
    expect(f.heading).toBeCloseTo(headingOf(it, s.facing));
  });

  it('躺下：姿勢是躺，原比例；先抬到床墊的高度再繞腳躺平（樞軸在抬高的位置，不是地上）', () => {
    const f = actFrame(item('decor.bed', 1, 1, 0), HOME_SPACE, 'lie', 1);
    expect(f.pose).toBe('lie');
    expect(f.scale).toBe(1);
    expect(f.tiltX).toBeCloseTo(-Math.PI / 2);
    expect(f.pivotY).toBeCloseTo(f.y);
    expect(f.y).toBeGreaterThan(0.4);
  });

  it('溜滑梯：先爬上去（越爬越高）、再溜下來（越溜越低），到時間自己站到滑道尾端外面', () => {
    const it = item('decor.slide', 5, 5, 2);
    const ys = (from: number, to: number) => Array.from({ length: 6 }, (_, i) => actFrame(it, HOME_SPACE, 'slide', from + ((to - from) * i) / 5).y);
    const climb = ys(0, 0.95);
    for (let i = 1; i < climb.length; i++) expect(climb[i]).toBeGreaterThanOrEqual(climb[i - 1]);
    expect(actFrame(it, HOME_SPACE, 'slide', 0.5).pose).toBe('climb');
    const slide = ys(1.35, 2.15);
    for (let i = 1; i < slide.length; i++) expect(slide[i]).toBeLessThanOrEqual(slide[i - 1]);
    expect(slide[0]).toBeGreaterThan(slide[slide.length - 1] + 0.4);
    const end = actFrame(it, HOME_SPACE, 'slide', SLIDE_TIME + 0.1);
    expect(end.done).toBe(true);
    expect(end.pose).toBe('stand');
    expect(end.y).toBeCloseTo(0);
    const e = exitPoint(it, HOME_SPACE);
    expect(end.x).toBeCloseTo(e.x);
    expect(end.z).toBeCloseTo(e.z);
  });

  it('鞦韆：坐在座椅上繞橫桿前後盪（從 0 開始、不超過 0.6）', () => {
    expect(swingAngle(0)).toBeCloseTo(0);
    for (let t = 0; t < 6; t += 0.13) expect(Math.abs(swingAngle(t))).toBeLessThanOrEqual(0.6);
    const f = actFrame(item('decor.swing', 3, 3, 0), HOME_SPACE, 'swing', 0.7);
    expect(f.pose).toBe('sit');
    expect(f.pivotY).toBeCloseTo(SWING_PIVOT);
    expect(f.tiltX).toBeCloseTo(swingAngle(0.7));
    expect(f.done).toBe(false);
  });
});

describe('找家具', () => {
  const items = [item('decor.fence', 2, 2), item('decor.bench', 2, 4), item('decor.slide', 7, 7), item('decor.piano', 5, 2)];

  it('nearestUsable：1.5 公尺內最近的「可以用的」家具（柵欄再近也不算）；太遠沒有', () => {
    const fence = center(items[0]);
    expect(nearestUsable(items, { x: fence.x, z: fence.z + 0.9 }, HOME_SPACE)?.id).toBe('decor.bench');
    const slide = center(items[2]);
    expect(nearestUsable(items, { x: slide.x + 1, z: slide.z }, HOME_SPACE)?.id).toBe('decor.slide');
    expect(nearestUsable(items, { x: -9, z: -9 }, HOME_SPACE)).toBeNull();
  });

  it('anchorFor：別人的動作代碼找附近同類的家具（坐包含鋼琴）；太遠或沒有同類是 null', () => {
    const piano = center(items[3]);
    expect(anchorFor(items, HOME_SPACE, 'sit', { x: piano.x, z: piano.z + 0.4 })?.id).toBe('decor.piano');
    const slide = center(items[2]);
    expect(anchorFor(items, HOME_SPACE, 'slide', { x: slide.x - 0.3, z: slide.z + 0.3 })?.id).toBe('decor.slide');
    expect(anchorFor(items, HOME_SPACE, 'lie', { x: slide.x, z: slide.z })).toBeNull();
    expect(anchorFor(items, HOME_SPACE, 'sit', { x: -9, z: -9 })).toBeNull();
  });
});
