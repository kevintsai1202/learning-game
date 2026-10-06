/**
 * 大人帳號（家長、老師）：註冊、登入、鎖定、身分、改密碼、登出。
 * 規格見 docs/plans/accounts.md 的 A1。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeClock, makeClient, openTestDb, resetDb } from './helpers';
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

/** 註冊用的基本資料 */
const WANG = { username: 'Teacher_Wang', password: 'secret123', email: 'wang@example.com', parent: false, teacher: true };

describe('註冊', () => {
  it('成功：回權杖與帳號資料（帳號名稱保留大小寫）；用權杖讀得到自己', async () => {
    const { call } = makeClient(db);
    const r = await call('POST', '/api/users', WANG);
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ username: 'Teacher_Wang', email: 'wang@example.com', emailVerified: false, hasPassword: true, parent: false, teacher: true });
    expect(typeof r.body.token).toBe('string');
    const me = await call('GET', '/api/users/me', undefined, r.body.token);
    expect(me.status).toBe(200);
    expect(me.body.user).toEqual(r.body.user);
  });

  it('帳號名稱、密碼、email 不合規則：400 並說明是哪一項', async () => {
    const { call } = makeClient(db);
    expect((await call('POST', '/api/users', { ...WANG, username: 'abc' })).body.code).toBe('bad_username');
    expect((await call('POST', '/api/users', { ...WANG, username: '王老師' })).body.code).toBe('bad_username');
    expect((await call('POST', '/api/users', { ...WANG, password: 'short' })).body.code).toBe('bad_password');
    expect((await call('POST', '/api/users', { ...WANG, email: 'not-an-email' })).body.code).toBe('bad_email');
    const r = await call('POST', '/api/users', { ...WANG, username: 'abc' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('4～20');
  });

  it('家長、老師至少勾一個', async () => {
    const { call } = makeClient(db);
    const r = await call('POST', '/api/users', { ...WANG, parent: false, teacher: false });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('no_role');
  });

  it('帳號名稱不分大小寫不能重複', async () => {
    const { call } = makeClient(db);
    expect((await call('POST', '/api/users', WANG)).status).toBe(200);
    const r = await call('POST', '/api/users', { ...WANG, username: 'TEACHER_WANG', email: 'other@example.com' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('username_taken');
  });
});

describe('登入', () => {
  it('帳號名稱不分大小寫；密碼錯或沒有這個帳號都回同一個錯誤', async () => {
    const { call } = makeClient(db);
    await call('POST', '/api/users', WANG);
    const ok = await call('POST', '/api/users/login', { username: 'teacher_wang', password: 'secret123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.username).toBe('Teacher_Wang');
    const wrong = await call('POST', '/api/users/login', { username: 'Teacher_Wang', password: 'wrong-pass' });
    const missing = await call('POST', '/api/users/login', { username: 'nobody_here', password: 'secret123' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error).toBe(missing.body.error);
  });

  it('連續錯 5 次鎖 5 分鐘（鎖定期間密碼對也進不去），時間過了就恢復', async () => {
    const clock = fakeClock();
    const { call } = makeClient(db, { now: clock.now });
    await call('POST', '/api/users', WANG);
    for (let i = 0; i < 5; i++) expect((await call('POST', '/api/users/login', { username: 'Teacher_Wang', password: 'wrong-pass' })).status).toBe(401);
    const locked = await call('POST', '/api/users/login', { username: 'Teacher_Wang', password: 'secret123' });
    expect(locked.status).toBe(423);
    expect(locked.body.retryAfter).toBeGreaterThan(0);
    clock.advance(5 * 60_000 + 1000);
    expect((await call('POST', '/api/users/login', { username: 'Teacher_Wang', password: 'secret123' })).status).toBe(200);
  });
});

describe('身分與 email', () => {
  it('可以加上另一個身分；兩個都拿掉不行；改 email 之後要重新驗證', async () => {
    const { call } = makeClient(db);
    const { token } = (await call('POST', '/api/users', WANG)).body;
    const both = await call('PATCH', '/api/users/me', { parent: true }, token);
    expect(both.status).toBe(200);
    expect(both.body.user).toMatchObject({ parent: true, teacher: true });
    const none = await call('PATCH', '/api/users/me', { parent: false, teacher: false }, token);
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('no_role');
    const mail = await call('PATCH', '/api/users/me', { email: ' new@example.com ' }, token);
    expect(mail.body.user).toMatchObject({ email: 'new@example.com', emailVerified: false });
    expect((await call('PATCH', '/api/users/me', { email: 'bad' }, token)).body.code).toBe('bad_email');
  });
});

describe('改密碼與登出', () => {
  it('舊密碼要對；改完舊密碼不能登入、新密碼可以；其他裝置的登入失效，這台照常', async () => {
    const { call } = makeClient(db);
    const here = (await call('POST', '/api/users', WANG)).body.token;
    const other = (await call('POST', '/api/users/login', { username: 'Teacher_Wang', password: 'secret123' })).body.token;
    const bad = await call('POST', '/api/users/me/password', { current: 'wrong-pass', next: 'newpass123' }, here);
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('bad_password');
    expect((await call('POST', '/api/users/me/password', { current: 'secret123', next: 'short' }, here)).body.code).toBe('bad_password');
    expect((await call('POST', '/api/users/me/password', { current: 'secret123', next: 'newpass123' }, here)).status).toBe(200);
    expect((await call('POST', '/api/users/login', { username: 'Teacher_Wang', password: 'secret123' })).status).toBe(401);
    expect((await call('POST', '/api/users/login', { username: 'Teacher_Wang', password: 'newpass123' })).status).toBe(200);
    expect((await call('GET', '/api/users/me', undefined, other)).status).toBe(401);
    expect((await call('GET', '/api/users/me', undefined, here)).status).toBe(200);
  });

  it('登出後權杖失效；沒有權杖或權杖錯誤回 401', async () => {
    const { call } = makeClient(db);
    const { token } = (await call('POST', '/api/users', WANG)).body;
    expect((await call('POST', '/api/logout', {}, token)).status).toBe(200);
    expect((await call('GET', '/api/users/me', undefined, token)).status).toBe(401);
    expect((await call('GET', '/api/users/me')).status).toBe(401);
    expect((await call('GET', '/api/users/me', undefined, 'not-a-real-token')).status).toBe(401);
  });
});
