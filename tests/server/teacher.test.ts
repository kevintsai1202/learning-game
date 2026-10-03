/**
 * 老師用大人帳號管理班級（A1）：一個老師可以有好幾個班級；只能管自己的班級（別人的與不存在的一樣回 404，
 * 不透露代碼存在）；只有老師身分能用；舊的「房間代碼＋管理密碼」API 已拿掉。規格見 docs/plans/accounts.md。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoom, createUser, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
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

describe('建立與列出班級', () => {
  it('建立班級拿到 6 位數代碼；可以建好幾個，清單依建立順序並附成員數', async () => {
    const { call } = makeClient(db);
    const t = await createUser(call);
    const a = await call('POST', '/api/teacher/rooms', { name: ' 二年一班 ' }, t.token);
    expect(a.status).toBe(200);
    expect(a.body.room).toEqual({ code: expect.stringMatching(/^[1-9]\d{5}$/), name: '二年一班', joinOpen: true, chatOpen: true, giftsOpen: true });
    await call('POST', '/api/teacher/rooms', { name: '安親班' }, t.token);
    await joinRoom(call, a.body.room.code, '小安');
    const list = await call('GET', '/api/teacher/rooms', undefined, t.token);
    expect(list.status).toBe(200);
    expect(list.body.rooms.map((r: { name: string; members: number }) => [r.name, r.members])).toEqual([
      ['二年一班', 1],
      ['安親班', 0],
    ]);
  });

  it('班級名稱空白或超過 20 個字都不行', async () => {
    const { call } = makeClient(db);
    const t = await createUser(call);
    for (const name of ['   ', '一'.repeat(21)]) {
      const r = await call('POST', '/api/teacher/rooms', { name }, t.token);
      expect(r.status, name).toBe(400);
      expect(r.body.code).toBe('bad_name');
    }
  });

  it('只有家長身分不能用老師的功能（403）；加上老師身分就可以', async () => {
    const { call } = makeClient(db);
    const p = await createUser(call, { parent: true, teacher: false });
    expect((await call('GET', '/api/teacher/rooms', undefined, p.token)).status).toBe(403);
    const denied = await call('POST', '/api/teacher/rooms', { name: '二年一班' }, p.token);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('not_teacher');
    await call('PATCH', '/api/users/me', { teacher: true }, p.token);
    expect((await call('POST', '/api/teacher/rooms', { name: '二年一班' }, p.token)).status).toBe(200);
  });
});

describe('只能管自己的班級', () => {
  it('別的老師的班級或不存在的代碼：讀取、設定、重設密碼、移出都回 404，對方的資料沒被動到', async () => {
    const { call } = makeClient(db);
    const mine = await createRoom(call);
    const other = await createRoom(call, '二年二班');
    const kid = await joinRoom(call, other.code, '小美');
    const attempts: [string, string, unknown?][] = [
      ['GET', `/api/teacher/rooms/${other.code}`],
      ['PATCH', `/api/teacher/rooms/${other.code}`, { chatOpen: false }],
      ['POST', `/api/teacher/rooms/${other.code}/members/${kid.account.id}/pin`, { pin: '0000' }],
      ['DELETE', `/api/teacher/rooms/${other.code}/members/${kid.account.id}`],
      ['GET', '/api/teacher/rooms/999999'],
    ];
    for (const [method, path, body] of attempts) {
      const r = await call(method, path, body, mine.token);
      expect(r.status, `${method} ${path}`).toBe(404);
      expect(r.body.code, `${method} ${path}`).toBe('no_room');
    }
    expect((await call('POST', '/api/login', { code: other.code, nickname: '小美', pin: '1234' })).status).toBe(200);
    expect((await call('GET', `/api/teacher/rooms/${other.code}`, undefined, other.token)).body.room.chatOpen).toBe(true);
  });

  it('同一位老師的另一班成員：用這一班的代碼重設密碼或移出回 404', async () => {
    const { call } = makeClient(db);
    const t = await createUser(call);
    const a = await createRoom(call, '二年一班', t.token);
    const b = await createRoom(call, '安親班', t.token);
    const kid = await joinRoom(call, b.code, '小安');
    expect((await call('POST', `/api/teacher/rooms/${a.code}/members/${kid.account.id}/pin`, { pin: '0000' }, t.token)).status).toBe(404);
    expect((await call('DELETE', `/api/teacher/rooms/${a.code}/members/${kid.account.id}`, undefined, t.token)).status).toBe(404);
    expect((await call('GET', `/api/teacher/rooms/${b.code}`, undefined, t.token)).body.members).toHaveLength(1);
  });

  it('孩子的權杖不能用老師的功能', async () => {
    const { call } = makeClient(db);
    const room = await createRoom(call);
    const kid = await joinRoom(call, room.code);
    expect((await call('GET', '/api/teacher/rooms', undefined, kid.token)).status).toBe(401);
    expect((await call('GET', `/api/teacher/rooms/${room.code}`, undefined, kid.token)).status).toBe(401);
  });
});

describe('舊的管理密碼 API 已拿掉', () => {
  it('建立房間、管理密碼登入、舊的管理頁、老師的 Google 登入都回 404', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    expect((await call('POST', '/api/rooms', { name: '二年一班', password: 'teach123' })).status).toBe(404);
    expect((await call('POST', '/api/teacher/login', { code, password: 'teach123' })).status).toBe(404);
    expect((await call('GET', '/api/teacher/room', undefined, token)).status).toBe(404);
    expect((await call('POST', '/api/teacher/google/login', { idToken: 'x' })).status).toBe(404);
  });
});
