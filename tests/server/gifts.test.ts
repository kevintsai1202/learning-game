/**
 * 送禮物（P3）：同學名單、送禮、收下、不用了、過期退款、送禮結果通知、老師移出成員時退款。
 * 規格見 docs/plans/online.md 第 7 節。同時送禮的鎖定只有設了 TEST_DATABASE_URL（真的 PostgreSQL）才驗得到。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom, fakeClock, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import type { Db } from '../../server/db';
import { expireGifts } from '../../server/gifts';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';

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

/** 本機角色（帶進度加入班級用） */
const local = (patch: Partial<Profile> = {}): Profile => ({
  ...addProfile(createEmptySave(), { name: '安安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, new Date()).profiles[0],
  ...patch,
});

let seq = 0;
/** 裝置產生的禮物 id */
const gid = () => `gift-${++seq}-${Math.random().toString(36).slice(2, 8)}`;

/** 建房間：小安（100 金幣）、小美、阿寶；另一班有一位小華 */
async function setup(opts: { coins?: number; online?: string[] } = {}) {
  const clock = fakeClock('2026-10-03T10:00:00+08:00');
  const hooks = { onProfileChanged: vi.fn(), onGift: vi.fn(), onKick: vi.fn() };
  const online = new Set<string>();
  const client = makeClient(db, { now: clock.now, isOnline: (id) => online.has(id), ...hooks });
  const { code, token: teacher } = await createRoom(client.call);
  const a = await joinRoom(client.call, code, '小安', '1111', { profile: local({ coins: opts.coins ?? 100, inventory: ['hat.cap'] }) });
  const b = await joinRoom(client.call, code, '小美', '2222', { avatar: { animal: 'panda', color: '#5b5b6b', hat: null } });
  const c = await joinRoom(client.call, code, '阿寶', '3333', { avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } });
  const other = await createRoom(client.call, '二年二班');
  const x = await joinRoom(client.call, other.code, '小華', '4444');
  return { ...client, clock, hooks, online, code, teacher, a, b, c, x };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** 小安送禮物給某人 */
const send = (s: Ctx, to: string, itemId: string, id = gid(), token = s.a.token) => s.call('POST', '/api/gifts', { id, to, itemId }, token);
/** 讀某人的禮物狀態 */
const gifts = async (s: Ctx, token: string) => (await s.call('GET', '/api/gifts', undefined, token)).body;
/** 讀某人的存檔 */
const me = async (s: Ctx, token: string) => (await s.call('GET', '/api/me', undefined, token)).body;

describe('同學名單', () => {
  it('全班同學（不含自己、不含別班），線上的排前面；外觀經過 equippedOf；owned 只列能送的外觀', async () => {
    const s = await setup();
    s.online.add(s.c.account.id);
    const r = await s.call('GET', '/api/classmates', undefined, s.b.token);
    expect(r.status).toBe(200);
    expect(r.body.classmates.map((m: any) => [m.nickname, m.online])).toEqual([
      ['阿寶', true],
      ['小安', false],
    ]);
    const an = r.body.classmates.find((m: any) => m.nickname === '小安');
    expect(an.avatar).toEqual({ animal: 'bear', color: '#8b5a2b', hat: null, face: null, back: null, hand: null, pet: null, trail: null });
    expect(an.owned).toEqual(['hat.cap']);
    expect(an).not.toHaveProperty('profile');
    expect((await s.call('GET', '/api/classmates')).status).toBe(401);
  });
});

describe('送禮', () => {
  it('送貼紙：先扣送禮人的金幣，回傳新存檔；收禮人看到待收下的禮物；通知雙方的裝置', async () => {
    const s = await setup();
    const r = await send(s, s.b.account.id, 'sticker.tulip');
    expect(r.status).toBe(200);
    expect(r.body.profile.coins).toBe(95);
    expect(r.body.rev).toBe(s.a.rev + 1);
    expect(r.body.gift).toMatchObject({ to: '小美', itemId: 'sticker.tulip', price: 5 });
    expect(s.hooks.onProfileChanged).toHaveBeenCalledWith(s.a.account.id, r.body.rev, expect.objectContaining({ coins: 95 }));
    expect(s.hooks.onGift).toHaveBeenCalledWith(s.b.account.id);

    const inbox = await gifts(s, s.b.token);
    expect(inbox.incoming).toEqual([{ id: r.body.gift.id, from: '小安', itemId: 'sticker.tulip', createdAt: expect.any(String) }]);
    expect((await gifts(s, s.a.token)).sentToday).toBe(1);
    expect((await gifts(s, s.a.token)).dailyLimit).toBe(5);
    // 還沒收下：收禮人的存檔不變
    expect((await me(s, s.b.token)).profile.stickers).toBeUndefined();
  });

  it('同一個禮物 id 重送（送出後沒收到回應）：回傳原本那份，不會扣兩次錢', async () => {
    const s = await setup();
    const id = gid();
    const first = await send(s, s.b.account.id, 'sticker.star', id);
    const again = await send(s, s.b.account.id, 'sticker.star', id);
    expect(again.status).toBe(200);
    expect(again.body.gift).toEqual(first.body.gift);
    expect(again.body.profile.coins).toBe(95);
    expect((await gifts(s, s.b.token)).incoming).toHaveLength(1);
  });

  it('每人每天最多送 5 份（被退回的也算），隔天重新計算', async () => {
    const s = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await send(s, s.b.account.id, 'sticker.apple');
      expect(r.status).toBe(200);
      ids.push(r.body.gift.id);
    }
    const sixth = await send(s, s.c.account.id, 'sticker.apple');
    expect(sixth.status).toBe(429);
    expect(sixth.body.code).toBe('gift_limit');
    await s.call('POST', `/api/gifts/${ids[0]}/decline`, {}, s.b.token);
    expect((await send(s, s.c.account.id, 'sticker.apple')).status).toBe(429);
    s.clock.advance(24 * 3600 * 1000);
    expect((await send(s, s.c.account.id, 'sticker.apple')).status).toBe(200);
  });

  it('金幣不夠不能送；朋友已經有的外觀不能送；同一份外觀還沒收下不能再送；貼紙可以重複送', async () => {
    const s = await setup({ coins: 40 });
    expect((await send(s, s.b.account.id, 'pet.dino')).body.code).toBe('not_enough');
    // 小美送小安一頂棒球帽：小安已經有了
    const owned = await s.call('POST', '/api/gifts', { id: gid(), to: s.a.account.id, itemId: 'hat.cap' }, s.b.token);
    expect(owned.status).toBe(409);
    expect(owned.body.code).toBe('already_owned');
    expect((await send(s, s.b.account.id, 'hat.party')).status).toBe(200);
    const twice = await send(s, s.b.account.id, 'hat.party');
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('already_pending');
    expect((await send(s, s.b.account.id, 'sticker.tulip')).status).toBe(200);
    expect((await send(s, s.b.account.id, 'sticker.tulip')).status).toBe(200);
    expect((await me(s, s.a.token)).profile.coins).toBe(40 - 20 - 5 - 5);
  });

  it('送給自己 400、別班或不存在的同學 404、獎章道具或不存在的東西 400、格式錯 400、沒登入 401', async () => {
    const s = await setup();
    expect((await send(s, s.a.account.id, 'sticker.tulip')).body.code).toBe('gift_self');
    expect((await send(s, s.x.account.id, 'sticker.tulip')).status).toBe(404);
    expect((await send(s, 'nobody', 'sticker.tulip')).status).toBe(404);
    expect((await send(s, s.b.account.id, 'hat.scholar')).body.code).toBe('not_giftable');
    expect((await send(s, s.b.account.id, 'nope')).body.code).toBe('not_giftable');
    expect((await s.call('POST', '/api/gifts', { id: 'x', to: s.b.account.id, itemId: 'sticker.tulip' }, s.a.token)).status).toBe(400);
    expect((await s.call('POST', '/api/gifts', { id: gid(), to: s.b.account.id, itemId: 'sticker.tulip' })).status).toBe(401);
    expect((await me(s, s.a.token)).profile.coins).toBe(100);
  });

  it('老師關閉送禮：不能送新的，但已經送出的可以收下或按不用了', async () => {
    const s = await setup();
    const g1 = (await send(s, s.b.account.id, 'sticker.tulip')).body.gift.id;
    const g2 = (await send(s, s.b.account.id, 'sticker.star')).body.gift.id;
    await s.call('PATCH', '/api/teacher/room', { giftsOpen: false }, s.teacher);
    const closed = await send(s, s.b.account.id, 'sticker.apple');
    expect(closed.status).toBe(403);
    expect(closed.body.code).toBe('gifts_closed');
    expect((await s.call('POST', `/api/gifts/${g1}/accept`, {}, s.b.token)).status).toBe(200);
    expect((await s.call('POST', `/api/gifts/${g2}/decline`, {}, s.b.token)).status).toBe(200);
  });

  it('同時送 10 份、金幣只夠 3 份：只成功 3 份，金幣不會變成負的（真的 PostgreSQL 才驗得到鎖定）', async () => {
    const s = await setup({ coins: 15 });
    const results = await Promise.all(Array.from({ length: 10 }, () => send(s, s.b.account.id, 'sticker.tulip')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect((await me(s, s.a.token)).profile.coins).toBe(0);
    expect((await gifts(s, s.b.token)).incoming).toHaveLength(3);
  });

  it('同時送 10 份、金幣很多：每日上限照樣只讓 5 份成功', async () => {
    const s = await setup({ coins: 500 });
    const results = await Promise.all(Array.from({ length: 10 }, () => send(s, s.b.account.id, 'sticker.cookie')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect((await me(s, s.a.token)).profile.coins).toBe(500 - 5 * 3);
  });
});

describe('收下與不用了', () => {
  it('收下貼紙：貼紙加一、收禮紀錄寫上誰送的；送禮人看到「收下了」（有暱稱），看過就不再出現', async () => {
    const s = await setup();
    const g = (await send(s, s.b.account.id, 'sticker.tulip')).body.gift.id;
    s.hooks.onGift.mockClear();
    const r = await s.call('POST', `/api/gifts/${g}/accept`, {}, s.b.token);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('accepted');
    expect(r.body.profile.stickers).toEqual({ 'sticker.tulip': 1 });
    expect(r.body.profile.giftLog).toEqual([{ from: '小安', itemId: 'sticker.tulip', date: '2026-10-03' }]);
    expect(s.hooks.onProfileChanged).toHaveBeenCalledWith(s.b.account.id, r.body.rev, expect.objectContaining({ stickers: { 'sticker.tulip': 1 } }));
    expect(s.hooks.onGift).toHaveBeenCalledWith(s.a.account.id);
    expect((await gifts(s, s.b.token)).incoming).toEqual([]);

    const notices = (await gifts(s, s.a.token)).notices;
    expect(notices).toEqual([{ id: g, kind: 'accepted', to: '小美', itemId: 'sticker.tulip' }]);
    expect((await s.call('POST', '/api/gifts/notices/ack', { ids: [g] }, s.a.token)).status).toBe(200);
    expect((await gifts(s, s.a.token)).notices).toEqual([]);
  });

  it('收下外觀：放進收藏，之後可以用 avatar 操作戴上', async () => {
    const s = await setup();
    const g = (await send(s, s.b.account.id, 'hat.party')).body.gift.id;
    const r = await s.call('POST', `/api/gifts/${g}/accept`, {}, s.b.token);
    expect(r.body.profile.inventory).toEqual(['hat.party']);
    const op = { id: gid(), at: '2026-10-03T10:00:00+08:00', kind: 'avatar', avatar: { animal: 'panda', color: '#5b5b6b', hat: 'hat.party' } };
    const sync = await s.call('POST', '/api/ops', { ops: [op] }, s.b.token);
    expect(sync.body.rejected).toEqual([]);
    expect(sync.body.profile.avatar.hat).toBe('hat.party');
  });

  it('按不用了：退回送出時的價格給送禮人；送禮人的通知不說是誰', async () => {
    const s = await setup();
    const g = (await send(s, s.b.account.id, 'hat.party')).body.gift.id;
    s.hooks.onProfileChanged.mockClear();
    const r = await s.call('POST', `/api/gifts/${g}/decline`, {}, s.b.token);
    expect(r.status).toBe(200);
    const a = await me(s, s.a.token);
    expect(a.profile.coins).toBe(100);
    expect(s.hooks.onProfileChanged).toHaveBeenCalledWith(s.a.account.id, a.rev, expect.objectContaining({ coins: 100 }));
    expect(s.hooks.onGift).toHaveBeenCalledWith(s.a.account.id);
    const notices = (await gifts(s, s.a.token)).notices;
    expect(notices).toEqual([{ id: g, kind: 'refunded', price: 20 }]);
    expect(JSON.stringify(notices)).not.toContain('小美');
  });

  it('退款用送出時的價格，不查現在的目錄', async () => {
    const s = await setup();
    const g = (await send(s, s.b.account.id, 'sticker.rocket')).body.gift.id;
    await db.query(`UPDATE gifts SET price = 7 WHERE id = $1`, [g]);
    await s.call('POST', `/api/gifts/${g}/decline`, {}, s.b.token);
    expect((await me(s, s.a.token)).profile.coins).toBe(100 - 10 + 7);
  });

  it('收下時已經自己買了同一個外觀：自動退回送禮人，回 returned', async () => {
    const s = await setup();
    const g = (await send(s, s.b.account.id, 'hat.party')).body.gift.id;
    // 模擬小美在收下前自己買了派對帽：直接把帽子寫進她的收藏
    await db.query(`UPDATE accounts SET profile = jsonb_set(profile, '{inventory}', '["hat.party"]') WHERE id = $1`, [s.b.account.id]);
    const r = await s.call('POST', `/api/gifts/${g}/accept`, {}, s.b.token);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('returned');
    expect(r.body.profile.inventory).toEqual(['hat.party']);
    expect((await me(s, s.a.token)).profile.coins).toBe(100);
    expect((await gifts(s, s.a.token)).notices).toEqual([{ id: g, kind: 'refunded', price: 20 }]);
  });

  it('已經處理過的再收下或不用了：409 gift_done；別人的禮物 404', async () => {
    const s = await setup();
    const g = (await send(s, s.b.account.id, 'sticker.tulip')).body.gift.id;
    expect((await s.call('POST', `/api/gifts/${g}/accept`, {}, s.c.token)).status).toBe(404);
    await s.call('POST', `/api/gifts/${g}/accept`, {}, s.b.token);
    const again = await s.call('POST', `/api/gifts/${g}/accept`, {}, s.b.token);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('gift_done');
    expect((await s.call('POST', `/api/gifts/${g}/decline`, {}, s.b.token)).body.code).toBe('gift_done');
    expect((await me(s, s.b.token)).profile.stickers).toEqual({ 'sticker.tulip': 1 });
  });
});

describe('過期', () => {
  it('7 天沒收：expireGifts 退款給送禮人並通知；收禮人看不到了', async () => {
    const s = await setup();
    const g = (await send(s, s.b.account.id, 'sticker.unicorn')).body.gift.id;
    s.clock.advance(6 * 24 * 3600 * 1000);
    expect(await expireGifts({ db, now: s.clock.now, ...s.hooks })).toBe(0);
    s.clock.advance(24 * 3600 * 1000 + 1000);
    s.hooks.onGift.mockClear();
    expect(await expireGifts({ db, now: s.clock.now, ...s.hooks })).toBe(1);
    const a = await me(s, s.a.token);
    expect(a.profile.coins).toBe(100);
    expect(s.hooks.onProfileChanged).toHaveBeenLastCalledWith(s.a.account.id, a.rev, expect.objectContaining({ coins: 100 }));
    expect(s.hooks.onGift).toHaveBeenCalledWith(s.a.account.id);
    expect((await gifts(s, s.b.token)).incoming).toEqual([]);
    expect((await gifts(s, s.a.token)).notices).toEqual([{ id: g, kind: 'refunded', price: 10 }]);
  });

  it('超過 7 天還沒掃到時：收禮人看不到；收下當作過期，退款並回 409 gift_expired', async () => {
    const s = await setup();
    const g = (await send(s, s.b.account.id, 'sticker.unicorn')).body.gift.id;
    s.clock.advance(7 * 24 * 3600 * 1000 + 1000);
    expect((await gifts(s, s.b.token)).incoming).toEqual([]);
    const r = await s.call('POST', `/api/gifts/${g}/accept`, {}, s.b.token);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('gift_expired');
    expect((await me(s, s.a.token)).profile.coins).toBe(100);
    expect((await me(s, s.b.token)).profile.stickers).toBeUndefined();
  });
});

describe('老師移出成員', () => {
  it('別人送給他、還沒收的禮物退款給送禮人（通知不說是誰）；他送出的禮物對方仍然可以收下', async () => {
    const s = await setup();
    const toB = (await send(s, s.b.account.id, 'sticker.rocket')).body.gift.id;
    const fromB = await s.call('POST', '/api/gifts', { id: gid(), to: s.c.account.id, itemId: 'sticker.cookie' }, s.b.token);
    expect(fromB.status).toBe(409); // 小美沒有金幣
    const fromA = (await send(s, s.c.account.id, 'sticker.apple')).body.gift.id;
    s.hooks.onProfileChanged.mockClear();
    const del = await s.call('DELETE', `/api/teacher/members/${s.a.account.id}`, undefined, s.teacher);
    expect(del.status).toBe(200);
    expect(s.hooks.onKick).toHaveBeenCalledWith(s.a.account.id, expect.any(String));
    // 小安被移出：他送給阿寶的禮物阿寶仍然可以收下
    const acc = await s.call('POST', `/api/gifts/${fromA}/accept`, {}, s.c.token);
    expect(acc.body.profile.giftLog[0]).toMatchObject({ from: '小安', itemId: 'sticker.apple' });
    // 小美送出的禮物要退款：先讓小美有金幣送給阿寶，再移出阿寶
    await db.query(`UPDATE accounts SET profile = jsonb_set(profile, '{coins}', '30') WHERE id = $1`, [s.b.account.id]);
    const g = (await s.call('POST', '/api/gifts', { id: gid(), to: s.c.account.id, itemId: 'sticker.whale' }, s.b.token)).body.gift.id;
    expect((await me(s, s.b.token)).profile.coins).toBe(22);
    await s.call('DELETE', `/api/teacher/members/${s.c.account.id}`, undefined, s.teacher);
    const b = await me(s, s.b.token);
    expect(b.profile.coins).toBe(30);
    expect(s.hooks.onProfileChanged).toHaveBeenCalledWith(s.b.account.id, b.rev, expect.objectContaining({ coins: 30 }));
    expect((await gifts(s, s.b.token)).notices).toEqual([{ id: g, kind: 'refunded', price: 8 }]);
    // 小美收到的、小安送的禮物（送禮人已移出）：按不用了也不會出錯
    expect((await s.call('POST', `/api/gifts/${toB}/decline`, {}, s.b.token)).status).toBe(200);
  });
});
