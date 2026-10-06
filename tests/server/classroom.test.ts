/**
 * L3 教室密碼（docs/plans/login-ux-review.md 第 7.1～7.2 節、第 8 節）：學校平板掃 QR code 後，老師輸入教室密碼拿到 8 小時的教室權杖，
 * 用它看班上名單、讓孩子進島（發 via 'tablet' 的孩子權杖）、建立學生。教室權杖只能做這四件事；老師與孩子的權杖不能用這四個 API。
 * 老師換教室密碼：教室權杖與用平板進島的孩子權杖全部失效；在家用班級代碼登入的（class）與家長裝置（parent）不受影響。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR, createRoom, createUser, fakeClock, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
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

type Call = ReturnType<typeof makeClient>['call'];
const PASSWORD = 'bear2026';

/** 建班級並設好教室密碼，回傳代碼與老師權杖 */
async function roomWithPassword(call: Call, password = PASSWORD) {
  const room = await createRoom(call);
  const r = await call('PATCH', `/api/teacher/rooms/${room.code}`, { classPassword: password }, room.token);
  expect(r.status).toBe(200);
  return room;
}

/** 平板用教室密碼解鎖，回傳教室權杖 */
async function unlock(call: Call, code: string, password = PASSWORD) {
  const r = await call('POST', `/api/class/${code}/unlock`, { password });
  expect(r.status).toBe(200);
  return r.body.token as string;
}

describe('老師設定教室密碼', () => {
  it('6 個字以上才收；設定後班級資料顯示已設定；老師成員頁也看得到', async () => {
    const { call } = makeClient(db);
    const room = await createRoom(call);
    expect((await call('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token)).body.room.hasClassPassword).toBe(false);
    const short = await call('PATCH', `/api/teacher/rooms/${room.code}`, { classPassword: 'abc12' }, room.token);
    expect(short.status).toBe(400);
    const ok = await call('PATCH', `/api/teacher/rooms/${room.code}`, { classPassword: PASSWORD }, room.token);
    expect(ok.status).toBe(200);
    expect(ok.body.room.hasClassPassword).toBe(true);
    // 雜湊存起來，不是明文
    const row = (await db.query<{ class_password_hash: string }>('SELECT class_password_hash FROM rooms WHERE code = $1', [room.code]))[0];
    expect(row.class_password_hash).toMatch(/^scrypt\$/);
    expect(row.class_password_hash).not.toContain(PASSWORD);
    // 班級清單也有
    expect((await call('GET', '/api/teacher/rooms', undefined, room.token)).body.rooms[0].hasClassPassword).toBe(true);
  });
});

describe('平板解鎖（POST /api/class/:code/unlock）', () => {
  it('密碼對：拿到教室權杖與班級名稱；錯 5 次鎖 5 分鐘；老師還沒設定密碼回 404 且不算猜錯；班級不存在 404', async () => {
    const clock = fakeClock();
    const { call } = makeClient(db, { now: clock.now });
    const room = await roomWithPassword(call);
    const ok = await call('POST', `/api/class/${room.code}/unlock`, { password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ room: { code: room.code, name: '二年一班' } });
    expect(typeof ok.body.token).toBe('string');
    expect(new Date(ok.body.expiresAt).getTime()).toBe(clock.now().getTime() + 8 * 3600 * 1000);

    for (let i = 0; i < 5; i++) {
      const bad = await call('POST', `/api/class/${room.code}/unlock`, { password: 'wrong-one' });
      expect(bad.status).toBe(401);
      expect(bad.body.code).toBe('bad_password');
    }
    const locked = await call('POST', `/api/class/${room.code}/unlock`, { password: PASSWORD });
    expect(locked.status).toBe(423);
    clock.advance(5 * 60_000 + 1);
    expect((await call('POST', `/api/class/${room.code}/unlock`, { password: PASSWORD })).status).toBe(200);

    const fresh = await createRoom(call);
    for (let i = 0; i < 6; i++) {
      const none = await call('POST', `/api/class/${fresh.code}/unlock`, { password: PASSWORD });
      expect(none.status).toBe(404);
      expect(none.body.code).toBe('no_classroom_password');
    }
    expect((await call('POST', '/api/class/999999/unlock', { password: PASSWORD })).status).toBe(404);
  });
});

describe('教室權杖只能用在四個 API；四個 API 只收教室權杖', () => {
  it('老師權杖與孩子權杖打名單 API 都是 401；教室權杖打同步、老師 API 也是 401；過了 8 小時失效', async () => {
    const clock = fakeClock();
    const { call } = makeClient(db, { now: clock.now });
    const room = await roomWithPassword(call);
    const kid = await joinRoom(call, room.code, '小美');
    const classroom = await unlock(call, room.code);
    expect((await call('GET', '/api/class/members', undefined, room.token)).status).toBe(401);
    expect((await call('GET', '/api/class/members', undefined, kid.token)).status).toBe(401);
    expect((await call('GET', '/api/class/members')).status).toBe(401);
    expect((await call('GET', '/api/class/members', undefined, classroom)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, classroom)).status).toBe(401);
    expect((await call('GET', `/api/teacher/rooms/${room.code}`, undefined, classroom)).status).toBe(401);
    expect((await call('POST', '/api/ops', { ops: [] }, classroom)).status).toBe(401);
    clock.advance(8 * 3600 * 1000 + 1);
    expect((await call('GET', '/api/class/members', undefined, classroom)).status).toBe(401);
  });
});

describe('名單與進島（GET /api/class/members、POST /api/class/members/:id/device）', () => {
  it('名單只有這一班的成員：這一班的暱稱與外觀，沒有星星金幣；點孩子拿到 tablet 權杖、能同步；不是這班的 404', async () => {
    const { call } = makeClient(db);
    const room = await roomWithPassword(call);
    const other = await createRoom(call, '安親班');
    const kid = await joinRoom(call, room.code, '小美');
    await joinRoom(call, other.code, '阿寶');
    // 家長名下的孩子加入這一班（這一班的暱稱是「小安」，角色名字是「安安」）
    const mom = await createUser(call, { parent: true, teacher: false });
    const profile = addProfile(createEmptySave(), { name: '安安', avatar: { ...AVATAR, animal: 'bear' } }, new Date()).profiles[0];
    const up = (await call('POST', '/api/parent/kids', { profile }, mom.token)).body;
    expect((await call('POST', `/api/parent/kids/${up.account.id}/class`, { code: room.code, nickname: '小安' }, mom.token)).status).toBe(200);

    const classroom = await unlock(call, room.code);
    const list = await call('GET', '/api/class/members', undefined, classroom);
    expect(list.status).toBe(200);
    expect(list.body.room).toEqual({ code: room.code, name: '二年一班' });
    expect(list.body.joinOpen).toBe(true);
    // 外觀是存檔裡的（其他道具欄位會補成 null）
    expect(list.body.members).toMatchObject([
      { id: kid.account.id, nickname: '小美', avatar: AVATAR },
      { id: up.account.id, nickname: '小安', avatar: { ...AVATAR, animal: 'bear' } },
    ]);
    expect(Object.keys(list.body.members[0]).sort()).toEqual(['avatar', 'id', 'nickname']);
    expect(JSON.stringify(list.body)).not.toContain('coins');

    const dev = await call('POST', `/api/class/members/${up.account.id}/device`, {}, classroom);
    expect(dev.status).toBe(200);
    expect(dev.body).toMatchObject({ account: { id: up.account.id, nickname: '小安' }, room: { code: room.code }, rooms: [{ code: room.code, nickname: '小安' }] });
    expect(dev.body.profile.name).toBe('安安');
    expect((await call('GET', '/api/me', undefined, dev.body.token)).status).toBe(200);
    const token = (await db.query<{ via: string; room_code: string }>('SELECT via, room_code FROM tokens WHERE kind = $1 AND account_id = $2 AND via = $3', ['kid', up.account.id, 'tablet']))[0];
    expect(token).toEqual({ via: 'tablet', room_code: room.code });

    const otherKid = (await db.query<{ account_id: string }>('SELECT account_id FROM class_members WHERE room_code = $1', [other.code]))[0];
    expect((await call('POST', `/api/class/members/${otherKid.account_id}/device`, {}, classroom)).status).toBe(404);
  });
});

describe('老師在平板上新增學生（POST /api/class/members）', () => {
  it('建一個沒有家長、沒有密碼、只在這一班的角色；暱稱撞名 409；老師關掉「允許加入」後 403；再點名單進島', async () => {
    const { call } = makeClient(db);
    const room = await roomWithPassword(call);
    await joinRoom(call, room.code, '小美');
    const classroom = await unlock(call, room.code);
    const created = await call('POST', '/api/class/members', { nickname: '小華', avatar: AVATAR }, classroom);
    expect(created.status).toBe(200);
    expect(created.body.member).toMatchObject({ nickname: '小華', avatar: AVATAR });
    expect(created.body).not.toHaveProperty('token');
    const row = (await db.query<{ parent_id: string | null; room_code: string | null; pin_hash: string | null }>('SELECT parent_id, room_code, pin_hash FROM accounts WHERE id = $1', [created.body.member.id]))[0];
    expect(row).toEqual({ parent_id: null, room_code: null, pin_hash: null });
    const member = (await db.query<{ pin_hash: string | null; nickname: string }>('SELECT pin_hash, nickname FROM class_members WHERE account_id = $1', [created.body.member.id]))[0];
    expect(member).toEqual({ pin_hash: null, nickname: '小華' });
    // 老師成員表看得到、沒有密碼
    const teacherView = await call('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token);
    expect(teacherView.body.members.find((m: { nickname: string }) => m.nickname === '小華')).toMatchObject({ hasPin: false });
    // 撞名
    const dup = await call('POST', '/api/class/members', { nickname: '小美', avatar: AVATAR }, classroom);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('nickname_taken');
    // 進島
    const dev = await call('POST', `/api/class/members/${created.body.member.id}/device`, {}, classroom);
    expect(dev.status).toBe(200);
    expect(dev.body.profile.name).toBe('小華');
    // 老師關掉允許加入：平板不能再建
    expect((await call('PATCH', `/api/teacher/rooms/${room.code}`, { joinOpen: false }, room.token)).status).toBe(200);
    const closed = await call('POST', '/api/class/members', { nickname: '小明', avatar: AVATAR }, classroom);
    expect(closed.status).toBe(403);
    expect(closed.body.code).toBe('join_closed');
    expect((await call('GET', '/api/class/members', undefined, classroom)).body.joinOpen).toBe(false);
  });
});

describe('老師換教室密碼', () => {
  it('教室權杖與平板上孩子的權杖失效並被踢（via tablet）；在家用代碼登入的與家長裝置不受影響；舊密碼解鎖失敗', async () => {
    const onKick = vi.fn();
    const { call } = makeClient(db, { onKick });
    const room = await roomWithPassword(call);
    const kid = await joinRoom(call, room.code, '小美', '1234');
    const classroom = await unlock(call, room.code);
    const tablet = (await call('POST', `/api/class/members/${kid.account.id}/device`, {}, classroom)).body.token as string;
    const home = (await call('POST', '/api/login', { code: room.code, nickname: '小美', pin: '1234' })).body.token as string;

    expect((await call('PATCH', `/api/teacher/rooms/${room.code}`, { classPassword: 'rabbit2027' }, room.token)).status).toBe(200);
    expect((await call('GET', '/api/class/members', undefined, classroom)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, tablet)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, home)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, kid.token)).status).toBe(200);
    expect(onKick).toHaveBeenCalledWith(kid.account.id, expect.stringContaining('教室密碼'), 'tablet', room.code);
    expect((await call('POST', `/api/class/${room.code}/unlock`, { password: PASSWORD })).status).toBe(401);
    expect((await call('POST', `/api/class/${room.code}/unlock`, { password: 'rabbit2027' })).status).toBe(200);
  });
});
