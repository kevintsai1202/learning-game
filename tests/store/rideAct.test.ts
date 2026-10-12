/**
 * 班級島遊樂場（docs/plans/playground.md）第 ③、④ 段的純函式：
 * - frameOf：正在用的家具或遊樂器材，同一個入口算角色的樣子（家具照開始後幾秒、器材照牆上的時間與座位有沒有人）。
 * - actCodeNow：玩遊樂器材送座位代碼 rideN；伺服器還不支援（caps 沒有 ride）時送 sit，舊伺服器不會斷線。
 * - resolveSeat：搶同一個位子時 id 小的留著，自己被擠掉就換到下一個空位（沒有空位就起來）；器材被老師換掉也起來。
 * - 大動作鍵：旁邊有器材時「🎠 騎木馬」，坐滿了不能按；玩溜滑梯城堡時不能起來。
 */
import { describe, expect, it } from 'vitest';
import { frameOf } from '../../src/store/actFrame';
import { actFrame } from '../../src/store/furnitureUse';
import { HOME_SPACE } from '../../src/store/home';
import { PLAYGROUND_SPOTS, rideFrame, resolveSeat } from '../../src/store/playground';
import { actCodeNow } from '../../src/online/realtimeClient';
import { player, type PlayerAct } from '../../src/world/input';
import { pickAction, type ActionState } from '../../src/ui/actionKeyRules';

const NONE: ActionState = { picking: null, acting: null, zone: null, houseDoor: null, onMat: false, near: null, ride: null };

describe('frameOf：家具與遊樂器材同一個入口', () => {
  it('家具照開始後幾秒（和 actFrame 一樣）', () => {
    const act: PlayerAct = { kind: 'sit', item: { id: 'decor.bench', gx: 3, gz: 3, rot: 0 }, place: 'home', t0: 10 };
    expect(frameOf(act, { now: 12, wall: 999 }, () => [])).toEqual(actFrame(act.item, HOME_SPACE, 'sit', 2));
  });

  it('遊樂器材照牆上的時間、坐上去之後幾秒、這一座的座位有沒有人', () => {
    const act: PlayerAct = { kind: 'ride', ride: 'seesaw', slot: 2, seat: 0, t0: 10 };
    const occupied = [true, true, false, false];
    const f = frameOf(act, { now: 12, wall: 55 }, (slot) => (slot === 2 ? occupied : []));
    expect(f).toEqual(rideFrame('seesaw', 0, PLAYGROUND_SPOTS[2], { wall: 55, since: 2 }, occupied));
  });
});

describe('actCodeNow：送出的動作代碼', () => {
  it('玩遊樂器材送 rideN；伺服器不支援時送 sit；家具照舊；站著沒有', () => {
    player.act = { kind: 'ride', ride: 'carousel', slot: 0, seat: 4, t0: 0 };
    expect(actCodeNow(true)).toBe('ride4');
    expect(actCodeNow(false)).toBe('sit');
    player.act = { kind: 'swing', item: { id: 'decor.swing', gx: 1, gz: 1, rot: 0 }, place: 'yard', t0: 0 };
    expect(actCodeNow(true)).toBe('swing');
    player.act = null;
    expect(actCodeNow(true)).toBeUndefined();
  });
});

describe('resolveSeat：搶位子、器材被換掉', () => {
  it('沒人搶：座位不變', () => {
    expect(resolveSeat('carousel', { id: 'b', slot: 0, seat: 2 }, [{ id: 'c', slot: 0, seat: 3 }])).toEqual({ seat: 2 });
  });

  it('搶同一個位子：id 小的留著；自己 id 大就換到最近的空位', () => {
    expect(resolveSeat('carousel', { id: 'a', slot: 0, seat: 2 }, [{ id: 'b', slot: 0, seat: 2 }])).toEqual({ seat: 2 });
    const moved = resolveSeat('carousel', { id: 'b', slot: 0, seat: 2 }, [{ id: 'a', slot: 0, seat: 2 }]);
    expect(moved.seat).not.toBeNull();
    expect(moved.seat).not.toBe(2);
    // 別的位置的人不算
    expect(resolveSeat('carousel', { id: 'b', slot: 0, seat: 2 }, [{ id: 'a', slot: 1, seat: 2 }])).toEqual({ seat: 2 });
  });

  it('被擠掉又沒有空位：起來（seat 是 null）', () => {
    const others = [0, 1, 2, 3, 4, 5].map((seat) => ({ id: `a${seat}`, slot: 0, seat }));
    expect(resolveSeat('carousel', { id: 'z', slot: 0, seat: 2 }, others)).toEqual({ seat: null });
  });
});

describe('大動作鍵：遊樂器材', () => {
  it('旁邊有器材：主鍵是器材的動作（例如「🎠 騎木馬」）；坐滿了不能按、上面說坐滿了', () => {
    expect(pickAction({ ...NONE, ride: { name: '旋轉木馬', emoji: '🎠', label: '🎠 騎木馬', full: false } })).toMatchObject({
      main: 'ride',
      label: '🎠 騎木馬',
      disabled: false,
      container: 'ride-card',
    });
    expect(pickAction({ ...NONE, ride: { name: '旋轉木馬', emoji: '🎠', label: '🎠 騎木馬', full: true } })).toMatchObject({
      main: 'ride',
      disabled: true,
      showCaption: true,
      caption: '🎠 旋轉木馬坐滿了',
    });
  });

  it('玩的時候：起來＋換視角；溜滑梯城堡途中不能起來，大鍵是換視角', () => {
    expect(pickAction({ ...NONE, acting: { kind: 'ride', name: '旋轉木馬', emoji: '🎠' } })).toMatchObject({ main: 'stop', secondary: ['view'] });
    expect(pickAction({ ...NONE, acting: { kind: 'ride', name: '溜滑梯城堡', emoji: '🏰', locked: true } })).toMatchObject({ main: 'view' });
  });
});
