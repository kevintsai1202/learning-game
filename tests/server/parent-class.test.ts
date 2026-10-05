/**
 * 家長的雲端角色和班級（A2，docs/plans/accounts.md 第 6 節）：雲端角色帶權杖加入班級、退出班級
 * （老師移出家長名下的角色、家長讓孩子退出）時禮物兩邊都結清、班級權杖失效、家長權杖照常；
 * 刪除角色與刪除自己的帳號時，通知不送給被刪的角色。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR, createRoom, createUser, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import type { Db, Queryable } from '../../server/db';
import { removeMemberWithRefunds } from '../../server/gifts';
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

type Call = ReturnType<typeof makeClient>['call'];

/** 送禮測試用的貼紙（3 枚金幣） */
const STICKER = 'sticker.cookie';
const STICKER_PRICE = 3;

/** 一個本機角色（裝置上建立的） */
function localKid(name: string, coins: number): Profile {
  return { ...addProfile(createEmptySave(), { name, avatar: AVATAR }, new Date()).profiles[0], coins };
}

/** 一位家長 */
const parentOf = (call: Call) => createUser(call, { parent: true, teacher: false });

/** 讀一個角色目前的金幣 */
const coinsOf = async (call: Call, token: string): Promise<number> => (await call('GET', '/api/me', undefined, token)).body.profile.coins;

/** 一個班級：家長名下的安安（也用代碼在學校平板登入）、純班級角色小美；兩人各送對方一份還沒收的貼紙 */
async function classWithGifts(call: Call) {
  const mom = await parentOf(call);
  const room = await createRoom(call);
  const up = (await call('POST', '/api/parent/kids', { profile: localKid('安安', 100) }, mom.token)).body;
  expect((await call('POST', '/api/join', { code: room.code, nickname: '安安', pin: '1234' }, up.token)).status).toBe(200);
  const school = (await call('POST', '/api/login', { code: room.code, nickname: '安安', pin: '1234' })).body;
  const mei = await joinRoom(call, room.code, '小美', '5678', { profile: localKid('小美', 100) });
  expect((await call('POST', '/api/gifts', { id: 'gift-an-to-mei', to: mei.account.id, itemId: STICKER }, up.token)).status).toBe(200);
  expect((await call('POST', '/api/gifts', { id: 'gift-mei-to-an', to: up.account.id, itemId: STICKER }, mei.token)).status).toBe(200);
  return { mom, room, up, school, mei };
}

describe('雲端角色加入班級', () => {
  it('帶孩子權杖加入：同一個帳號掛進班級、名字改成班上的暱稱；學校平板用代碼登入是同一個角色', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    const up = (await call('POST', '/api/parent/kids', { profile: localKid('安安', 30) }, mom.token)).body;
    const room = await createRoom(call);
    const r = await call('POST', '/api/join', { code: room.code, nickname: '小安', pin: '1234' }, up.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ account: { id: up.account.id, nickname: '小安' }, room: { code: room.code, name: '二年一班' }, profile: { id: up.profile.id, name: '小安', coins: 30 }, rev: 2 });
    expect(r.body.token).toBeUndefined();
    expect((await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids[0].room).toEqual({ code: room.code, name: '二年一班', curriculum: null });
    const school = await call('POST', '/api/login', { code: room.code, nickname: '小安', pin: '1234' });
    expect(school.body.account.id).toBe(up.account.id);
    expect((await call('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token)).body.members.map((m: { nickname: string }) => m.nickname)).toEqual(['小安']);
    // 原本的權杖照常，現在有班級：同學名單可以用
    expect((await call('GET', '/api/classmates', undefined, up.token)).status).toBe(200);
  });

  it('已經在班級裡回 409；暱稱重複 409；班級不開放加入 403；代碼不存在 404', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    const a = await createRoom(call);
    const b = await createRoom(call, '二年二班');
    await joinRoom(call, a.code, '小美');
    const up = (await call('POST', '/api/parent/kids', { profile: localKid('安安', 0) }, mom.token)).body;
    expect((await call('POST', '/api/join', { code: a.code, nickname: '小美', pin: '1234' }, up.token)).status).toBe(409);
    expect((await call('POST', '/api/join', { code: '999999', nickname: '安安', pin: '1234' }, up.token)).status).toBe(404);
    await call('PATCH', `/api/teacher/rooms/${b.code}`, { joinOpen: false }, b.token);
    expect((await call('POST', '/api/join', { code: b.code, nickname: '安安', pin: '1234' }, up.token)).status).toBe(403);
    expect((await call('POST', '/api/join', { code: a.code, nickname: '安安', pin: '1234' }, up.token)).status).toBe(200);
    const again = await call('POST', '/api/join', { code: a.code, nickname: '安安二號', pin: '1234' }, up.token);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_in_class');
  });
});

describe('退出班級', () => {
  it('老師移出家長名下的角色：退出班級、兩份禮物都退款；班級權杖失效、家長權杖照常、送禮回 403', async () => {
    const hooks = { onKick: vi.fn(), onProfileChanged: vi.fn(), onGift: vi.fn() };
    const { call } = makeClient(db, hooks);
    const s = await classWithGifts(call);
    const anBefore = await coinsOf(call, s.up.token);
    const meiBefore = await coinsOf(call, s.mei.token);
    const r = await call('DELETE', `/api/teacher/rooms/${s.room.code}/members/${s.up.account.id}`, undefined, s.room.token);
    expect(r.status).toBe(200);
    expect(r.body.left).toBe(true);
    expect(hooks.onKick).toHaveBeenCalledWith(s.up.account.id, '老師把你移出班級了，進度都還在');
    expect((await call('GET', '/api/me', undefined, s.school.token)).status).toBe(401);
    const me = await call('GET', '/api/me', undefined, s.up.token);
    expect(me.body.room).toBeNull();
    expect(me.body.profile.coins).toBe(anBefore + STICKER_PRICE);
    expect(await coinsOf(call, s.mei.token)).toBe(meiBefore + STICKER_PRICE);
    expect((await call('GET', '/api/classmates', undefined, s.up.token)).status).toBe(403);
    expect((await call('POST', '/api/login', { code: s.room.code, nickname: '安安', pin: '1234' })).status).toBe(401);
    expect((await call('GET', `/api/teacher/rooms/${s.room.code}`, undefined, s.room.token)).body.members.map((m: { nickname: string }) => m.nickname)).toEqual(['小美']);
    // 小美沒有待收的禮物了
    expect((await call('GET', '/api/gifts', undefined, s.mei.token)).body.incoming).toEqual([]);
  });

  it('老師移出純班級角色：照舊刪除', async () => {
    const { call } = makeClient(db);
    const s = await classWithGifts(call);
    const r = await call('DELETE', `/api/teacher/rooms/${s.room.code}/members/${s.mei.account.id}`, undefined, s.room.token);
    expect(r.status).toBe(200);
    expect(r.body.left).toBe(false);
    expect((await call('GET', '/api/me', undefined, s.mei.token)).status).toBe(401);
  });

  it('家長讓孩子退出班級：和老師移出一樣結清、保留進度；已經沒有班級時回 409', async () => {
    const hooks = { onKick: vi.fn() };
    const { call } = makeClient(db, hooks);
    const s = await classWithGifts(call);
    const anBefore = await coinsOf(call, s.up.token);
    expect((await call('POST', `/api/parent/kids/${s.up.account.id}/leave-class`, {}, s.mom.token)).status).toBe(200);
    expect(hooks.onKick).toHaveBeenCalledWith(s.up.account.id, '已經退出班級，進度都還在');
    expect(await coinsOf(call, s.up.token)).toBe(anBefore + STICKER_PRICE);
    expect((await call('GET', '/api/me', undefined, s.school.token)).status).toBe(401);
    const again = await call('POST', `/api/parent/kids/${s.up.account.id}/leave-class`, {}, s.mom.token);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('not_in_class');
  });

  it('老師重設家長名下角色的密碼：只撤銷班級登入的權杖，家長裝置照常', async () => {
    const { call } = makeClient(db);
    const s = await classWithGifts(call);
    expect((await call('POST', `/api/teacher/rooms/${s.room.code}/members/${s.up.account.id}/pin`, { pin: '0000' }, s.room.token)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, s.school.token)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, s.up.token)).status).toBe(200);
  });

  it('家長刪除在班級裡的角色：先結清禮物（小美拿回送出的），通知不送給被刪的角色', async () => {
    const hooks = { onKick: vi.fn(), onProfileChanged: vi.fn(), onGift: vi.fn() };
    const { call } = makeClient(db, hooks);
    const s = await classWithGifts(call);
    const meiBefore = await coinsOf(call, s.mei.token);
    hooks.onProfileChanged.mockClear();
    expect((await call('DELETE', `/api/parent/kids/${s.up.account.id}`, undefined, s.mom.token)).status).toBe(200);
    expect(await coinsOf(call, s.mei.token)).toBe(meiBefore + STICKER_PRICE);
    const notified = hooks.onProfileChanged.mock.calls.map((c) => c[0]);
    expect(notified).toContain(s.mei.account.id);
    expect(notified).not.toContain(s.up.account.id);
    expect(hooks.onKick).toHaveBeenCalledWith(s.up.account.id, '這個角色已經被家長刪除');
  });
});

describe('老師只能移出自己班上的學生', () => {
  it('移出的交易鎖到帳號時，他已經換到別的班級（交易開頭讀到的班級過期）：整個撤銷，回傳不是成員', async () => {
    const { call } = makeClient(db);
    const s = await classWithGifts(call);
    const other = await createRoom(call, '二年二班');
    // 模擬真正的 PostgreSQL 的時間窗：交易讀完班級、鎖到帳號之前，家長讓他退出、又加入了別的班級
    const racingTx = (tx: Queryable) =>
      ({
        query: async (sql: string, params?: unknown[]) => {
          if (sql.includes('FROM accounts WHERE id = ANY') && sql.includes('FOR UPDATE')) {
            await tx.query('UPDATE accounts SET room_code = $2 WHERE id = $1', [s.up.account.id, other.code]);
          }
          return tx.query(sql, params);
        },
      }) as Queryable;
    const racing: Db = { query: db.query.bind(db), close: db.close.bind(db), transaction: (fn) => db.transaction((tx) => fn(racingTx(tx))) };
    expect(await removeMemberWithRefunds(racing, s.up.account.id, s.room.code, new Date())).toBeNull();
    // 整個交易撤銷：兩份禮物還是 pending，帳號的班級與孩子密碼都還在
    const gifts = await db.query<{ status: string }>("SELECT status FROM gifts WHERE id IN ('gift-an-to-mei', 'gift-mei-to-an')");
    expect(gifts.map((g) => g.status)).toEqual(['pending', 'pending']);
    const acc = (await db.query<{ room_code: string; pin_hash: string | null }>('SELECT room_code, pin_hash FROM accounts WHERE id = $1', [s.up.account.id]))[0];
    expect(acc.room_code).toBe(s.room.code);
    expect(acc.pin_hash).not.toBeNull();
  });
});

describe('退出前殘留的禮物（只算目前班級的）', () => {
  it('退出班級後又加入別的班級：舊班級殘留的未收禮物與送禮結果都看不到，殘留的禮物也收不下（交給 7 天過期退款）', async () => {
    const { call } = makeClient(db);
    const s = await classWithGifts(call);
    expect((await call('POST', `/api/parent/kids/${s.up.account.id}/leave-class`, {}, s.mom.token)).status).toBe(200);
    // 模擬真正的 PostgreSQL 上的時間窗：退出的交易掃完禮物、還沒鎖帳號時，同學剛好送出一份（退款時漏掉、留在 pending）；
    // 另一份是他送出的、對方之後才處理的結果
    const t = new Date().toISOString();
    await db.query(
      `INSERT INTO gifts (id, room_code, from_id, to_id, from_nickname, to_nickname, item_id, price, status, sender_seen, created_at, resolved_at)
       VALUES ('gift-late', $1, $2, $3, '小美', '安安', $4, $5, 'pending', false, $6::timestamptz, NULL),
              ('gift-old-result', $1, $3, $2, '安安', '小美', $4, $5, 'declined', false, $6::timestamptz, $6::timestamptz)`,
      [s.room.code, s.mei.account.id, s.up.account.id, STICKER, STICKER_PRICE, t],
    );
    const other = await createRoom(call, '二年二班');
    expect((await call('POST', '/api/join', { code: other.code, nickname: '安安', pin: '1234' }, s.up.token)).status).toBe(200);
    const inbox = (await call('GET', '/api/gifts', undefined, s.up.token)).body;
    expect(inbox.incoming).toEqual([]);
    expect(inbox.notices).toEqual([]);
    expect((await call('POST', '/api/gifts/gift-late/accept', {}, s.up.token)).status).toBe(404);
    expect((await call('POST', '/api/gifts/gift-late/decline', {}, s.up.token)).status).toBe(404);
  });
});

describe('刪除自己的帳號', () => {
  it('還有班級回 409；密碼錯回 401；名下的角色一併刪除，班上的禮物先結清，通知只送給對方', async () => {
    const hooks = { onKick: vi.fn(), onProfileChanged: vi.fn(), onGift: vi.fn() };
    const { call } = makeClient(db, hooks);
    // 老師兼家長、還有班級：不能刪（刪了會連帶刪掉班上所有角色）
    const both = await createUser(call, { parent: true, teacher: true });
    await createRoom(call, '安親班', both.token);
    const blocked = await call('DELETE', '/api/users/me', { password: 'teach1234' }, both.token);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('has_classes');

    const s = await classWithGifts(call);
    const home = (await call('POST', '/api/parent/kids', { profile: localKid('妹妹', 5) }, s.mom.token)).body;
    expect((await call('DELETE', '/api/users/me', { password: 'wrong-pass' }, s.mom.token)).status).toBe(401);
    const meiBefore = await coinsOf(call, s.mei.token);
    hooks.onProfileChanged.mockClear();
    expect((await call('DELETE', '/api/users/me', { password: 'teach1234' }, s.mom.token)).status).toBe(200);
    expect((await call('GET', '/api/users/me', undefined, s.mom.token)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, s.up.token)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, home.token)).status).toBe(401);
    expect(await coinsOf(call, s.mei.token)).toBe(meiBefore + STICKER_PRICE);
    const notified = hooks.onProfileChanged.mock.calls.map((c) => c[0]);
    expect(notified).toContain(s.mei.account.id);
    expect(notified).not.toContain(s.up.account.id);
  });
});
