import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoom, joinRoom, makeClient, openTestDb, resetDb, fakeClock } from './helpers';
import type { Db } from '../../server/db';
import type { Op } from '../../src/online/ops';
import { addProfile, createEmptySave } from '../../src/store/save';
import type { Question } from '../../src/core/types';

let db: Db;
beforeAll(async () => {
  db = await openTestDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
});

const AT = '2026-10-02T09:30:00+08:00';
const q = (id: string): Question => ({ id, subject: 'math', skill: 'math.add', indicators: ['N-2-2'], prompt: id, type: 'number', answer: 1 });
const sessionOp = (id: string): Op => ({
  id,
  at: AT,
  kind: 'session',
  result: {
    activityId: 'math.add',
    subject: 'math',
    total: 2,
    correct: 1,
    stars: 1,
    coins: 3,
    seconds: 60,
    answers: [
      { question: q('a'), correct: true, firstTry: true },
      { question: q('b'), correct: false, firstTry: false },
    ],
  },
});

/** 建房間並加入一位帶 100 金幣的孩子 */
async function setup(opts = {}) {
  const client = makeClient(db, opts);
  const { code, token: teacher } = await createRoom(client.call);
  const local = addProfile(createEmptySave(), { name: '安安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, new Date()).profiles[0];
  const kid = await joinRoom(client.call, code, '小安', '1234', { profile: { ...local, coins: 100 } });
  return { ...client, code, teacher, kid };
}

describe('同步操作', () => {
  it('依序套用多筆操作，回傳最新存檔與版本號；錯題本也存到伺服器', async () => {
    const { call, kid } = await setup();
    const r = await call('POST', '/api/ops', { ops: [sessionOp('o1'), { id: 'o2', at: AT, kind: 'buy', itemId: 'hat.cap' }] }, kid.token);
    expect(r.status).toBe(200);
    // 一回合：1 題一次答對、1 星 → 1 + 2 = 3 金幣；帽子 30
    expect(r.body.profile.coins).toBe(100 + 3 - 30);
    expect(r.body.profile.inventory).toEqual(['hat.cap']);
    expect(Object.keys(r.body.profile.wrongBook)).toEqual(['b']);
    expect(r.body.rev).toBe(2);
    expect(r.body.rejected).toEqual([]);
    const me = await call('GET', '/api/me', undefined, kid.token);
    expect(me.body.profile.wrongBook.b.question.id).toBe('b');
    expect(me.body.rev).toBe(2);
  });

  it('重送同一批（同樣的 id）不會重複套用，版本號也不變', async () => {
    const { call, kid } = await setup();
    const batch = { ops: [sessionOp('o1')] };
    const first = await call('POST', '/api/ops', batch, kid.token);
    const again = await call('POST', '/api/ops', batch, kid.token);
    expect(again.body.profile.coins).toBe(first.body.profile.coins);
    expect(again.body.profile.history).toHaveLength(1);
    expect(again.body.rev).toBe(first.body.rev);
  });

  it('被拒絕的操作列在 rejected，其他照常套用；重送時仍是拒絕（不會之後才成功）', async () => {
    const { call, kid } = await setup();
    const ops = [{ id: 'b1', at: AT, kind: 'buy', itemId: 'hat.wizard' }, sessionOp('o1')];
    const r = await call('POST', '/api/ops', { ops }, kid.token);
    expect(r.body.rejected).toEqual([{ id: 'b1', reason: '金幣不夠' }]);
    expect(r.body.profile.history).toHaveLength(1);
    // 之後金幣夠了，重送同一筆也不會補買
    await call('POST', '/api/ops', { ops: [{ id: 'p1', at: AT, kind: 'playTime', seconds: 10 }] }, kid.token);
    const again = await call('POST', '/api/ops', { ops: [{ id: 'b1', at: AT, kind: 'buy', itemId: 'hat.party' }] }, kid.token);
    expect(again.body.profile.inventory).toEqual([]);
  });

  it('格式不符的單筆列為拒絕，不影響同一批的其他操作', async () => {
    const { call, kid } = await setup();
    const r = await call('POST', '/api/ops', { ops: [{ id: 'x1', at: AT, kind: 'hack' }, sessionOp('o1')] }, kid.token);
    expect(r.status).toBe(200);
    expect(r.body.rejected).toEqual([{ id: 'x1', reason: '格式不符' }]);
    expect(r.body.profile.history).toHaveLength(1);
  });

  it('空批次用來拿最新存檔；一次超過 20 筆回 400', async () => {
    const { call, kid } = await setup();
    const empty = await call('POST', '/api/ops', { ops: [] }, kid.token);
    expect(empty.body).toMatchObject({ rev: 1, rejected: [] });
    const many = Array.from({ length: 21 }, (_, i) => ({ id: `p${i}`, at: AT, kind: 'playTime', seconds: 1 }));
    expect((await call('POST', '/api/ops', { ops: many }, kid.token)).status).toBe(400);
  });

  it('同步會更新最後上線時間（老師的成員列表看得到）', async () => {
    const clock = fakeClock();
    const { call, kid, teacher, code } = await setup({ now: clock.now });
    clock.advance(3600_000);
    await call('POST', '/api/ops', { ops: [] }, kid.token);
    const room = await call('GET', `/api/teacher/rooms/${code}`, undefined, teacher);
    expect(new Date(room.body.members[0].lastSeen).getTime()).toBe(clock.now().getTime());
  });

  it('多個請求同時送進度，一筆都不會被蓋掉（交易鎖定；真正的 PostgreSQL 才驗得到搶鎖）', async () => {
    const { call, kid } = await setup();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => call('POST', '/api/ops', { ops: [sessionOp(`s${i}`)] }, kid.token)));
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
    const me = await call('GET', '/api/me', undefined, kid.token);
    expect(me.body.profile.history).toHaveLength(10);
    expect(me.body.profile.coins).toBe(100 + 10 * 3);
    expect(me.body.rev).toBe(11);
  });

  it('兩個請求同時花錢，金幣不會被扣成負的', async () => {
    const { call, kid } = await setup();
    // 100 金幣，同時買兩頂 60 金幣的帽子：只能成功一頂
    const [a, b] = await Promise.all([
      call('POST', '/api/ops', { ops: [{ id: 'h1', at: AT, kind: 'buy', itemId: 'hat.helmet' }] }, kid.token),
      call('POST', '/api/ops', { ops: [{ id: 'h2', at: AT, kind: 'buy', itemId: 'hat.chef' }] }, kid.token),
    ]);
    const rejected = [...a.body.rejected, ...b.body.rejected];
    expect(rejected).toHaveLength(1);
    const me = await call('GET', '/api/me', undefined, kid.token);
    expect(me.body.profile.coins).toBe(40);
    expect(me.body.profile.inventory).toHaveLength(1);
  });
});

describe('益智遊戲館', () => {
  it('益智遊戲的金幣在伺服器也是每天最多 20 枚（分兩批送也一樣）', async () => {
    const { call, kid } = await setup();
    const puzzle = (id: string): Op => ({ id, at: AT, kind: 'puzzle', game: 'quiz', stars: 3 });
    const first = await call('POST', '/api/ops', { ops: [puzzle('z1'), puzzle('z2'), puzzle('z3')] }, kid.token);
    expect(first.status).toBe(200);
    expect(first.body.profile.coins).toBe(100 + 15);
    const second = await call('POST', '/api/ops', { ops: [puzzle('z4'), puzzle('z5')] }, kid.token);
    expect(second.body.rejected).toEqual([]);
    expect(second.body.profile.coins).toBe(100 + 20);
    expect(second.body.profile.puzzle.days['2026-10-02'].coins).toBe(20);
  });

  it('在益智遊戲館的遊玩時間同時記到整體與益智遊戲', async () => {
    const { call, kid } = await setup();
    const r = await call('POST', '/api/ops', { ops: [{ id: 't1', at: AT, kind: 'playTime', seconds: 30, puzzle: true }] }, kid.token);
    expect(r.body.profile.playLog['2026-10-02']).toBe(30);
    expect(r.body.profile.puzzle.days['2026-10-02'].seconds).toBe(30);
  });
});
