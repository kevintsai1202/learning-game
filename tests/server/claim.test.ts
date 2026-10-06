/**
 * L4 家長連結卡（docs/plans/login-ux-review.md 第 7.3 節方案 A）：老師對還沒有家長的孩子產生一次性連結（7 天），
 * 家長打開、登入後一顆按鈕就把孩子連到自己的帳號（parent_id 填上，進度不動）。
 * 重新產生時舊的作廢；用過、過期、孩子已經有家長都不能再用；孩子被移出（刪除）時連結跟著消失。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR, createRoom, createUser, fakeClock, makeClient, openTestDb, resetDb } from './helpers';
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

type Call = ReturnType<typeof makeClient>['call'];
const PASSWORD = 'bear2026';

/** 建班級、設教室密碼、在平板上建一位學生，回傳班級、老師權杖與學生 id */
async function classWithStudent(call: Call, nickname = '小安') {
  const room = await createRoom(call);
  expect((await call('PATCH', `/api/teacher/rooms/${room.code}`, { classPassword: PASSWORD }, room.token)).status).toBe(200);
  const classroom = (await call('POST', `/api/class/${room.code}/unlock`, { password: PASSWORD })).body.token as string;
  const created = await call('POST', '/api/class/members', { nickname, avatar: AVATAR }, classroom);
  expect(created.status).toBe(200);
  return { room, classroom, kidId: created.body.member.id as string };
}

/** 老師產生連結代碼 */
async function issue(call: Call, room: { code: string; token: string }, kidId: string) {
  const r = await call('POST', `/api/teacher/rooms/${room.code}/members/${kidId}/claim`, {}, room.token);
  expect(r.status).toBe(200);
  return r.body as { code: string; expiresAt: string; kid: { nickname: string } };
}

describe('老師產生家長連結（POST /api/teacher/rooms/:code/members/:id/claim）', () => {
  it('還沒有家長的孩子：拿到代碼、7 天到期、卡片資料；成員表標示有沒有家長；重新產生後舊的失效', async () => {
    const clock = fakeClock();
    const { call } = makeClient(db, { now: clock.now });
    const { room, kidId } = await classWithStudent(call);
    const mom = await createUser(call, { parent: true, teacher: false });
    const first = await issue(call, room, kidId);
    expect(first.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(first.expiresAt).getTime()).toBe(clock.now().getTime() + 7 * 24 * 3600 * 1000);
    expect(first.kid).toMatchObject({ nickname: '小安', avatar: AVATAR });
    // 只存雜湊
    const rows = await db.query<{ code_hash: string }>('SELECT code_hash FROM claim_codes');
    expect(rows).toHaveLength(1);
    expect(rows[0].code_hash).not.toBe(first.code);
    expect((await call('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token)).body.members[0].hasParent).toBe(false);

    const second = await issue(call, room, kidId);
    expect(second.code).not.toBe(first.code);
    expect((await call('GET', `/api/parent/claims/${first.code}`, undefined, mom.token)).status).toBe(404);
    expect((await call('GET', `/api/parent/claims/${second.code}`, undefined, mom.token)).status).toBe(200);
  });

  it('已經有家長的孩子 409 has_parent；別的班的成員 404；別人的班級 404', async () => {
    const { call } = makeClient(db);
    const { room, kidId } = await classWithStudent(call);
    const other = await createRoom(call, '安親班');
    expect((await call('POST', `/api/teacher/rooms/${other.code}/members/${kidId}/claim`, {}, other.token)).status).toBe(404);
    expect((await call('POST', `/api/teacher/rooms/${room.code}/members/${kidId}/claim`, {}, other.token)).status).toBe(404);
    const { code } = await issue(call, room, kidId);
    const mom = await createUser(call, { parent: true, teacher: false });
    expect((await call('POST', `/api/parent/claims/${code}`, {}, mom.token)).status).toBe(200);
    const again = await call('POST', `/api/teacher/rooms/${room.code}/members/${kidId}/claim`, {}, room.token);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('has_parent');
    expect((await call('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token)).body.members[0].hasParent).toBe(true);
  });
});

describe('家長查詢連結（GET /api/parent/claims/:code）', () => {
  it('任何大人帳號查得到孩子的暱稱、外觀與班級（不回帳號 id）；沒登入 401；不存在 404；過期 410；用過 410', async () => {
    const clock = fakeClock();
    const { call } = makeClient(db, { now: clock.now });
    const { room, kidId } = await classWithStudent(call);
    const { code } = await issue(call, room, kidId);
    const teacherOnly = await createUser(call, { parent: false, teacher: true });
    const look = await call('GET', `/api/parent/claims/${code}`, undefined, teacherOnly.token);
    expect(look.status).toBe(200);
    expect(look.body).toMatchObject({ kid: { nickname: '小安', avatar: AVATAR }, room: { code: room.code, name: '二年一班' } });
    expect(JSON.stringify(look.body)).not.toContain(kidId);
    expect((await call('GET', `/api/parent/claims/${code}`)).status).toBe(401);
    const missing = await call('GET', '/api/parent/claims/not-a-real-code-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', undefined, teacherOnly.token);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('claim_not_found');

    const mom = await createUser(call, { parent: true, teacher: false });
    expect((await call('POST', `/api/parent/claims/${code}`, {}, mom.token)).status).toBe(200);
    const used = await call('GET', `/api/parent/claims/${code}`, undefined, mom.token);
    expect(used.status).toBe(410);
    expect(used.body.code).toBe('claim_used');

    // 另一位孩子的連結過期
    const created = await call('POST', '/api/class/members', { nickname: '小美', avatar: AVATAR }, (await call('POST', `/api/class/${room.code}/unlock`, { password: PASSWORD })).body.token);
    const late = await issue(call, room, created.body.member.id);
    clock.advance(7 * 24 * 3600 * 1000 + 1);
    const expired = await call('GET', `/api/parent/claims/${late.code}`, undefined, mom.token);
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe('claim_expired');
    expect((await call('POST', `/api/parent/claims/${late.code}`, {}, mom.token)).status).toBe(410);
  });
});

describe('家長接手（POST /api/parent/claims/:code）', () => {
  it('孩子連到家長帳號、進度與班級不動、平板上的權杖照常；家長頁看得到；即時中樞讓孩子重新上線；同一張卡不能再用', async () => {
    const onClassChanged = vi.fn();
    const { call } = makeClient(db, { onClassChanged });
    const { room, classroom, kidId } = await classWithStudent(call);
    const tablet = (await call('POST', `/api/class/members/${kidId}/device`, {}, classroom)).body.token as string;
    const { code } = await issue(call, room, kidId);
    const mom = await createUser(call, { parent: true, teacher: false });
    const r = await call('POST', `/api/parent/claims/${code}`, {}, mom.token);
    expect(r.status).toBe(200);
    expect(r.body.kid).toMatchObject({ id: kidId, name: '小安', rooms: [{ code: room.code, nickname: '小安' }] });
    expect(onClassChanged).toHaveBeenCalledWith(kidId);
    expect((await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids.map((k: { id: string }) => k.id)).toEqual([kidId]);
    expect((await call('GET', '/api/me', undefined, tablet)).status).toBe(200);
    const row = (await db.query<{ parent_id: string; used_at: Date | null }>('SELECT a.parent_id, c.used_at FROM accounts a JOIN claim_codes c ON c.account_id = a.id WHERE a.id = $1', [kidId]))[0];
    expect(row.parent_id).toBe(mom.user.id);
    expect(row.used_at).not.toBeNull();

    const dad = await createUser(call, { parent: true, teacher: false });
    const twice = await call('POST', `/api/parent/claims/${code}`, {}, dad.token);
    expect(twice.status).toBe(410);
    expect(twice.body.code).toBe('claim_used');
    // 接手後老師移出：只退出班級，角色留在家長名下（不刪除）
    expect((await call('DELETE', `/api/teacher/rooms/${room.code}/members/${kidId}`, undefined, room.token)).status).toBe(200);
    expect((await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids).toHaveLength(1);
  });

  it('兩位家長同時接手：只有一位成功', async () => {
    const { call } = makeClient(db);
    const { room, kidId } = await classWithStudent(call);
    const { code } = await issue(call, room, kidId);
    const mom = await createUser(call, { parent: true, teacher: false });
    const dad = await createUser(call, { parent: true, teacher: false });
    const results = await Promise.all([call('POST', `/api/parent/claims/${code}`, {}, mom.token), call('POST', `/api/parent/claims/${code}`, {}, dad.token)]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 410]);
    const owner = (await db.query<{ parent_id: string }>('SELECT parent_id FROM accounts WHERE id = $1', [kidId]))[0].parent_id;
    expect([mom.user.id, dad.user.id]).toContain(owner);
  });

  it('只有老師身分 403 not_parent；沒登入 401；孩子被移出（刪除）後連結消失 404', async () => {
    const { call } = makeClient(db);
    const { room, kidId } = await classWithStudent(call);
    const { code } = await issue(call, room, kidId);
    const teacherOnly = await createUser(call, { parent: false, teacher: true });
    const denied = await call('POST', `/api/parent/claims/${code}`, {}, teacherOnly.token);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('not_parent');
    expect((await call('POST', `/api/parent/claims/${code}`, {})).status).toBe(401);
    expect((await call('DELETE', `/api/teacher/rooms/${room.code}/members/${kidId}`, undefined, room.token)).status).toBe(200);
    const mom = await createUser(call, { parent: true, teacher: false });
    expect((await call('POST', `/api/parent/claims/${code}`, {}, mom.token)).status).toBe(404);
  });
});
