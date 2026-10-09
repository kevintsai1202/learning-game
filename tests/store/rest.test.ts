/**
 * 玩一段時間要休息（src/store/rest.ts，docs/decisions.md「遊玩時間：玩一段時間要休息」）：
 * 只算有操作的時間（1 分鐘沒操作就不算）；累計到連續上限就開始休息（照真實時間），累計歸零；上限 0 表示不限制。
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_REST, IDLE_MS, addActive, isActive, restLeftSec } from '../../src/store/rest';

const T = Date.parse('2026-10-09T10:00:00+08:00');
const MIN = 60_000;

describe('isActive', () => {
  it('最後一次操作在 1 分鐘內才算在玩', () => {
    expect(IDLE_MS).toBe(MIN);
    expect(isActive(T - 30_000, T)).toBe(true);
    expect(isActive(T - MIN, T)).toBe(true);
    expect(isActive(T - MIN - 1, T)).toBe(false);
  });
});

describe('addActive', () => {
  it('還沒到上限：累計秒數', () => {
    expect(addActive(EMPTY_REST, 30, T, 30, 15)).toEqual({ activeSec: 30, restUntil: null });
  });

  it('累計到上限：開始休息（照真實時間），累計歸零', () => {
    const s = addActive({ activeSec: 30 * 60 - 30, restUntil: null }, 30, T, 30, 15);
    expect(s).toEqual({ activeSec: 0, restUntil: T + 15 * MIN });
    expect(restLeftSec(s, T)).toBe(15 * 60);
    expect(restLeftSec(s, T + 14 * MIN)).toBe(60);
    expect(restLeftSec(s, T + 15 * MIN)).toBe(0);
  });

  it('休息中不累計；休息結束後重新開始累計', () => {
    const resting = { activeSec: 0, restUntil: T + 15 * MIN };
    expect(addActive(resting, 30, T + MIN, 30, 15)).toBe(resting);
    expect(addActive(resting, 30, T + 16 * MIN, 30, 15)).toEqual({ activeSec: 30, restUntil: null });
  });

  it('連續上限 0（不限制）：只累計，不會開始休息', () => {
    expect(addActive({ activeSec: 99 * 60, restUntil: null }, 30, T, 0, 15)).toEqual({ activeSec: 99 * 60 + 30, restUntil: null });
  });
});
