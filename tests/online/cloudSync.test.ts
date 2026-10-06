/**
 * 雲端同步迴圈的整合測試：前端的同步邏輯直接接上真正的伺服器 app（PGlite 記憶體資料庫），
 * 用「裝置」物件模擬不同的平板（各自的本機存檔、權杖、待送佇列）。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import type { Db } from '../../server/db';
import { openTestDb, resetDb } from '../server/helpers';
import { api, ApiFailure, type ApiOptions } from '../../src/online/api';
import {
  acceptGift,
  ackGiftNotices,
  declineGift,
  fetchClassmates,
  fetchGifts,
  joinClass,
  loginClass,
  logoutClass,
  sendGift,
  syncProfile,
  withRooms,
  type CloudDeps,
} from '../../src/online/cloudSync';
import { applyOp, type Op } from '../../src/online/ops';
import { emptyOutbox, enqueue, type Outbox } from '../../src/online/sync';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';
import type { Question } from '../../src/core/types';

const SERVER = 'http://island.test';
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

const q = (id: string): Question => ({ id, subject: 'math', skill: 'math.add', indicators: ['N-2-2'], prompt: id, type: 'number', answer: 1 });
let seq = 0;
/** 一回合：第一題一次答對、其餘答錯（進錯題本） */
const sessionOp = (...ids: string[]): Op => ({
  id: `s${++seq}`,
  at: new Date().toISOString(),
  kind: 'session',
  result: {
    activityId: 'math.add',
    subject: 'math',
    total: ids.length,
    correct: 1,
    stars: 1,
    coins: 3,
    seconds: 30,
    answers: ids.map((id, i) => ({ question: q(id), correct: i === 0, firstTry: i === 0 })),
  },
});

/** 一台模擬的裝置 */
function device(app: ReturnType<typeof createApp>) {
  const profiles = new Map<string, Profile>();
  const tokens = new Map<string, string>();
  const outboxes = new Map<string, Outbox>();
  const state = { offline: false, loseResponse: false, duringFlight: null as null | (() => void) };
  const deps: CloudDeps = {
    call: async <T,>(method: string, path: string, opts: ApiOptions) => {
      if (state.offline) throw new ApiFailure(0, 'network', '連不上');
      const result = await api<T>(method, path, { ...opts, fetchImpl: (url, init) => app.request(url, init) });
      // 模擬「伺服器已經套用、但回應在路上遺失」
      if (state.loseResponse) {
        state.loseResponse = false;
        throw new ApiFailure(0, 'network', '回應遺失');
      }
      // 模擬「送出期間孩子又做了別的事」
      if (state.duringFlight) {
        const fn = state.duringFlight;
        state.duringFlight = null;
        fn();
      }
      return result;
    },
    getProfile: (id) => profiles.get(id) ?? null,
    putProfile: (p) => void profiles.set(p.id, p),
    loadOutbox: (acc) => outboxes.get(acc) ?? emptyOutbox(),
    saveOutbox: (acc, box) => void outboxes.set(acc, box),
    getToken: (acc) => tokens.get(acc) ?? null,
    setToken: (acc, token) => void (token ? tokens.set(acc, token) : tokens.delete(acc)),
    now: () => new Date(),
  };
  /** 模擬 useGame 的雲端路徑：本機先套用，再放進待送佇列 */
  const act = (profileId: string, op: Op): boolean => {
    const p = profiles.get(profileId)!;
    const r = applyOp(p, op, new Date());
    if (!r.ok) return false;
    profiles.set(profileId, r.profile);
    deps.saveOutbox(p.cloud!.accountId, enqueue(deps.loadOutbox(p.cloud!.accountId), op));
    return true;
  };
  return { deps, profiles, tokens, outboxes, state, act };
}

/** 每個班級的老師權杖（重設孩子密碼的測試要用） */
const teacherTokens = new Map<string, string>();
/** 測試老師帳號名稱的流水號 */
let teacherSeq = 0;

/** 註冊一位老師並建立班級，回傳班級代碼 */
async function newRoom(app: ReturnType<typeof createApp>): Promise<string> {
  const post = async (path: string, body: unknown, token?: string) =>
    (await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json();
  const username = `sync_teacher_${++teacherSeq}`;
  const { token } = (await post('/api/users', { username, password: 'teach1234', email: `${username}@example.com`, parent: false, teacher: true })) as { token: string };
  const { room } = (await post('/api/teacher/rooms', { name: '二年一班' }, token)) as { room: { code: string } };
  teacherTokens.set(room.code, token);
  return room.code;
}

/** 去掉本機才有的雲端標記，方便和伺服器的存檔比較 */
const strip = (p: Profile) => {
  const { cloud: _c, ...rest } = p;
  return rest;
};

describe('加入與登入', () => {
  it('加入班級：本機多一個雲端角色，記住權杖與伺服器網址', async () => {
    const app = createApp({ db });
    const code = await newRoom(app);
    const d = device(app);
    const p = await joinClass(d.deps, SERVER, { code, nickname: '小安', pin: '1234', avatar: { animal: 'cat', color: '#ffffff', hat: null } });
    expect(p.cloud).toMatchObject({ server: SERVER, rooms: [{ code, name: '二年一班', nickname: '小安' }] });
    expect(d.profiles.get(p.id)).toEqual(p);
    expect(d.tokens.get(p.cloud!.accountId)).toBeTruthy();
  });

  it('帶本機角色加入：同一個角色直接變成雲端角色（不會多一個同名角色）', async () => {
    const app = createApp({ db });
    const code = await newRoom(app);
    const d = device(app);
    const local = { ...addProfile(createEmptySave(), { name: '安安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, new Date()).profiles[0], coins: 50 };
    d.profiles.set(local.id, local);
    const p = await joinClass(d.deps, SERVER, { code, nickname: '小安', pin: '1234', profile: local });
    expect(p.id).toBe(local.id);
    expect(d.profiles.size).toBe(1);
    expect(p).toMatchObject({ name: '小安', coins: 50 });
  });

  it('登入失敗丟出可以顯示的中文訊息', async () => {
    const app = createApp({ db });
    const code = await newRoom(app);
    const d = device(app);
    await expect(loginClass(d.deps, SERVER, { code, nickname: '沒有這個人', pin: '1234' })).rejects.toThrow('房間代碼、暱稱或密碼不對');
  });
});

describe('同步', () => {
  async function joined() {
    const app = createApp({ db });
    const code = await newRoom(app);
    const d = device(app);
    const p = await joinClass(d.deps, SERVER, { code, nickname: '小安', pin: '1234', avatar: { animal: 'cat', color: '#ffffff', hat: null } });
    return { app, code, d, id: p.id, acc: p.cloud!.accountId };
  }

  it('玩完的進度送到伺服器；之後本機與伺服器的存檔相同，佇列清空', async () => {
    const { d, id, acc } = await joined();
    d.act(id, sessionOp('a', 'b'));
    d.act(id, { id: 'p1', at: new Date().toISOString(), kind: 'playTime', seconds: 30 });
    const r = await syncProfile(d.deps, id);
    expect(r).toMatchObject({ status: 'synced', rev: 2 });
    expect(d.outboxes.get(acc)).toEqual(emptyOutbox());
    const me = await d.deps.call<{ profile: Profile }>('GET', '/api/me', { base: SERVER, token: d.tokens.get(acc) });
    expect(strip(d.profiles.get(id)!)).toEqual(me.profile);
    expect(Object.keys(me.profile.wrongBook)).toEqual(['b']);
  });

  it('沒網路：回報離線、進度留在佇列；連上後送出，不會重複', async () => {
    const { d, id, acc } = await joined();
    d.act(id, sessionOp('a'));
    d.state.offline = true;
    expect((await syncProfile(d.deps, id)).status).toBe('offline');
    expect(d.outboxes.get(acc)!.inflight).toHaveLength(1);
    d.act(id, sessionOp('c'));
    d.state.offline = false;
    expect((await syncProfile(d.deps, id)).status).toBe('synced');
    const me = await d.deps.call<{ profile: Profile }>('GET', '/api/me', { base: SERVER, token: d.tokens.get(acc) });
    expect(me.profile.history).toHaveLength(2);
    expect(strip(d.profiles.get(id)!)).toEqual(me.profile);
  });

  it('伺服器已套用但回應遺失：重送同一批，不會重複加金幣', async () => {
    const { d, id, acc } = await joined();
    d.act(id, sessionOp('a'));
    d.state.loseResponse = true;
    expect((await syncProfile(d.deps, id)).status).toBe('offline');
    expect((await syncProfile(d.deps, id)).status).toBe('synced');
    const me = await d.deps.call<{ profile: Profile }>('GET', '/api/me', { base: SERVER, token: d.tokens.get(acc) });
    expect(me.profile.history).toHaveLength(1);
    // 單題一次答對：3 顆星，1 + 3 × 2 = 7 金幣（只加一次）
    expect(me.profile.coins).toBe(7);
    expect(d.profiles.get(id)!.coins).toBe(7);
  });

  it('送出期間孩子又玩了一回合：兩回合都在，本機顯示正確', async () => {
    const { d, id, acc } = await joined();
    d.act(id, sessionOp('a'));
    d.state.duringFlight = () => d.act(id, sessionOp('c'));
    expect((await syncProfile(d.deps, id)).status).toBe('synced');
    expect(d.outboxes.get(acc)).toEqual(emptyOutbox());
    const me = await d.deps.call<{ profile: Profile }>('GET', '/api/me', { base: SERVER, token: d.tokens.get(acc) });
    expect(me.profile.history).toHaveLength(2);
    expect(strip(d.profiles.get(id)!)).toEqual(me.profile);
  });

  it('換一台裝置登入看得到進度與錯題本；在新裝置玩的進度，舊裝置同步後也看得到', async () => {
    const { app, code, d, id } = await joined();
    d.act(id, sessionOp('a', 'b'));
    await syncProfile(d.deps, id);

    const d2 = device(app);
    const p2 = await loginClass(d2.deps, SERVER, { code, nickname: '小安', pin: '1234' });
    expect(p2.id).toBe(id);
    expect(Object.keys(p2.wrongBook)).toEqual(['b']);
    d2.act(id, sessionOp('x', 'y'));
    await syncProfile(d2.deps, id);

    expect((await syncProfile(d.deps, id)).status).toBe('synced');
    expect(d.profiles.get(id)!.history).toHaveLength(2);
    expect(Object.keys(d.profiles.get(id)!.wrongBook).sort()).toEqual(['b', 'y']);
  });

  it('權杖失效（老師重設密碼）：要求重新登入，佇列保留；重新登入後送出', async () => {
    const { app, code, d, id, acc } = await joined();
    const teacher = teacherTokens.get(code)!;
    await app.request(`/api/teacher/rooms/${code}/members/${acc}/pin`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${teacher}` }, body: JSON.stringify({ pin: '5555' }) });
    d.act(id, sessionOp('a'));
    expect((await syncProfile(d.deps, id)).status).toBe('needLogin');
    expect(d.outboxes.get(acc)!.inflight).toHaveLength(1);
    expect(d.tokens.has(acc)).toBe(false);
    const p = await loginClass(d.deps, SERVER, { code, nickname: '小安', pin: '5555' });
    // 登入時本機顯示「伺服器版本＋還沒送出的進度」
    expect(p.history).toHaveLength(1);
    expect((await syncProfile(d.deps, id)).status).toBe('synced');
    const me = await d.deps.call<{ profile: Profile }>('GET', '/api/me', { base: SERVER, token: d.tokens.get(acc) });
    expect(me.profile.history).toHaveLength(1);
  });

  it('本機角色或沒有雲端標記的角色不做事', async () => {
    const { d } = await joined();
    const local = addProfile(createEmptySave(), { name: '小美', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, new Date()).profiles[0];
    d.profiles.set(local.id, local);
    expect((await syncProfile(d.deps, local.id)).status).toBe('skipped');
  });

  it('登出：權杖與佇列清掉，伺服器端的權杖也失效', async () => {
    const { d, id, acc } = await joined();
    const token = d.tokens.get(acc)!;
    await logoutClass(d.deps, id);
    expect(d.tokens.has(acc)).toBe(false);
    expect(d.outboxes.get(acc) ?? emptyOutbox()).toEqual(emptyOutbox());
    await expect(d.deps.call('GET', '/api/me', { base: SERVER, token })).rejects.toMatchObject({ status: 401 });
  });
});

describe('班級教材版本與我的島（老師 GM 的 G0＋G1）', () => {
  /** 老師設定的班級版本 */
  const CLASS = { zh: 'nani-zh', math: 'hanlin-math', term: '上' as const };
  /** 老師改班級設定 */
  const patchRoom = (app: ReturnType<typeof createApp>, code: string, body: unknown) =>
    app.request(`/api/teacher/rooms/${code}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${teacherTokens.get(code)}` },
      body: JSON.stringify(body),
    });

  it('老師設定班級版本後，同步一次本機就記住；老師取消統一後，同步一次就拿掉', async () => {
    const app = createApp({ db });
    const code = await newRoom(app);
    const d = device(app);
    const p = await joinClass(d.deps, SERVER, { code, nickname: '小安', pin: '1234', avatar: { animal: 'cat', color: '#ffffff', hat: null } });
    expect(p.cloud!.rooms![0].curriculum).toBeUndefined();
    expect((await patchRoom(app, code, { curriculum: CLASS })).status).toBe(200);
    await syncProfile(d.deps, p.id);
    expect(d.profiles.get(p.id)!.cloud!.rooms).toEqual([{ code, name: '二年一班', nickname: '小安', curriculum: CLASS }]);
    // 孩子自己的設定沒有被改
    expect(d.profiles.get(p.id)!.curriculum).toEqual(p.curriculum);
    await patchRoom(app, code, { curriculum: null });
    await syncProfile(d.deps, p.id);
    expect(d.profiles.get(p.id)!.cloud!.rooms![0]).not.toHaveProperty('curriculum');
  });

  it('本機選了我的島：同步後還在我的島；用班級代碼登入時班級版本一起帶回來', async () => {
    const app = createApp({ db });
    const code = await newRoom(app);
    await patchRoom(app, code, { curriculum: CLASS });
    const d = device(app);
    const p = await joinClass(d.deps, SERVER, { code, nickname: '小安', pin: '1234', avatar: { animal: 'cat', color: '#ffffff', hat: null } });
    expect(p.cloud!.rooms![0].curriculum).toEqual(CLASS);
    d.profiles.set(p.id, { ...p, cloud: { ...p.cloud!, island: 'mine' } });
    await syncProfile(d.deps, p.id);
    expect(d.profiles.get(p.id)!.cloud).toMatchObject({ island: 'mine', rooms: [{ code, curriculum: CLASS }] });
    const other = device(app);
    const again = await loginClass(other.deps, SERVER, { code, nickname: '小安', pin: '1234' });
    expect(again.cloud!.rooms![0].curriculum).toEqual(CLASS);
    expect(again.cloud!.island).toBeUndefined();
  });

  it('withRooms（多班級）：班級清單換成伺服器的（暱稱、班級版本；沒有統一版本時拿掉）；我的島保留，選的班級還在才保留，沒有班級時都拿掉', () => {
    const base = { server: SERVER, accountId: 'a_1', rooms: [{ code: '123456', name: '二年一班', curriculum: CLASS }], island: '654321' };
    const both = {
      room: { code: '123456', name: '二年一班', curriculum: CLASS },
      rooms: [
        { code: '123456', name: '二年一班', curriculum: CLASS, nickname: '小安' },
        { code: '654321', name: '安親班', curriculum: null, nickname: '安安' },
      ],
    };
    expect(withRooms(base, both)).toEqual({
      server: SERVER,
      accountId: 'a_1',
      rooms: [
        { code: '123456', name: '二年一班', curriculum: CLASS, nickname: '小安' },
        { code: '654321', name: '安親班', nickname: '安安' },
      ],
      island: '654321',
    });
    // 退出安親班：選的班級不在了，回到第一個班級（拿掉）；我的島照樣保留
    const onlySchool = { room: both.room, rooms: [both.rooms[0]] };
    expect(withRooms(base, onlySchool)).not.toHaveProperty('island');
    expect(withRooms({ ...base, island: 'mine' }, onlySchool).island).toBe('mine');
    // 沒有班級了
    expect(withRooms({ ...base, island: 'mine' }, { room: null, rooms: [] })).toEqual({ server: SERVER, accountId: 'a_1' });
    // 多班級之前的伺服器只給 room（沒有 rooms、可能也沒有 curriculum）：當作只有一個班級
    expect(withRooms(base, { room: { code: '123456', name: '二年一班' } as never })).toEqual({ server: SERVER, accountId: 'a_1', rooms: [{ code: '123456', name: '二年一班' }] });
  });
});

describe('送禮物（P3）', () => {
  /** 小安（50 金幣，裝置 A）與小美（裝置 B）加入同一個班級 */
  async function twoKids() {
    const app = createApp({ db });
    const code = await newRoom(app);
    const da = device(app);
    const db2 = device(app);
    const local = { ...addProfile(createEmptySave(), { name: '安安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, new Date()).profiles[0], coins: 50 };
    da.profiles.set(local.id, local);
    const a = await joinClass(da.deps, SERVER, { code, nickname: '小安', pin: '1111', profile: local });
    const b = await joinClass(db2.deps, SERVER, { code, nickname: '小美', pin: '2222', avatar: { animal: 'panda', color: '#5b5b6b', hat: null } });
    return { app, da, db: db2, a, b };
  }

  it('fetchClassmates：讀到同班同學（不含自己）', async () => {
    const { da, a } = await twoKids();
    const list = await fetchClassmates(da.deps, a.id);
    expect(list.map((m) => m.nickname)).toEqual(['小美']);
  });

  it('sendGift：先把佇列送完再送禮（伺服器才看得到最新的金幣），回應的存檔寫回本機', async () => {
    const { da, a, b } = await twoKids();
    // 還沒同步的購買：本機先扣了 20 金幣
    expect(da.act(a.id, { id: 'buy-1', at: new Date().toISOString(), kind: 'buy', itemId: 'hat.party' })).toBe(true);
    const gift = await sendGift(da.deps, a.id, { id: 'gift-0001', to: b.cloud!.accountId, itemId: 'sticker.tulip' });
    expect(gift).toMatchObject({ to: '小美', itemId: 'sticker.tulip', price: 5 });
    const local = da.profiles.get(a.id)!;
    expect(local.coins).toBe(50 - 20 - 5);
    expect(local.inventory).toEqual(['hat.party']);
    expect(local.cloud?.accountId).toBe(a.cloud!.accountId);
    expect(da.outboxes.get(a.cloud!.accountId)?.pending ?? []).toEqual([]);
  });

  it('sendGift 同一個 id 再送一次：伺服器只扣一次錢', async () => {
    const { da, a, b } = await twoKids();
    const input = { id: 'gift-0002', to: b.cloud!.accountId, itemId: 'sticker.star' };
    await sendGift(da.deps, a.id, input);
    await sendGift(da.deps, a.id, input);
    expect(da.profiles.get(a.id)!.coins).toBe(45);
  });

  it('sendGift 連不上：丟出連不上的錯誤，金幣不變', async () => {
    const { da, a, b } = await twoKids();
    da.state.offline = true;
    await expect(sendGift(da.deps, a.id, { id: 'gift-0003', to: b.cloud!.accountId, itemId: 'sticker.star' })).rejects.toMatchObject({ status: 0 });
    expect(da.profiles.get(a.id)!.coins).toBe(50);
  });

  it('收下：本機存檔有貼紙；送禮人讀到「收下了」的通知，看過之後不再出現', async () => {
    const { da, db: dbb, a, b } = await twoKids();
    const gift = await sendGift(da.deps, a.id, { id: 'gift-0004', to: b.cloud!.accountId, itemId: 'sticker.tulip' });
    const inbox = await fetchGifts(dbb.deps, b.id);
    expect(inbox.incoming.map((g) => [g.from, g.itemId])).toEqual([['小安', 'sticker.tulip']]);
    expect(await acceptGift(dbb.deps, b.id, gift.id)).toBe('accepted');
    expect(dbb.profiles.get(b.id)!.stickers).toEqual({ 'sticker.tulip': 1 });
    // 重複按收下（例如兩台裝置）：當作已處理
    expect(await acceptGift(dbb.deps, b.id, gift.id)).toBe('done');
    const notices = (await fetchGifts(da.deps, a.id)).notices;
    expect(notices).toEqual([{ id: gift.id, kind: 'accepted', to: '小美', itemId: 'sticker.tulip' }]);
    await ackGiftNotices(da.deps, a.id, [gift.id]);
    expect((await fetchGifts(da.deps, a.id)).notices).toEqual([]);
  });

  it('不用了：送禮人同步後金幣退回；重複按不會出錯', async () => {
    const { da, db: dbb, a, b } = await twoKids();
    const gift = await sendGift(da.deps, a.id, { id: 'gift-0005', to: b.cloud!.accountId, itemId: 'hat.party' });
    expect(da.profiles.get(a.id)!.coins).toBe(30);
    await declineGift(dbb.deps, b.id, gift.id);
    await declineGift(dbb.deps, b.id, gift.id);
    expect((await syncProfile(da.deps, a.id)).status).toBe('synced');
    expect(da.profiles.get(a.id)!.coins).toBe(50);
  });
});
