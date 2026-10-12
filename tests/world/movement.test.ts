import { describe, expect, it } from 'vitest';
import { moveByInput, nearestDoor, resolveCollisions, stepToward, lerpAngle } from '../../src/world/movement';
import { ZONES, doorOf, WALK_RADIUS, zoneName } from '../../src/world/layout';
import type { ZoneId } from '../../src/store/useUi';

describe('stepToward 走向目標點', () => {
  it('每一步最多走 speed × dt，不會走過頭', () => {
    const p = stepToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 4, 0.5);
    expect(p.pos.x).toBeCloseTo(2);
    expect(p.arrived).toBe(false);
    const q = stepToward({ x: 9.9, z: 0 }, { x: 10, z: 0 }, 4, 0.5);
    expect(q.pos.x).toBeCloseTo(10);
    expect(q.arrived).toBe(true);
  });
});

describe('moveByInput 方向鍵／搖桿移動', () => {
  it('斜向移動速度不會比直走快', () => {
    const p = moveByInput({ x: 0, z: 0 }, { x: 1, z: 1 }, 4, 1);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(4);
  });
  it('沒有輸入時不動', () => {
    expect(moveByInput({ x: 1, z: 2 }, { x: 0, z: 0 }, 4, 1)).toEqual({ x: 1, z: 2 });
  });
});

describe('resolveCollisions 碰撞', () => {
  it('走進建築會被推到邊緣外', () => {
    const p = resolveCollisions({ x: 0.5, z: 0 }, [{ x: 0, z: 0, r: 2 }], 30, 0.4);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(2.4 - 1e-9);
  });
  it('不會走出可行走範圍', () => {
    const p = resolveCollisions({ x: 100, z: 0 }, [], WALK_RADIUS, 0.4);
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(WALK_RADIUS - 0.4 + 1e-9);
  });

  // 自己的家第二期：房間是長方形（中心在原點）
  const ROOM = { halfX: 5, halfZ: 5 };
  it('房間：不會走出長方形（四邊各留身體半徑）', () => {
    expect(resolveCollisions({ x: 9, z: -9 }, [], ROOM, 0.45)).toEqual({ x: 4.55, z: -4.55 });
    expect(resolveCollisions({ x: -1, z: 7 }, [], ROOM, 0.45)).toEqual({ x: -1, z: 4.55 });
    expect(resolveCollisions({ x: 1, z: 2 }, [], ROOM, 0.45)).toEqual({ x: 1, z: 2 });
  });
  it('房間：牆角的家具把人往牆外推，會夾回房間裡', () => {
    const p = resolveCollisions({ x: 4.5, z: 4.4 }, [{ x: 4.3, z: 4.3, r: 0.45 }], ROOM, 0.45);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(4.55 + 1e-9);
    expect(Math.abs(p.z)).toBeLessThanOrEqual(4.55 + 1e-9);
  });
});

describe('nearestDoor 靠近門口', () => {
  it('站在數學城堡門口會回報 math，遠離就回報 null', () => {
    const math = ZONES.find((z) => z.id === 'math')!;
    const door = doorOf(math);
    const doors = ZONES.map((z) => ({ id: z.id, ...doorOf(z) }));
    expect(nearestDoor(door, doors, 1.6)).toBe('math');
    expect(nearestDoor({ x: 0, z: 13 }, doors, 1.6)).toBeNull();
  });

  it('每個門口都在可行走範圍內，而且不會卡在別的建築裡', () => {
    for (const z of ZONES) {
      const d = doorOf(z);
      expect(Math.hypot(d.x, d.z), z.id).toBeLessThan(WALK_RADIUS - 0.4);
      for (const other of ZONES) {
        expect(Math.hypot(d.x - other.x, d.z - other.z), `${z.id} 門口與 ${other.id}`).toBeGreaterThan(other.radius + 0.4);
      }
    }
  });
});

describe('建築版面', () => {
  it('建築彼此不重疊（中間至少留 1.5 公尺的路）', () => {
    for (const a of ZONES) {
      for (const b of ZONES) {
        if (a.id >= b.id) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius, `${a.id} 與 ${b.id}`).toBeGreaterThan(1.5);
      }
    }
  });

  it('益智遊戲館在右前方，和左前方的百寶屋對稱', () => {
    const puzzle = ZONES.find((z) => z.id === 'puzzle')!;
    const shop = ZONES.find((z) => z.id === 'shop')!;
    expect(puzzle).toMatchObject({ x: -shop.x, z: shop.z, rotY: -shop.rotY, name: '益智遊戲館' });
  });

  it('建築名稱：不認得的建築 id 不丟例外（同學的裝置版本比較新時會送來）', () => {
    expect(zoneName('math')).toBe('數學城堡');
    expect(zoneName('castle-of-future' as ZoneId)).toBe('別的地方');
  });
});

describe('lerpAngle 轉身', () => {
  it('t=1 直接轉到目標；t=0.5 轉一半', () => {
    expect(lerpAngle(0, Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2);
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4);
  });

  it('走最短的方向：從 170° 轉到 −170° 只轉 20°，不會繞一大圈', () => {
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    expect(lerpAngle(a, b, 1) - a).toBeCloseTo((20 * Math.PI) / 180);
  });

  it('角度很大（旋轉木馬下車時朝向約 8 億弧度）也一下子算完、照樣走最短方向，結果夾在 (−π, π]（使用者 2026-10-12：坐完旋轉木馬走路異常緩慢）', () => {
    const big = 0.45 * 1.76e9 + Math.PI / 2;
    const t0 = performance.now();
    const r = lerpAngle(big, 0, 0.5);
    expect(performance.now() - t0).toBeLessThan(20);
    expect(r).toBeGreaterThan(-Math.PI);
    expect(r).toBeLessThanOrEqual(Math.PI);
    // 從 big 轉到 0 的一半：big 換算到 (−π, π] 是 a0，結果是 a0 往 0 走一半
    const a0 = Math.atan2(Math.sin(big), Math.cos(big));
    expect(r).toBeCloseTo(a0 / 2, 6);
  });
});
