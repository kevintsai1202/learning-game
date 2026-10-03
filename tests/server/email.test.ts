/**
 * Email 驗證與忘記密碼（A3，docs/plans/accounts.md 第 7 節）：用測試信箱（記憶體）收信、假時鐘控制效期。
 * email 只能綁一個帳號（使用者 2026-10-04 決定）；忘記密碼一律回同一句話，不透露帳號是否存在。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeClient, openTestDb, resetDb } from './helpers';
import type { Db } from '../../server/db';
import { createMailer, type Mailer } from '../../server/mail';
import { appBaseUrl, DEFAULT_APP_URL } from '../../server/email';

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

/** 正式環境與 e2e 的前端網址（允許清單） */
const ORIGINS = ['http://localhost:4183', 'https://kevintsai1202.github.io', 'https://learning-island.zeabur.app'];
const APP = 'https://kevintsai1202.github.io/learning-game/';
const MINUTE = 60_000;

/** 開好測試信箱與假時鐘的 app */
function setup(mailer: Mailer = createMailer({ TEST_MAIL_OUTBOX: '1', ALLOW_TEST_MAIL: '1' }).mailer) {
  const clock = { t: Date.parse('2026-10-04T08:00:00Z') };
  const { call } = makeClient(db, { now: () => new Date(clock.t), mailer, allowedOrigins: ORIGINS });
  /** 寄給某個信箱的信 */
  const mailsTo = (to: string) => (mailer.outbox ?? []).filter((m) => m.to.toLowerCase() === to.toLowerCase());
  return { call, clock, mailer, mailsTo };
}

/** 從信件內文取出連結裡的權杖 */
function tokenIn(text: string, kind: 'verify' | 'reset'): string {
  const url = text.match(/https?:\/\/\S+/)?.[0];
  const token = url ? new URL(url).searchParams.get(kind) : null;
  if (!token) throw new Error(`信裡找不到 ${kind} 連結：${text}`);
  return token;
}

let seq = 0;
/** 註冊一位家長；回傳帳號名稱、email、權杖與註冊回應 */
async function register(call: ReturnType<typeof setup>['call'], email?: string) {
  const username = `mail_user_${++seq}`;
  const mail = email ?? `${username}@example.com`;
  const r = await call('POST', '/api/users', { username, password: 'teach1234', email: mail, parent: true, teacher: false, appUrl: APP });
  return { username, email: mail, token: r.body.token as string, res: r };
}

/** 註冊並完成 email 驗證 */
async function registerVerified(s: ReturnType<typeof setup>) {
  const u = await register(s.call);
  const verify = tokenIn(s.mailsTo(u.email).at(-1)!.text, 'verify');
  expect((await s.call('POST', '/api/users/email/verify', { token: verify })).status).toBe(200);
  return u;
}

describe('註冊與驗證 email', () => {
  it('註冊後寄驗證信（連結用前端的網址）；打開連結就驗證好（不用登入）；同一個連結不能再用', async () => {
    const s = setup();
    const u = await register(s.call);
    expect(u.res.status).toBe(200);
    expect(u.res.body).toMatchObject({ user: { emailVerified: false }, verifyMail: 'sent' });
    const mails = s.mailsTo(u.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain(`${APP}?verify=`);
    expect(mails[0].text).toContain(u.username);
    const token = tokenIn(mails[0].text, 'verify');
    expect((await s.call('POST', '/api/users/email/verify', { token })).status).toBe(200);
    expect((await s.call('GET', '/api/users/me', undefined, u.token)).body.user.emailVerified).toBe(true);
    const again = await s.call('POST', '/api/users/email/verify', { token });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('bad_token');
  });

  it('驗證連結 24 小時後失效；改 email 之後舊連結失效，新的 email 收到新連結', async () => {
    const s = setup();
    const u = await register(s.call);
    const first = tokenIn(s.mailsTo(u.email)[0].text, 'verify');
    s.clock.t += 24 * 60 * MINUTE + MINUTE;
    expect((await s.call('POST', '/api/users/email/verify', { token: first })).status).toBe(400);
    expect((await s.call('POST', '/api/users/me/verify/resend', { appUrl: APP }, u.token)).status).toBe(200);
    const resent = tokenIn(s.mailsTo(u.email).at(-1)!.text, 'verify');
    s.clock.t += 2 * MINUTE;
    const changed = await s.call('PATCH', '/api/users/me', { email: 'new.mail@example.com', appUrl: APP }, u.token);
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ user: { email: 'new.mail@example.com', emailVerified: false }, verifyMail: 'sent' });
    expect((await s.call('POST', '/api/users/email/verify', { token: resent })).status).toBe(400);
    const fresh = tokenIn(s.mailsTo('new.mail@example.com')[0].text, 'verify');
    expect((await s.call('POST', '/api/users/email/verify', { token: fresh })).status).toBe(200);
  });

  it('連結的網址：允許清單裡的前端網址（保留路徑、去掉檔名與參數）；不在清單或格式不對就用 GitHub Pages', () => {
    const allowed = new Set(ORIGINS);
    expect(appBaseUrl(APP, allowed)).toBe(APP);
    expect(appBaseUrl('https://kevintsai1202.github.io/learning-game/index.html?x=1#top', allowed)).toBe(APP);
    expect(appBaseUrl('https://learning-island.zeabur.app/', allowed)).toBe('https://learning-island.zeabur.app/');
    expect(appBaseUrl('http://localhost:4183/', allowed)).toBe('http://localhost:4183/');
    expect(appBaseUrl('https://evil.example/learning-game/', allowed)).toBe(DEFAULT_APP_URL);
    expect(appBaseUrl('不是網址', allowed)).toBe(DEFAULT_APP_URL);
    expect(appBaseUrl(undefined, allowed)).toBe(DEFAULT_APP_URL);
    expect(DEFAULT_APP_URL).toBe(APP);
  });

  it('重寄驗證信：每分鐘 1 封、每天 10 封（超過回 429）；已經驗證過回 409', async () => {
    const s = setup();
    const u = await register(s.call);
    const tooSoon = await s.call('POST', '/api/users/me/verify/resend', { appUrl: APP }, u.token);
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.retryAfter).toBeGreaterThan(0);
    for (let i = 0; i < 9; i++) {
      s.clock.t += MINUTE + 1000;
      expect((await s.call('POST', '/api/users/me/verify/resend', { appUrl: APP }, u.token)).status).toBe(200);
    }
    expect(s.mailsTo(u.email)).toHaveLength(10);
    s.clock.t += MINUTE + 1000;
    expect((await s.call('POST', '/api/users/me/verify/resend', { appUrl: APP }, u.token)).status).toBe(429);
    const token = tokenIn(s.mailsTo(u.email).at(-1)!.text, 'verify');
    expect((await s.call('POST', '/api/users/email/verify', { token })).status).toBe(200);
    s.clock.t += 24 * 60 * MINUTE;
    expect((await s.call('POST', '/api/users/me/verify/resend', { appUrl: APP }, u.token)).status).toBe(409);
  });

  it('沒有設定寄信：註冊照常成功（verifyMail 是 disabled），重寄回 503', async () => {
    const s = setup(createMailer({}).mailer);
    const u = await register(s.call);
    expect(u.res.status).toBe(200);
    expect(u.res.body.verifyMail).toBe('disabled');
    const r = await s.call('POST', '/api/users/me/verify/resend', { appUrl: APP }, u.token);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('伺服器沒有設定寄信');
  });

  it('email 只能綁一個帳號（不分大小寫）：註冊與改 email 都擋；改成同一個 email 的不同大小寫不用重新驗證', async () => {
    const s = setup();
    const a = await registerVerified(s);
    const dup = await s.call('POST', '/api/users', { username: 'other_user', password: 'teach1234', email: a.email.toUpperCase(), parent: true, teacher: false });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('email_taken');
    const b = await register(s.call);
    const steal = await s.call('PATCH', '/api/users/me', { email: a.email.toUpperCase() }, b.token);
    expect(steal.status).toBe(409);
    expect(steal.body.code).toBe('email_taken');
    const recase = await s.call('PATCH', '/api/users/me', { email: a.email.toUpperCase() }, a.token);
    expect(recase.status).toBe(200);
    expect(recase.body.user).toMatchObject({ email: a.email.toUpperCase(), emailVerified: true });
  });
});

describe('忘記密碼與重設', () => {
  it('忘記密碼：一律回同一句話；只寄給驗證過的 email；帳號名稱或 email（不分大小寫）都可以', async () => {
    const s = setup();
    const unknown = await s.call('POST', '/api/users/password/forgot', { login: 'nobody_here', appUrl: APP });
    expect(unknown.status).toBe(200);
    const unverified = await register(s.call);
    const r1 = await s.call('POST', '/api/users/password/forgot', { login: unverified.username, appUrl: APP });
    expect(r1.body).toEqual(unknown.body);
    expect(s.mailsTo(unverified.email).filter((m) => m.text.includes('?reset='))).toHaveLength(0);
    const u = await registerVerified(s);
    expect((await s.call('POST', '/api/users/password/forgot', { login: u.username.toUpperCase(), appUrl: APP })).body).toEqual(unknown.body);
    s.clock.t += MINUTE + 1000;
    await s.call('POST', '/api/users/password/forgot', { login: u.email.toUpperCase(), appUrl: APP });
    const resets = s.mailsTo(u.email).filter((m) => m.text.includes('?reset='));
    expect(resets).toHaveLength(2);
    expect(resets[0].text).toContain(`${APP}?reset=`);
  });

  it('重設密碼：密碼不合規則時連結還能用；成功後所有裝置登出，新密碼可以登入、舊的不行；連結只能用一次、30 分鐘後失效', async () => {
    const s = setup();
    const u = await registerVerified(s);
    await s.call('POST', '/api/users/password/forgot', { login: u.username, appUrl: APP });
    const token = tokenIn(s.mailsTo(u.email).at(-1)!.text, 'reset');
    const weak = await s.call('POST', '/api/users/password/reset', { token, password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('bad_password');
    expect((await s.call('POST', '/api/users/password/reset', { token, password: 'brandnew99' })).status).toBe(200);
    expect((await s.call('GET', '/api/users/me', undefined, u.token)).status).toBe(401);
    expect((await s.call('POST', '/api/users/login', { username: u.username, password: 'teach1234' })).status).toBe(401);
    expect((await s.call('POST', '/api/users/login', { username: u.username, password: 'brandnew99' })).status).toBe(200);
    const reuse = await s.call('POST', '/api/users/password/reset', { token, password: 'another99' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('bad_token');
    s.clock.t += MINUTE + 1000;
    await s.call('POST', '/api/users/password/forgot', { login: u.username, appUrl: APP });
    const late = tokenIn(s.mailsTo(u.email).at(-1)!.text, 'reset');
    s.clock.t += 31 * MINUTE;
    expect((await s.call('POST', '/api/users/password/reset', { token: late, password: 'another99' })).status).toBe(400);
  });

  it('忘記密碼的頻率限制：超過時照常回應，但不寄信、不建權杖', async () => {
    const s = setup();
    const u = await registerVerified(s);
    const first = await s.call('POST', '/api/users/password/forgot', { login: u.username, appUrl: APP });
    const second = await s.call('POST', '/api/users/password/forgot', { login: u.username, appUrl: APP });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(s.mailsTo(u.email).filter((m) => m.text.includes('?reset='))).toHaveLength(1);
    expect((await db.query("SELECT 1 FROM email_tokens WHERE purpose = 'reset'")).length).toBe(1);
  });

  it('測試信箱的路由只在測試模式有', async () => {
    const s = setup();
    const u = await register(s.call);
    const r = await s.call('GET', '/api/test/mails');
    expect(r.status).toBe(200);
    expect(r.body.mails.map((m: { to: string }) => m.to)).toContain(u.email);
    expect((await setup(createMailer({}).mailer).call('GET', '/api/test/mails')).status).toBe(404);
  });
});
