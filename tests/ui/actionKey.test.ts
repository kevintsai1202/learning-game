/**
 * 手機的大動作鍵（第 10.2 節，src/ui/actionKeyRules.ts）：看情況決定主要動作與旁邊的小圓鈕。
 * 同時有好幾種時的順序：佈置 > 正在用 > 建築門口 > 小屋門口 > 腳踏墊 > 旁邊家具。
 */
import { describe, expect, it } from 'vitest';
import { pickAction, type ActionState } from '../../src/ui/actionKeyRules';

/** 什麼都沒有的狀態 */
const NONE: ActionState = { picking: null, acting: null, zone: null, houseDoor: null, onMat: false, near: null, ride: null, grand: null };

describe('pickAction', () => {
  it('什麼都沒有：不顯示', () => {
    expect(pickAction(NONE)).toBeNull();
  });

  it('建築門口：鍵上是建築的圖示加「進去」（建築名稱給朗讀器，不另外顯示）', () => {
    expect(pickAction({ ...NONE, zone: { name: '數學城堡', icon: '🏰' } })).toMatchObject({
      main: 'enterZone',
      label: '🏰 進去',
      caption: '🏰 數學城堡',
      showCaption: false,
      container: 'door-bubble',
      secondary: [],
    });
  });

  it('小屋門口：🏠 進去（○○的家）；腳踏墊：🚪 出去（回到島上）', () => {
    expect(pickAction({ ...NONE, houseDoor: { name: '小安' } })).toMatchObject({ main: 'enterHome', label: '🏠 進去', caption: '🏠 小安的家', container: 'home-door-bubble' });
    expect(pickAction({ ...NONE, onMat: true })).toMatchObject({ main: 'leaveHome', label: '🚪 出去', caption: '🚪 回到島上', container: 'home-mat-bubble' });
  });

  it('上面的小字只有警告時才顯示（不能放的原因）；其他時候鍵上已經寫了', () => {
    expect(pickAction({ ...NONE, near: { name: '溜滑梯', emoji: '🛝', use: '🛝 溜滑梯', decor: false } })?.showCaption).toBe(false);
    expect(pickAction({ ...NONE, acting: { kind: 'sit', name: '長椅', emoji: '🪑' } })?.showCaption).toBe(false);
    expect(pickAction({ ...NONE, picking: { name: '長椅', problem: null } })?.showCaption).toBe(false);
    expect(pickAction({ ...NONE, picking: { name: '長椅', problem: '這裡不能擺' } })?.showCaption).toBe(true);
  });

  it('旁邊可以用的家具：主鍵是用法；自己能佈置的地方多轉方向、收起來', () => {
    expect(pickAction({ ...NONE, near: { name: '長椅', emoji: '🪑', use: '🪑 坐下', decor: false } })).toMatchObject({
      main: 'use',
      label: '🪑 坐下',
      caption: '🪑 長椅',
      container: 'use-card',
      secondary: [],
    });
    expect(pickAction({ ...NONE, near: { name: '長椅', emoji: '🪑', use: '🪑 坐下', decor: true } })).toMatchObject({ main: 'use', container: 'decor-near', secondary: ['rotate', 'pickup'] });
  });

  it('旁邊的家具不能用（例如柵欄）、自己能佈置：主鍵是轉方向，旁邊收起來', () => {
    expect(pickAction({ ...NONE, near: { name: '木柵欄', emoji: '🪵', use: null, decor: true } })).toMatchObject({ main: 'rotate', container: 'decor-near', secondary: ['pickup'] });
    expect(pickAction({ ...NONE, near: { name: '木柵欄', emoji: '🪵', use: null, decor: false } })).toBeNull();
  });

  it('旁邊的家具轉不過去：大鍵上面顯示提示（第 10.3 節），按鍵照常', () => {
    const v = pickAction({ ...NONE, near: { name: '長椅', emoji: '🪑', use: '🪑 坐下', decor: true, notice: '旁邊太擠了，轉不過去' } });
    expect(v).toMatchObject({ main: 'use', caption: '旁邊太擠了，轉不過去', showCaption: true, disabled: false, secondary: ['rotate', 'pickup'] });
    expect(pickAction({ ...NONE, near: { name: '木柵欄', emoji: '🪵', use: null, decor: true, notice: '旁邊太擠了，轉不過去' } })).toMatchObject({ main: 'rotate', showCaption: true });
  });

  it('正在用：起來，旁邊小圓鈕換視角（第 10.5 節）；溜滑梯途中不能起來，大鍵是換視角', () => {
    expect(pickAction({ ...NONE, acting: { kind: 'sit', name: '長椅', emoji: '🪑' } })).toMatchObject({ main: 'stop', label: '⬆️ 起來', container: 'use-card', secondary: ['view'] });
    expect(pickAction({ ...NONE, acting: { kind: 'slide', name: '溜滑梯', emoji: '🛝' } })).toMatchObject({ main: 'view', label: '🎥 換視角', container: 'use-card', secondary: [] });
  });

  it('佈置：放下（不能放時停用、寫原因），旁邊是轉方向', () => {
    expect(pickAction({ ...NONE, picking: { name: '長椅', problem: null } })).toMatchObject({ main: 'place', label: '放下', caption: '放下長椅', disabled: false, secondary: ['ghostRotate'] });
    expect(pickAction({ ...NONE, picking: { name: '長椅', problem: '這裡不能擺' } })).toMatchObject({ main: 'place', caption: '這裡不能擺', disabled: true });
  });

  it('順序：佈置 > 正在用 > 建築門口 > 小屋門口 > 腳踏墊 > 旁邊家具', () => {
    const all: ActionState = {
      picking: { name: '長椅', problem: null },
      acting: { kind: 'sit', name: '長椅', emoji: '🪑' },
      zone: { name: '數學城堡', icon: '🏰' },
      houseDoor: { name: '小安' },
      onMat: true,
      near: { name: '長椅', emoji: '🪑', use: '🪑 坐下', decor: true },
      ride: null,
      grand: null,
    };
    expect(pickAction(all)?.main).toBe('place');
    expect(pickAction({ ...all, picking: null })?.main).toBe('stop');
    expect(pickAction({ ...all, picking: null, acting: null })?.main).toBe('enterZone');
    expect(pickAction({ ...all, picking: null, acting: null, zone: null })?.main).toBe('enterHome');
    expect(pickAction({ ...all, picking: null, acting: null, zone: null, houseDoor: null })?.main).toBe('leaveHome');
    expect(pickAction({ ...all, picking: null, acting: null, zone: null, houseDoor: null, onMat: false })?.main).toBe('use');
  });
});
