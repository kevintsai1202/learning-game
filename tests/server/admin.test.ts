/**
 * 營運者監控入口（docs/plans/admin.md）：
 * - 登入：只收 ADMIN_EMAILS 裡、Google 驗證過 email 的帳號；沒設 ADMIN_EMAILS 或沒開 Google 時整個關掉
 * - admin 權杖只能用在 admin 的 API；大人、孩子的權杖不能看監控
 * - 總覽：人數、活躍、每日趨勢、科目分布、AI 用量、匿名造訪、現在線上
 * - 明細：班級、孩子、大人；不回密碼雜湊、孩子密碼、完整 email、Google sub、存檔全文
 * - 匿名造訪：同一天同一台只算一次、依網址分類、90 天後刪除
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalJWKSet } from 'jose';
import { createRoom, createUser, fakeClock, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import { makeGoogleKeys, TEST_CLIENT_ID } from './googleKeys';
import { createGoogleVerifier, type GoogleConfig } from '../../server/google';
import { pruneVisits } from '../../server/admin';
import type { Db } from '../../server/db';

let db: Db;
let keys: Awaited<ReturnType<typeof makeGoogleKeys>>;
let google: GoogleConfig;
beforeAll(async () => {
  db = await openTestDb();
  keys = await makeGoogleKeys();
  google = { clientId: TEST_CLIENT_ID, verify: createGoogleVerifier({ clientId: TEST_CLIENT_ID, keys: createLocalJWKSet(keys.jwks) }), testMode: true };
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
});

const ADMIN = 'boss@gmail.com';
/** 台灣時間 2026-10-14 中午 */
const START = '2026-10-14T12:00:00+08:00';

/** 開好 Google 與管理者清單的 app */
function client(opts: { adminEmails?: string[]; google?: GoogleConfig | null; liveStats?: () => { kids: number; teachers: number } } = {}) {
  const clock = fakeClock(START);
  const c = makeClient(db, { google: 'google' in opts ? opts.google : google, adminEmails: opts.adminEmails ?? [ADMIN], liveStats: opts.liveStats, now: clock.now });
  return { ...c, clock };
}

/** 用 Google 登入監控頁，回傳權杖 */
async function adminLogin(call: ReturnType<typeof client>['call'], email = ADMIN) {
  const r = await call('POST', '/api/admin/login', { idToken: await keys.sign('g-admin', email) });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.token as string;
}

/** 改孩子雲端存檔的回合紀錄、遊玩時間與金幣 */
async function setUsage(accountId: string, history: { date: string; subject: string; total: number }[], playLog: Record<string, number>, coins = 0) {
  const rows = history.map((h) => ({ activityId: `${h.subject}.x`, subject: h.subject, date: h.date, total: h.total, correct: h.total, stars: 3, coins: 1, seconds: 60 }));
  await db.query(`UPDATE accounts SET profile = jsonb_set(jsonb_set(jsonb_set(profile, '{history}', $2::jsonb), '{playLog}', $3::jsonb), '{coins}', $4::jsonb) WHERE id = $1`, [
    accountId,
    JSON.stringify(rows),
    JSON.stringify(playLog),
    JSON.stringify(coins),
  ]);
}

describe('登入', () => {
  it('ADMIN_EMAILS 裡的 Google 帳號拿得到權杖；不在清單、email 沒驗證的回 403', async () => {
    const { call } = client();
    expect(await adminLogin(call)).toMatch(/.{20,}/);
    expect(await adminLogin(call, 'BOSS@gmail.com')).toMatch(/.{20,}/);
    const other = await call('POST', '/api/admin/login', { idToken: await keys.sign('g-other', 'someone@gmail.com') });
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('not_admin');
    const unverified = await call('POST', '/api/admin/login', { idToken: await keys.sign('g-admin', ADMIN, { emailVerified: false }) });
    expect(unverified.status).toBe(403);
    const bad = await call('POST', '/api/admin/login', { idToken: 'not-a-token' });
    expect(bad.status).toBe(401);
  });

  it('沒設 ADMIN_EMAILS 或沒開 Google 時，admin 的 API 都是 404', async () => {
    for (const c of [client({ adminEmails: [] }), client({ google: null })]) {
      const r = await c.call('POST', '/api/admin/login', { idToken: await keys.sign('g-admin', ADMIN) });
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('admin_disabled');
      expect((await c.call('GET', '/api/admin/overview', undefined, 'whatever')).status).toBe(404);
    }
  });

  it('admin 權杖只能用在 admin 的 API；大人權杖看不到監控；登出後權杖失效；8 小時後過期', async () => {
    const { call, clock } = client();
    const token = await adminLogin(call);
    const teacher = await createUser(call);
    expect((await call('GET', '/api/admin/overview', undefined, token)).status).toBe(200);
    expect((await call('GET', '/api/users/me', undefined, token)).status).toBe(401);
    expect((await call('GET', '/api/admin/overview', undefined, teacher.token)).status).toBe(401);
    expect((await call('GET', '/api/admin/overview')).status).toBe(401);
    expect((await call('POST', '/api/admin/logout', {}, token)).status).toBe(200);
    expect((await call('GET', '/api/admin/overview', undefined, token)).status).toBe(401);
    const again = await adminLogin(call);
    clock.advance(8 * 3600 * 1000 + 1000);
    expect((await call('GET', '/api/admin/accounts', undefined, again)).status).toBe(401);
  });
});

describe('總覽與明細', () => {
  /** 一位老師的班級＋兩個孩子，一位只有家長身分的大人；孩子有作答紀錄 */
  async function setup(c: ReturnType<typeof client>) {
    const { call } = c;
    const room = await createRoom(call, '二年一班');
    const bao = await joinRoom(call, room.code, '阿寶', '1111');
    const mei = await joinRoom(call, room.code, '小美', '2222');
    await createUser(call, { parent: true, teacher: false });
    await setUsage(bao.account.id, [{ date: '2026-10-13', subject: 'math', total: 10 }, { date: '2026-10-14', subject: 'zh', total: 8 }], { '2026-10-13': 600, '2026-10-14': 1200 }, 50);
    await setUsage(mei.account.id, [{ date: '2026-10-14', subject: 'math', total: 5 }], { '2026-10-14': 300 }, 7);
    await db.query("INSERT INTO ai_usage (user_id, day, count) SELECT owner_id, '2026-10-14', 10 FROM rooms WHERE code = $1", [room.code]);
    return { room, bao, mei };
  }

  it('總覽：人數、活躍、每日趨勢、科目分布、AI 出題量、現在線上', async () => {
    const c = client({ liveStats: () => ({ kids: 3, teachers: 1 }) });
    await setup(c);
    const token = await adminLogin(c.call);
    const r = await c.call('GET', '/api/admin/overview', undefined, token);
    expect(r.status).toBe(200);
    const o = r.body;
    expect(o.counts).toMatchObject({ adults: 2, teachers: 1, parents: 1, kids: 2, kidsInClass: 2, classes: 1 });
    expect(o.active.kids.today).toBe(2);
    expect(o.online).toEqual({ kids: 3, teachers: 1 });
    expect(o.days).toHaveLength(30);
    expect(o.days.at(-1)).toMatchObject({ day: '2026-10-14', kids: 2, rounds: 2, questions: 13, minutes: 25 });
    expect(o.days.at(-2)).toMatchObject({ day: '2026-10-13', kids: 1, rounds: 1, questions: 10, minutes: 10 });
    expect(o.subjects[0]).toEqual({ subject: 'math', rounds: 2, questions: 15 });
    expect(o.ai.questions.at(-1)).toEqual({ day: '2026-10-14', count: 10 });
    expect(o.ai.questions).toHaveLength(7);
  });

  it('明細：班級、孩子、大人的使用狀況；不回密碼、孩子密碼、完整 email、Google sub、存檔全文', async () => {
    const c = client();
    const { room } = await setup(c);
    const token = await adminLogin(c.call);
    const r = await c.call('GET', '/api/admin/accounts', undefined, token);
    expect(r.status).toBe(200);
    expect(r.body.classes).toEqual([expect.objectContaining({ code: room.code, name: '二年一班', members: 2, packs: 0 })]);
    const bao = r.body.kids.find((k: any) => k.name === '阿寶');
    expect(bao).toMatchObject({ classes: ['二年一班'], hasParent: false, rounds: 2, questions: 18, minutes: 30, coins: 50 });
    const teacher = r.body.adults.find((a: any) => a.teacher);
    expect(teacher).toMatchObject({ classes: 1, kids: 0, emailVerified: false });
    expect(teacher).not.toHaveProperty('google');
    expect(teacher.email).toMatch(/^us\*\*\*@example\.com$/);
    expect(r.body.truncated).toBe(false);
    const text = JSON.stringify(r.body);
    for (const banned of ['password', 'pin_hash', 'pinHash', 'google_sub', 'token', 'profile', 'history', 'playLog', '@example.com"']) {
      if (banned === '@example.com"') expect(text).not.toMatch(/"user_\d+@example\.com"/);
      else expect(text).not.toContain(banned);
    }
  });
});

describe('匿名造訪', () => {
  const device = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

  it('同一天同一台只算一次；隔天再算；依網址分類；格式不對 400', async () => {
    const { call, clock } = client();
    const pages = { origin: 'https://kevintsai1202.github.io' };
    expect((await call('POST', '/api/visit', { device }, undefined, pages)).status).toBe(200);
    expect((await call('POST', '/api/visit', { device }, undefined, pages)).status).toBe(200);
    expect((await call('POST', '/api/visit', { device: 'b'.repeat(32) }, undefined, { origin: 'https://learning-island.zeabur.app' })).status).toBe(200);
    expect((await call('POST', '/api/visit', { device: 'short' })).status).toBe(400);
    expect((await call('POST', '/api/visit', { device: 'x'.repeat(32) + '<' })).status).toBe(400);
    clock.advance(24 * 3600 * 1000);
    expect((await call('POST', '/api/visit', { device }, undefined, pages)).status).toBe(200);
    const rows = await db.query<{ day: string; host: string; n: number }>("SELECT day::text AS day, host, count(*)::int AS n FROM visits GROUP BY day, host ORDER BY day, host");
    expect(rows).toEqual([
      { day: '2026-10-14', host: 'pages', n: 1 },
      { day: '2026-10-14', host: 'zeabur', n: 1 },
      { day: '2026-10-15', host: 'pages', n: 1 },
    ]);
    // 不存原本的 id
    expect(JSON.stringify(await db.query('SELECT * FROM visits'))).not.toContain(device);
    const token = await adminLogin(call);
    const o = (await call('GET', '/api/admin/overview', undefined, token)).body;
    expect(o.visits).toMatchObject({ today: 1, d7: 2, d30: 2, hosts: { pages: 1, zeabur: 1 } });
    expect(o.days.at(-1).visits).toBe(1);
    expect(o.days.at(-2).visits).toBe(2);
  });

  it('沒開監控（沒設 ADMIN_EMAILS）也照樣計數；90 天前的刪掉', async () => {
    const { call } = client({ adminEmails: [] });
    expect((await call('POST', '/api/visit', { device })).status).toBe(200);
    await db.query("INSERT INTO visits (day, device_hash, host, first_at) VALUES ('2026-07-01', 'old', 'other', now())");
    await pruneVisits(db, new Date(START));
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM visits'))[0].n).toBe(1);
  });
});
