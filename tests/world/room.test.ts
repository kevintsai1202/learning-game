/**
 * 自己的家第二期：房間的幾何（src/world/room.ts）。進屋的出生點、門口的腳踏墊、走出去的條件、小屋門口、房間的鏡頭。
 */
import { describe, expect, it } from 'vitest';
import { HOME_SPAWN, HOUSE_DOOR_RANGE, ROOM_RECT, atRoomExit, houseDoor, onDoorMat, roomCamera } from '../../src/world/room';
import { HOUSE } from '../../src/world/layout';
import { resolveCollisions } from '../../src/world/movement';
import { HOME_DOOR_CELLS, homeCellToWorld } from '../../src/store/home';

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

  it('房間的鏡頭：在前上方看房間；直式螢幕拉遠，房間整個看得到', () => {
    const wide = roomCamera(16 / 9);
    const tall = roomCamera(9 / 16);
    expect(wide.position.z).toBeGreaterThan(ROOM_RECT.halfZ);
    expect(wide.position.y).toBeGreaterThan(5);
    const dist = (c: typeof wide) => Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z);
    expect(dist(tall)).toBeGreaterThan(dist(wide));
    // 水平方向：房間的寬度（加一點邊）在畫面裡
    const halfFov = (45 / 2) * (Math.PI / 180);
    expect(dist(tall) * Math.tan(halfFov) * (9 / 16)).toBeGreaterThanOrEqual(ROOM_RECT.halfX);
  });
});
