/**
 * 班級島大型設施（docs/plans/grand-rides.md）第 ④ 段：玩的規則（狀態與動作，不含畫面）。
 * - 付錢：useGame.payGrand 扣 5 金幣、雲端角色記一筆 grand 操作；伺服器不支援時絕對不排進佇列（舊伺服器會整批退回）。
 * - 上車：startGrand 照班次（停站中才能上）、金幣、伺服器支援、空位；熊熊老師免費。
 * - 角色的樣子（frameOf）：雲霄飛車出發前在站上、跑完 done；飛船甲板上的局部座標；摩天輪轉一圈 done。
 * - 起來：途中不行，跑完站到下車站。
 * - 送出的動作代碼與座標：co、wh、sh（飛船送甲板上的局部座標）；伺服器不支援時不送新代碼。
 * - 大動作鍵：價錢、倒數、金幣不夠、坐滿了；坐上去之後是換視角，等出發時上面寫倒數。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSaveForTests, useGame } from '../../src/store/useGame';
import { onRecorded } from '../../src/online/storage';
import type { Op } from '../../src/online/ops';
import { resetClockSync, setServerNow, wallSec } from '../../src/store/clockSync';
import { COASTER_BOARD, MAST, SHIP, SHIP_CYCLE, STATION, WHEEL, coaster, coasterSeatFrame, grandExit } from '../../src/store/grandRides';
import { grandBlock, setRemoteGrand, startGrand, useGrand } from '../../src/store/useGrand';
import { frameOf } from '../../src/store/actFrame';
import { stopUse } from '../../src/store/useFurnitureUse';
import { actCodeNow, movePayload, useRealtime } from '../../src/online/realtimeClient';
import { player } from '../../src/world/input';
import { pickAction, type ActionState } from '../../src/ui/actionKeyRules';

const cloud = { server: 'https://island.example', accountId: 'a_1', rooms: [{ code: '123456', name: '二年一班' }] };
let recorded: { accountId: string; op: Op }[] = [];
let off: () => void;

/** 建立一位雲端角色的小朋友（金幣可以指定） */
function makeKid(coins: number, cloudLinked = true): void {
  const g = useGame.getState();
  g.createProfile('小安', { animal: 'bear', color: '#8b5a2b', hat: null });
  useGame.getState().putProfile({ ...useGame.getState().profile()!, coins, ...(cloudLinked ? { cloud } : {}) });
}
/** 把牆上的時間撥到 sec 秒（照對時的做法） */
function setWall(sec: number): void {
  setServerNow(sec * 1000, Date.now());
}
const coins = () => useGame.getState().profile()!.coins;
const NONE = { picking: null, acting: null, zone: null, houseDoor: null, onMat: false, near: null, ride: null, grand: null } satisfies ActionState;

beforeEach(() => {
  resetSaveForTests();
  recorded = [];
  off = onRecorded((accountId, op) => recorded.push({ accountId, op }));
  player.act = null;
  player.pos = { x: -8, z: 20 };
  useRealtime.setState({ grand: true });
  useGrand.setState({ near: null, riders: {} });
});
afterEach(() => {
  off();
  resetClockSync();
  player.act = null;
});

describe('付錢', () => {
  it('雲端角色：扣 5 金幣、記一筆 grand 操作；伺服器不支援時不扣、不記（舊伺服器會把整批退回）；金幣不夠不行', () => {
    makeKid(12);
    expect(useGame.getState().payGrand('coaster', true)).toBe(true);
    expect(coins()).toBe(7);
    expect(recorded.map((r) => r.op.kind)).toEqual(['grand']);
    expect(useGame.getState().payGrand('wheel', false)).toBe(false);
    expect(coins()).toBe(7);
    expect(recorded).toHaveLength(1);
    useGame.getState().putProfile({ ...useGame.getState().profile()!, coins: 4 });
    expect(useGame.getState().payGrand('ship', true)).toBe(false);
    expect(coins()).toBe(4);
  });

  it('本機角色直接扣', () => {
    makeKid(9, false);
    expect(useGame.getState().payGrand('ship', false)).toBe(true);
    expect(coins()).toBe(4);
    expect(recorded).toEqual([]);
  });
});

describe('上車', () => {
  const cc = () => coaster().cycle;

  it('雲霄飛車停站時在月台上按：付 5 金幣、坐離自己最近的空位、記下第幾班；坐上去後不能再上', () => {
    makeKid(12);
    setWall(cc() * 1000 + 5);
    expect(grandBlock('coaster', { free: false })).toBeNull();
    expect(startGrand('coaster', { free: false })).toBe(true);
    expect(coins()).toBe(7);
    const act = player.act!;
    expect(act).toMatchObject({ kind: 'grand', ride: 'coaster', run: 1000 });
    expect(act.kind === 'grand' && act.seat).toBeGreaterThanOrEqual(0);
    // 站到座位上（下一則位置訊息就是座位）
    const f = coasterSeatFrame(act.kind === 'grand' ? act.seat : 0, 0);
    expect(player.pos.x).toBeCloseTo(f.x, 6);
    expect(startGrand('coaster', { free: false })).toBe(false);
    expect(coins()).toBe(7);
  });

  it('開走了不能上（按鈕寫下一班幾秒）；金幣不夠、伺服器不支援、坐滿了都不能上，不扣錢', () => {
    makeKid(12);
    setWall(cc() * 1000 + COASTER_BOARD + 3);
    expect(grandBlock('coaster', { free: false })).toMatch(/^下一班 \d+ 秒$/);
    expect(startGrand('coaster', { free: false })).toBe(false);
    setWall(cc() * 1000 + 3);
    useRealtime.setState({ grand: false });
    expect(grandBlock('coaster', { free: false })).toBe('稍後再來');
    expect(startGrand('coaster', { free: false })).toBe(false);
    useRealtime.setState({ grand: true });
    useGame.getState().putProfile({ ...useGame.getState().profile()!, coins: 4 });
    expect(grandBlock('coaster', { free: false })).toBe('要 5 金幣');
    expect(startGrand('coaster', { free: false })).toBe(false);
    useGame.getState().putProfile({ ...useGame.getState().profile()!, coins: 50 });
    for (let i = 0; i < 24; i++) setRemoteGrand(`k${i}`, { ride: 'coaster', seat: i });
    expect(grandBlock('coaster', { free: false })).toBe('坐滿了');
    expect(startGrand('coaster', { free: false })).toBe(false);
    expect(coins()).toBe(50);
    expect(recorded).toEqual([]);
  });

  it('熊熊老師免費（沒有角色也可以）', () => {
    setWall(SHIP_CYCLE * 500 + 4);
    player.pos = { ...MAST.board };
    expect(grandBlock('ship', { free: true })).toBeNull();
    expect(startGrand('ship', { free: true })).toBe(true);
    expect(player.act).toMatchObject({ kind: 'grand', ride: 'ship', run: 500, deck: { x: SHIP.boardAt.x, z: SHIP.boardAt.z, h: SHIP.boardAt.h } });
    expect(recorded).toEqual([]);
  });

  it('摩天輪隨時能上：坐進最靠近底部的車廂', () => {
    makeKid(5);
    setWall(777.7);
    player.pos = { ...WHEEL.board };
    expect(startGrand('wheel', { free: false })).toBe(true);
    expect(coins()).toBe(0);
    const act = player.act!;
    expect(act).toMatchObject({ kind: 'grand', ride: 'wheel' });
    expect(Math.abs(act.kind === 'grand' ? act.w0 - wallSec() : 99)).toBeLessThan(0.5);
  });
});

describe('角色的樣子、起來', () => {
  const occupied = () => [];
  const clockAt = (wall: number) => ({ now: performance.now() / 1000, wall });

  it('雲霄飛車：出發前在站上；跑完 done；途中不能起來，跑完站到月台', () => {
    const cc = coaster().cycle;
    player.act = { kind: 'grand', ride: 'coaster', seat: 3, run: 10, w0: cc * 10 + 2, t0: 0, deck: null, target: null };
    const before = frameOf(player.act, clockAt(cc * 10 + 10), occupied);
    expect(before.x).toBeCloseTo(coasterSeatFrame(3, 0).x, 6);
    expect(before.quat).toBeDefined();
    const mid = frameOf(player.act, clockAt(cc * 10 + COASTER_BOARD + 20), occupied);
    expect(Math.hypot(mid.x - before.x, mid.z - before.z)).toBeGreaterThan(5);
    expect(mid.done).toBe(false);
    expect(frameOf(player.act, clockAt(cc * 11 + 0.1), occupied).done).toBe(true);
    stopUse();
    expect(player.act).not.toBeNull();
    stopUse(true);
    expect(player.act).toBeNull();
    expect(player.pos).toEqual(grandExit('coaster'));
    expect(STATION.exit).toEqual(grandExit('coaster'));
  });

  it('飛船：甲板上的局部座標換成世界座標、甲板的高度；降落後 done；摩天輪轉一圈 done', () => {
    const deck = { x: -1, z: 2, h: 0.5 };
    player.act = { kind: 'grand', ride: 'ship', seat: 0, run: 3, w0: SHIP_CYCLE * 3 + 1, t0: 0, deck, target: null };
    const f = frameOf(player.act, clockAt(SHIP_CYCLE * 3 + 5), occupied);
    expect(f.y).toBeCloseTo(SHIP.deckY, 6);
    expect(f.pose).toBe('stand');
    expect(frameOf(player.act, clockAt(SHIP_CYCLE * 3 + SHIP.board + 50), occupied).y).toBeGreaterThan(SHIP.deckY + 5);
    expect(frameOf(player.act, clockAt(SHIP_CYCLE * 4 + 0.1), occupied).done).toBe(true);
    player.act = { kind: 'grand', ride: 'wheel', seat: 7, run: 0, w0: 100, t0: 0, deck: null, target: null };
    expect(frameOf(player.act, clockAt(150), occupied).done).toBe(false);
    expect(frameOf(player.act, clockAt(100 + WHEEL.period + 0.1), occupied).done).toBe(true);
  });
});

describe('送出的動作代碼與座標', () => {
  it('雲霄飛車 coN、摩天輪 whN、飛船 sh 送甲板上的局部座標；伺服器不支援 grand 時不送新代碼', () => {
    player.act = { kind: 'grand', ride: 'coaster', seat: 5, run: 0, w0: 0, t0: 0, deck: null, target: null };
    expect(actCodeNow(['ride', 'grand'])).toBe('co5');
    expect(actCodeNow(['ride'])).toBe('sit');
    player.act = { kind: 'grand', ride: 'wheel', seat: 47, run: 0, w0: 0, t0: 0, deck: null, target: null };
    expect(actCodeNow(['grand'])).toBe('wh47');
    player.act = { kind: 'grand', ride: 'ship', seat: 0, run: 0, w0: 0, t0: 0, deck: { x: 1.2, z: -3, h: 0.4 }, target: null };
    player.pos = { x: -27, z: -5 };
    player.heading = 2;
    expect(movePayload(['grand'])).toEqual({ x: 1.2, z: -3, h: 0.4, a: 'sh' });
    player.act = null;
    expect(movePayload(['grand'])).toEqual({ x: -27, z: -5, h: 2 });
  });
});

describe('大動作鍵', () => {
  it('旁邊的設施：按鈕寫價錢；不能上時上面寫原因、不能按', () => {
    const v = pickAction({ ...NONE, grand: { name: '雲霄飛車', emoji: '🎢', label: '🎢 上車 5🪙', blocked: null } })!;
    expect(v).toMatchObject({ main: 'grand', label: '🎢 上車 5🪙', disabled: false, container: 'grand-card', showCaption: false });
    const b = pickAction({ ...NONE, grand: { name: '雲霄飛車', emoji: '🎢', label: '🎢 上車 5🪙', blocked: '下一班 23 秒' } })!;
    expect(b).toMatchObject({ main: 'grand', disabled: true, showCaption: true, caption: '🎢 下一班 23 秒' });
  });

  it('坐上去之後：大鍵是換視角（途中不能下來）；等出發時上面寫倒數', () => {
    const v = pickAction({ ...NONE, acting: { kind: 'grand', name: '雲霄飛車', emoji: '🎢', locked: true, wait: '⏳ 12 秒後出發' } })!;
    expect(v).toMatchObject({ main: 'view', caption: '⏳ 12 秒後出發', showCaption: true });
    const w = pickAction({ ...NONE, acting: { kind: 'grand', name: '摩天輪', emoji: '🎡', locked: true, wait: null } })!;
    expect(w).toMatchObject({ main: 'view', showCaption: false });
  });
});
