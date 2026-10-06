/**
 * 掃 QR code 加入班級（docs/plans/class-join.md）：家長用家長帳號讓名下的雲端角色加入班級，不用密碼；
 * 查班級名稱（任何大人帳號，擋大量請求）；沒有密碼的孩子不能用班級代碼登入，老師設定密碼後才可以；
 * 加入班級後通知即時中樞讓那個帳號重新上線。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR, createRoom, createUser, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
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

/** 家長上傳一個本機角色成為雲端角色 */
async function uploadKid(call: Call, token: string, name: string) {
  const profile = addProfile(createEmptySave(), { name, avatar: AVATAR }, new Date()).profiles[0];
  const r = await call('POST', '/api/parent/kids', { profile }, token);
  expect(r.status).toBe(200);
  return r.body as { token: string; account: { id: string } };
}

describe('查班級（加入連結打開時顯示班級名稱）', () => {
  it('任何大人帳號都查得到名稱與是否開放加入；找不到 404；孩子權杖 401', async () => {
    const { call } = makeClient(db);
    const { code, token } = await createRoom(call);
    const mom = await createUser(call, { parent: true, teacher: false });
    const r = await call('GET', `/api/parent/classes/${code}`, undefined, mom.token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ room: { code, name: '二年一班' }, joinOpen: true });
    // 只有老師身分的帳號也查得到（畫面提示他到帳號設定勾選家長）
    expect((await call('GET', `/api/parent/classes/${code}`, undefined, token)).status).toBe(200);
    expect((await call('GET', '/api/parent/classes/999999', undefined, mom.token)).status).toBe(404);
    const kid = await joinRoom(call, code);
    expect((await call('GET', `/api/parent/classes/${code}`, undefined, kid.token)).status).toBe(401);
  });
});

describe('家長讓雲端角色加入班級（不用密碼）', () => {
  it('加入成功：回傳角色摘要（帶班級）、存檔名字改成班上的暱稱；沒有密碼不能用班級代碼登入，老師設定密碼後可以', async () => {
    const { call } = makeClient(db);
    const { code, token: teacher } = await createRoom(call);
    const mom = await createUser(call, { parent: true, teacher: false });
    const kid = await uploadKid(call, mom.token, '安安');
    const r = await call('POST', `/api/parent/kids/${kid.account.id}/class`, { code, nickname: '小安' }, mom.token);
    expect(r.status).toBe(200);
    // 多班級起：角色的名字不改成班上的暱稱，暱稱記在這一班（rooms）
    expect(r.body.kid).toMatchObject({ id: kid.account.id, name: '安安', room: { code, name: '二年一班' }, rooms: [{ code, name: '二年一班', curriculum: null, nickname: '小安' }] });
    expect((await call('GET', '/api/me', undefined, kid.token)).body.profile.name).toBe('安安');
    // 沒有密碼：班級登入失敗，直接說還沒有設定密碼（使用者決定）
    const denied = await call('POST', '/api/login', { code, nickname: '小安', pin: '0000' });
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe('no_pin');
    expect(denied.body.error).toContain('請老師');
    // 老師成員表：沒有密碼；設定密碼後可以登入
    const room = await call('GET', `/api/teacher/rooms/${code}`, undefined, teacher);
    expect(room.body.members.map((m: { nickname: string; hasPin: boolean }) => [m.nickname, m.hasPin])).toEqual([['小安', false]]);
    expect((await call('POST', `/api/teacher/rooms/${code}/members/${kid.account.id}/pin`, { pin: '4321' }, teacher)).status).toBe(200);
    expect((await call('POST', '/api/login', { code, nickname: '小安', pin: '4321' })).status).toBe(200);
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, teacher)).body.members[0].hasPin).toBe(true);
  });

  it('用孩子自己的密碼加入的成員：hasPin 是 true', async () => {
    const { call } = makeClient(db);
    const { code, token: teacher } = await createRoom(call);
    await joinRoom(call, code, '小美');
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, teacher)).body.members[0].hasPin).toBe(true);
  });

  it('不能加入的情況：別人的角色 404、已經在這一班 409、找不到班級 404、不開放加入 403、暱稱格式 400、暱稱重複 409', async () => {
    const { call } = makeClient(db);
    const { code, token: teacher } = await createRoom(call);
    const mom = await createUser(call, { parent: true, teacher: false });
    const other = await createUser(call, { parent: true, teacher: false });
    const kid = await uploadKid(call, mom.token, '安安');
    const path = `/api/parent/kids/${kid.account.id}/class`;
    expect((await call('POST', path, { code, nickname: '安安' }, other.token)).status).toBe(404);
    expect((await call('POST', path, { code: '999999', nickname: '安安' }, mom.token)).status).toBe(404);
    expect((await call('POST', path, { code, nickname: '   ' }, mom.token)).status).toBe(400);
    await joinRoom(call, code, '小美');
    const dup = await call('POST', path, { code, nickname: '小美' }, mom.token);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('nickname_taken');
    await call('PATCH', `/api/teacher/rooms/${code}`, { joinOpen: false }, teacher);
    const closed = await call('POST', path, { code, nickname: '安安' }, mom.token);
    expect(closed.status).toBe(403);
    expect(closed.body.code).toBe('join_closed');
    await call('PATCH', `/api/teacher/rooms/${code}`, { joinOpen: true }, teacher);
    expect((await call('POST', path, { code, nickname: '安安' }, mom.token)).status).toBe(200);
    const again = await call('POST', path, { code, nickname: '安安2' }, mom.token);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_member');
  });

  it('新建角色加入：家長先建雲端角色（不經過裝置上的存檔）再加入', async () => {
    const { call } = makeClient(db);
    const { code } = await createRoom(call);
    const mom = await createUser(call, { parent: true, teacher: false });
    const kid = await uploadKid(call, mom.token, '新同學');
    expect((await call('POST', `/api/parent/kids/${kid.account.id}/class`, { code, nickname: '新同學' }, mom.token)).status).toBe(200);
    const kids = (await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids;
    expect(kids.map((k: { name: string; room: { code: string } | null }) => [k.name, k.room?.code])).toEqual([['新同學', code]]);
  });
});

describe('加入班級後通知即時中樞重新上線', () => {
  it('家長加入與孩子權杖加入都通知 onClassChanged（帳號 id）', async () => {
    const onClassChanged = vi.fn();
    const onProfileChanged = vi.fn();
    const { call } = makeClient(db, { onClassChanged, onProfileChanged });
    const { code } = await createRoom(call);
    const mom = await createUser(call, { parent: true, teacher: false });
    const a = await uploadKid(call, mom.token, '安安');
    const b = await uploadKid(call, mom.token, '寶寶');
    await call('POST', `/api/parent/kids/${a.account.id}/class`, { code, nickname: '安安' }, mom.token);
    expect(onClassChanged).toHaveBeenLastCalledWith(a.account.id);
    // 多班級起加入班級不改存檔（名字不改成暱稱），裝置靠重新上線後的同步拿到新的班級
    expect(onProfileChanged).not.toHaveBeenCalled();
    await call('POST', '/api/join', { code, nickname: '寶寶', pin: '1234' }, b.token);
    expect(onClassChanged).toHaveBeenLastCalledWith(b.account.id);
  });
});
