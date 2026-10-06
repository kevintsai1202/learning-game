/**
 * 多班級（docs/plans/multi-class.md）：一個孩子同時在學校的班級與安親班。
 * 加入第二個班級、上限 5 個、各班各自的暱稱與密碼、班級登入、權杖只撤銷那一班的、退出與移出只影響那一班、
 * 回應帶所有班級（room 是第一個班級給舊版網頁）、送禮與收禮在各班。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR, createRoom, createUser, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import type { Db } from '../../server/db';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';
import { MAX_CLASSES } from '../../server/classes';

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

/** 送禮測試用的貼紙（3 枚金幣） */
const STICKER = 'sticker.cookie';

/** 一個本機角色（裝置上建立的） */
function localKid(name: string, coins = 50): Profile {
  return { ...addProfile(createEmptySave(), { name, avatar: AVATAR }, new Date()).profiles[0], coins };
}

/** 家長上傳一個角色，回傳孩子權杖（家長來源）與帳號 */
async function uploadKid(call: Call, parentToken: string, name: string, coins = 50) {
  const r = await call('POST', '/api/parent/kids', { profile: localKid(name, coins) }, parentToken);
  expect(r.status).toBe(200);
  return r.body as { token: string; account: { id: string } };
}

/** 家長讓孩子加入一個班級 */
const parentJoin = (call: Call, parentToken: string, kidId: string, code: string, nickname: string) =>
  call('POST', `/api/parent/kids/${kidId}/class`, { code, nickname }, parentToken);

/** 學校（二年三班）、安親班、一位家長與他名下的安安（兩班都加入：學校叫小安、安親班叫安安） */
async function twoClasses(call: Call) {
  const school = await createRoom(call, '二年三班');
  const after = await createRoom(call, '安親班');
  const mom = await createUser(call, { parent: true, teacher: false });
  const an = await uploadKid(call, mom.token, '安安');
  expect((await parentJoin(call, mom.token, an.account.id, school.code, '小安')).status).toBe(200);
  expect((await parentJoin(call, mom.token, an.account.id, after.code, '安安')).status).toBe(200);
  return { school, after, mom, an };
}

describe('加入第二個班級', () => {
  it('家長讓孩子再加入安親班：兩個班級都在（先加入的在前面）、各班的暱稱；room 是第一個班級；存檔裡的名字不改成暱稱', async () => {
    const { call } = makeClient(db);
    const { school, after, mom, an } = await twoClasses(call);
    const kid = (await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids[0];
    expect(kid.name).toBe('安安');
    expect(kid.rooms).toEqual([
      { code: school.code, name: '二年三班', curriculum: null, nickname: '小安' },
      { code: after.code, name: '安親班', curriculum: null, nickname: '安安' },
    ]);
    expect(kid.room).toEqual({ code: school.code, name: '二年三班', curriculum: null });
    const me = (await call('GET', '/api/me', undefined, an.token)).body;
    expect(me.profile.name).toBe('安安');
    expect(me.room.code).toBe(school.code);
    expect(me.rooms.map((r: { code: string }) => r.code)).toEqual([school.code, after.code]);
    const ops = (await call('POST', '/api/ops', { ops: [] }, an.token)).body;
    expect(ops.room.code).toBe(school.code);
    expect(ops.rooms.map((r: { nickname: string }) => r.nickname)).toEqual(['小安', '安安']);
    // 家長「在這台裝置玩」：一樣帶兩個班級
    const device = (await call('POST', `/api/parent/kids/${an.account.id}/device`, {}, mom.token)).body;
    expect(device.rooms.map((r: { code: string }) => r.code)).toEqual([school.code, after.code]);
  });

  it('已經是這一班的成員回 409 already_member；最多 5 個班級，第 6 個回 409 too_many_classes', async () => {
    const { call } = makeClient(db);
    const { school, mom, an } = await twoClasses(call);
    const again = await parentJoin(call, mom.token, an.account.id, school.code, '小安安');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_member');
    for (let i = 3; i <= MAX_CLASSES; i++) {
      const room = await createRoom(call, `第${i}班`);
      expect((await parentJoin(call, mom.token, an.account.id, room.code, '安安')).status).toBe(200);
    }
    const sixth = await createRoom(call, '第六班');
    const r = await parentJoin(call, mom.token, an.account.id, sixth.code, '安安');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('too_many_classes');
  });

  it('暱稱只在同一班裡不能重複：學校有別人叫小美，安親班照樣可以叫小美', async () => {
    const { call } = makeClient(db);
    const { school, after, mom } = await twoClasses(call);
    await joinRoom(call, school.code, '小美');
    const mei = await uploadKid(call, mom.token, '妹妹');
    const taken = await parentJoin(call, mom.token, mei.account.id, school.code, '小美');
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('nickname_taken');
    expect((await parentJoin(call, mom.token, mei.account.id, after.code, '小美')).status).toBe(200);
  });

  it('帶孩子權杖加入第二個班級：沒有家長帳號的回 409 need_parent（請家長掃 QR code）；有家長帳號的可以', async () => {
    const { call } = makeClient(db);
    const school = await createRoom(call, '二年三班');
    const after = await createRoom(call, '安親班');
    const solo = await joinRoom(call, school.code, '阿寶');
    const r = await call('POST', '/api/join', { code: after.code, nickname: '阿寶', pin: '1234' }, solo.token);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('need_parent');
    const mom = await createUser(call, { parent: true, teacher: false });
    const an = await uploadKid(call, mom.token, '安安');
    expect((await call('POST', '/api/join', { code: school.code, nickname: '小安', pin: '1111' }, an.token)).status).toBe(200);
    const second = await call('POST', '/api/join', { code: after.code, nickname: '安安', pin: '2222' }, an.token);
    expect(second.status).toBe(200);
    expect(second.body.room.code).toBe(after.code);
    expect(second.body.rooms.map((x: { code: string }) => x.code)).toEqual([school.code, after.code]);
  });
});

describe('班級登入、密碼與權杖（各班各自的）', () => {
  it('用那一班的代碼＋那一班的暱稱＋那一班的密碼登入；別班的暱稱不行', async () => {
    const { call } = makeClient(db);
    const { school, after, an } = await twoClasses(call);
    expect((await call('POST', `/api/teacher/rooms/${school.code}/members/${an.account.id}/pin`, { pin: '1234' }, school.token)).status).toBe(200);
    expect((await call('POST', `/api/teacher/rooms/${after.code}/members/${an.account.id}/pin`, { pin: '5678' }, after.token)).status).toBe(200);
    const a = await call('POST', '/api/login', { code: school.code, nickname: '小安', pin: '1234' });
    expect(a.status).toBe(200);
    expect(a.body.account).toEqual({ id: an.account.id, nickname: '小安' });
    const b = await call('POST', '/api/login', { code: after.code, nickname: '安安', pin: '5678' });
    expect(b.status).toBe(200);
    expect(b.body.account.nickname).toBe('安安');
    expect((await call('POST', '/api/login', { code: after.code, nickname: '小安', pin: '5678' })).status).toBe(401);
    expect((await call('POST', '/api/login', { code: after.code, nickname: '安安', pin: '1234' })).status).toBe(401);
  });

  it('老師重設密碼只撤銷自己那一班發的權杖：另一班的平板和家長裝置照常；踢線也只踢那一班登入的', async () => {
    const onKick = vi.fn();
    const { call } = makeClient(db, { onKick });
    const { school, after, an } = await twoClasses(call);
    await call('POST', `/api/teacher/rooms/${school.code}/members/${an.account.id}/pin`, { pin: '1234' }, school.token);
    await call('POST', `/api/teacher/rooms/${after.code}/members/${an.account.id}/pin`, { pin: '5678' }, after.token);
    const tabletA = (await call('POST', '/api/login', { code: school.code, nickname: '小安', pin: '1234' })).body.token;
    const tabletB = (await call('POST', '/api/login', { code: after.code, nickname: '安安', pin: '5678' })).body.token;
    onKick.mockClear();
    await call('POST', `/api/teacher/rooms/${school.code}/members/${an.account.id}/pin`, { pin: '9999' }, school.token);
    expect((await call('GET', '/api/me', undefined, tabletA)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, tabletB)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, an.token)).status).toBe(200);
    expect(onKick).toHaveBeenCalledWith(an.account.id, expect.any(String), 'class', school.code);
    // 老師成員表的「有沒有密碼」是那一班的
    const mom2 = await createUser(call, { parent: true, teacher: false });
    const bo = await uploadKid(call, mom2.token, '寶寶');
    await parentJoin(call, mom2.token, bo.account.id, after.code, '寶寶');
    const members = (await call('GET', `/api/teacher/rooms/${after.code}`, undefined, after.token)).body.members;
    expect(members.map((m: { nickname: string; hasPin: boolean }) => [m.nickname, m.hasPin])).toEqual([
      ['安安', true],
      ['寶寶', false],
    ]);
  });
});

describe('退出與移出（只影響那一班）', () => {
  it('家長讓孩子退出安親班：學校還在；安親班的平板權杖失效，學校的平板與家長裝置照常；通知中樞「離開了哪一班」', async () => {
    const onLeftClass = vi.fn();
    const onKick = vi.fn();
    const { call } = makeClient(db, { onLeftClass, onKick });
    const { school, after, mom, an } = await twoClasses(call);
    await call('POST', `/api/teacher/rooms/${school.code}/members/${an.account.id}/pin`, { pin: '1234' }, school.token);
    await call('POST', `/api/teacher/rooms/${after.code}/members/${an.account.id}/pin`, { pin: '5678' }, after.token);
    const tabletA = (await call('POST', '/api/login', { code: school.code, nickname: '小安', pin: '1234' })).body.token;
    const tabletB = (await call('POST', '/api/login', { code: after.code, nickname: '安安', pin: '5678' })).body.token;
    // 設定密碼時已經呼叫過踢線（撤銷舊的平板權杖），只看退出之後的
    onKick.mockClear();
    const r = await call('POST', `/api/parent/kids/${an.account.id}/leave-class`, { code: after.code }, mom.token);
    expect(r.status).toBe(200);
    const kid = (await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids[0];
    expect(kid.rooms.map((x: { code: string }) => x.code)).toEqual([school.code]);
    expect((await call('GET', '/api/me', undefined, tabletB)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, tabletA)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, an.token)).status).toBe(200);
    expect(onLeftClass).toHaveBeenCalledWith(an.account.id, after.code, expect.any(String));
    expect(onKick).not.toHaveBeenCalled();
    // 已經不是成員：再退出一次回 409
    expect((await call('POST', `/api/parent/kids/${an.account.id}/leave-class`, { code: after.code }, mom.token)).status).toBe(409);
  });

  it('退出時沒說哪一班（舊版網頁）：有兩個班級回 400 which_class；只剩一個班級時退出那一班', async () => {
    const { call } = makeClient(db);
    const { school, mom, an } = await twoClasses(call);
    const r = await call('POST', `/api/parent/kids/${an.account.id}/leave-class`, {}, mom.token);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('which_class');
    const { after } = { after: (await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids[0].rooms[1] };
    await call('POST', `/api/parent/kids/${an.account.id}/leave-class`, { code: after.code }, mom.token);
    expect((await call('POST', `/api/parent/kids/${an.account.id}/leave-class`, {}, mom.token)).status).toBe(200);
    expect((await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids[0].rooms).toEqual([]);
    expect(school.code).toBeTruthy();
  });

  it('老師只移出自己的班：學校老師移出後，安親班還在（有家長：left）；別班老師移不了別人班上的成員', async () => {
    const onLeftClass = vi.fn();
    const { call } = makeClient(db, { onLeftClass });
    const { school, after, mom, an } = await twoClasses(call);
    expect((await call('DELETE', `/api/teacher/rooms/${after.code}/members/${an.account.id}`, undefined, school.token)).status).toBe(404);
    const r = await call('DELETE', `/api/teacher/rooms/${school.code}/members/${an.account.id}`, undefined, school.token);
    expect(r.status).toBe(200);
    expect(r.body.left).toBe(true);
    const kid = (await call('GET', '/api/parent/kids', undefined, mom.token)).body.kids[0];
    expect(kid.rooms.map((x: { code: string }) => x.code)).toEqual([after.code]);
    expect(onLeftClass).toHaveBeenCalledWith(an.account.id, school.code, expect.any(String));
    expect((await call('GET', `/api/teacher/rooms/${school.code}`, undefined, school.token)).body.members).toEqual([]);
    expect((await call('GET', '/api/teacher/rooms', undefined, after.token)).body.rooms[0].members).toBe(1);
  });

  it('沒有家長帳號、只有一個班級的孩子被移出：角色刪除（照舊）', async () => {
    const onKick = vi.fn();
    const { call } = makeClient(db, { onKick });
    const school = await createRoom(call, '二年三班');
    const solo = await joinRoom(call, school.code, '阿寶');
    const r = await call('DELETE', `/api/teacher/rooms/${school.code}/members/${solo.account.id}`, undefined, school.token);
    expect(r.body.left).toBe(false);
    expect((await db.query('SELECT 1 FROM accounts WHERE id = $1', [solo.account.id])).length).toBe(0);
    expect(onKick).toHaveBeenCalledWith(solo.account.id, expect.any(String));
  });
});

describe('送禮與收禮（多班級）', () => {
  /** 安安在學校與安親班；學校有小美、安親班有阿寶（都是純班級角色） */
  async function giftSetup(call: Call) {
    const base = await twoClasses(call);
    const mei = await joinRoom(call, base.school.code, '小美', '1111', { profile: localKid('小美', 50) });
    const bo = await joinRoom(call, base.after.code, '阿寶', '2222', { profile: localKid('阿寶', 50) });
    return { ...base, mei, bo };
  }

  it('同學名單：帶 room 只列那一班；沒帶列出所有班級的同學', async () => {
    const { call } = makeClient(db);
    const { school, after, an } = await giftSetup(call);
    const names = async (q: string) => (await call('GET', `/api/classmates${q}`, undefined, an.token)).body.classmates.map((c: { nickname: string }) => c.nickname).sort();
    expect(await names(`?room=${school.code}`)).toEqual(['小美']);
    expect(await names(`?room=${after.code}`)).toEqual(['阿寶']);
    expect(await names('')).toEqual(['小美', '阿寶']);
    // 不是自己的班級：403
    const other = await createRoom(call, '別班');
    expect((await call('GET', `/api/classmates?room=${other.code}`, undefined, an.token)).status).toBe(403);
  });

  it('送禮帶 room：只能送給那一班的同學，用那一班的暱稱；那一班關了送禮回 403；收禮清單包含所有班級的禮物', async () => {
    const { call } = makeClient(db);
    const { school, after, an, mei, bo } = await giftSetup(call);
    const wrong = await call('POST', '/api/gifts', { id: 'gift-wrong-class', to: bo.account.id, itemId: STICKER, room: school.code }, an.token);
    expect(wrong.status).toBe(404);
    const ok = await call('POST', '/api/gifts', { id: 'gift-to-bo-0001', to: bo.account.id, itemId: STICKER, room: after.code }, an.token);
    expect(ok.status).toBe(200);
    // 阿寶收到的禮物寫的是安安在安親班的暱稱
    expect((await call('GET', '/api/gifts', undefined, bo.token)).body.incoming[0].from).toBe('安安');
    await call('PATCH', `/api/teacher/rooms/${school.code}`, { giftsOpen: false }, school.token);
    expect((await call('POST', '/api/gifts', { id: 'gift-to-mei-01', to: mei.account.id, itemId: STICKER, room: school.code }, an.token)).status).toBe(403);
    // 安安收到兩班同學的禮物都看得到
    await call('PATCH', `/api/teacher/rooms/${school.code}`, { giftsOpen: true }, school.token);
    expect((await call('POST', '/api/gifts', { id: 'gift-mei-to-an', to: an.account.id, itemId: STICKER }, mei.token)).status).toBe(200);
    expect((await call('POST', '/api/gifts', { id: 'gift-bo-to-an1', to: an.account.id, itemId: STICKER }, bo.token)).status).toBe(200);
    const inbox = (await call('GET', '/api/gifts', undefined, an.token)).body.incoming.map((g: { from: string }) => g.from).sort();
    expect(inbox).toEqual(['小美', '阿寶']);
    expect((await call('POST', '/api/gifts/gift-bo-to-an1/accept', {}, an.token)).body.status).toBe('accepted');
  });

  it('退出安親班時只結清安親班的禮物：學校同學送的還在、還能收下', async () => {
    const { call } = makeClient(db);
    const { after, mom, an, mei, bo } = await giftSetup(call);
    await call('POST', '/api/gifts', { id: 'gift-mei-to-an', to: an.account.id, itemId: STICKER }, mei.token);
    await call('POST', '/api/gifts', { id: 'gift-bo-to-an1', to: an.account.id, itemId: STICKER }, bo.token);
    const boCoins = (await call('GET', '/api/me', undefined, bo.token)).body.profile.coins;
    await call('POST', `/api/parent/kids/${an.account.id}/leave-class`, { code: after.code }, mom.token);
    // 阿寶的禮物退款了；小美的還在
    expect((await call('GET', '/api/me', undefined, bo.token)).body.profile.coins).toBe(boCoins + 3);
    const inbox = (await call('GET', '/api/gifts', undefined, an.token)).body.incoming;
    expect(inbox.map((g: { from: string }) => g.from)).toEqual(['小美']);
    expect((await call('POST', '/api/gifts/gift-mei-to-an/accept', {}, an.token)).body.status).toBe('accepted');
  });

  it('沒帶 room 的送禮（舊版網頁）：記在最早建立的、開放送禮的共同班級', async () => {
    const { call } = makeClient(db);
    const { school, after, mom, an } = await giftSetup(call);
    // 妹妹也在兩班：和安安的共同班級是學校（先建立）與安親班
    const mei2 = await uploadKid(call, mom.token, '妹妹');
    await parentJoin(call, mom.token, mei2.account.id, after.code, '妹妹');
    await parentJoin(call, mom.token, mei2.account.id, school.code, '小妹');
    expect((await call('POST', '/api/gifts', { id: 'gift-an-to-mei2', to: mei2.account.id, itemId: STICKER }, an.token)).status).toBe(200);
    expect((await db.query<{ room_code: string }>("SELECT room_code FROM gifts WHERE id = 'gift-an-to-mei2'"))[0].room_code).toBe(school.code);
    // 學校關了送禮：改記在安親班
    await call('PATCH', `/api/teacher/rooms/${school.code}`, { giftsOpen: false }, school.token);
    expect((await call('POST', '/api/gifts', { id: 'gift-an-to-mei3', to: mei2.account.id, itemId: 'sticker.tulip' }, an.token)).status).toBe(200);
    expect((await db.query<{ room_code: string }>("SELECT room_code FROM gifts WHERE id = 'gift-an-to-mei3'"))[0].room_code).toBe(after.code);
  });
});
