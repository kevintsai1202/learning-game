/**
 * 第 ③ 批（docs/plans/home.md 第 10.5 節）：轉視角、移動跟著鏡頭、放開才算點擊、用家具時換視角（src/world/cameraOrbit.ts）。
 * - yaw 0 是原本從南邊看的方向：鏡頭和第 ③ 批以前一模一樣（e2e 的角色位置、鏡頭位置都靠這個）。
 * - 往右拖＝視角往右轉（使用者 2026-10-12）。
 */
import { describe, expect, it } from 'vitest';
import {
  DRAG_RATE,
  KEY_TURN_RATE,
  TAP_SLOP,
  actCamera,
  canOrbitFrom,
  followCamera,
  isRotated,
  nextView,
  normalizeYaw,
  worldInput,
  yawByDrag,
  yawByKeys,
} from '../../src/world/cameraOrbit';
import { HOME_SPACE } from '../../src/store/home';
import { FURNITURE_USE, SWING_PIVOT, actFrame, swingAngle } from '../../src/store/furnitureUse';
import type { YardItem } from '../../src/store/yard';

const close = (a: { x: number; y?: number; z: number }, b: { x: number; y?: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  if (a.y !== undefined && b.y !== undefined) expect(a.y).toBeCloseTo(b.y, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
};

describe('島上的跟隨鏡頭（followCamera）', () => {
  it('yaw 0 和第 ③ 批以前一模一樣：鏡頭在 (0.85x, 高, z + 後)、看 (0.9x, 1, z − 4)；直式拉遠；乘縮放', () => {
    const pos = { x: 6, z: -3 };
    const land = followCamera(pos, 0, 1, false);
    close(land.position, { x: 6 * 0.85, y: 15.5, z: -3 + 18.5 });
    close(land.target, { x: 6 * 0.9, y: 1, z: -3 - 4 });
    const tall = followCamera(pos, 0, 1, true);
    close(tall.position, { x: 6 * 0.85, y: 22, z: -3 + 25 });
    const zoomed = followCamera(pos, 0, 0.5, false);
    close(zoomed.position, { x: 6 * 0.85, y: 15.5 * 0.5, z: -3 + 18.5 * 0.5 });
  });

  it('往右拖＝視角往右轉：從南邊看北方時往右拖，鏡頭移到角色西邊、往東看', () => {
    const yaw = yawByDrag(0, 100);
    expect(yaw).toBeLessThan(0);
    const c = followCamera({ x: 0, z: 0 }, yaw, 1, false);
    expect(c.position.x).toBeLessThan(0);
    // 看的方向（鏡頭 → 看的點）往東偏
    expect(c.target.x - c.position.x).toBeGreaterThan(0);
  });

  it('繞著角色轉：鏡頭到角色的水平距離不變；轉半圈鏡頭在角色北邊', () => {
    const pos = { x: 0, z: 0 };
    const base = followCamera(pos, 0, 1, false);
    const half = followCamera(pos, Math.PI, 1, false);
    expect(Math.hypot(half.position.x, half.position.z)).toBeCloseTo(Math.hypot(base.position.x, base.position.z), 6);
    expect(half.position.z).toBeCloseTo(-18.5, 6);
    expect(half.target.z).toBeCloseTo(4, 6);
  });
});

describe('轉的角度', () => {
  it('normalizeYaw 夾在 (−π, π]；isRotated 只有轉過才算', () => {
    expect(normalizeYaw(0)).toBe(0);
    expect(normalizeYaw(2 * Math.PI + 0.5)).toBeCloseTo(0.5);
    expect(normalizeYaw(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5);
    expect(isRotated(0)).toBe(false);
    expect(isRotated(2 * Math.PI)).toBe(false);
    expect(isRotated(0.3)).toBe(true);
  });

  it('拖曳：每 px 轉 DRAG_RATE 弧度，往右拖 yaw 變小；Q 左轉（變大）、E 右轉（變小），同時按不動', () => {
    expect(yawByDrag(0.2, 50)).toBeCloseTo(0.2 - 50 * DRAG_RATE);
    expect(yawByDrag(0.2, -50)).toBeCloseTo(0.2 + 50 * DRAG_RATE);
    expect(yawByKeys(0, true, false, 0.1)).toBeCloseTo(KEY_TURN_RATE * 0.1);
    expect(yawByKeys(0, false, true, 0.1)).toBeCloseTo(-KEY_TURN_RATE * 0.1);
    expect(yawByKeys(0.4, true, true, 0.1)).toBeCloseTo(0.4);
  });

  it('手機（有搖桿）只有右半邊能拖曳轉；電腦哪裡都可以', () => {
    expect(canOrbitFrom(300, 400, true)).toBe(true);
    expect(canOrbitFrom(100, 400, true)).toBe(false);
    expect(canOrbitFrom(100, 400, false)).toBe(true);
  });

  it('點一下：移動 TAP_SLOP（8px）以內才算', () => {
    expect(TAP_SLOP).toBe(8);
  });
});

describe('移動跟著鏡頭（worldInput）', () => {
  it('yaw 0 不變；轉了以後輸入的「上」是鏡頭看的方向', () => {
    close(worldInput({ x: 0, z: -1 }, 0), { x: 0, z: -1 });
    // 往右轉 90 度（yaw −π/2）：看東方，「上」是東（+x），「右」是南（+z）
    close(worldInput({ x: 0, z: -1 }, -Math.PI / 2), { x: 1, z: 0 });
    close(worldInput({ x: 1, z: 0 }, -Math.PI / 2), { x: 0, z: 1 });
    // 和鏡頭看的方向一致（任意角度）
    for (const yaw of [0.4, 1.7, -2.6]) {
      const c = followCamera({ x: 0, z: 0 }, yaw, 1, false);
      const look = { x: c.target.x - c.position.x, z: c.target.z - c.position.z };
      const len = Math.hypot(look.x, look.z);
      close(worldInput({ x: 0, z: -1 }, yaw), { x: look.x / len, z: look.z / len });
    }
  });
});

describe('用家具時換視角（actCamera）', () => {
  const swing: YardItem = { id: 'decor.swing', gx: 4, gz: 4, rot: 0 };
  const slide: YardItem = { id: 'decor.slide', gx: 5, gz: 5, rot: 0 };
  const bench: YardItem = { id: 'decor.bench', gx: 3, gz: 3, rot: 1 };

  it('順序：跟拍 → 近拍 → 第一人稱 → 跟拍；跟拍不另外算鏡頭', () => {
    expect(nextView('follow')).toBe('close');
    expect(nextView('close')).toBe('first');
    expect(nextView('first')).toBe('follow');
    expect(actCamera(bench, HOME_SPACE, 'sit', 1, 'follow', 0, 1)).toBeNull();
  });

  it('第一人稱在角色的頭（照 PoseWrap 的樞軸與傾斜算）：盪鞦韆時跟著盪，鏡頭直接跳到定位', () => {
    const t = 0.6;
    const f = actFrame(swing, HOME_SPACE, 'swing', t);
    const a = swingAngle(t);
    // 頭在身體原點上方 1.55；PoseWrap：樞軸在 SWING_PIVOT、繞 x 轉 tiltX，內層在 y − pivotY
    const Y = f.y - SWING_PIVOT + 1.55;
    const head = { x: f.x + Math.sin(f.heading) * Y * Math.sin(a), y: SWING_PIVOT + Y * Math.cos(a), z: f.z + Math.cos(f.heading) * Y * Math.sin(a) };
    const c = actCamera(swing, HOME_SPACE, 'swing', t, 'first', 0, 1)!;
    expect(c.snap).toBe(true);
    expect(Math.hypot(c.position.x - head.x, c.position.y - head.y, c.position.z - head.z)).toBeLessThan(0.45);
    // 看角色面向的那一邊（鞦韆朝 +z）
    expect(c.target.z).toBeGreaterThan(c.position.z);
  });

  it('第一人稱溜滑梯：溜的時候沿著滑道往下看（看的點比眼睛低、在 +x 那邊）', () => {
    const c = actCamera(slide, HOME_SPACE, 'slide', 1.6, 'first', 0, 1)!;
    expect(c.target.y).toBeLessThan(c.position.y);
    expect(c.target.x).toBeGreaterThan(c.position.x);
  });

  it('近拍：看角色的胸口，比平常的鏡頭近，跟著轉的角度', () => {
    const f = actFrame(bench, HOME_SPACE, 'sit', 1);
    const c = actCamera(bench, HOME_SPACE, 'sit', 1, 'close', 0, 1)!;
    expect(c.snap).toBe(false);
    expect(Math.hypot(c.target.x - f.x, c.target.z - f.z)).toBeLessThan(0.01);
    const d = Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z);
    expect(d).toBeLessThan(6);
    expect(c.position.z).toBeGreaterThan(c.target.z);
    const turned = actCamera(bench, HOME_SPACE, 'sit', 1, 'close', Math.PI, 1)!;
    expect(turned.position.z).toBeLessThan(turned.target.z);
  });

  it('座位表的家具都算得出來（不丟例外）', () => {
    for (const [id, s] of Object.entries(FURNITURE_USE)) {
      if (!s.seat) continue;
      const it: YardItem = { id, gx: 4, gz: 4, rot: 2 };
      for (const view of ['close', 'first'] as const) expect(actCamera(it, HOME_SPACE, s.kind, 0.5, view, 0.3, 1)).not.toBeNull();
    }
  });
});
