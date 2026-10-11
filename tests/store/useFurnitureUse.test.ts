/**
 * 用家具的狀態與動作（第 9 節優化，src/store/useFurnitureUse.ts）：坐下、起來、溜滑梯途中不能起來、
 * 傳送時起來、鞦韆記在 swingers、開關與沙堡只在本機而且換島時恢復。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cellKey, startUse, stopUse, syncActMirror, useFurnitureUse } from '../../src/store/useFurnitureUse';
import { useHome } from '../../src/store/useHome';
import { actFrame, exitPoint } from '../../src/store/furnitureUse';
import { HOME_SPACE } from '../../src/store/home';
import { player, teleport } from '../../src/world/input';
import type { YardItem } from '../../src/store/yard';

const item = (id: string, gx = 3, gz = 3): YardItem => ({ id, gx, gz, rot: 0 });

beforeEach(() => {
  teleport({ x: 0, z: 0 });
  useFurnitureUse.setState({ near: null, acting: null, toggles: {}, swingers: {} });
  useHome.setState({ houseKey: 'mine', houseName: null, inside: 'mine', nearDoor: false, onMat: false });
});

describe('坐下與起來', () => {
  it('坐下：player.act 有值、畫面的鏡像跟上、取消走路的目標', () => {
    player.target = { x: 5, z: 5 };
    const bench = item('decor.bench');
    expect(startUse(bench, 'home')).toBe('sit');
    expect(player.act).toMatchObject({ kind: 'sit', item: bench, place: 'home' });
    expect(player.target).toBeNull();
    expect(useFurnitureUse.getState().acting).toEqual({ kind: 'sit', item: bench, place: 'home' });
    // 一坐下位置就在座位上（位置訊息和動作代碼一起送出去時，別人看到的是座位）
    const f = actFrame(bench, HOME_SPACE, 'sit', 0);
    expect(player.pos).toEqual({ x: f.x, z: f.z });
    expect(player.heading).toBeCloseTo(f.heading);
  });

  it('起來：站到起身點、act 清掉', () => {
    const bench = item('decor.bench');
    startUse(bench, 'home');
    stopUse();
    expect(player.act).toBeNull();
    expect(player.pos).toEqual(exitPoint(bench, HOME_SPACE));
    expect(useFurnitureUse.getState().acting).toBeNull();
  });

  it('溜滑梯途中不能起來；溜完了才站起來', () => {
    startUse(item('decor.slide'), 'home');
    stopUse();
    expect(player.act?.kind).toBe('slide');
    stopUse(true);
    expect(player.act).toBeNull();
  });

  it('傳送（集合、老師過去、進出屋）就起來，畫面的鏡像下一格跟上', () => {
    startUse(item('decor.sofa'), 'home');
    teleport({ x: 1, z: 1 });
    expect(player.act).toBeNull();
    syncActMirror();
    expect(useFurnitureUse.getState().acting).toBeNull();
  });

  it('盪鞦韆：記在 swingers 的 self（哪一格、開始時間）；起來就拿掉', () => {
    const swing = item('decor.swing', 6, 2);
    startUse(swing, 'yard');
    expect(useFurnitureUse.getState().swingers.self).toEqual({ cell: cellKey('yard', swing), t0: player.act!.t0 });
    stopUse();
    expect(useFurnitureUse.getState().swingers.self).toBeUndefined();
  });
});

describe('開關與沙堡（只在本機）', () => {
  it('切換開關不會讓角色上去；再按一次關掉', () => {
    const tv = item('decor.tv');
    expect(startUse(tv, 'home')).toBe('toggle');
    expect(player.act).toBeNull();
    expect(useFurnitureUse.getState().toggles[cellKey('home', tv)]).toBe(true);
    startUse(tv, 'home');
    expect(useFurnitureUse.getState().toggles[cellKey('home', tv)]).toBe(false);
  });

  it('換島、進出屋時恢復原狀', () => {
    startUse(item('decor.sandbox'), 'yard');
    expect(Object.values(useFurnitureUse.getState().toggles)).toEqual([true]);
    useHome.setState({ inside: null });
    expect(useFurnitureUse.getState().toggles).toEqual({});
  });

  it('不能用的家具不做事', () => {
    expect(startUse(item('decor.fence'), 'yard')).toBeNull();
    expect(player.act).toBeNull();
  });
});
