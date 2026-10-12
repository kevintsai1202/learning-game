/**
 * 走路動作（docs/plans/grand-rides.md 第 11.3 節；使用者 2026-10-13：人物走動時要有走路的動作，朋友走路也要，不能滑動）。
 * 從島上的鏡頭（斜上方往下看、腳被身體擋住）也要看得出在走：身體一蹦一蹦、左右搖擺、往前傾、落地稍微壓扁、手腳擺得大。
 */
import { describe, expect, it } from 'vitest';
import { WALK_STEP_RATE, walkPose } from '../../src/world/walkPose';

describe('walkPose', () => {
  it('走路時：一蹦一蹦（離地至少 0.18 公尺）、左右搖擺、往前傾、手腳擺得大；落地時稍微壓扁', () => {
    const samples = Array.from({ length: 64 }, (_, i) => walkPose((i / 64) * Math.PI * 2, true, 0));
    expect(Math.max(...samples.map((s) => s.bob))).toBeGreaterThanOrEqual(0.18);
    expect(Math.min(...samples.map((s) => s.bob))).toBeLessThan(0.02);
    expect(Math.max(...samples.map((s) => s.sway))).toBeGreaterThan(0.08);
    expect(Math.min(...samples.map((s) => s.sway))).toBeLessThan(-0.08);
    expect(samples.every((s) => s.lean > 0.05)).toBe(true);
    expect(Math.max(...samples.map((s) => Math.abs(s.leg)))).toBeGreaterThan(0.7);
    expect(Math.max(...samples.map((s) => Math.abs(s.arm)))).toBeGreaterThan(0.8);
    // 落地（離地最低）時壓扁、在空中時不壓扁
    const landing = samples.reduce((a, b) => (b.bob < a.bob ? b : a));
    const air = samples.reduce((a, b) => (b.bob > a.bob ? b : a));
    expect(landing.squash).toBeLessThan(0.97);
    expect(air.squash).toBeGreaterThan(0.99);
  });

  it('動作是連續的（相位走一小步，每一項都只變一點點）', () => {
    for (let i = 0; i < 200; i++) {
      const a = walkPose(i * 0.05, true, 0);
      const b = walkPose(i * 0.05 + 0.05, true, 0);
      for (const k of ['leg', 'arm', 'bob', 'sway', 'lean', 'squash'] as const) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.08);
    }
  });

  it('站著：不擺手腳、不搖擺、不前傾，只有輕輕的呼吸', () => {
    for (const t of [0, 0.4, 1.3, 2.7]) {
      const s = walkPose(1.2, false, t);
      expect(s.leg).toBe(0);
      expect(s.arm).toBe(0);
      expect(s.sway).toBe(0);
      expect(s.lean).toBe(0);
      expect(Math.abs(s.bob)).toBeLessThanOrEqual(0.02);
    }
  });

  it('步伐的快慢跟著走路速度（走越快踏越快）', () => {
    expect(WALK_STEP_RATE(5)).toBeGreaterThan(WALK_STEP_RATE(1));
    expect(WALK_STEP_RATE(1)).toBeGreaterThan(6);
  });
});
