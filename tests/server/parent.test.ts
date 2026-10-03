/**
 * 家長的雲端角色（A2，docs/plans/accounts.md 第 6 節）：把裝置上的角色上傳成雲端角色、列出、在這台裝置玩、刪除；
 * 只能動自己名下的；沒有班級的角色可以同步，但送禮、同學名單等班級功能回 403 no_class。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVATAR, createUser, makeClient, openTestDb, resetDb } from './helpers';
import type { Db } from '../../server/db';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';

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

/** 一個本機角色（裝置上建立的） */
function localKid(name = '安安', coins = 25): Profile {
  return { ...addProfile(createEmptySave(), { name, avatar: AVATAR }, new Date()).profiles[0], coins };
}

/** 一位家長 */
const parentOf = (call: ReturnType<typeof makeClient>['call']) => createUser(call, { parent: true, teacher: false });

describe('上傳與列出', () => {
  it('把裝置上的角色上傳：保留角色 id、名字與進度，沒有班級；拿到這個角色的權杖', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    const kid = localKid('安安', 25);
    const r = await call('POST', '/api/parent/kids', { profile: { ...kid, cloud: { server: 'x', room: 'y', roomName: 'z', accountId: 'w' } } }, mom.token);
    expect(r.status).toBe(200);
    expect(r.body.room).toBeNull();
    expect(r.body.profile).toMatchObject({ id: kid.id, name: '安安', coins: 25 });
    expect(r.body.profile.cloud).toBeUndefined();
    const me = await call('GET', '/api/me', undefined, r.body.token);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ room: null, owned: true, profile: { id: kid.id, coins: 25 } });
  });

  it('同一個角色同時上傳兩次（例如連按兩下、網路慢）：只有一個成功，另一個 409，不會變成兩個分身', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    const kid = localKid('安安', 25);
    const [a, b] = await Promise.all([call('POST', '/api/parent/kids', { profile: kid }, mom.token), call('POST', '/api/parent/kids', { profile: kid }, mom.token)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids).toHaveLength(1);
  });

  it('同一個角色上傳兩次回 409（不會變成兩個分身）；格式不符回 400', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    const kid = localKid();
    expect((await call('POST', '/api/parent/kids', { profile: kid }, mom.token)).status).toBe(200);
    const again = await call('POST', '/api/parent/kids', { profile: kid }, mom.token);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_uploaded');
    expect((await call('POST', '/api/parent/kids', { profile: { id: 'p1', coins: -5 } }, mom.token)).status).toBe(400);
  });

  it('列出名下的孩子：名字、外觀、班級、金幣、星星、最後上線', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    await call('POST', '/api/parent/kids', { profile: { ...localKid('哥哥', 10), bestStars: { a: 3, b: 1 } } }, mom.token);
    await call('POST', '/api/parent/kids', { profile: localKid('妹妹', 5) }, mom.token);
    const r = await call('GET', '/api/parent/kids', undefined, mom.token);
    expect(r.status).toBe(200);
    expect(r.body.kids).toEqual([
      expect.objectContaining({ id: expect.any(String), name: '哥哥', avatar: expect.objectContaining(AVATAR), room: null, coins: 10, stars: 4, lastSeen: expect.any(String) }),
      expect.objectContaining({ name: '妹妹', coins: 5, stars: 0 }),
    ]);
  });
});

describe('在這台裝置玩與刪除', () => {
  it('在這台裝置玩：另發一張權杖，兩台裝置都能同步同一個角色', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    const up = (await call('POST', '/api/parent/kids', { profile: localKid('安安', 0) }, mom.token)).body;
    const tablet = await call('POST', `/api/parent/kids/${up.account.id}/device`, {}, mom.token);
    expect(tablet.status).toBe(200);
    expect(tablet.body.token).not.toBe(up.token);
    expect(tablet.body.profile.id).toBe(up.profile.id);
    const op = { id: 'op-play-1', at: new Date().toISOString(), kind: 'playTime', seconds: 30 };
    expect((await call('POST', '/api/ops', { ops: [op] }, tablet.body.token)).status).toBe(200);
    const sync = await call('POST', '/api/ops', { ops: [] }, up.token);
    expect(sync.status).toBe(200);
    expect(sync.body.room).toBeNull();
    expect(sync.body.rev).toBe(2);
  });

  it('刪除：角色與它的權杖都不見了，清單變空', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    const up = (await call('POST', '/api/parent/kids', { profile: localKid() }, mom.token)).body;
    expect((await call('DELETE', `/api/parent/kids/${up.account.id}`, undefined, mom.token)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, up.token)).status).toBe(401);
    expect((await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids).toEqual([]);
  });
});

describe('只能動自己名下的角色', () => {
  it('別的家長：在這台裝置玩、刪除、退出班級都回 404；只有老師身分回 403；孩子權杖回 401', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    const other = await parentOf(call);
    const teacher = await createUser(call);
    const up = (await call('POST', '/api/parent/kids', { profile: localKid() }, mom.token)).body;
    for (const [method, path] of [
      ['POST', `/api/parent/kids/${up.account.id}/device`],
      ['DELETE', `/api/parent/kids/${up.account.id}`],
      ['POST', `/api/parent/kids/${up.account.id}/leave-class`],
    ] as const) {
      const r = await call(method, path, method === 'DELETE' ? undefined : {}, other.token);
      expect(r.status, `${method} ${path}`).toBe(404);
      expect(r.body.code).toBe('no_kid');
    }
    const denied = await call('GET', '/api/parent/kids', undefined, teacher.token);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('not_parent');
    expect((await call('GET', '/api/parent/kids', undefined, up.token)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, up.token)).status).toBe(200);
  });
});

describe('沒有班級的角色', () => {
  it('同步照常；送禮、同學名單、禮物清單回 403 no_class', async () => {
    const { call } = makeClient(db);
    const mom = await parentOf(call);
    const up = (await call('POST', '/api/parent/kids', { profile: localKid('安安', 100) }, mom.token)).body;
    const op = { id: 'op-play-2', at: new Date().toISOString(), kind: 'playTime', seconds: 30 };
    expect((await call('POST', '/api/ops', { ops: [op] }, up.token)).status).toBe(200);
    for (const [method, path, body] of [
      ['GET', '/api/classmates'],
      ['GET', '/api/gifts'],
      ['POST', '/api/gifts', { id: 'gift-noclass-01', to: 'a_x', itemId: 'sticker.rocket' }],
    ] as const) {
      const r = await call(method, path, body, up.token);
      expect(r.status, `${method} ${path}`).toBe(403);
      expect(r.body.code).toBe('no_class');
    }
  });
});
