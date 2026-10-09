/**
 * 老師發獎勵（老師 GM 的 G3，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：
 * 老師給一位孩子或全班金幣（1～50）或貼紙（8 種之一）；伺服器直接改孩子的存檔（rev 加一）並記一筆獎勵，
 * 線上的孩子收到通知；孩子讀還沒看過的獎勵、看過後標記。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom, createUser, fakeClock, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import type { Db } from '../../server/db';

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

/** 建班級：小安、小美；另一班有小華 */
async function setup() {
  const clock = fakeClock('2026-10-09T10:00:00+08:00');
  const hooks = { onProfileChanged: vi.fn(), onReward: vi.fn() };
  const client = makeClient(db, { now: clock.now, ...hooks });
  const { code, token: teacher } = await createRoom(client.call);
  const a = await joinRoom(client.call, code, '小安', '1111');
  const b = await joinRoom(client.call, code, '小美', '2222');
  const other = await createRoom(client.call, '二年二班');
  const x = await joinRoom(client.call, other.code, '小華', '4444');
  return { ...client, clock, hooks, code, teacher, a, b, other, x };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

/** 老師發獎勵 */
const give = (s: Ctx, body: unknown, token = s.teacher, code = s.code) => s.call('POST', `/api/teacher/rooms/${code}/rewards`, body, token);
/** 讀某位孩子的存檔與版本 */
const me = async (s: Ctx, token: string) => (await s.call('GET', '/api/me', undefined, token)).body;

describe('老師發獎勵', () => {
  it('給一位孩子金幣：存檔加金幣、版本加一、線上通知；別人不變', async () => {
    const s = await setup();
    const before = await me(s, s.a.token);
    const r = await give(s, { to: [s.a.account.id], coins: 10 });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ given: 1 });
    const after = await me(s, s.a.token);
    expect(after.profile.coins).toBe(before.profile.coins + 10);
    expect(after.rev).toBe(before.rev + 1);
    expect(s.hooks.onProfileChanged).toHaveBeenCalledWith(s.a.account.id, after.rev, expect.objectContaining({ coins: after.profile.coins }));
    expect(s.hooks.onReward).toHaveBeenCalledWith(s.a.account.id);
    expect((await me(s, s.b.token)).profile.coins).toBe(0);
  });

  it('給全班貼紙：班上每個孩子都多一張，別班的不會', async () => {
    const s = await setup();
    expect((await give(s, { to: 'all', sticker: 'sticker.tulip' })).body).toEqual({ given: 2 });
    for (const t of [s.a.token, s.b.token]) expect((await me(s, t)).profile.stickers).toEqual({ 'sticker.tulip': 1 });
    expect((await me(s, s.x.token)).profile.stickers).toBeUndefined();
    expect(s.hooks.onReward).toHaveBeenCalledTimes(2);
  });

  it('格式不對：金幣 0 或 51、不是那 8 種貼紙、兩種都沒給、不是這一班的孩子 → 400，存檔不變', async () => {
    const s = await setup();
    for (const body of [
      { to: 'all', coins: 0 },
      { to: 'all', coins: 51 },
      { to: 'all', sticker: 'hat.cap' },
      { to: 'all' },
      { to: [s.x.account.id], coins: 5 },
    ]) {
      expect((await give(s, body)).status).toBe(400);
    }
    expect((await me(s, s.a.token)).profile.coins).toBe(0);
    expect(s.hooks.onReward).not.toHaveBeenCalled();
  });

  it('不是老師、不是這一班的老師：不能發', async () => {
    const s = await setup();
    const parent = await createUser(s.call, { parent: true, teacher: false });
    expect((await give(s, { to: 'all', coins: 5 }, parent.token)).status).toBe(403);
    expect((await give(s, { to: 'all', coins: 5 }, s.other.token)).status).toBe(404);
    expect((await give(s, { to: 'all', coins: 5 }, s.a.token)).status).toBe(401);
  });
});

describe('孩子收到的獎勵', () => {
  it('讀還沒看過的獎勵（班級名稱、金幣、貼紙）；看過之後不再出現；別人的不能標記', async () => {
    const s = await setup();
    await give(s, { to: [s.a.account.id], coins: 10 });
    s.clock.advance(1000);
    await give(s, { to: [s.a.account.id], sticker: 'sticker.star' });
    const list = (await s.call('GET', '/api/rewards', undefined, s.a.token)).body.rewards;
    expect(list.map((r: { coins: number; itemId: string | null; className: string }) => [r.coins, r.itemId, r.className])).toEqual([
      [10, null, '二年一班'],
      [0, 'sticker.star', '二年一班'],
    ]);
    // 小美標記小安的獎勵：不算
    await s.call('POST', '/api/rewards/seen', { ids: [list[0].id] }, s.b.token);
    expect((await s.call('GET', '/api/rewards', undefined, s.a.token)).body.rewards).toHaveLength(2);
    await s.call('POST', '/api/rewards/seen', { ids: [list[0].id] }, s.a.token);
    expect((await s.call('GET', '/api/rewards', undefined, s.a.token)).body.rewards.map((r: { id: string }) => r.id)).toEqual([list[1].id]);
    expect((await s.call('GET', '/api/rewards', undefined, s.b.token)).body.rewards).toEqual([]);
  });
});
