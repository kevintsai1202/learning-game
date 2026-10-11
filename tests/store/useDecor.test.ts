/**
 * 佈置的狀態與動作（src/store/useDecor.ts）：島上與屋裡共用家具包（自己的家第二期，docs/plans/home.md 第 8 節）。
 * 在自己的屋裡放、轉、收的是房間的擺設（房間的格子）；每種家具的數量島上加屋裡一起算。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetSaveForTests, useGame } from '../../src/store/useGame';
import { frontProblem, pickDecor, pickUpNear, placeFront, remainingAll, resetDecor, rotateNear, surfaceChoices, updateDecorSpot, useDecor } from '../../src/store/useDecor';
import { useHome } from '../../src/store/useHome';
import { HOME_DOOR_CELLS, HOME_SPACE, homeOf } from '../../src/store/home';
import { ROTATE_BLOCKED, yardCells } from '../../src/store/yard';

/** 建立一位小朋友：收藏 inventory、島上擺 yard */
function makeKid(inventory: string[], yard: { id: string; gx: number; gz: number; rot: 0 | 1 | 2 | 3 }[] = []): void {
  useGame.getState().createProfile('小安', { animal: 'bear', color: '#8b5a2b', hat: null });
  useGame.getState().putProfile({ ...useGame.getState().profile()!, inventory, yard });
}
const profile = () => useGame.getState().profile()!;
/** 在自己的屋裡 */
const goInside = () => useHome.setState({ houseKey: 'mine', inside: 'mine' });
/** 在島上 */
const goOutside = () => useHome.setState({ houseKey: 'mine', inside: null });

beforeEach(() => {
  resetSaveForTests();
  resetDecor();
  useHome.setState({ houseKey: null, houseName: null, inside: null, nearDoor: false, onMat: false });
});

describe('多格的家具（第 10.3 節）', () => {
  it('從面前那一格往角色面向的方向展開：面向北方放床，床佔面前那一格與再往北一格', () => {
    makeKid(['decor.bed']);
    goInside();
    pickDecor('decor.bed');
    useDecor.setState({ front: { gx: 5, gz: 5 }, facing: 2 });
    expect(frontProblem()).toBeNull();
    expect(placeFront()).toBe(true);
    expect(homeOf(profile()).items).toEqual([{ id: 'decor.bed', gx: 5, gz: 4, rot: 0 }]);
  });

  it('預覽照面向展開後整塊不能擺就說原因：面向東方在最右邊放長椅會突出房間', () => {
    makeKid(['decor.bench']);
    goInside();
    pickDecor('decor.bench');
    useDecor.setState({ front: { gx: 9, gz: 3 }, facing: 1 });
    expect(frontProblem()).toBe('這裡不能擺');
    expect(placeFront()).toBe(false);
  });

  it('updateDecorSpot 記下面向的方向（四個方向）；只改面向也會更新', () => {
    makeKid([]);
    goInside();
    updateDecorSpot({ gx: 5, gz: 5 }, { x: 0, z: 0 }, 1);
    expect(useDecor.getState().facing).toBe(1);
    updateDecorSpot({ gx: 5, gz: 5 }, { x: 0, z: 0 }, 3);
    expect(useDecor.getState().facing).toBe(3);
  });

  it('在床尾轉床：床橫過去離角色變遠，角色沒走開就還是「旁邊的家具」（可以一直按轉方向）；走開才換', () => {
    makeKid(['decor.bed']);
    goInside();
    useGame.getState().saveHome({ items: [{ id: 'decor.bed', gx: 2, gz: 2, rot: 0 }], wall: 'wall.cream', floor: 'floor.wood' });
    const foot = HOME_SPACE.toWorld(2, 3);
    const pos = { x: foot.x, z: foot.z + 1.2 };
    updateDecorSpot(null, pos, 2);
    expect(useDecor.getState().near).toEqual({ id: 'decor.bed', gx: 2, gz: 2, rot: 0 });
    expect(rotateNear()).toBe(true);
    // 床變成 (2,2)(3,2)，離角色 2.2 公尺（超過 1.5）
    updateDecorSpot(null, pos, 2);
    expect(useDecor.getState().near).toEqual({ id: 'decor.bed', gx: 2, gz: 2, rot: 1 });
    expect(rotateNear()).toBe(true);
    updateDecorSpot(null, { x: pos.x + 0.1, z: pos.z }, 2);
    expect(useDecor.getState().near).toEqual({ id: 'decor.bed', gx: 2, gz: 2, rot: 2 });
    // 走開（超過 0.3 公尺）就照距離找
    expect(rotateNear()).toBe(true);
    updateDecorSpot(null, { x: pos.x + 1, z: pos.z + 0.5 }, 2);
    expect(useDecor.getState().near).toBeNull();
  });

  it('轉不過去時不轉、顯示「旁邊太擠了，轉不過去」；走開就消失', () => {
    makeKid(['decor.bench']);
    goInside();
    useGame.getState().saveHome({ items: [{ id: 'decor.bench', gx: 9, gz: 3, rot: 1 }], wall: 'wall.cream', floor: 'floor.wood' });
    const w = HOME_SPACE.toWorld(9, 3);
    updateDecorSpot(null, { x: w.x - 0.9, z: w.z }, 1);
    expect(useDecor.getState().near?.id).toBe('decor.bench');
    expect(rotateNear()).toBe(false);
    expect(useDecor.getState().notice).toBe(ROTATE_BLOCKED);
    expect(homeOf(profile()).items[0].rot).toBe(1);
    updateDecorSpot(null, { x: -4, z: -4 }, 1);
    expect(useDecor.getState().notice).toBeNull();
  });
});

describe('島上與屋裡共用家具包', () => {
  const [c1] = yardCells();

  it('收藏 2 張長椅、島上擺 1 張：屋裡選得到、放得下；放完就不再選著', () => {
    makeKid(['decor.bench', 'decor.bench'], [{ id: 'decor.bench', gx: c1.gx, gz: c1.gz, rot: 0 }]);
    goInside();
    expect(remainingAll()['decor.bench']).toBe(1);
    pickDecor('decor.bench');
    expect(useDecor.getState().picking).toBe('decor.bench');
    useDecor.setState({ front: { gx: 1, gz: 1 } });
    expect(frontProblem()).toBeNull();
    expect(placeFront()).toBe(true);
    expect(homeOf(profile()).items).toEqual([{ id: 'decor.bench', gx: 1, gz: 1, rot: 0 }]);
    expect(profile().yard).toHaveLength(1);
    expect(useDecor.getState().picking).toBeNull();
    expect(remainingAll()['decor.bench']).toBe(0);
  });

  it('屋裡擺了以後回到島上：同一種家具都擺出去了', () => {
    makeKid(['decor.bench', 'decor.bench'], [{ id: 'decor.bench', gx: c1.gx, gz: c1.gz, rot: 0 }]);
    goInside();
    pickDecor('decor.bench');
    useDecor.setState({ front: { gx: 1, gz: 1 } });
    placeFront();
    goOutside();
    // 離島上那張長椅遠一點的空格子（長椅 2×1，旁邊那格被佔了）
    const far = yardCells().find((c) => Math.abs(c.gx - c1.gx) > 3 || Math.abs(c.gz - c1.gz) > 3)!;
    useDecor.setState({ picking: 'decor.bench', front: { gx: far.gx, gz: far.gz } });
    expect(frontProblem()).toBe('這個家具都擺出去了');
    // 剩 0 個時選不到
    pickDecor(null);
    pickDecor('decor.bench');
    expect(useDecor.getState().picking).toBeNull();
  });

  it('屋裡的門口不能擺', () => {
    makeKid(['decor.bed']);
    goInside();
    pickDecor('decor.bed');
    const [door] = HOME_DOOR_CELLS;
    useDecor.setState({ front: door });
    expect(frontProblem()).toBe('這裡不能擺');
  });

  it('屋裡旁邊的家具：用房間的座標找；轉方向、收起來改的是房間', () => {
    makeKid(['decor.bed']);
    goInside();
    useGame.getState().saveHome({ items: [{ id: 'decor.bed', gx: 2, gz: 2, rot: 0 }], wall: 'wall.cream', floor: 'floor.wood' });
    const w = HOME_SPACE.toWorld(2, 2);
    updateDecorSpot({ gx: 2, gz: 3 }, { x: w.x + 0.8, z: w.z });
    expect(useDecor.getState().near).toEqual({ id: 'decor.bed', gx: 2, gz: 2, rot: 0 });
    rotateNear();
    expect(homeOf(profile()).items[0].rot).toBe(1);
    pickUpNear();
    expect(homeOf(profile()).items).toEqual([]);
    expect(useDecor.getState().near).toBeNull();
  });

  it('同一個座標在島上找不到屋裡的家具', () => {
    makeKid(['decor.bed']);
    goInside();
    useGame.getState().saveHome({ items: [{ id: 'decor.bed', gx: 2, gz: 2, rot: 0 }], wall: 'wall.cream', floor: 'floor.wood' });
    goOutside();
    const w = HOME_SPACE.toWorld(2, 2);
    updateDecorSpot(null, { x: w.x + 0.8, z: w.z });
    expect(useDecor.getState().near).toBeNull();
  });
});

describe('壁紙地板', () => {
  it('surfaceChoices 只列擁有的（預設款本來就有），標出現在用的', () => {
    makeKid(['wall.sky', 'floor.check']);
    goInside();
    useGame.getState().saveHome({ items: [], wall: 'wall.sky', floor: 'floor.wood' });
    const c = surfaceChoices();
    expect(c.walls.map((w) => w.id)).toEqual(['wall.cream', 'wall.sky']);
    expect(c.floors.map((f) => f.id)).toEqual(['floor.wood', 'floor.check']);
    expect(c.wall).toBe('wall.sky');
    expect(c.floor).toBe('floor.wood');
  });
});
