/**
 * 自己的家第二期：進屋、出屋的狀態（src/store/useHome.ts）。在哪一間屋子裡要綁島主是誰：
 * 換島、回到標題時被迫出來（站到出生點）；熊熊老師換島時由 gmClient 傳送，這裡不動位置。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { enterHome, houseKeyOf, isInsideHome, leaveHome, setHouseKey, useHome } from '../../src/store/useHome';
import { player, teleport } from '../../src/world/input';
import { HOME_SPAWN, houseDoor } from '../../src/world/room';
import { HOUSE, SPAWN } from '../../src/world/layout';

beforeEach(() => {
  useHome.setState({ houseKey: null, inside: null, nearDoor: false, onMat: false });
  teleport(SPAWN);
});

describe('houseKeyOf：島上的小屋是誰的', () => {
  it('沒有小屋（班級島）是 null；自己的島是 mine；別人的島是島主的 id', () => {
    expect(houseKeyOf(false, null)).toBeNull();
    expect(houseKeyOf(false, { id: 'b' })).toBeNull();
    expect(houseKeyOf(true, null)).toBe('mine');
    expect(houseKeyOf(true, { id: 'b' })).toBe('b');
  });
});

describe('進屋與出屋', () => {
  it('島上沒有小屋時進不去', () => {
    expect(enterHome()).toBe(false);
    expect(isInsideHome()).toBe(false);
  });

  it('進屋：站到房間門口裡面、面向房間；出屋：站到小屋門口、背對小屋', () => {
    setHouseKey('mine');
    useHome.setState({ nearDoor: true });
    expect(enterHome()).toBe(true);
    expect(useHome.getState().inside).toBe('mine');
    expect(useHome.getState().nearDoor).toBe(false);
    expect(isInsideHome()).toBe(true);
    expect(player.pos).toEqual({ x: HOME_SPAWN.x, z: HOME_SPAWN.z });
    expect(player.heading).toBeCloseTo(Math.PI);
    useHome.setState({ onMat: true });
    leaveHome();
    expect(useHome.getState().inside).toBeNull();
    expect(useHome.getState().onMat).toBe(false);
    expect(player.pos).toEqual(houseDoor());
    expect(player.heading).toBeCloseTo(HOUSE.rotY);
  });

  it('同一座島（島主沒變）：留在屋裡', () => {
    setHouseKey('b');
    enterHome();
    setHouseKey('b');
    expect(useHome.getState().inside).toBe('b');
  });

  it('換島（島主變了、沒有小屋）：被迫出來，站到出生點', () => {
    setHouseKey('b');
    enterHome();
    setHouseKey('mine');
    expect(useHome.getState().inside).toBeNull();
    expect(player.pos).toEqual({ x: SPAWN.x, z: SPAWN.z });
    setHouseKey('mine');
    enterHome();
    setHouseKey(null);
    expect(useHome.getState().inside).toBeNull();
  });

  it('熊熊老師換島：被迫出來，位置交給 gmClient（不動）', () => {
    setHouseKey('b');
    enterHome();
    teleport({ x: 1.8, z: -1.5 });
    setHouseKey(null, { teacher: true });
    expect(useHome.getState().inside).toBeNull();
    expect(player.pos).toEqual({ x: 1.8, z: -1.5 });
  });
});
