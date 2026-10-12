/**
 * 班級島大型設施（docs/plans/grand-rides.md）第 ① 段：規則（純函式）。
 * - 對時（clockSync）、座位代碼（co、wh、sh）。
 * - 雲霄飛車的軌道：封閉、連續、有垂直迴圈、南邊壓低、不撞到自己、摩天輪、停著的飛船；時間表；列車的座位。
 * - 巨大摩天輪：車廂、上車坐最靠近底部的車廂、轉一圈下車。
 * - 環島飛船：停靠、起飛、繞島一圈、回來；甲板的局部與世界座標、能走的範圍。
 * - 班次與倒數、上車的範圍、下車站、碰撞、鏡頭拉遠（tallView）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { resetClockSync, setServerNow, wallOffsetMs, wallSec, warpWall } from '../../src/store/clockSync';
import { ACT_CODES, COASTER_SEATS, WHEEL_SEATS, grandSeatCode, grandSeatOf } from '../../src/store/actCodes';
import { SPEED, rotateByQuat, trackAt } from '../../src/store/coasterTrack';
import {
  BOARD_RANGE,
  COASTER_BOARD,
  MAST,
  SHIP,
  SHIP_CYCLE,
  STATION,
  TRAIN,
  WHEEL,
  boardingOf,
  cabinFloor,
  carPose,
  clampDeck,
  coaster,
  coasterRun,
  coasterSeatFrame,
  deckToWorld,
  departed,
  freeCoasterSeat,
  freeWheelSeat,
  grandExit,
  grandNear,
  grandObstacles,
  resolveGrandSeat,
  rideEnd,
  shipFrame,
  shipState,
  tallView,
  wheelAngle,
  wheelSeatFrame,
  worldToDeck,
} from '../../src/store/grandRides';
import { GRAND_PRICE, GRAND_RIDES } from '../../src/store/grandKinds';
import { WALK_RADIUS, ZONES } from '../../src/world/layout';
import { isFree } from '../../src/world/scenery';

afterEach(() => resetClockSync());

describe('對時', () => {
  it('收到伺服器的時間後，牆上的時間照伺服器校正；舊伺服器沒有 now 就不改；e2e 可以往前撥', () => {
    setServerNow(1_000_000, 990_000);
    expect(wallOffsetMs()).toBe(10_000);
    const w = wallSec();
    expect(Math.abs(w - (Date.now() + 10_000) / 1000)).toBeLessThan(0.05);
    setServerNow(undefined);
    expect(wallOffsetMs()).toBe(10_000);
    warpWall(30);
    expect(wallSec() - w).toBeGreaterThan(29.9);
  });
});

describe('座位代碼與價錢', () => {
  it('雲霄飛車 co0～co23、摩天輪 wh0～wh47、飛船 sh；範圍外不認得', () => {
    expect(ACT_CODES).toContain('co0');
    expect(ACT_CODES).toContain(`co${COASTER_SEATS - 1}`);
    expect(ACT_CODES).toContain(`wh${WHEEL_SEATS - 1}`);
    expect(ACT_CODES).toContain('sh');
    expect(ACT_CODES).toContain('ride7');
    expect(ACT_CODES).not.toContain('co24');
    expect(grandSeatCode('coaster', 5)).toBe('co5');
    expect(grandSeatCode('wheel', 47)).toBe('wh47');
    expect(grandSeatOf('co23')).toEqual({ ride: 'coaster', seat: 23 });
    expect(grandSeatOf('wh0')).toEqual({ ride: 'wheel', seat: 0 });
    expect(grandSeatOf('sh')).toEqual({ ride: 'ship', seat: 0 });
    expect(grandSeatOf('co24')).toBeNull();
    expect(grandSeatOf('wh48')).toBeNull();
    expect(grandSeatOf('ride3')).toBeNull();
    expect(GRAND_RIDES).toEqual(['coaster', 'wheel', 'ship']);
    expect(GRAND_PRICE).toBe(5);
  });
});

describe('雲霄飛車的軌道', () => {
  const { track, timeline, cycle } = coaster();
  const n = track.pos.length;

  it('封閉、位置與方向連續；上和前進方向垂直', () => {
    for (let i = 0; i < n; i++) {
      const a = track.pos[i];
      const b = track.pos[(i + 1) % n];
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.4);
      const f0 = track.fwd[i];
      const f1 = track.fwd[(i + 1) % n];
      expect(f0.x * f1.x + f0.y * f1.y + f0.z * f1.z).toBeGreaterThan(Math.cos(0.15));
      const u = track.up[i];
      expect(Math.abs(u.x * f0.x + u.y * f0.y + u.z * f0.z)).toBeLessThan(1e-6);
      expect(Math.hypot(u.x, u.y, u.z)).toBeCloseTo(1, 6);
    }
  });

  it('經典款：爬坡到 14～17 公尺、有垂直迴圈（車廂頭下腳上）、過彎會傾斜', () => {
    const maxY = Math.max(...track.pos.map((p) => p.y));
    expect(maxY).toBeGreaterThan(14);
    expect(maxY).toBeLessThan(17);
    expect(Math.min(...track.up.map((u) => u.y))).toBeLessThan(-0.95);
    expect(track.up.some((u, i) => track.tag[i] === 'free' && Math.abs(u.y) < 0.8 && u.y > 0)).toBe(true);
  });

  it('南邊（z > 15）壓低不超過 3.5 公尺；車站以外都在沙灘外（半徑 26 以上）', () => {
    for (let i = 0; i < n; i++) {
      const p = track.pos[i];
      if (p.z > 15) expect(p.y).toBeLessThanOrEqual(3.5);
      if (track.tag[i] !== 'brake' && track.tag[i] !== 'station') expect(Math.hypot(p.x, p.z)).toBeGreaterThan(26);
    }
  });

  it('不撞到自己（軌道上相隔 6 公尺以上的兩點至少差 2 公尺，迴圈進出口錯開）', () => {
    let min = Infinity;
    for (let i = 0; i < n; i += 2)
      for (let j = i + 24; j < n; j += 2) {
        if (n - (j - i) < 24) continue;
        const a = track.pos[i];
        const b = track.pos[j];
        min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    expect(min).toBeGreaterThan(2);
  });

  it('不碰到摩天輪（輪面前後 1.2 公尺的車廂）與繫留塔；從停著的飛船底下穿過時乘客頭頂還有空間', () => {
    for (const p of track.pos) {
      // 輪子（前後 0.9）與掛在前面的車廂（cabinZ ± 0.9）
      // 輪子與車廂佔的那一片（輪子前後 0.9、車廂到 cabinZ + 0.9），外面再留 2 公尺
      const inWheel = Math.abs(p.x - WHEEL.x) < WHEEL.r + 1.5 && p.y < WHEEL.hubH + WHEEL.r + 1 && p.z > WHEEL.z - 0.9 - 2 && p.z < WHEEL.z + WHEEL.cabinZ + 0.9 + 2;
      expect(inWheel).toBe(false);
      expect(Math.hypot(p.x - MAST.x, p.z - MAST.z)).toBeGreaterThan(MAST.r + 3);
      // 飛船的船底在甲板下 0.9 公尺；乘客的頭在軌道上 2.3 公尺
      if (Math.abs(p.x - SHIP.dock.x) < SHIP.halfW + 0.6 && Math.abs(p.z - SHIP.dock.z) < SHIP.halfL + 1.5) expect(SHIP.deckY - 0.9 - (p.y + 2.3)).toBeGreaterThan(1);
    }
  });

  it('時間表：時間一直增加、速度不低於最低速度（不會卡在迴圈頂端）、一趟 45～65 秒、一班多停站 20 秒', () => {
    for (let i = 0; i < n; i++) expect(timeline.time[i + 1]).toBeGreaterThan(timeline.time[i]);
    expect(Math.min(...timeline.speed)).toBeGreaterThanOrEqual(SPEED.min - 1e-9);
    expect(Math.max(...timeline.speed)).toBeLessThan(20);
    expect(timeline.duration).toBeGreaterThan(45);
    expect(timeline.duration).toBeLessThan(65);
    expect(cycle).toBe(COASTER_BOARD + Math.ceil(timeline.duration));
  });

  it('班次：停站時列車在站上，出發後往前跑，這一班結束時回到站上', () => {
    const r0 = coasterRun(cycle * 100 + 5);
    expect(r0).toMatchObject({ run: 100, boarding: true, s: 0 });
    const r1 = coasterRun(cycle * 100 + COASTER_BOARD + 10);
    const r2 = coasterRun(cycle * 100 + COASTER_BOARD + 20);
    expect(r1.boarding).toBe(false);
    expect(r2.s).toBeGreaterThan(r1.s);
    expect(coasterRun(cycle * 101 - 0.01).s).toBeCloseTo(track.length, 0);
    expect(coasterRun(cycle * 101).run).toBe(101);
  });

  it('列車停在站上的直線段；座位在車廂裡、彼此分開；角色的方向跟著車廂（迴圈頂端頭下腳上）', () => {
    for (let k = 0; k < TRAIN.cars; k++) {
      const c = carPose(0, k);
      expect(c.p.x).toBeGreaterThanOrEqual(STATION.x0 - 0.01);
      expect(c.p.x).toBeLessThanOrEqual(STATION.x1);
      expect(c.p.z).toBeCloseTo(STATION.z, 1);
    }
    const seats = Array.from({ length: COASTER_SEATS }, (_, i) => coasterSeatFrame(i, 0));
    for (let i = 0; i < seats.length; i++)
      for (let j = i + 1; j < seats.length; j++) expect(Math.hypot(seats[i].x - seats[j].x, seats[i].z - seats[j].z)).toBeGreaterThan(0.6);
    // 站上：直立、朝西
    const up0 = rotateByQuat(seats[0].quat!, { x: 0, y: 1, z: 0 });
    expect(up0.y).toBeGreaterThan(0.99);
    const fwd0 = rotateByQuat(seats[0].quat!, { x: 0, y: 0, z: 1 });
    expect(fwd0.x).toBeLessThan(-0.99);
    // 迴圈頂端：角色的上朝下
    let top = 0;
    for (let i = 0; i < n; i++) if (track.up[i].y < track.up[top].y) top = i;
    const s = (top * track.length) / n;
    const f = coasterSeatFrame(0, s);
    expect(rotateByQuat(f.quat!, { x: 0, y: 1, z: 0 }).y).toBeLessThan(-0.9);
    // 頭在軌道的上方（車廂的上那一側）
    const t = trackAt(track, s);
    expect((f.y - t.p.y) * t.u.y).toBeGreaterThan(0);
  });

  it('停站時坐離自己最近的空位；坐滿了是 null', () => {
    const near = coasterSeatFrame(20, 0);
    expect(freeCoasterSeat(new Set(), { x: near.x, z: near.z + 1.5 })).toBe(20);
    expect(freeCoasterSeat(new Set([20]), { x: near.x, z: near.z + 1.5 })).not.toBe(20);
    expect(freeCoasterSeat(new Set(Array.from({ length: COASTER_SEATS }, (_, i) => i)), { x: 0, z: 20 })).toBeNull();
  });
});

describe('巨大摩天輪', () => {
  it('夠高夠巨大：最高的車廂地板約 19 公尺；最低的車廂地板約 0.6 公尺（在月台上）', () => {
    const lows = Array.from({ length: 360 }, (_, i) => cabinFloor(i, 0).y);
    expect(Math.min(...lows)).toBeCloseTo(WHEEL.hubH - WHEEL.r - WHEEL.cabinDrop, 1);
    expect(Math.min(...lows)).toBeGreaterThan(0.3);
    expect(Math.min(...lows)).toBeLessThan(1);
    expect(Math.max(...lows)).toBeGreaterThan(18);
    expect(WHEEL.hubH + WHEEL.r).toBeGreaterThan(20);
  });

  it('上車坐進最靠近底部、還有空位的車廂；滿了換下一個；全滿是 null；轉一圈下車', () => {
    const wall = 1234.5;
    const seat = freeWheelSeat(new Set(), wall)!;
    const cabin = Math.floor(seat / 4);
    const off = (i: number) => Math.abs(Math.atan2(Math.sin(wheelAngle(wall, i)), Math.cos(wheelAngle(wall, i))));
    for (let i = 0; i < WHEEL.cabins; i++) expect(off(cabin)).toBeLessThanOrEqual(off(i));
    const taken = new Set([cabin * 4, cabin * 4 + 1, cabin * 4 + 2, cabin * 4 + 3]);
    expect(Math.floor(freeWheelSeat(taken, wall)! / 4)).not.toBe(cabin);
    expect(freeWheelSeat(new Set(Array.from({ length: WHEEL_SEATS }, (_, i) => i)), wall)).toBeNull();
    // 座位在車廂裡、一圈之後回到同一個地方
    const f0 = wheelSeatFrame(seat, wall);
    const f1 = wheelSeatFrame(seat, wall + WHEEL.period);
    expect(f1.x).toBeCloseTo(f0.x, 6);
    expect(f1.y).toBeCloseTo(f0.y, 6);
    expect(rideEnd('wheel', 0, wall)).toBe(wall + WHEEL.period);
  });
});

describe('環島飛船', () => {
  it('停靠時在繫留塔外側、甲板高度；起飛時朝向不會跳；繞島一圈（半徑約 35、高約 18）再回來', () => {
    const run = 50;
    const at = (p: number) => shipState(run * SHIP_CYCLE + p);
    const d = at(3);
    expect(d.docked).toBe(true);
    expect(d.x).toBeCloseTo(SHIP.dock.x, 6);
    expect(d.z).toBeCloseTo(SHIP.dock.z, 6);
    expect(d.y).toBeCloseTo(SHIP.deckY, 6);
    const dh = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    expect(dh(at(SHIP.board + 0.5).heading, d.heading)).toBeLessThan(0.1);
    const mid = at(SHIP.board + SHIP.flight / 2);
    expect(mid.docked).toBe(false);
    expect(Math.hypot(mid.x, mid.z)).toBeCloseTo(SHIP.cruiseR, 0);
    expect(mid.y).toBeCloseTo(SHIP.cruiseY, 0);
    const end = at(SHIP_CYCLE - 0.01);
    expect(end.x).toBeCloseTo(SHIP.dock.x, 1);
    expect(end.z).toBeCloseTo(SHIP.dock.z, 1);
    expect(dh(end.heading, d.heading)).toBeLessThan(0.15);
    // 繞了一整圈：途中經過島的東邊
    let east = false;
    for (let p = SHIP.board; p < SHIP_CYCLE; p += 1) if (at(p).x > 30) east = true;
    expect(east).toBe(true);
    // 朝向一路連續（每 0.5 秒不會轉超過 0.3 弧度）
    for (let p = 0; p < SHIP_CYCLE; p += 0.5) expect(dh(at(p + 0.5).heading, at(p).heading)).toBeLessThan(0.3);
  });

  it('甲板的局部座標：+x 是靠島那一側（跳板）；局部與世界座標互換；走到欄杆、舵輪會停住', () => {
    const ship = shipState(3);
    const inner = deckToWorld(ship, SHIP.halfW, 0);
    const outer = deckToWorld(ship, -SHIP.halfW, 0);
    expect(Math.hypot(inner.x, inner.z)).toBeLessThan(Math.hypot(outer.x, outer.z));
    const w = deckToWorld(ship, 1.2, -3.4);
    const l = worldToDeck(ship, w.x, w.z);
    expect(l.x).toBeCloseTo(1.2, 6);
    expect(l.z).toBeCloseTo(-3.4, 6);
    expect(clampDeck(10, 0).x).toBeLessThan(SHIP.halfW);
    expect(clampDeck(0, -10).z).toBeGreaterThan(-SHIP.halfL);
    const c = clampDeck(SHIP.wheel.x, SHIP.wheel.z);
    expect(Math.hypot(c.x - SHIP.wheel.x, c.z - SHIP.wheel.z)).toBeGreaterThan(SHIP.wheel.r);
    // 上船站在跳板那一側，離繫留塔不遠
    const b = shipFrame(SHIP.boardAt, 3);
    expect(Math.hypot(b.x - MAST.x, b.z - MAST.z)).toBeLessThan(6);
    expect(b.y).toBeCloseTo(SHIP.deckY, 6);
  });
});

describe('班次、上車、下車', () => {
  it('雲霄飛車與飛船：停站時能上（出發前 1 秒內不行），倒數到出發；開走了倒數到下一班；摩天輪隨時能上', () => {
    const cc = coaster().cycle;
    expect(boardingOf('coaster', cc * 10 + 2)).toEqual({ open: true, wait: COASTER_BOARD - 2 });
    expect(boardingOf('coaster', cc * 10 + COASTER_BOARD - 0.5).open).toBe(false);
    expect(boardingOf('coaster', cc * 10 + 30)).toEqual({ open: false, wait: cc - 30 });
    expect(boardingOf('ship', SHIP_CYCLE * 3 + 10)).toEqual({ open: true, wait: SHIP.board - 10 });
    expect(boardingOf('ship', SHIP_CYCLE * 3 + 60)).toEqual({ open: false, wait: SHIP_CYCLE - 60 });
    expect(boardingOf('wheel', 77).open).toBe(true);
    expect(departed('coaster', 10, cc * 10 + 5)).toBe(false);
    expect(departed('coaster', 10, cc * 10 + COASTER_BOARD)).toBe(true);
    expect(rideEnd('coaster', 10, 0)).toBe(cc * 11);
    expect(rideEnd('ship', 3, 0)).toBe(SHIP_CYCLE * 4);
  });

  it('上車的地方走得到（島的半徑內有一點在範圍內），不在建築、步道上；下車站在島上、不在碰撞裡', () => {
    for (const ride of ['coaster', 'wheel', 'ship'] as const) {
      // 走得到：可以走的範圍內找得到算「旁邊」的點
      let reach = false;
      for (let x = -22; x <= 22 && !reach; x += 0.25)
        for (let z = -22; z <= 22 && !reach; z += 0.25) if (Math.hypot(x, z) <= WALK_RADIUS - 0.45 && grandNear({ x, z }) === ride) reach = true;
      expect(reach).toBe(true);
      const e = grandExit(ride);
      expect(Math.hypot(e.x, e.z)).toBeLessThanOrEqual(WALK_RADIUS - 0.45);
      expect(grandNear(e)).toBe(ride);
      for (const o of grandObstacles()) expect(Math.hypot(e.x - o.x, e.z - o.z)).toBeGreaterThan(o.r + 0.45);
      for (const zone of ZONES) expect(Math.hypot(e.x - zone.x, e.z - zone.z)).toBeGreaterThan(zone.radius + 0.5);
    }
    // 繫留塔、車站下車的地方不在建築、步道、廣場上；摩天輪的月台在挑戰塔後面（不在塔的碰撞裡）
    expect(isFree(MAST.x, MAST.z, 0)).toBe(true);
    expect(isFree(STATION.exit.x, STATION.exit.z, 0)).toBe(true);
    for (const zone of ZONES) expect(Math.hypot(WHEEL.board.x - zone.x, WHEEL.board.z - zone.z)).toBeGreaterThan(zone.radius + 0.45);
    // 最低的車廂不會壓到站在月台上按按鈕的人
    expect(WHEEL.board.z - (WHEEL.z + WHEEL.cabinZ + 0.8)).toBeGreaterThan(0.5);
    expect(BOARD_RANGE).toBeGreaterThan(2);
  });

  it('鏡頭：靠近摩天輪的月台拉遠 1.6 倍、看的點抬高；靠近繫留塔也拉遠一點；走開不變', () => {
    expect(tallView(WHEEL.board)).toEqual({ zoom: 1.6, lift: 11 });
    const m = tallView(MAST.board);
    expect(m.zoom).toBeCloseTo(1.3, 6);
    expect(m.lift).toBeCloseTo(5, 6);
    expect(tallView({ x: 0, z: 13 })).toEqual({ zoom: 1, lift: 0 });
    const half = tallView({ x: 0, z: -10 });
    expect(half.zoom).toBeGreaterThan(1);
    expect(half.zoom).toBeLessThan(1.6);
  });
});

describe('搶同一個位子', () => {
  it('id 小的人留著；被擠掉的換到空位（摩天輪先找同一個車廂）；沒人搶就不換；飛船沒有座位不用搶', () => {
    expect(resolveGrandSeat('coaster', { id: 'b', seat: 5 }, [{ id: 'c', ride: 'coaster', seat: 5 }], 0)).toBe(5);
    const moved = resolveGrandSeat('coaster', { id: 'b', seat: 5 }, [{ id: 'a', ride: 'coaster', seat: 5 }], 0);
    expect(moved).not.toBe(5);
    expect(moved).not.toBeNull();
    // 摩天輪：同一個車廂還有空位就換到同一個車廂
    expect(resolveGrandSeat('wheel', { id: 'b', seat: 9 }, [{ id: 'a', ride: 'wheel', seat: 9 }], 50)).toBe(8);
    // 別的設施的同一號座位不算
    expect(resolveGrandSeat('wheel', { id: 'b', seat: 9 }, [{ id: 'a', ride: 'coaster', seat: 9 }], 50)).toBe(9);
    // 全滿：沒有空位是 null
    const full = Array.from({ length: COASTER_SEATS }, (_, i) => ({ id: `a${i}`, ride: 'coaster' as const, seat: i }));
    expect(resolveGrandSeat('coaster', { id: 'z', seat: 3 }, full, 0)).toBeNull();
    expect(resolveGrandSeat('ship', { id: 'b', seat: 0 }, [{ id: 'a', ride: 'ship', seat: 0 }], 0)).toBe(0);
  });
});
