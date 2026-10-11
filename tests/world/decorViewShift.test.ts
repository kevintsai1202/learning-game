/**
 * 家具包打開時畫面往上移（第 10 節第 ① 批，src/world/decorViewShift.ts）：直式手機才移（約畫面高的 15%，最多 140px），
 * 橫式與電腦的角色本來就在家具包上方，不移；關上是 0。
 */
import { describe, expect, it } from 'vitest';
import { decorViewShift } from '../../src/world/decorViewShift';

describe('decorViewShift', () => {
  it('直式手機、家具包打開：往上移畫面高的 15%，最多 140px', () => {
    expect(decorViewShift(390, 844, true)).toBeCloseTo(126.6);
    expect(decorViewShift(360, 740, true)).toBeCloseTo(111);
    expect(decorViewShift(600, 1400, true)).toBe(140);
  });

  it('橫式、電腦：不移；家具包關上：不移', () => {
    expect(decorViewShift(844, 390, true)).toBe(0);
    expect(decorViewShift(1280, 800, true)).toBe(0);
    expect(decorViewShift(390, 844, false)).toBe(0);
  });
});
