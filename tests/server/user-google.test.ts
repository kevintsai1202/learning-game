/**
 * Google 快速登入綁大人帳號（A4，docs/plans/accounts.md 第 9 節）：用 Google 註冊（email 自動帶入、算驗證過；
 * L1 起不用設帳號名稱與密碼，docs/plans/login-ux-review.md 第 6 節）、登入後綁定與解除、用 Google 登入；一個 Google 只能綁一個大人帳號。
 * 沒有密碼的帳號：改密碼、刪除帳號用綁定的 Google 再確認一次身分；不能解除最後一個 Google。
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

/** 用 Google 註冊的請求內容（L1 起不用帳號名稱與密碼，只要身分） */
async function googleRegisterBody(sub: string, email: string | null, extra: Record<string, unknown> = {}, emailVerified = true) {
  return { idToken: await keys.sign(sub, email, { emailVerified }), parent: true, teacher: false, ...extra };
}

/** 從信件內文取出連結裡的權杖 */
function tokenIn(text: string, kind: 'verify' | 'reset'): string {
  const url = text.match(/https?:\/\/\S+/)?.[0];
  const token = url ? new URL(url).searchParams.get(kind) : null;
  if (!token) throw new Error(`信裡找不到 ${kind} 連結：${text}`);
  return token;
}

describe('用 Google 註冊（L1：不用設帳號名稱與密碼，docs/plans/login-ux-review.md 第 6 節第 1 點）', () => {
  it('帳號名稱從 email 產生、沒有密碼；email 自動帶入而且算驗證過、不寄驗證信；同時綁好 Google，之後用 Google 登入', async () => {
    const { call, mailer } = client();
    const r = await call('POST', '/api/users/google/register', await googleRegisterBody('g-mom', 'Mom.Chen@gmail.com'));
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ username: 'MomChen', email: 'Mom.Chen@gmail.com', emailVerified: true, hasPassword: false, parent: true, teacher: false });
    expect(mailer.outbox).toEqual([]);
    const viaGoogle = await call('POST', '/api/users/google/login', { idToken: await keys.sign('g-mom', 'Mom.Chen@gmail.com') });
    expect(viaGoogle.status).toBe(200);
    expect(viaGoogle.body.user.id).toBe(r.body.user.id);
    expect((await call('GET', '/api/users/me', undefined, viaGoogle.body.token)).body.user).toMatchObject({ username: 'MomChen', hasPassword: false });
    expect((await call('GET', '/api/users/me/google', undefined, r.body.token)).body.google).toEqual([{ id: 'g-mom', email: 'Mo***@gmail.com' }]);
  });

  it('沒有密碼的帳號不能用密碼登入：和帳號不存在、密碼錯一樣回 bad_login（不透露帳號存在），也算猜錯次數', async () => {
    const { call } = client();
    await call('POST', '/api/users/google/register', await googleRegisterBody('g-mom', 'mom.chen@gmail.com'));
    const r = await call('POST', '/api/users/login', { username: 'momchen', password: 'whatever123' });
    const nobody = await call('POST', '/api/users/login', { username: 'nobody_here', password: 'whatever123' });
    expect(r.status).toBe(401);
    expect(r.body).toEqual(nobody.body);
    for (let i = 0; i < 4; i++) await call('POST', '/api/users/login', { username: 'momchen', password: 'whatever123' });
    expect((await call('POST', '/api/users/login', { username: 'momchen', password: 'whatever123' })).status).toBe(423);
  });

  it('帳號名稱撞名時加數字（不分大小寫，也會避開用帳號密碼註冊的帳號）；舊版網頁多送的帳號名稱與密碼會被忽略', async () => {
    const { call } = client();
    await call('POST', '/api/users', { username: 'momchen', password: 'teach1234', email: 'someone@example.com', parent: true, teacher: false });
    const a = await call('POST', '/api/users/google/register', await googleRegisterBody('g-a', 'Mom.Chen@gmail.com'));
    const b = await call('POST', '/api/users/google/register', await googleRegisterBody('g-b', 'momchen@yahoo.com', { username: 'chosen_name', password: 'teach1234' }));
    expect(a.body.user.username).toBe('MomChen2');
    expect(b.body.user.username).toBe('momchen3');
    expect(b.body.user.hasPassword).toBe(false);
    expect((await call('POST', '/api/users/login', { username: 'chosen_name', password: 'teach1234' })).status).toBe(401);
  });

  it('身分照樣要選；Google 沒有驗證過的 email（或沒有 email）不能用 Google 註冊', async () => {
    const { call } = client();
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

describe('沒有密碼的帳號（用 Google 註冊）：用 Google 再確認一次身分', () => {
  /** 用 Google 註冊一位家長，回傳權杖與帳號名稱 */
  async function googleOnly(call: ReturnType<typeof client>['call'], sub = 'g-mom', email = 'mom.chen@gmail.com') {
    const r = await call('POST', '/api/users/google/register', await googleRegisterBody(sub, email));
    expect(r.status).toBe(200);
    return { token: r.body.token as string, username: r.body.user.username as string };
  }

  it('設定密碼：用綁定的 Google 確認身分就能設定，之後帳號名稱＋密碼也能登入；別人的 Google、沒有密碼卻填目前的密碼都不行', async () => {
    const { call } = client();
    const me = await googleOnly(call);
    const stranger = await call('POST', '/api/users/me/password', { idToken: await keys.sign('g-other', 'x@gmail.com'), next: 'brandnew99' }, me.token);
    expect(stranger.status).toBe(401);
    expect(stranger.body.code).toBe('bad_google');
    const guess = await call('POST', '/api/users/me/password', { current: 'whatever123', next: 'brandnew99' }, me.token);
    expect(guess.status).toBe(401);
    expect(guess.body.code).toBe('bad_password');
    expect((await call('POST', '/api/users/me/password', { next: 'brandnew99' }, me.token)).status).toBe(400);
    const ok = await call('POST', '/api/users/me/password', { idToken: await keys.sign('g-mom', 'mom.chen@gmail.com'), next: 'brandnew99' }, me.token);
    expect(ok.status).toBe(200);
    expect((await call('GET', '/api/users/me', undefined, me.token)).body.user.hasPassword).toBe(true);
    expect((await call('POST', '/api/users/login', { username: me.username, password: 'brandnew99' })).status).toBe(200);
  });

  it('有密碼的帳號也可以改用綁定的 Google 確認身分改密碼', async () => {
    const { call } = client();
    const me = await createUser(call, { parent: true, teacher: false });
    await call('POST', '/api/users/me/google', { idToken: await keys.sign('g-dad', 'dad@gmail.com') }, me.token);
    const r = await call('POST', '/api/users/me/password', { idToken: await keys.sign('g-dad', 'dad@gmail.com'), next: 'brandnew99' }, me.token);
    expect(r.status).toBe(200);
    expect((await call('POST', '/api/users/login', { username: me.user.username, password: 'brandnew99' })).status).toBe(200);
  });

  it('刪除帳號：用綁定的 Google 確認身分；別人的 Google、填密碼都不行', async () => {
    const { call } = client();
    const me = await googleOnly(call);
    expect((await call('DELETE', '/api/users/me', { idToken: await keys.sign('g-other', 'x@gmail.com') }, me.token)).body.code).toBe('bad_google');
    expect((await call('DELETE', '/api/users/me', { password: 'whatever123' }, me.token)).body.code).toBe('bad_password');
    expect((await call('DELETE', '/api/users/me', {}, me.token)).status).toBe(400);
    expect((await call('DELETE', '/api/users/me', { idToken: await keys.sign('g-mom', 'mom.chen@gmail.com') }, me.token)).status).toBe(200);
    expect((await call('GET', '/api/users/me', undefined, me.token)).status).toBe(401);
    expect((await call('POST', '/api/users/google/login', { idToken: await keys.sign('g-mom', 'mom.chen@gmail.com') })).status).toBe(404);
  });

  it('沒有密碼時不能解除最後一個 Google（不然就沒辦法登入）；還有別的 Google、或設了密碼之後就可以', async () => {
    const { call } = client();
    const me = await googleOnly(call);
    const last = await call('DELETE', '/api/users/me/google/g-mom', undefined, me.token);
    expect(last.status).toBe(409);
    expect(last.body.code).toBe('last_login_method');
    await call('POST', '/api/users/me/google', { idToken: await keys.sign('g-dad', 'dad@gmail.com') }, me.token);
    expect((await call('DELETE', '/api/users/me/google/g-mom', undefined, me.token)).status).toBe(200);
    expect((await call('DELETE', '/api/users/me/google/g-dad', undefined, me.token)).body.code).toBe('last_login_method');
    await call('POST', '/api/users/me/password', { idToken: await keys.sign('g-dad', 'dad@gmail.com'), next: 'brandnew99' }, me.token);
    expect((await call('DELETE', '/api/users/me/google/g-dad', undefined, me.token)).status).toBe(200);
  });

  it('也能用「忘記密碼」寄到 Google 驗證過的 email 設定密碼（不用新功能）', async () => {
    const { call, mailer } = client();
    const me = await googleOnly(call);
    expect((await call('POST', '/api/users/password/forgot', { login: 'mom.chen@gmail.com' })).status).toBe(200);
    const mail = (mailer.outbox ?? []).filter((m) => m.to.toLowerCase() === 'mom.chen@gmail.com' && m.text.includes('?reset=')).at(-1)!;
    expect((await call('POST', '/api/users/password/reset', { token: tokenIn(mail.text, 'reset'), password: 'brandnew99' })).status).toBe(200);
    expect((await call('POST', '/api/users/login', { username: me.username, password: 'brandnew99' })).status).toBe(200);
  });

  it('伺服器沒開 Google 登入時，用 Google 確認身分回 404 google_disabled', async () => {
    const off = makeClient(db);
    const me = await createUser(off.call, { parent: true, teacher: false });
    expect((await off.call('POST', '/api/users/me/password', { idToken: 'x', next: 'brandnew99' }, me.token)).body.code).toBe('google_disabled');
    expect((await off.call('DELETE', '/api/users/me', { idToken: 'x' }, me.token)).body.code).toBe('google_disabled');
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
    expect((await off.call('POST', '/api/users/google/register', { idToken: 'x', parent: true, teacher: false })).body.code).toBe('google_disabled');
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
