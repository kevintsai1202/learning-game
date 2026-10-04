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

describe('useGame：益智遊戲館', () => {
  const quizAnswers = [{ question: q('p'), correct: false, firstTry: false }];

  it('本機角色：玩完一局拿到金幣，回傳這局的金幣；不記錄雲端操作', () => {
    makeKid(false, 0);
    expect(useGame.getState().finishPuzzle({ game: 'memory', stars: 3 })).toEqual({ coins: 5, newBadges: [] });
    expect(useGame.getState().profile()!.coins).toBe(5);
    expect(recorded).toEqual([]);
  });

  it('今天的益智金幣拿滿了：這局 0 枚', () => {
    makeKid(false, 0);
    for (let i = 0; i < 4; i++) useGame.getState().finishPuzzle({ game: 'quiz', stars: 3 });
    expect(useGame.getState().finishPuzzle({ game: 'quiz', stars: 3 })).toEqual({ coins: 0, newBadges: [] });
    expect(useGame.getState().profile()!.coins).toBe(20);
  });

  it('雲端角色：記錄一筆 puzzle 操作（不帶金幣，由伺服器算），本機照同樣規則更新', () => {
    makeKid(true, 0);
    const r = useGame.getState().finishPuzzle({ game: 'quiz', stars: 2, answers: quizAnswers });
    expect(r.coins).toBe(3);
    const p = useGame.getState().profile()!;
    expect(p.coins).toBe(3);
    expect(Object.keys(p.wrongBook)).toEqual(['p']);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].op).toMatchObject({ kind: 'puzzle', game: 'quiz', stars: 2, answers: quizAnswers });
    expect(recorded[0].op).not.toHaveProperty('coins');
  });

  it('在益智遊戲館的遊玩時間帶 puzzle 旗標；其他地方的操作格式和以前一樣（沒有這個欄位）', () => {
    makeKid(true);
    useGame.getState().tickPlayTime(30, true);
    useGame.getState().tickPlayTime(30);
    expect(recorded[0].op).toMatchObject({ kind: 'playTime', seconds: 30, puzzle: true });
    expect(recorded[1].op).not.toHaveProperty('puzzle');
    const p = useGame.getState().profile()!;
    expect(Object.values(p.playLog)).toEqual([60]);
    expect(Object.values(p.puzzle!.days)).toEqual([{ seconds: 30, coins: 0 }]);
  });
});
