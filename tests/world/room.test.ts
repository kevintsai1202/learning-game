/**
 * 自己的家第二期：房間的幾何（src/world/room.ts）。進屋的出生點、門口的腳踏墊、走出去的條件、小屋門口、房間的鏡頭。
 */
import { describe, expect, it } from 'vitest';
import { HOME_SPAWN, HOUSE_DOOR_RANGE, ROOM_RECT, atRoomExit, houseDoor, onDoorMat, roomCamera } from '../../src/world/room';
import { HOUSE } from '../../src/world/layout';
import { resolveCollisions } from '../../src/world/movement';
import { HOME_CLEAR_CELLS, HOME_DOOR_CELLS, homeCellToWorld, isHomeCell } from '../../src/store/home';
import { HOME_SPACE } from '../../src/store/home';

describe('房間的幾何', () => {
  it('房間 10×10 公尺，中心在原點', () => {
    expect(ROOM_RECT).toEqual({ halfX: 5, halfZ: 5 });
  });

  it('腳踏墊在門口的格子上（前緣中間）；進屋的出生點不在腳踏墊上，面向房間裡面', () => {
    for (const d of HOME_DOOR_CELLS) expect(onDoorMat(homeCellToWorld(d.gx, d.gz))).toBe(true);
    expect(onDoorMat({ x: 0, z: 0 })).toBe(false);
    expect(onDoorMat({ x: 3, z: 4.5 })).toBe(false);
    expect(onDoorMat(HOME_SPAWN)).toBe(false);
    expect(HOME_SPAWN.heading).toBeCloseTo(Math.PI);
    // 進屋站的那一格不能擺家具（不會一進來就被家具推開）
    const at = HOME_SPACE.toCell(HOME_SPAWN.x + 0.3, HOME_SPAWN.z);
    expect(isHomeCell(at.gx, at.gz)).toBe(false);
    expect(HOME_CLEAR_CELLS.some((c) => c.gx === at.gx && c.gz === at.gz)).toBe(true);
  });

  it('走出去：站在前緣的門口、往前（+z）推才算；出生點不算；門口以外的前緣不算', () => {
    const edge = resolveCollisions({ x: 0.3, z: 9 }, [], ROOM_RECT, 0.45);
    expect(atRoomExit(edge, { x: 0, z: 1 })).toBe(true);
    expect(atRoomExit(edge, { x: 0, z: -1 })).toBe(false);
    expect(atRoomExit(edge, { x: 1, z: 0.2 })).toBe(false);
    expect(atRoomExit(HOME_SPAWN, { x: 0, z: 1 })).toBe(false);
    expect(atRoomExit({ x: 3, z: edge.z }, { x: 0, z: 1 })).toBe(false);
  });

  it('小屋門口在小屋正面（朝出生點的方向）外面一點', () => {
    const d = houseDoor();
    const dist = Math.hypot(d.x - HOUSE.x, d.z - HOUSE.z);
    expect(dist).toBeGreaterThan(HOUSE.radius);
    expect(dist).toBeLessThan(HOUSE.radius + 2);
    expect(Math.atan2(d.x - HOUSE.x, d.z - HOUSE.z)).toBeCloseTo(HOUSE.rotY);
    expect(HOUSE_DOOR_RANGE).toBeGreaterThan(1);
  });

  // 第 9 節優化：屋裡的鏡頭跟著角色（拉近一點），乘縮放倍率
  const dist = (c: ReturnType<typeof roomCamera>) => Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z);

  it('房間的鏡頭跟著角色：看的點跟著角色走，但夾在房間裡；鏡頭在前上方', () => {
    const mid = roomCamera(16 / 9, { x: 0, z: 0 });
    const left = roomCamera(16 / 9, { x: -4, z: -4 });
    expect(left.target.x).toBeLessThan(mid.target.x);
    expect(left.target.z).toBeLessThan(mid.target.z);
    for (const c of [mid, left, roomCamera(16 / 9, { x: 9, z: 9 })]) {
      expect(Math.abs(c.target.x)).toBeLessThanOrEqual(ROOM_RECT.halfX);
      expect(Math.abs(c.target.z)).toBeLessThanOrEqual(ROOM_RECT.halfZ);
      expect(c.position.z).toBeGreaterThan(c.target.z);
      expect(c.position.y).toBeGreaterThan(3);
      // 鏡頭不會跑到側牆外面
      expect(Math.abs(c.position.x)).toBeLessThan(ROOM_RECT.halfX);
    }
  });

  it('房間的鏡頭比島上近；直式螢幕拉遠；縮放倍率乘在距離上', () => {
    const wide = roomCamera(16 / 9, { x: 0, z: 0 });
    const tall = roomCamera(9 / 16, { x: 0, z: 0 });
    expect(dist(wide)).toBeLessThan(13);
    expect(dist(tall)).toBeGreaterThan(dist(wide));
    expect(dist(roomCamera(16 / 9, { x: 0, z: 0 }, 0.5))).toBeCloseTo(dist(wide) * 0.5, 5);
    expect(dist(roomCamera(16 / 9, { x: 0, z: 0 }, 1.5))).toBeCloseTo(dist(wide) * 1.5, 5);
  });
});
