import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVATAR, createRoom, fakeClock, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import type { Db } from '../../server/db';
import { addProfile, createEmptySave } from '../../src/store/save';

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

// 老師建立班級與登入（大人帳號）的測試在 teacher.test.ts 與 users.test.ts

describe('孩子加入班級', () => {
  it('第一次加入：用選的外觀建立新角色，名字就是暱稱', async () => {
    const { call } = makeClient(db);
    const { code } = await createRoom(call);
    const r = await joinRoom(call, code, '  小安 ');
    expect(r.account.nickname).toBe('小安');
    expect(r.profile).toMatchObject({ name: '小安', coins: 0, avatar: AVATAR });
    expect(r.rev).toBe(1);
    expect(r.room).toEqual({ code, name: '二年一班' });
  });

  it('帶本機的進度加入：保留角色 id 與進度，名字改成暱稱，不存本機的雲端標記', async () => {
    const { call } = makeClient(db);
    const { code } = await createRoom(call);
    const local = addProfile(createEmptySave(), { name: '安安', avatar: AVATAR }, new Date()).profiles[0];
    const profile = { ...local, coins: 37, cloud: { server: 'x', room: 'y', roomName: 'z', accountId: 'w' } };
    const r = await joinRoom(call, code, '小安', '1234', { profile });
    expect(r.profile).toMatchObject({ id: local.id, name: '小安', coins: 37 });
    expect(r.profile.cloud).toBeUndefined();
    const me = await call('GET', '/api/me', undefined, r.token);
    expect(me.body.profile.coins).toBe(37);
  });

  it('上傳的進度格式不符就拒絕', async () => {
    const { call } = makeClient(db);
    const { code } = await createRoom(call);
    const r = await call('POST', '/api/join', { code, nickname: '小安', pin: '1234', profile: { id: 'p1', coins: -5 } });
    expect(r.status).toBe(400);
  });

  it('同房間暱稱不能重複（前後空白、英文大小寫視為相同）；不同房間可以', async () => {
    const { call } = makeClient(db);
    const a = await createRoom(call);
    const b = await createRoom(call, '二年二班');
    await joinRoom(call, a.code, 'Amy');
    expect((await call('POST', '/api/join', { code: a.code, nickname: ' amy ', pin: '1234', avatar: AVATAR })).status).toBe(409);
    expect((await call('POST', '/api/join', { code: b.code, nickname: 'Amy', pin: '1234', avatar: AVATAR })).status).toBe(200);
  });

  it('暱稱不能空白、超過 12 字、像電話號碼或網址；密碼必須是 4 位數字', async () => {
    const { call } = makeClient(db);
    const { code } = await createRoom(call);
    for (const nickname of ['   ', '一二三四五六七八九十一二三', '0912345678', 'www.abc.tw', 'http://x']) {
      expect((await call('POST', '/api/join', { code, nickname, pin: '1234', avatar: AVATAR })).status, nickname).toBe(400);
    }
    expect((await call('POST', '/api/join', { code, nickname: '小安', pin: '12a4', avatar: AVATAR })).status).toBe(400);
  });

  it('房間不存在回 404；老師關閉加入後回 403', async () => {
    const { call } = makeClient(db);
    expect((await call('POST', '/api/join', { code: '999999', nickname: '小安', pin: '1234', avatar: AVATAR })).status).toBe(404);
    const { code, token } = await createRoom(call);
    expect((await call('PATCH', `/api/teacher/rooms/${code}`, { joinOpen: false }, token)).status).toBe(200);
    expect((await call('POST', '/api/join', { code, nickname: '小安', pin: '1234', avatar: AVATAR })).status).toBe(403);
  });
});

describe('孩子登入', () => {
  it('代碼＋暱稱＋密碼正確就拿到權杖與存檔；錯誤回 401', async () => {
    const { call } = makeClient(db);
    const { code } = await createRoom(call);
    await joinRoom(call, code, '小安', '1234');
    const ok = await call('POST', '/api/login', { code, nickname: '小安', pin: '1234' });
    expect(ok.status).toBe(200);
    expect(ok.body.profile.name).toBe('小安');
    expect(ok.body.room).toEqual({ code, name: '二年一班' });
    expect((await call('POST', '/api/login', { code, nickname: '小安', pin: '0000' })).status).toBe(401);
    expect((await call('POST', '/api/login', { code, nickname: '沒有這個人', pin: '1234' })).status).toBe(401);
  });

  it('同一個暱稱連錯 5 次鎖定；同教室（同 IP）的其他孩子不受影響', async () => {
    const clock = fakeClock();
    const { call } = makeClient(db, { now: clock.now });
    const { code } = await createRoom(call);
    await joinRoom(call, code, '小安', '1234');
    await joinRoom(call, code, '小美', '5678');
    const ip = { 'x-forwarded-for': '203.0.113.7' };
    for (let i = 0; i < 5; i++) await call('POST', '/api/login', { code, nickname: '小安', pin: '0000' }, undefined, ip);
    expect((await call('POST', '/api/login', { code, nickname: '小安', pin: '1234' }, undefined, ip)).status).toBe(423);
    expect((await call('POST', '/api/login', { code, nickname: '小美', pin: '5678' }, undefined, ip)).status).toBe(200);
    clock.advance(5 * 60_000 + 1);
    expect((await call('POST', '/api/login', { code, nickname: '小安', pin: '1234' }, undefined, ip)).status).toBe(200);
  });

  it('同一個 IP 短時間大量請求才會被擋（429）', async () => {
    const { call } = makeClient(db, { floodLimit: 3 });
    const { code } = await createRoom(call);
    const ip = { 'x-forwarded-for': '203.0.113.9' };
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await call('POST', '/api/login', { code, nickname: '小安', pin: '0000' }, undefined, ip)).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it('權杖 180 天後到期；沒有權杖回 401', async () => {
    const clock = fakeClock();
    const { call } = makeClient(db, { now: clock.now });
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code);
    expect((await call('GET', '/api/me')).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, kid.token)).status).toBe(200);
    clock.advance(181 * 24 * 3600 * 1000);
    expect((await call('GET', '/api/me', undefined, kid.token)).status).toBe(401);
  });

  it('登出後權杖失效', async () => {
    const { call } = makeClient(db);
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code);
    expect((await call('POST', '/api/logout', {}, kid.token)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, kid.token)).status).toBe(401);
  });
});

describe('老師管理成員', () => {
  it('成員列表顯示暱稱、金幣、總星數、錯題數、回合數、最後上線', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    const local = addProfile(createEmptySave(), { name: '安安', avatar: AVATAR }, new Date()).profiles[0];
    await joinRoom(call, code, '小安', '1234', { profile: { ...local, coins: 12, bestStars: { a: 3, b: 2 } } });
    const r = await call('GET', `/api/teacher/rooms/${code}`, undefined, token);
    expect(r.body.members).toEqual([
      expect.objectContaining({ id: expect.any(String), nickname: '小安', coins: 12, stars: 5, wrongCount: 0, sessions: 0, lastSeen: expect.any(String) }),
    ]);
  });

  it('重設密碼：舊密碼不能登入、新密碼可以，那位孩子在其他裝置的權杖失效', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    const kid = await joinRoom(call, code, '小安', '1234');
    expect((await call('POST', `/api/teacher/rooms/${code}/members/${kid.account.id}/pin`, { pin: '4321' }, token)).status).toBe(200);
    expect((await call('POST', '/api/login', { code, nickname: '小安', pin: '1234' })).status).toBe(401);
    expect((await call('POST', '/api/login', { code, nickname: '小安', pin: '4321' })).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, kid.token)).status).toBe(401);
  });

  it('移除成員：權杖失效、不能再登入，暱稱可以重新使用', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    const kid = await joinRoom(call, code, '小安', '1234');
    expect((await call('DELETE', `/api/teacher/rooms/${code}/members/${kid.account.id}`, undefined, token)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, kid.token)).status).toBe(401);
    expect((await call('POST', '/api/login', { code, nickname: '小安', pin: '1234' })).status).toBe(401);
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, token)).body.members).toEqual([]);
    await joinRoom(call, code, '小安', '9999');
  });

  it('老師只能管自己房間的成員；孩子的權杖不能用老師的功能，反之亦然', async () => {
    const { call } = makeClient(db);
    const a = await createRoom(call);
    const b = await createRoom(call, '二年二班');
    const kid = await joinRoom(call, a.code);
    expect((await call('DELETE', `/api/teacher/rooms/${a.code}/members/${kid.account.id}`, undefined, b.token)).status).toBe(404);
    expect((await call('GET', `/api/teacher/rooms/${a.code}`, undefined, kid.token)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, a.token)).status).toBe(401);
  });
});

describe('其他', () => {
  it('健康檢查', async () => {
    const { call } = makeClient(db);
    expect((await call('GET', '/healthz')).body).toEqual({ ok: true });
  });

  it('CORS 只允許設定的網址', async () => {
    const { app } = makeClient(db, { allowedOrigins: ['https://kevintsai1202.github.io'] });
    const ok = await app.request('/api/login', { method: 'OPTIONS', headers: { origin: 'https://kevintsai1202.github.io', 'access-control-request-method': 'POST' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://kevintsai1202.github.io');
    const bad = await app.request('/api/login', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('JSON 格式錯誤回 400，不會讓伺服器出錯', async () => {
    const { app } = makeClient(db);
    const r = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    expect(r.status).toBe(400);
  });
});
