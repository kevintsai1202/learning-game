/**
 * 老師用大人帳號管理班級（A1）：一個老師可以有好幾個班級；只能管自己的班級（別人的與不存在的一樣回 404，
 * 不透露代碼存在）；只有老師身分能用；舊的「房間代碼＋管理密碼」API 已拿掉。規格見 docs/plans/accounts.md。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVATAR, createRoom, createUser, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import { addProfile, createEmptySave } from '../../src/store/save';
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
    expect(a.body.room).toEqual({ code: expect.stringMatching(/^[1-9]\d{5}$/), name: '二年一班', joinOpen: true, chatOpen: true, giftsOpen: true, curriculum: null, hasClassPassword: false });
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

describe('班級教材版本（老師 GM 的 G0，docs/plans/teacher-gm.md 第 4 節）', () => {
  /** 老師設定的班級版本 */
  const CLASS = { zh: 'nani-zh', math: 'hanlin-math', term: '上' };

  it('新班級沒有統一版本（null）；老師設定後，管理頁、孩子的同步與登入回應都帶班級版本；設 null 取消統一', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, token)).body.room.curriculum).toBeNull();
    const kid = await joinRoom(call, code);
    expect(kid.room).toEqual({ code, name: '二年一班', curriculum: null });

    const set = await call('PATCH', `/api/teacher/rooms/${code}`, { curriculum: CLASS }, token);
    expect(set.status).toBe(200);
    expect(set.body.room.curriculum).toEqual(CLASS);
    expect((await call('POST', '/api/ops', { ops: [] }, kid.token)).body.room).toEqual({ code, name: '二年一班', curriculum: CLASS });
    expect((await call('POST', '/api/login', { code, nickname: '小安', pin: '1234' })).body.room.curriculum).toEqual(CLASS);

    // 只改開關時版本不變
    await call('PATCH', `/api/teacher/rooms/${code}`, { chatOpen: false }, token);
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, token)).body.room).toMatchObject({ chatOpen: false, curriculum: CLASS });

    const cleared = await call('PATCH', `/api/teacher/rooms/${code}`, { curriculum: null }, token);
    expect(cleared.body.room.curriculum).toBeNull();
    expect((await call('POST', '/api/ops', { ops: [] }, kid.token)).body.room.curriculum).toBeNull();
  });

  it('班級版本不改孩子自己的設定（孩子的設定留給我的島）', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    const kid = await joinRoom(call, code);
    const own = kid.profile.curriculum;
    await call('PATCH', `/api/teacher/rooms/${code}`, { curriculum: CLASS }, token);
    const after = await call('POST', '/api/ops', { ops: [] }, kid.token);
    expect(after.body.profile.curriculum).toEqual(own);
    expect(after.body.rev).toBe(kid.rev);
  });

  it('版本格式不對回 400，設定不變', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    for (const curriculum of [{ ...CLASS, term: '中' }, { zh: 'nani-zh', term: '上' }, { ...CLASS, zh: 'x'.repeat(61) }, 'nani-zh']) {
      const r = await call('PATCH', `/api/teacher/rooms/${code}`, { curriculum }, token);
      expect(r.status, JSON.stringify(curriculum)).toBe(400);
    }
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, token)).body.room.curriculum).toBeNull();
  });

  it('家長的孩子清單：在班級裡的孩子也帶班級版本', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    await call('PATCH', `/api/teacher/rooms/${code}`, { curriculum: CLASS }, token);
    const mom = await createUser(call, { parent: true, teacher: false });
    // 家長把裝置上的角色上傳成雲端角色，再用那個角色的權杖加入班級
    const local = { ...addProfile(createEmptySave(), { name: '安安', avatar: AVATAR }, new Date()).profiles[0] };
    const up = await call('POST', '/api/parent/kids', { profile: local }, mom.token);
    expect(up.status).toBe(200);
    const attach = await call('POST', '/api/join', { code, nickname: '小美', pin: '5678' }, up.body.token);
    expect(attach.status, JSON.stringify(attach.body)).toBe(200);
    expect(attach.body.room).toEqual({ code, name: '二年一班', curriculum: CLASS });
    expect((await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids[0].room).toEqual({ code, name: '二年一班', curriculum: CLASS });
  });
});

describe('老師改班級名稱（升級換年級時用）', () => {
  it('改名後管理頁、班級清單、孩子的同步與登入回應都是新名稱；前後空白去掉', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    const kid = await joinRoom(call, code);
    const r = await call('PATCH', `/api/teacher/rooms/${code}`, { name: ' 三年一班 ' }, token);
    expect(r.status).toBe(200);
    expect(r.body.room.name).toBe('三年一班');
    expect((await call('GET', '/api/teacher/rooms', undefined, token)).body.rooms[0].name).toBe('三年一班');
    expect((await call('POST', '/api/ops', { ops: [] }, kid.token)).body.room).toMatchObject({ code, name: '三年一班' });
    expect((await call('POST', '/api/login', { code, nickname: '小安', pin: '1234' })).body.room.name).toBe('三年一班');
  });

  it('名稱空白或超過 20 個字：400 bad_name，名稱不變；只改開關時名稱不變', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    for (const name of ['   ', '一'.repeat(21)]) {
      const r = await call('PATCH', `/api/teacher/rooms/${code}`, { name }, token);
      expect(r.status, name).toBe(400);
      expect(r.body.code).toBe('bad_name');
    }
    await call('PATCH', `/api/teacher/rooms/${code}`, { chatOpen: false }, token);
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, token)).body.room.name).toBe('二年一班');
  });
});
