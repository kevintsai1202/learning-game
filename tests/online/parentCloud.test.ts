/**
 * 家長的雲端角色（A2）前端整合測試：前端的雲端函式直接接上真正的伺服器 app（PGlite 記憶體資料庫），
 * 用「裝置」物件模擬不同的平板。存到雲端、在這台裝置玩、加入班級、被移出後同步。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import type { Db } from '../../server/db';
import { openTestDb, resetDb } from '../server/helpers';
import { api, type ApiOptions } from '../../src/online/api';
import { attachToClass, LocalConflictError, playOnThisDevice, syncProfile, uploadToCloud, type CloudDeps } from '../../src/online/cloudSync';
import { applyOp, type Op } from '../../src/online/ops';
import { emptyOutbox, enqueue, type Outbox } from '../../src/online/sync';
import { addProfile, createEmptySave, parseProfile, type Profile } from '../../src/store/save';

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

/** 一台模擬的裝置（本機存檔、權杖、待送佇列各自獨立） */
function device(app: ReturnType<typeof createApp>) {
  const profiles = new Map<string, Profile>();
  const tokens = new Map<string, string>();
  const outboxes = new Map<string, Outbox>();
  const deps: CloudDeps = {
    call: <T,>(method: string, path: string, opts: ApiOptions) => api<T>(method, path, { ...opts, fetchImpl: (url, init) => app.request(url, init) }),
    getProfile: (id) => profiles.get(id) ?? null,
    putProfile: (p) => void profiles.set(p.id, p),
    loadOutbox: (acc) => outboxes.get(acc) ?? emptyOutbox(),
    saveOutbox: (acc, box) => void outboxes.set(acc, box),
    getToken: (acc) => tokens.get(acc) ?? null,
    setToken: (acc, token) => void (token ? tokens.set(acc, token) : tokens.delete(acc)),
    now: () => new Date(),
  };
  /** 模擬 useGame 的雲端路徑：本機先套用，再放進待送佇列 */
  const act = (profileId: string, op: Op) => {
    const p = profiles.get(profileId)!;
    const r = applyOp(p, op, new Date());
    if (!r.ok) throw new Error(r.reason);
    profiles.set(profileId, r.profile);
    deps.saveOutbox(p.cloud!.accountId, enqueue(deps.loadOutbox(p.cloud!.accountId), op));
  };
  return { deps, profiles, tokens, act };
}

/** 直接呼叫伺服器（準備資料用） */
async function post(app: ReturnType<typeof createApp>, path: string, body: unknown, token?: string, method = 'POST') {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return (await res.json()) as any;
}

let userSeq = 0;
/** 註冊一位大人（家長或老師），回傳權杖 */
async function register(app: ReturnType<typeof createApp>, roles: { parent: boolean; teacher: boolean }): Promise<string> {
  const username = `pc_user_${++userSeq}`;
  return (await post(app, '/api/users', { username, password: 'teach1234', email: `${username}@example.com`, ...roles })).token;
}

/** 一個本機角色 */
const localKid = (name: string, coins: number): Profile => ({ ...addProfile(createEmptySave(), { name, avatar: { animal: 'cat', color: '#ffffff', hat: null } }, new Date()).profiles[0], coins });

let opSeq = 0;
/** 玩 30 秒（會送到伺服器的操作） */
const playOp = (): Op => ({ id: `pc-op-${++opSeq}`, at: new Date().toISOString(), kind: 'playTime', seconds: 30 });

describe('家長的雲端角色（前端）', () => {
  it('存檔格式：雲端角色可以沒有班級（家長名下）', () => {
    const p = { ...localKid('安安', 0), cloud: { server: SERVER, accountId: 'a_x' } };
    expect(parseProfile(p)?.cloud).toEqual({ server: SERVER, accountId: 'a_x' });
  });

  it('存到雲端：這台裝置的角色就地變成雲端角色（同一個 id、沒有班級），之後同步照常', async () => {
    const app = createApp({ db });
    const mom = await register(app, { parent: true, teacher: false });
    const d = device(app);
    const local = localKid('安安', 20);
    d.profiles.set(local.id, local);
    const p = await uploadToCloud(d.deps, SERVER, mom, local.id);
    expect(p.id).toBe(local.id);
    expect(d.profiles.size).toBe(1);
    expect(p.cloud).toEqual({ server: SERVER, accountId: expect.any(String) });
    expect(d.tokens.get(p.cloud!.accountId)).toBeTruthy();
    d.act(p.id, playOp());
    expect((await syncProfile(d.deps, p.id)).status).toBe('synced');
    expect(d.profiles.get(p.id)!.cloud!.room).toBeUndefined();
    expect(d.profiles.get(p.id)!.coins).toBe(20);
  });

  it('在這台裝置玩：新裝置拿到同一個角色與進度', async () => {
    const app = createApp({ db });
    const mom = await register(app, { parent: true, teacher: false });
    const home = device(app);
    const local = localKid('安安', 33);
    home.profiles.set(local.id, local);
    const up = await uploadToCloud(home.deps, SERVER, mom, local.id);
    const tablet = device(app);
    const p = await playOnThisDevice(tablet.deps, SERVER, mom, up.cloud!.accountId);
    expect(p).toMatchObject({ id: local.id, name: '安安', coins: 33, cloud: { server: SERVER, accountId: up.cloud!.accountId } });
    expect(tablet.tokens.get(up.cloud!.accountId)).toBeTruthy();
    expect((await syncProfile(tablet.deps, p.id)).status).toBe('synced');
  });

  it('在這台裝置玩：這台裝置已經有同一個角色、但不是這個雲端角色（例如之前用備份匯入的）時不蓋掉，丟出說明', async () => {
    const app = createApp({ db });
    const mom = await register(app, { parent: true, teacher: false });
    const home = device(app);
    const local = localKid('安安', 33);
    home.profiles.set(local.id, local);
    const up = await uploadToCloud(home.deps, SERVER, mom, local.id);
    // 另一台裝置之前匯入了同一份備份（同一個角色 id、沒有雲端標記），之後自己又玩出進度
    const tablet = device(app);
    tablet.profiles.set(local.id, { ...local, coins: 50 });
    await expect(playOnThisDevice(tablet.deps, SERVER, mom, up.cloud!.accountId)).rejects.toBeInstanceOf(LocalConflictError);
    expect(tablet.profiles.get(local.id)).toMatchObject({ coins: 50 });
    expect(tablet.profiles.get(local.id)!.cloud).toBeUndefined();
    expect(tablet.tokens.size).toBe(0);
  });

  it('在這台裝置玩，家長確認取代（replaceLocal）：這台裝置上的同一個角色換成雲端的進度', async () => {
    const app = createApp({ db });
    const mom = await register(app, { parent: true, teacher: false });
    const home = device(app);
    const local = localKid('安安', 33);
    home.profiles.set(local.id, local);
    const up = await uploadToCloud(home.deps, SERVER, mom, local.id);
    const tablet = device(app);
    tablet.profiles.set(local.id, { ...local, coins: 50 });
    const p = await playOnThisDevice(tablet.deps, SERVER, mom, up.cloud!.accountId, { replaceLocal: true });
    expect(p).toMatchObject({ id: local.id, coins: 33, cloud: { accountId: up.cloud!.accountId } });
    expect(tablet.profiles.get(local.id)).toEqual(p);
    expect(tablet.tokens.get(up.cloud!.accountId)).toBeTruthy();
    expect((await syncProfile(tablet.deps, p.id)).status).toBe('synced');
  });

  it('確認取代時，這台裝置上的同一個角色是另一個雲端帳號：那個帳號在這台的權杖與待送佇列一併清掉', async () => {
    const app = createApp({ db });
    const mom = await register(app, { parent: true, teacher: false });
    const home = device(app);
    const local = localKid('安安', 33);
    home.profiles.set(local.id, local);
    const up = await uploadToCloud(home.deps, SERVER, mom, local.id);
    const tablet = device(app);
    tablet.profiles.set(local.id, { ...local, cloud: { server: SERVER, accountId: 'a_other', room: '123456', roomName: '舊班級' } });
    tablet.tokens.set('a_other', 'old-token');
    tablet.deps.saveOutbox('a_other', enqueue(emptyOutbox(), playOp()));
    await expect(playOnThisDevice(tablet.deps, SERVER, mom, up.cloud!.accountId)).rejects.toBeInstanceOf(LocalConflictError);
    await playOnThisDevice(tablet.deps, SERVER, mom, up.cloud!.accountId, { replaceLocal: true });
    expect(tablet.profiles.get(local.id)!.cloud!.accountId).toBe(up.cloud!.accountId);
    expect(tablet.tokens.has('a_other')).toBe(false);
    expect(tablet.deps.loadOutbox('a_other').pending).toHaveLength(0);
  });

  it('權杖不見了（過期、被撤銷）：同一台裝置再按「在這台裝置玩」拿到新權杖，這台還沒送出的進度照樣送出', async () => {
    const app = createApp({ db });
    const mom = await register(app, { parent: true, teacher: false });
    const d = device(app);
    const local = localKid('安安', 12);
    d.profiles.set(local.id, local);
    const up = await uploadToCloud(d.deps, SERVER, mom, local.id);
    const acc = up.cloud!.accountId;
    d.act(up.id, playOp());
    d.tokens.delete(acc);
    expect((await syncProfile(d.deps, up.id)).status).toBe('needLogin');
    const p = await playOnThisDevice(d.deps, SERVER, mom, acc);
    expect(p).toMatchObject({ id: local.id, coins: 12, cloud: { accountId: acc } });
    expect((await syncProfile(d.deps, p.id)).status).toBe('synced');
    expect(d.deps.loadOutbox(acc).pending).toHaveLength(0);
    const me = (await post(app, '/api/ops', { ops: [] }, d.tokens.get(acc)!)) as { rev: number };
    expect(me.rev).toBe(2);
  });

  it('雲端角色加入班級：本機的雲端標記多了班級；被老師移出後同步，班級清掉、進度還在', async () => {
    const app = createApp({ db });
    const mom = await register(app, { parent: true, teacher: false });
    const teacher = await register(app, { parent: false, teacher: true });
    const { room } = await post(app, '/api/teacher/rooms', { name: '二年一班' }, teacher);
    const d = device(app);
    const local = localKid('安安', 40);
    d.profiles.set(local.id, local);
    const up = await uploadToCloud(d.deps, SERVER, mom, local.id);
    const joined = await attachToClass(d.deps, up.id, { code: room.code, nickname: '小安', pin: '1234' });
    expect(joined).toMatchObject({ id: local.id, name: '小安', coins: 40, cloud: { server: SERVER, accountId: up.cloud!.accountId, room: room.code, roomName: '二年一班' } });
    // 老師移出（家長名下的角色：退出班級）
    await post(app, `/api/teacher/rooms/${room.code}/members/${up.cloud!.accountId}`, undefined, teacher, 'DELETE');
    d.act(up.id, playOp());
    expect((await syncProfile(d.deps, up.id)).status).toBe('synced');
    const after = d.profiles.get(up.id)!;
    expect(after.cloud).toEqual({ server: SERVER, accountId: up.cloud!.accountId });
    expect(after.coins).toBe(40);
  });
});
