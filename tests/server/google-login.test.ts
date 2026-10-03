/**
 * 家長的 Google 快速登入（綁在孩子的班級帳號上）。
 * 老師的 Google 綁定（綁在房間上）已隨舊的管理密碼一起拿掉；A4 會改成 Google 綁大人帳號，到時候重寫測試（docs/plans/accounts.md）。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalJWKSet } from 'jose';
import { createRoom, createUser, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import { addProfile, createEmptySave } from '../../src/store/save';
import { makeGoogleKeys, TEST_CLIENT_ID } from './googleKeys';
import { createGoogleVerifier, type GoogleConfig } from '../../server/google';
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

/** 開好 Google 登入的 app */
const client = () => makeClient(db, { google });

describe('伺服器設定', () => {
  it('有開 Google 登入時回傳 Client ID；沒開回傳 null', async () => {
    expect((await client().call('GET', '/api/config')).body).toEqual({ googleClientId: TEST_CLIENT_ID });
    expect((await makeClient(db).call('GET', '/api/config')).body).toEqual({ googleClientId: null });
  });
});

describe('退出班級後的 Google 綁定（A2）', () => {
  it('家長名下的角色退出班級：Google 綁定跟著拿掉（綁定靠班級權杖建立，和用班級代碼登入的權杖一起失效）', async () => {
    const { call } = client();
    const { code } = await createRoom(call);
    const mom = await createUser(call, { parent: true, teacher: false });
    const local = addProfile(createEmptySave(), { name: '安安', avatar: { animal: 'rabbit', color: '#ffffff', hat: null } }, new Date()).profiles[0];
    const up = (await call('POST', '/api/parent/kids', { profile: local }, mom.token)).body;
    expect((await call('POST', '/api/join', { code, nickname: '安安', pin: '1234' }, up.token)).status).toBe(200);
    // 知道孩子密碼的人在自己的裝置用班級代碼登入，綁上自己的 Google
    const other = (await call('POST', '/api/login', { code, nickname: '安安', pin: '1234' })).body;
    expect((await call('POST', '/api/google/link', { idToken: await keys.sign('stranger', 'x.y@gmail.com') }, other.token)).status).toBe(200);
    // 家長讓孩子退出班級 → 那個 Google 不能再拿到這個角色的權杖
    expect((await call('POST', `/api/parent/kids/${up.account.id}/leave-class`, {}, mom.token)).status).toBe(200);
    const login = await call('POST', '/api/google/login', { idToken: await keys.sign('stranger', 'x.y@gmail.com') });
    expect(login.status).toBe(404);
    expect(login.body.code).toBe('google_not_linked');
  });
});

describe('家長綁定 Google 與快速登入', () => {
  it('孩子登入後綁定 Google；之後用 Google 登入拿到那位孩子的權杖與存檔', async () => {
    const { call } = client();
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code, '小安', '1234');
    const link = await call('POST', '/api/google/link', { idToken: await keys.sign('mom', 'mom.chen@gmail.com') }, kid.token);
    expect(link.status).toBe(200);
    expect(link.body).toEqual({ google: ['mo***@gmail.com'] });
    expect((await call('GET', '/api/me', undefined, kid.token)).body.google).toEqual(['mo***@gmail.com']);

    const login = await call('POST', '/api/google/login', { idToken: await keys.sign('mom', 'mom.chen@gmail.com') });
    expect(login.status).toBe(200);
    expect(login.body.kids).toHaveLength(1);
    expect(login.body.kids[0]).toMatchObject({ account: { id: kid.account.id, nickname: '小安' }, room: { code, name: '二年一班' }, rev: 1 });
    const me = await call('GET', '/api/me', undefined, login.body.kids[0].token);
    expect(me.body.profile.name).toBe('小安');
  });

  it('一個 Google 綁兩個孩子（兄弟姊妹，可以在不同房間）：一次登入兩位', async () => {
    const { call } = client();
    const a = await createRoom(call);
    const b = await createRoom(call, '二年二班');
    const kid1 = await joinRoom(call, a.code, '哥哥', '1111');
    const kid2 = await joinRoom(call, b.code, '妹妹', '2222');
    for (const k of [kid1, kid2]) await call('POST', '/api/google/link', { idToken: await keys.sign('mom', 'mom@gmail.com') }, k.token);
    const login = await call('POST', '/api/google/login', { idToken: await keys.sign('mom', 'mom@gmail.com') });
    expect(login.body.kids.map((k: { account: { nickname: string } }) => k.account.nickname).sort()).toEqual(['哥哥', '妹妹']);
  });

  it('一個孩子可以綁爸爸和媽媽兩個 Google；重複綁同一個不會變兩筆', async () => {
    const { call } = client();
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code);
    await call('POST', '/api/google/link', { idToken: await keys.sign('mom', 'mom@gmail.com') }, kid.token);
    await call('POST', '/api/google/link', { idToken: await keys.sign('mom', 'mom@gmail.com') }, kid.token);
    const both = await call('POST', '/api/google/link', { idToken: await keys.sign('dad', 'dad@gmail.com') }, kid.token);
    expect(both.body.google.sort()).toEqual(['da***@gmail.com', 'mo***@gmail.com']);
    for (const who of ['mom', 'dad']) {
      expect((await call('POST', '/api/google/login', { idToken: await keys.sign(who, `${who}@gmail.com`) })).body.kids).toHaveLength(1);
    }
  });

  it('沒有綁定的 Google 帳號：回 404 並說明要先用代碼登入再綁定', async () => {
    const { call } = client();
    const r = await call('POST', '/api/google/login', { idToken: await keys.sign('stranger', 'x@gmail.com') });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: 'google_not_linked', error: expect.stringContaining('綁定') });
  });

  it('無效的 token 回 401；綁定也一樣', async () => {
    const { call } = client();
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code);
    expect((await call('POST', '/api/google/login', { idToken: 'forged' })).status).toBe(401);
    expect((await call('POST', '/api/google/link', { idToken: 'forged' }, kid.token)).status).toBe(401);
  });

  it('綁定要用孩子的權杖（老師的不行）', async () => {
    const { call } = client();
    const { token } = await createRoom(call);
    expect((await call('POST', '/api/google/link', { idToken: await keys.sign('mom', 'mom@gmail.com') }, token)).status).toBe(401);
  });

  it('解除綁定後就不能用 Google 登入', async () => {
    const { call } = client();
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code);
    await call('POST', '/api/google/link', { idToken: await keys.sign('mom', 'mom@gmail.com') }, kid.token);
    expect((await call('DELETE', '/api/google/link', undefined, kid.token)).body).toEqual({ google: [] });
    expect((await call('POST', '/api/google/login', { idToken: await keys.sign('mom', 'mom@gmail.com') })).status).toBe(404);
  });

  it('老師移除成員：綁定一併刪除；老師重設密碼：綁定保留', async () => {
    const { call } = client();
    const { code, token } = await createRoom(call);
    const kid1 = await joinRoom(call, code, '小安', '1234');
    const kid2 = await joinRoom(call, code, '小美', '5678');
    await call('POST', '/api/google/link', { idToken: await keys.sign('mom1', 'a@gmail.com') }, kid1.token);
    await call('POST', '/api/google/link', { idToken: await keys.sign('mom2', 'b@gmail.com') }, kid2.token);
    await call('DELETE', `/api/teacher/rooms/${code}/members/${kid1.account.id}`, undefined, token);
    await call('POST', `/api/teacher/rooms/${code}/members/${kid2.account.id}/pin`, { pin: '0000' }, token);
    expect((await call('POST', '/api/google/login', { idToken: await keys.sign('mom1', 'a@gmail.com') })).status).toBe(404);
    expect((await call('POST', '/api/google/login', { idToken: await keys.sign('mom2', 'b@gmail.com') })).status).toBe(200);
  });

  it('伺服器沒開 Google 登入：相關 API 回 404', async () => {
    const { call } = makeClient(db);
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code);
    expect((await call('POST', '/api/google/link', { idToken: 'x' }, kid.token)).body.code).toBe('google_disabled');
    expect((await call('POST', '/api/google/login', { idToken: 'x' })).body.code).toBe('google_disabled');
  });

  it('同一個 IP 大量 Google 登入請求會被擋', async () => {
    const { call } = makeClient(db, { google, floodLimit: 2 });
    const ip = { 'x-forwarded-for': '203.0.113.20' };
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await call('POST', '/api/google/login', { idToken: 'x' }, undefined, ip)).status);
    expect(statuses).toEqual([401, 401, 429]);
  });
});
