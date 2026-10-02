import { describe, expect, it } from 'vitest';
import { applyOp, normalizeOpTime, opSchema, PLAYTIME_OP_MAX, type Op } from '../../src/online/ops';
import { addPlayTime, addProfile, buyItem, createEmptySave, recordSession, setAvatar, setCurriculum, setTitle, type Profile, type SaveData } from '../../src/store/save';
import type { AnswerRecord, Question, SessionResult } from '../../src/core/types';

const q = (id: string): Question => ({ id, subject: 'math', skill: 'math.add', indicators: ['N-2-2'], prompt: id, type: 'number', answer: 1 });

/** 依作答紀錄組出「誠實的」回合結果（星數、金幣與 summarize 的算法相同） */
const session = (answers: AnswerRecord[]): SessionResult => {
  const correct = answers.filter((a) => a.firstTry).length;
  const ratio = correct / answers.length;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
  return { activityId: 'math.add', subject: 'math', total: answers.length, correct, stars, coins: correct + stars * 2, seconds: 90, answers };
};

const NOW = new Date('2026-10-02T10:00:00+08:00');
const AT = '2026-10-02T09:30:00+08:00';

/** 一位有 200 金幣的小朋友 */
function kid(): Profile {
  const s = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW);
  return { ...s.profiles[0], coins: 200 };
}

/** 依序套用操作，遇到拒絕就讓測試失敗 */
function applyAll(p: Profile, ops: Op[]): Profile {
  return ops.reduce((acc, op) => {
    const r = applyOp(acc, op, NOW);
    if (!r.ok) throw new Error(`操作 ${op.id} 被拒絕：${r.reason}`);
    return r.profile;
  }, p);
}

const answers: AnswerRecord[] = [
  { question: q('a'), correct: true, firstTry: true },
  { question: q('b'), correct: true, firstTry: false },
  { question: q('c'), correct: false, firstTry: false },
];

describe('操作套用：與本機現有路徑結果相同（核心不變量）', () => {
  it('同一串操作，用 applyOp 和用 save.ts 原本的函式算出的存檔完全一樣', () => {
    const start = kid();
    const result = session(answers);
    const ops: Op[] = [
      { id: 'o1', at: AT, kind: 'session', result },
      { id: 'o2', at: AT, kind: 'playTime', seconds: 300 },
      { id: 'o3', at: AT, kind: 'buy', itemId: 'hat.cap' },
      { id: 'o4', at: AT, kind: 'avatar', avatar: { animal: 'cat', color: '#ffffff', hat: 'hat.cap' } },
      { id: 'o5', at: AT, kind: 'curriculum', curriculum: { zh: 'hanlin-zh', math: 'kanghsuan-math', term: '下' } },
    ];
    const viaOps = applyAll(start, ops);

    // 本機現有的路徑（useGame 原本呼叫的函式）
    const at = new Date(AT);
    let s: SaveData = { ...createEmptySave(), profiles: [start], activeProfileId: start.id };
    s = recordSession(s, start.id, result, at);
    s = addPlayTime(s, start.id, 300, at);
    s = buyItem(s, start.id, 'hat.cap', 30);
    s = setAvatar(s, start.id, { animal: 'cat', color: '#ffffff', hat: 'hat.cap' });
    s = setCurriculum(s, start.id, { zh: 'hanlin-zh', math: 'kanghsuan-math', term: '下' });

    expect(viaOps).toEqual(s.profiles[0]);
    expect(viaOps.wrongBook).toHaveProperty('b');
    expect(viaOps.wrongBook).toHaveProperty('c');
  });
});

describe('操作套用：回合', () => {
  it('星數與金幣由伺服器重算，不信任裝置送來的數字', () => {
    const honest = session(answers);
    const tampered = { ...honest, correct: 3, stars: 3, coins: 999 };
    const r = applyOp(kid(), { id: 'o1', at: AT, kind: 'session', result: tampered }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.coins).toBe(200 + honest.coins);
    expect(r.profile.history[0]).toMatchObject({ correct: 1, stars: honest.stars, coins: honest.coins });
  });

  it('作答筆數比題數多就拒絕', () => {
    const bad = { ...session(answers), total: 2 };
    const r = applyOp(kid(), { id: 'o1', at: AT, kind: 'session', result: bad }, NOW);
    expect(r).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('日期用操作發生的時間，不是伺服器收到的時間', () => {
    const r = applyOp(kid(), { id: 'o1', at: '2026-09-28T20:00:00+08:00', kind: 'session', result: session(answers) }, NOW);
    expect(r.ok && r.profile.history[0].date).toBe('2026-09-28');
  });
});

describe('操作套用：遊玩時間、購買、外觀', () => {
  it(`單筆遊玩時間超過 ${PLAYTIME_OP_MAX} 秒改成 ${PLAYTIME_OP_MAX}，不拒絕`, () => {
    const r = applyOp(kid(), { id: 'o1', at: AT, kind: 'playTime', seconds: 2400 }, NOW);
    expect(r.ok && r.profile.playLog['2026-10-02']).toBe(PLAYTIME_OP_MAX);
  });

  it('價格查目錄：金幣不夠或商品不存在就拒絕', () => {
    const poor = { ...kid(), coins: 10 };
    expect(applyOp(poor, { id: 'o1', at: AT, kind: 'buy', itemId: 'hat.crown' }, NOW)).toEqual({ ok: false, reason: '金幣不夠' });
    expect(applyOp(kid(), { id: 'o2', at: AT, kind: 'buy', itemId: 'hat.nope' }, NOW).ok).toBe(false);
    const r = applyOp(kid(), { id: 'o3', at: AT, kind: 'buy', itemId: 'hat.crown' }, NOW);
    expect(r.ok && r.profile.coins).toBe(80);
  });

  it('只能戴已經擁有的帽子；不戴帽子一定可以', () => {
    expect(applyOp(kid(), { id: 'o1', at: AT, kind: 'avatar', avatar: { animal: 'dog', color: '#ffffff', hat: 'hat.crown' } }, NOW).ok).toBe(false);
    const r = applyOp(kid(), { id: 'o2', at: AT, kind: 'avatar', avatar: { animal: 'dog', color: '#ffffff', hat: null } }, NOW);
    expect(r.ok && r.profile.avatar.animal).toBe('dog');
  });

  it('可以換成新增的 8 種動物（例如卡皮巴拉）；不存在的動物格式驗證失敗', () => {
    for (const animal of ['capybara', 'panda', 'penguin', 'fox', 'koala', 'pig', 'eagle', 'elephant'] as const) {
      const op = { id: `a-${animal}`, at: AT, kind: 'avatar', avatar: { animal, color: '#8b5a2b', hat: null } } as const;
      expect(opSchema.safeParse(op).success, animal).toBe(true);
      const r = applyOp(kid(), op, NOW);
      expect(r.ok && r.profile.avatar.animal).toBe(animal);
    }
    expect(opSchema.safeParse({ id: 'x', at: AT, kind: 'avatar', avatar: { animal: 'dragon', color: '#8b5a2b', hat: null } }).success).toBe(false);
  });

  it('不改動傳入的存檔（不可變更新）', () => {
    const p = kid();
    const before = JSON.stringify(p);
    applyOp(p, { id: 'o1', at: AT, kind: 'session', result: session(answers) }, NOW);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('操作套用：稱號（R1）', () => {
  it('只能選已得到、而且有稱號的獎章；沒得到的拒絕', () => {
    const fresh = kid();
    expect(applyOp(fresh, { id: 't1', at: AT, kind: 'title', badge: 'first-adventure' }, NOW)).toEqual({ ok: false, reason: '還沒有這個稱號' });
    const played = applyAll(fresh, [{ id: 's1', at: AT, kind: 'session', result: session(answers) }]);
    const r = applyOp(played, { id: 't2', at: AT, kind: 'title', badge: 'first-adventure' }, NOW);
    expect(r.ok && r.profile.title).toBe('first-adventure');
    const cleared = applyOp(played, { id: 't3', at: AT, kind: 'title', badge: null }, NOW);
    expect(cleared.ok && cleared.profile.title).toBeNull();
  });

  it('稱號操作和本機的 setTitle 結果相同', () => {
    const played = applyAll(kid(), [{ id: 's1', at: AT, kind: 'session', result: session(answers) }]);
    const viaOp = applyAll(played, [{ id: 't1', at: AT, kind: 'title', badge: 'first-adventure' }]);
    const local = setTitle({ ...createEmptySave(), profiles: [played], activeProfileId: played.id }, played.id, 'first-adventure').profiles[0];
    expect(viaOp).toEqual(local);
  });
});

describe('操作時間修正', () => {
  it('一般情況不變；比伺服器現在晚的改成現在；比 90 天前早的改成 90 天前', () => {
    expect(normalizeOpTime(AT, NOW).toISOString()).toBe(new Date(AT).toISOString());
    expect(normalizeOpTime('2026-10-03T10:00:00+08:00', NOW).getTime()).toBe(NOW.getTime());
    const old = normalizeOpTime('2025-01-01T00:00:00+08:00', NOW);
    expect(NOW.getTime() - old.getTime()).toBe(90 * 24 * 3600 * 1000);
  });

  it('兩週前離線玩的進度照收，日期維持兩週前', () => {
    const r = applyOp(kid(), { id: 'o1', at: '2026-09-18T15:00:00+08:00', kind: 'playTime', seconds: 120 }, NOW);
    expect(r.ok && r.profile.playLog['2026-09-18']).toBe(120);
  });

  it('看不懂的時間字串改成現在', () => {
    expect(normalizeOpTime('not a date', NOW).getTime()).toBe(NOW.getTime());
  });
});

describe('操作格式驗證', () => {
  it('合法的操作可以通過；未知種類、缺 id、秒數不是正數都不行', () => {
    expect(opSchema.safeParse({ id: 'o1', at: AT, kind: 'playTime', seconds: 30 }).success).toBe(true);
    expect(opSchema.safeParse({ id: 'o1', at: AT, kind: 'hack', seconds: 30 }).success).toBe(false);
    expect(opSchema.safeParse({ at: AT, kind: 'playTime', seconds: 30 }).success).toBe(false);
    expect(opSchema.safeParse({ id: 'o1', at: AT, kind: 'playTime', seconds: 0 }).success).toBe(false);
  });

  it('回合操作裡的題目只檢查基本欄位（和錯題本相同的寬鬆規則）', () => {
    const op = { id: 'o1', at: AT, kind: 'session', result: session(answers) };
    expect(opSchema.safeParse(op).success).toBe(true);
    const noSkill = { ...op, result: { ...op.result, answers: [{ question: { id: 'x', type: 'number', prompt: 'x' }, correct: true, firstTry: true }] } };
    expect(opSchema.safeParse(noSkill).success).toBe(false);
  });
});
