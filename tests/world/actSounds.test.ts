/**
 * 用家具時的音效時機（第 10 節第 ① 批加：家具要有音效；src/world/actSounds.ts）：
 * 從上一格到這一格（開始用之後幾秒）之間該響哪些音效。坐下、躺下一開始響一次；溜滑梯爬梯子每 0.25 秒一步、
 * 開始溜「咻」、到底「咚」；盪鞦韆每盪到一邊響一次「嘎」。
 */
import { describe, expect, it } from 'vitest';
import { actSoundEvents } from '../../src/world/actSounds';

describe('actSoundEvents', () => {
  it('坐下、躺下、鋼琴：一開始響一次', () => {
    expect(actSoundEvents('sit', -1, 0)).toEqual(['sit']);
    expect(actSoundEvents('sit', 0, 0.5)).toEqual([]);
    expect(actSoundEvents('lie', -1, 0.02)).toEqual(['lie']);
    expect(actSoundEvents('piano', -1, 0)).toEqual(['sit']);
  });

  it('溜滑梯：爬梯子每 0.25 秒一步、開始溜咻一聲、溜到底咚一聲', () => {
    expect(actSoundEvents('slide', -1, 0)).toEqual(['step']);
    expect(actSoundEvents('slide', 0, 0.3)).toEqual(['step']);
    expect(actSoundEvents('slide', 0.3, 0.8)).toEqual(['step', 'step']);
    expect(actSoundEvents('slide', 1.2, 1.4)).toEqual(['whee']);
    expect(actSoundEvents('slide', 2.1, 2.3)).toEqual(['land']);
    expect(actSoundEvents('slide', 1.4, 2.0)).toEqual([]);
  });

  it('盪鞦韆：一開始坐上去，之後每盪到一邊（半個週期）嘎一聲', () => {
    expect(actSoundEvents('swing', -1, 0)).toEqual(['sit']);
    const half = Math.PI / 2.4;
    expect(actSoundEvents('swing', 0.1, half * 0.5 + 0.01)).toEqual(['creak']);
    expect(actSoundEvents('swing', half * 0.5 + 0.02, half * 1.4)).toEqual([]);
    expect(actSoundEvents('swing', half * 1.4, half * 1.6)).toEqual(['creak']);
  });
});
