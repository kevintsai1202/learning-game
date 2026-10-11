/**
 * 鏡頭縮放（第 9 節優化，src/world/cameraZoom.ts）：倍率夾在範圍裡、滾輪往下拉遠、兩指張開拉近。
 */
import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, ZOOM_MIN, clampZoom, zoomByPinch, zoomByWheel } from '../../src/world/cameraZoom';

describe('鏡頭縮放', () => {
  it('倍率夾在範圍裡（1 是原本的距離）', () => {
    expect(ZOOM_MIN).toBeLessThan(1);
    expect(ZOOM_MAX).toBeGreaterThan(1);
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('滾輪往下（deltaY > 0）拉遠、往上拉近；一格大約一成；不會超出範圍', () => {
    expect(zoomByWheel(1, 100)).toBeGreaterThan(1);
    expect(zoomByWheel(1, -100)).toBeLessThan(1);
    expect(zoomByWheel(1, 100)).toBeLessThan(1.2);
    expect(zoomByWheel(ZOOM_MAX, 1000)).toBe(ZOOM_MAX);
    expect(zoomByWheel(ZOOM_MIN, -1000)).toBe(ZOOM_MIN);
  });

  it('兩指捏合：張開（距離變大）拉近、捏起來拉遠，照兩指距離的比例', () => {
    expect(zoomByPinch(1, 100, 150)).toBeCloseTo(2 / 3, 5);
    expect(zoomByPinch(1, 200, 160)).toBeCloseTo(1.25, 5);
    expect(zoomByPinch(1.2, 100, 100)).toBeCloseTo(1.2, 5);
    expect(zoomByPinch(1, 100, 1000)).toBe(ZOOM_MIN);
    expect(zoomByPinch(1, 0, 100)).toBe(1);
  });
});
