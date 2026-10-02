/**
 * useGame 的雲端角色路徑：本機先用 applyOp 套用，再把操作放進待送佇列；本機角色維持原本的行為。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSaveForTests, useGame } from '../../src/store/useGame';
import { onRecorded } from '../../src/online/storage';
import type { Op } from '../../src/online/ops';
import type { Question, SessionResult } from '../../src/core/types';
import type { Profile } from '../../src/store/save';

const q = (id: string): Question => ({ id, subject: 'math', skill: 'math.add', indicators: ['N-2-2'], prompt: id, type: 'number', answer: 1 });
const result: SessionResult = {
  activityId: 'math.add',
  subject: 'math',
  total: 2,
  correct: 1,
  stars: 1,
  coins: 3,
  seconds: 30,
  answers: [
    { question: q('a'), correct: true, firstTry: true },
    { question: q('b'), correct: false, firstTry: false },
  ],
};
const cloud = { server: 'https://island.example', room: '123456', roomName: '二年一班', accountId: 'a_1' };

/** 收集被記錄的操作 */
let recorded: { accountId: string; op: Op }[] = [];
let off: () => void;
beforeEach(() => {
  resetSaveForTests();
  recorded = [];
  off = onRecorded((accountId, op) => recorded.push({ accountId, op }));
});
afterEach(() => off());

/** 建立一位小朋友；cloudLinked 時加上雲端標記與金幣 */
function makeKid(cloudLinked: boolean, coins = 100): Profile {
  const g = useGame.getState();
  g.createProfile('小安', { animal: 'bear', color: '#8b5a2b', hat: null });
  const p = { ...useGame.getState().profile()!, coins, ...(cloudLinked ? { cloud } : {}) };
  useGame.getState().putProfile(p);
  return p;
}

describe('useGame：本機角色', () => {
  it('照原本的方式存檔，不記錄雲端操作', () => {
    makeKid(false);
    useGame.getState().finishSession(result);
    expect(useGame.getState().profile()!.coins).toBe(103);
    expect(recorded).toEqual([]);
  });
});

describe('useGame：雲端角色', () => {
  it('玩完一回合：本機依同樣規則更新，並記錄一筆 session 操作', () => {
    makeKid(true);
    useGame.getState().finishSession(result);
    const p = useGame.getState().profile()!;
    expect(p.coins).toBe(103);
    expect(Object.keys(p.wrongBook)).toEqual(['b']);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ accountId: 'a_1', op: { kind: 'session', result: { activityId: 'math.add' } } });
    expect(p.cloud).toEqual(cloud);
  });

  it('購買用目錄價格；金幣不夠時回傳 false，也不記錄', () => {
    makeKid(true, 100);
    expect(useGame.getState().purchase('hat.cap', 1)).toBe(true);
    expect(useGame.getState().profile()!.coins).toBe(70);
    expect(useGame.getState().purchase('hat.wizard', 150)).toBe(false);
    expect(useGame.getState().profile()!.coins).toBe(70);
    expect(recorded.map((r) => r.op.kind)).toEqual(['buy']);
  });

  it('戴沒有擁有的帽子：不變、不記錄；換動物可以', () => {
    makeKid(true);
    useGame.getState().updateAvatar({ animal: 'bear', color: '#8b5a2b', hat: 'hat.crown' });
    expect(useGame.getState().profile()!.avatar.hat).toBeNull();
    useGame.getState().updateAvatar({ animal: 'dog', color: '#8b5a2b', hat: null });
    expect(useGame.getState().profile()!.avatar.animal).toBe('dog');
    expect(recorded.map((r) => r.op.kind)).toEqual(['avatar']);
  });

  it('遊玩時間記成 playTime 操作', () => {
    makeKid(true);
    useGame.getState().tickPlayTime(30);
    expect(recorded.map((r) => r.op)).toEqual([expect.objectContaining({ kind: 'playTime', seconds: 30 })]);
    expect(Object.values(useGame.getState().profile()!.playLog)).toEqual([30]);
  });

  it('家長替不是目前角色的雲端角色改教材版本：記在那位角色的帳號', () => {
    const kid = makeKid(true);
    useGame.getState().createProfile('小美', { animal: 'cat', color: '#ffffff', hat: null });
    useGame.getState().updateCurriculum(kid.id, { zh: 'hanlin-zh', math: 'nani-math', term: '下' });
    expect(useGame.getState().save.profiles.find((p) => p.id === kid.id)!.curriculum.zh).toBe('hanlin-zh');
    expect(recorded).toEqual([{ accountId: 'a_1', op: expect.objectContaining({ kind: 'curriculum' }) }]);
  });
});
