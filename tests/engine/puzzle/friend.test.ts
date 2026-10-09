/**
 * 和朋友益智對戰的規則（純函式，島嶼互訪 I4）：伺服器排好先後的動作，兩台裝置依序套用同一套規則。
 * 自己是 kid、對方是 bot（沿用和機器人比賽的狀態）；同一串動作在兩邊的視角互為鏡像。
 * 規格見 docs/plans/islands.md 第 12 節「I4 實作設計」。
 */
import { describe, expect, it } from 'vitest';
import {
  foldDuel,
  friendDuelStep,
  friendMemoryStep,
  friendSpotStep,
  friendTangramStep,
  startFriendDuel,
  startFriendMemory,
  startFriendSpot,
  startFriendTangram,
  type DuelEvent,
} from '../../../src/engine/puzzle/friend';
import { makeMemoryDeck, type MemoryDeck } from '../../../src/engine/puzzle/memory';
import { TANGRAM_PIECES } from '../../../src/engine/puzzle/tangram';

/** 換成對方的視角：kid 與 bot 對調 */
const mirror = (events: DuelEvent[]): DuelEvent[] => events.map((e) => ({ ...e, by: e.by === 'kid' ? 'bot' : 'kid' }));

describe('搶答（益智搶答、積木大師）', () => {
  /** 三題的正解 */
  const answers = [2, 0, 3];
  const step = (s: ReturnType<typeof startFriendDuel>, e: DuelEvent) => friendDuelStep(s, e, (i) => answers[i], answers.length);

  it('先收到的答對得分；答錯的人這一題不能再答', () => {
    let s = startFriendDuel();
    s = step(s, { by: 'bot', k: 'pick', i: 0, n: 1 });
    expect(s.duel.botOut).toBe(true);
    expect(s.botPick).toBe(1);
    // 答錯的人再答不算
    expect(step(s, { by: 'bot', k: 'pick', i: 0, n: 2 })).toBe(s);
    s = step(s, { by: 'kid', k: 'pick', i: 0, n: 2 });
    expect(s.duel).toMatchObject({ kid: 1, bot: 0, phase: 'kid' });
    expect(s.kidPick).toBe(2);
  });

  it('兩個都答對時先收到的算；這一題有結果後的作答不算', () => {
    let s = startFriendDuel();
    s = step(s, { by: 'bot', k: 'pick', i: 0, n: 2 });
    expect(s.duel).toMatchObject({ bot: 1, phase: 'bot' });
    expect(step(s, { by: 'kid', k: 'pick', i: 0, n: 2 })).toBe(s);
  });

  it('不是這一題的作答與 ready 都不算', () => {
    const s = startFriendDuel();
    expect(step(s, { by: 'kid', k: 'pick', i: 1, n: 0 })).toBe(s);
    const resolved = step(s, { by: 'kid', k: 'pick', i: 0, n: 2 });
    expect(step(resolved, { by: 'kid', k: 'ready', i: 1 })).toBe(resolved);
  });

  it('還在搶的時候 ready 不算；有結果後第一個 ready 就換下一題，晚到的 ready 不算', () => {
    let s = startFriendDuel();
    expect(step(s, { by: 'kid', k: 'ready', i: 0 })).toBe(s);
    s = step(s, { by: 'kid', k: 'pick', i: 0, n: 2 });
    s = step(s, { by: 'bot', k: 'ready', i: 0 });
    expect(s.duel).toMatchObject({ index: 1, phase: 'open', kidOut: false, botOut: false });
    expect(s.kidPick).toBeNull();
    expect(s.botPick).toBeNull();
    expect(step(s, { by: 'kid', k: 'ready', i: 0 })).toBe(s);
  });

  it('最後一題有結果後 ready 就結束；兩邊的比分互為鏡像', () => {
    const events: DuelEvent[] = [
      { by: 'kid', k: 'pick', i: 0, n: 2 },
      { by: 'kid', k: 'ready', i: 0 },
      { by: 'bot', k: 'pick', i: 1, n: 0 },
      { by: 'bot', k: 'ready', i: 1 },
      { by: 'kid', k: 'pick', i: 2, n: 1 },
      { by: 'bot', k: 'pick', i: 2, n: 3 },
      { by: 'kid', k: 'ready', i: 2 },
    ];
    const a = foldDuel(events, startFriendDuel(), step);
    const b = foldDuel(mirror(events), startFriendDuel(), step);
    expect(a.duel).toMatchObject({ kid: 1, bot: 2, done: true });
    expect(b.duel).toMatchObject({ kid: 2, bot: 1, done: true });
  });

  it('不認得的動作不改狀態', () => {
    const s = startFriendDuel();
    expect(step(s, { by: 'kid', k: 'flip', i: 0 })).toBe(s);
  });
});

describe('記憶翻牌', () => {
  /** 固定的一副牌：0 1 0 1 2 2（第幾對） */
  const deck: MemoryDeck = {
    kind: 'mul',
    cards: [0, 1, 0, 1, 2, 2].map((pair) => ({ pair, face: { text: String(pair) } })),
  };

  it('先手照指定：被邀請的人那一邊開局是對方先翻', () => {
    expect(startFriendMemory(deck, 'kid').turn).toBe('kid');
    expect(startFriendMemory(deck, 'bot').turn).toBe('bot');
    expect(startFriendMemory(deck, 'bot').mode).toBe('vs');
  });

  it('沒輪到的人翻牌不算', () => {
    const s = startFriendMemory(deck, 'kid');
    expect(friendMemoryStep(s, { by: 'bot', k: 'flip', i: 0 })).toBe(s);
  });

  it('不同對的兩張在下一次翻牌前蓋回去、換人；配對成功可以再翻', () => {
    let s = startFriendMemory(deck, 'kid');
    s = friendMemoryStep(s, { by: 'kid', k: 'flip', i: 0 });
    s = friendMemoryStep(s, { by: 'kid', k: 'flip', i: 1 });
    expect(s.open).toEqual([0, 1]);
    // 換對方翻：先蓋回去再翻
    s = friendMemoryStep(s, { by: 'bot', k: 'flip', i: 0 });
    expect(s.turn).toBe('bot');
    expect(s.open).toEqual([0]);
    s = friendMemoryStep(s, { by: 'bot', k: 'flip', i: 2 });
    expect(s.scores).toEqual({ kid: 0, bot: 1 });
    expect(s.turn).toBe('bot');
  });

  it('兩張不同對還開著時，原本的人不能再翻（蓋回去之後已經換人）', () => {
    let s = startFriendMemory(deck, 'kid');
    s = friendMemoryStep(s, { by: 'kid', k: 'flip', i: 0 });
    s = friendMemoryStep(s, { by: 'kid', k: 'flip', i: 1 });
    const after = friendMemoryStep(s, { by: 'kid', k: 'flip', i: 4 });
    // 蓋回去、換人之後 kid 不能翻；這次翻牌不算，但蓋回去兩邊一樣
    expect(after.open).toEqual([]);
    expect(after.turn).toBe('bot');
  });

  it('同一串動作兩邊互為鏡像：配完時比分相反', () => {
    const events: DuelEvent[] = [
      { by: 'kid', k: 'flip', i: 0 },
      { by: 'kid', k: 'flip', i: 2 },
      { by: 'kid', k: 'flip', i: 1 },
      { by: 'kid', k: 'flip', i: 4 },
      { by: 'bot', k: 'flip', i: 4 },
      { by: 'bot', k: 'flip', i: 5 },
      { by: 'bot', k: 'flip', i: 1 },
      { by: 'bot', k: 'flip', i: 3 },
    ];
    const a = foldDuel(events, startFriendMemory(deck, 'kid'), friendMemoryStep);
    const b = foldDuel(mirror(events), startFriendMemory(deck, 'bot'), friendMemoryStep);
    expect(a).toMatchObject({ done: true, scores: { kid: 1, bot: 2 } });
    expect(b).toMatchObject({ done: true, scores: { kid: 2, bot: 1 } });
  });

  it('真的牌組也能用（makeMemoryDeck）', () => {
    const real = makeMemoryDeck(123, 1);
    const s = friendMemoryStep(startFriendMemory(real, 'kid'), { by: 'kid', k: 'flip', i: 3 });
    expect(s.open).toEqual([3]);
  });
});

describe('找不同', () => {
  it('先收到的 claim 算他的，已經被找到的不能再搶', () => {
    let s = startFriendSpot(3);
    s = friendSpotStep(s, { by: 'bot', k: 'claim', i: 1 });
    expect(s.found).toEqual([null, 'bot', null]);
    expect(friendSpotStep(s, { by: 'kid', k: 'claim', i: 1 })).toBe(s);
  });

  it('不在範圍的處不算', () => {
    const s = startFriendSpot(3);
    expect(friendSpotStep(s, { by: 'kid', k: 'claim', i: 3 })).toBe(s);
    expect(friendSpotStep(s, { by: 'kid', k: 'claim' })).toBe(s);
  });

  it('全部找到就結束', () => {
    const s = foldDuel(
      [
        { by: 'kid', k: 'claim', i: 0 },
        { by: 'bot', k: 'claim', i: 1 },
        { by: 'kid', k: 'claim', i: 2 },
      ],
      startFriendSpot(3),
      friendSpotStep,
    );
    expect(s.done).toBe(true);
    expect(s.found).toEqual(['kid', 'bot', 'kid']);
  });

  it('第一個 time 就結束，之後的 claim 不算', () => {
    let s = startFriendSpot(3);
    s = friendSpotStep(s, { by: 'kid', k: 'claim', i: 0 });
    s = friendSpotStep(s, { by: 'bot', k: 'time' });
    expect(s.done).toBe(true);
    expect(friendSpotStep(s, { by: 'bot', k: 'claim', i: 1 })).toBe(s);
  });
});

describe('七巧板', () => {
  it('對方的進度照 progress（0～7）；自己的 progress 不記', () => {
    let s = startFriendTangram();
    s = friendTangramStep(s, { by: 'bot', k: 'progress', n: 3 });
    expect(s.botPlaced).toBe(3);
    expect(friendTangramStep(s, { by: 'kid', k: 'progress', n: 5 })).toBe(s);
    expect(friendTangramStep(s, { by: 'bot', k: 'progress', n: 99 }).botPlaced).toBe(TANGRAM_PIECES.length);
  });

  it('第一個 done 的人贏；之後的 done 與 progress 不算', () => {
    let s = startFriendTangram();
    s = friendTangramStep(s, { by: 'kid', k: 'done' });
    expect(s.winner).toBe('kid');
    expect(friendTangramStep(s, { by: 'bot', k: 'done' })).toBe(s);
    expect(friendTangramStep(s, { by: 'bot', k: 'progress', n: 6 })).toBe(s);
  });

  it('對方先拼完時，對方的進度是 7 塊', () => {
    const s = friendTangramStep(startFriendTangram(), { by: 'bot', k: 'done' });
    expect(s).toEqual({ botPlaced: TANGRAM_PIECES.length, winner: 'bot' });
  });
});
