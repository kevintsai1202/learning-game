/**
 * Google 快速登入綁大人帳號（A4，docs/plans/accounts.md 第 9 節）：用 Google 註冊（email 自動帶入、算驗證過，
 * 帳號名稱與密碼照樣要設）、登入後綁定與解除、用 Google 登入；一個 Google 只能綁一個大人帳號。
 * 舊的「Google 直接綁孩子」路由（/api/google/link、/api/google/login）已經拿掉。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalJWKSet } from 'jose';
import { createRoom, createUser, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import { makeGoogleKeys, TEST_CLIENT_ID } from './googleKeys';
import { createGoogleVerifier, type GoogleConfig } from '../../server/google';
import { createMailer } from '../../server/mail';
import type { Db } from '../../server/db';

let db: Db;
let keys: Awaited<ReturnType<typeof makeGoogleKeys>>;
let google: GoogleConfig;
beforeAll(async () => {
  db = await openTestDb();
  keys = await makeGoogleKeys();
  google = { clientId: TEST_CLIENT_ID, verify: createGoogleVerifier({ clientId: TEST_CLIENT_ID, keys: createLocalJWKSet(keys.jwks) }), testMode: true };
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
});

/** 開好 Google 登入（與測試信箱）的 app */
function client() {
  const mailer = createMailer({ TEST_MAIL_OUTBOX: '1', ALLOW_TEST_MAIL: '1' }).mailer;
  return { ...makeClient(db, { google, mailer }), mailer };
}

let seq = 0;
/** 用 Google 註冊的請求內容 */
async function googleRegisterBody(sub: string, email: string | null, extra: Record<string, unknown> = {}, emailVerified = true) {
  return { idToken: await keys.sign(sub, email, { emailVerified }), username: `gg_user_${++seq}`, password: 'teach1234', parent: true, teacher: false, ...extra };
}

describe('伺服器設定', () => {
  it('有開 Google 登入時回傳 Client ID；沒開回傳 null', async () => {
    expect((await client().call('GET', '/api/config')).body).toEqual({ googleClientId: TEST_CLIENT_ID });
    expect((await makeClient(db).call('GET', '/api/config')).body).toEqual({ googleClientId: null });
  });
});

describe('用 Google 註冊', () => {
  it('email 自動帶入 Google 的 email 而且算驗證過、不寄驗證信；同時綁好 Google，之後用 Google 或帳號密碼都能登入', async () => {
    const { call, mailer } = client();
    const body = await googleRegisterBody('g-mom', 'Mom.Chen@gmail.com');
    const r = await call('POST', '/api/users/google/register', body);
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ username: body.username, email: 'Mom.Chen@gmail.com', emailVerified: true, parent: true, teacher: false });
    expect(mailer.outbox).toEqual([]);
    const viaGoogle = await call('POST', '/api/users/google/login', { idToken: await keys.sign('g-mom', 'Mom.Chen@gmail.com') });
    expect(viaGoogle.status).toBe(200);
    expect(viaGoogle.body.user.id).toBe(r.body.user.id);
    expect((await call('GET', '/api/users/me', undefined, viaGoogle.body.token)).body.user.username).toBe(body.username);
    expect((await call('POST', '/api/users/login', { username: body.username, password: 'teach1234' })).status).toBe(200);
    expect((await call('GET', '/api/users/me/google', undefined, r.body.token)).body.google).toEqual([{ id: 'g-mom', email: 'Mo***@gmail.com' }]);
  });

  it('帳號名稱、密碼、身分照樣要檢查；Google 沒有驗證過的 email（或沒有 email）不能用 Google 註冊', async () => {
    const { call } = client();
    expect((await call('POST', '/api/users/google/register', await googleRegisterBody('g1', 'a@gmail.com', { username: 'x' }))).body.code).toBe('bad_username');
    expect((await call('POST', '/api/users/google/register', await googleRegisterBody('g1', 'a@gmail.com', { password: 'short' }))).body.code).toBe('bad_password');
    expect((await call('POST', '/api/users/google/register', await googleRegisterBody('g1', 'a@gmail.com', { parent: false, teacher: false }))).body.code).toBe('no_role');
    const unverified = await call('POST', '/api/users/google/register', await googleRegisterBody('g2', 'b@example.com', {}, false));
    expect(unverified.status).toBe(400);
    expect(unverified.body.code).toBe('google_no_email');
    expect((await call('POST', '/api/users/google/register', await googleRegisterBody('g3', null))).body.code).toBe('google_no_email');
  });

  it('Google 已經綁了別的帳號：409 google_taken；Google 的 email 已經有帳號：409 email_taken（先登入那個帳號再綁定）', async () => {
    const { call } = client();
    expect((await call('POST', '/api/users/google/register', await googleRegisterBody('g-a', 'a@gmail.com'))).status).toBe(200);
    const again = await call('POST', '/api/users/google/register', await googleRegisterBody('g-a', 'a@gmail.com'));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('google_taken');
    await call('POST', '/api/users', { username: 'dad_account', password: 'teach1234', email: 'DAD@gmail.com', parent: true, teacher: false });
    const taken = await call('POST', '/api/users/google/register', await googleRegisterBody('g-dad', 'dad@gmail.com'));
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('email_taken');
    expect(taken.body.error).toContain('綁定');
  });
});

describe('綁定、解除與用 Google 登入', () => {
  it('沒有綁定的 Google：登入回 404，說明先用帳號密碼登入再綁定、或用 Google 註冊', async () => {
    const r = await client().call('POST', '/api/users/google/login', { idToken: await keys.sign('nobody', 'n@gmail.com') });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('google_not_linked');
    expect(r.body.error).toContain('註冊');
  });

  it('登入後可以綁兩個 Google（爸爸、媽媽），email 有遮罩、重複綁不會變兩筆；用哪一個登入都是同一個帳號；解除後那個就不能登入', async () => {
    const { call } = client();
    const me = await createUser(call, { parent: true, teacher: false });
    expect((await call('POST', '/api/users/me/google', { idToken: await keys.sign('g-a', 'papa.lin@gmail.com') }, me.token)).body.google).toEqual([{ id: 'g-a', email: 'pa***@gmail.com' }]);
    await call('POST', '/api/users/me/google', { idToken: await keys.sign('g-b', 'mama.lin@gmail.com') }, me.token);
    const twice = await call('POST', '/api/users/me/google', { idToken: await keys.sign('g-a', 'papa.lin@gmail.com') }, me.token);
    expect(twice.body.google.map((g: { id: string }) => g.id)).toEqual(['g-a', 'g-b']);
    for (const sub of ['g-a', 'g-b']) {
      const r = await call('POST', '/api/users/google/login', { idToken: await keys.sign(sub, null) });
      expect(r.body.user.id).toBe(me.user.id);
    }
    const left = await call('DELETE', '/api/users/me/google/g-a', undefined, me.token);
    expect(left.body.google.map((g: { id: string }) => g.id)).toEqual(['g-b']);
    expect((await call('POST', '/api/users/google/login', { idToken: await keys.sign('g-a', null) })).status).toBe(404);
    expect((await call('DELETE', '/api/users/me/google/g-a', undefined, me.token)).status).toBe(404);
  });

  it('一個 Google 只能綁一個大人帳號：已經綁在別的帳號回 409；別人的綁定不能解除', async () => {
    const { call } = client();
    const a = await createUser(call, { parent: true, teacher: false });
    const b = await createUser(call, { parent: true, teacher: false });
    await call('POST', '/api/users/me/google', { idToken: await keys.sign('g-shared', 's@gmail.com') }, a.token);
    const r = await call('POST', '/api/users/me/google', { idToken: await keys.sign('g-shared', 's@gmail.com') }, b.token);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('google_taken');
    expect((await call('DELETE', '/api/users/me/google/g-shared', undefined, b.token)).status).toBe(404);
    expect((await call('GET', '/api/users/me/google', undefined, a.token)).body.google).toHaveLength(1);
  });

  it('無效的 token 回 401；綁定要用大人權杖；伺服器沒開 Google 登入時相關 API 回 404', async () => {
    const { call } = client();
    expect((await call('POST', '/api/users/google/login', { idToken: 'not-a-token' })).status).toBe(401);
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code, '小安', '1234');
    expect((await call('POST', '/api/users/me/google', { idToken: await keys.sign('g-k', null) }, kid.token)).status).toBe(401);
    const off = makeClient(db);
    expect((await off.call('POST', '/api/users/google/login', { idToken: 'x' })).body.code).toBe('google_disabled');
    expect((await off.call('POST', '/api/users/google/register', { idToken: 'x', username: 'abcd', password: 'teach1234', parent: true, teacher: false })).body.code).toBe('google_disabled');
  });

  it('舊的「Google 直接綁孩子」路由已經拿掉；孩子的 /api/me 沒有 google 欄位', async () => {
    const { call } = client();
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code, '小安', '1234');
    expect((await call('POST', '/api/google/link', { idToken: await keys.sign('g-k', null) }, kid.token)).status).toBe(404);
    expect((await call('POST', '/api/google/login', { idToken: await keys.sign('g-k', null) })).status).toBe(404);
    expect((await call('GET', '/api/me', undefined, kid.token)).body.google).toBeUndefined();
  });

  it('同一個 IP 大量 Google 登入請求會被擋', async () => {
    const { call } = makeClient(db, { google, floodLimit: 2 });
    const ip = { 'x-forwarded-for': '203.0.113.20' };
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await call('POST', '/api/users/google/login', { idToken: 'x' }, undefined, ip)).status);
    expect(statuses).toEqual([401, 401, 429]);
  });
});
