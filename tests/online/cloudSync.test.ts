/**
 * 雲端同步迴圈的整合測試：前端的同步邏輯直接接上真正的伺服器 app（PGlite 記憶體資料庫），
 * 用「裝置」物件模擬不同的平板（各自的本機存檔、權杖、待送佇列）。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import type { Db } from '../../server/db';
import { openTestDb, resetDb } from '../server/helpers';
import { api, ApiFailure, type ApiOptions } from '../../src/online/api';
import { fetchGoogleLinks, googleLogin, joinClass, linkGoogle, loginClass, logoutClass, syncProfile, unlinkGoogle, type CloudDeps } from '../../src/online/cloudSync';
import { createLocalJWKSet } from 'jose';
import { createGoogleVerifier } from '../../server/google';
import { makeGoogleKeys, TEST_CLIENT_ID } from '../server/googleKeys';
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

/** 建立房間，回傳代碼 */
async function newRoom(app: ReturnType<typeof createApp>): Promise<string> {
  const res = await app.request('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '二年一班', password: 'teach123' }) });
  return ((await res.json()) as { code: string }).code;
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
    expect(p.cloud).toMatchObject({ server: SERVER, room: code, roomName: '二年一班' });
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
    const teacher = (await (await app.request('/api/teacher/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, password: 'teach123' }) })).json()) as { token: string };
    await app.request(`/api/teacher/members/${acc}/pin`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${teacher.token}` }, body: JSON.stringify({ pin: '5555' }) });
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

describe('Google 快速登入（備選）', () => {
  let keys: Awaited<ReturnType<typeof makeGoogleKeys>>;
  beforeAll(async () => {
    keys = await makeGoogleKeys();
  });
  /** 開好 Google 登入的伺服器 app */
  const googleApp = () =>
    createApp({ db, google: { clientId: TEST_CLIENT_ID, verify: createGoogleVerifier({ clientId: TEST_CLIENT_ID, keys: createLocalJWKSet(keys.jwks) }), testMode: true } });

  it('綁定後在新裝置用 Google 登入：綁定的孩子都登入到這台裝置，進度都在', async () => {
    const app = googleApp();
    const code = await newRoom(app);
    const d1 = device(app);
    const a = await joinClass(d1.deps, SERVER, { code, nickname: '哥哥', pin: '1111', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } });
    const b = await joinClass(d1.deps, SERVER, { code, nickname: '妹妹', pin: '2222', avatar: { animal: 'cat', color: '#ffffff', hat: null } });
    d1.act(a.id, sessionOp('q1', 'q2'));
    await syncProfile(d1.deps, a.id);
    const token = await keys.sign('mom', 'mom@gmail.com');
    expect(await linkGoogle(d1.deps, a.id, token)).toEqual(['mo***@gmail.com']);
    await linkGoogle(d1.deps, b.id, token);
    expect(await fetchGoogleLinks(d1.deps, b.id)).toEqual(['mo***@gmail.com']);

    const d2 = device(app);
    const kids = await googleLogin(d2.deps, SERVER, await keys.sign('mom', 'mom@gmail.com'));
    expect(kids.map((k) => k.name).sort()).toEqual(['哥哥', '妹妹']);
    expect(d2.profiles.size).toBe(2);
    expect(d2.profiles.get(a.id)!.history).toHaveLength(1);
    expect(d2.profiles.get(a.id)!.cloud).toMatchObject({ server: SERVER, room: code });
    // 兩位都拿到自己的權杖，可以各自同步
    expect((await syncProfile(d2.deps, a.id)).status).toBe('synced');
    expect((await syncProfile(d2.deps, b.id)).status).toBe('synced');
  });

  it('這台裝置有還沒上傳的進度時用 Google 登入：進度不會遺失，之後照常上傳', async () => {
    const app = googleApp();
    const code = await newRoom(app);
    const d = device(app);
    const a = await joinClass(d.deps, SERVER, { code, nickname: '哥哥', pin: '1111', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } });
    await linkGoogle(d.deps, a.id, await keys.sign('mom', 'mom@gmail.com'));
    // 離線玩一回合：進度留在佇列
    d.state.offline = true;
    d.act(a.id, sessionOp('q1'));
    expect((await syncProfile(d.deps, a.id)).status).toBe('offline');
    d.state.offline = false;
    // 用 Google 重新登入：本機要是「伺服器版本＋還沒送出的進度」
    const [kid] = await googleLogin(d.deps, SERVER, await keys.sign('mom', 'mom@gmail.com'));
    expect(kid.history).toHaveLength(1);
    expect(d.profiles.get(a.id)!.history).toHaveLength(1);
    expect((await syncProfile(d.deps, a.id)).status).toBe('synced');
    const me = await d.deps.call<{ profile: Profile }>('GET', '/api/me', { base: SERVER, token: d.tokens.get(a.cloud!.accountId) });
    expect(me.profile.history).toHaveLength(1);
  });

  it('沒有綁定的 Google 帳號：丟出說明要先綁定的訊息', async () => {
    const app = googleApp();
    const d = device(app);
    await expect(googleLogin(d.deps, SERVER, await keys.sign('nobody', 'x@gmail.com'))).rejects.toThrow('還沒有綁定');
  });

  it('解除綁定後不能再用 Google 登入', async () => {
    const app = googleApp();
    const code = await newRoom(app);
    const d = device(app);
    const a = await joinClass(d.deps, SERVER, { code, nickname: '哥哥', pin: '1111', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } });
    await linkGoogle(d.deps, a.id, await keys.sign('mom', 'mom@gmail.com'));
    expect(await unlinkGoogle(d.deps, a.id)).toEqual([]);
    await expect(googleLogin(device(app).deps, SERVER, await keys.sign('mom', 'mom@gmail.com'))).rejects.toThrow('還沒有綁定');
  });
});
