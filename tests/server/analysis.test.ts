/**
 * 學習報告的伺服器（docs/plans/learning-report.md 第 4 節）：
 * - 老師：全班與每個孩子的面向統計；AI 分析全班或單一孩子（工作編號＋查結果、快取、每日上限、資料不夠不呼叫）
 * - 孩子：AI 分析自己（給孩子與家長）；AI 的句子不合格時改用規則建議
 * - 送給 AI 的提示裡沒有名字、暱稱與帳號 id
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRoom, createUser, fakeClock, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import { migrate, openDb, type Db } from '../../server/db';
import { createFakeGenerator, type GenerateInput, type QuestionGenerator } from '../../server/ai';
import { pruneAiReports } from '../../server/analysis';

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

const st = (a: number, f: number) => ({ attempts: a, firstTry: f });

/** 會記錄每次呼叫的出題器（預設用假出題器的輸出） */
function spy(output?: (input: GenerateInput) => unknown) {
  const calls: GenerateInput[] = [];
  const fake = createFakeGenerator();
  const generator: QuestionGenerator = {
    generate: async (input) => {
      calls.push(input);
      return output ? output(input) : fake.generate(input);
    },
  };
  return { calls, generator };
}

/** 改孩子雲端存檔裡的指標統計與遊玩紀錄 */
async function setStats(accountId: string, indicators: Record<string, { attempts: number; firstTry: number }>, sessions = 3) {
  const history = Array.from({ length: sessions }, (_, i) => ({ activityId: 'math.times', subject: 'math', date: `2026-10-${String(10 + i).padStart(2, '0')}`, total: 10, correct: 8, stars: 2, coins: 3, seconds: 60 }));
  await db.query(`UPDATE accounts SET profile = jsonb_set(jsonb_set(profile, '{indicators}', $2::jsonb), '{history}', $3::jsonb) WHERE id = $1`, [
    accountId,
    JSON.stringify(indicators),
    JSON.stringify(history),
  ]);
}

/** 建班級：阿寶（時鐘弱）、小美（乘法弱）；另一位老師的班級 */
async function setup(opts: { generator?: QuestionGenerator | null; teacherLimit?: number; kidLimit?: number } = {}) {
  const clock = fakeClock('2026-10-13T10:00:00+08:00');
  const client = makeClient(db, {
    now: clock.now,
    ai: opts.generator === undefined ? createFakeGenerator() : opts.generator,
    aiAnalysisDaily: { teacher: opts.teacherLimit ?? 30, kid: opts.kidLimit ?? 5 },
  });
  const { code, token: teacher } = await createRoom(client.call);
  const a = await joinRoom(client.call, code, '阿寶', '1111');
  const b = await joinRoom(client.call, code, '小美', '2222');
  await setStats(a.account.id, { 'math:N-2-7': st(20, 18), 'math:N-2-13': st(10, 3), 'zh:Aa-Ⅰ-2': st(10, 6) });
  await setStats(b.account.id, { 'math:N-2-7': st(20, 8), 'math:N-2-13': st(10, 8), 'life:Ba-Ⅰ-1': st(10, 9) });
  const other = await createRoom(client.call, '二年二班');
  return { ...client, clock, code, teacher, a, b, other };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

/** 送出並一直查到不是 running */
async function run(s: Ctx, path: string, body: unknown, token: string) {
  const sent = await s.call('POST', path, body, token);
  if (sent.status !== 200) return sent;
  for (let i = 0; i < 200; i++) {
    const r = await s.call('GET', `${path}/${sent.body.job}`, undefined, token);
    if (r.status !== 200 || r.body.status !== 'running') return r;
    await new Promise((ok) => setTimeout(ok, 5));
  }
  throw new Error('分析一直沒有結果');
}
const teacherAi = (s: Ctx, body: unknown = {}, token = s.teacher, code = s.code) => run(s, `/api/teacher/rooms/${code}/ai-analysis`, body, token);
const kidAi = (s: Ctx, token: string) => run(s, '/api/me/ai-analysis', {}, token);

describe('老師的面向統計', () => {
  it('全班平均與每個孩子的面向、弱項指標', async () => {
    const s = await setup();
    const r = await s.call('GET', `/api/teacher/rooms/${s.code}/analysis`, undefined, s.teacher);
    expect(r.status).toBe(200);
    expect(r.body.class.students).toBe(2);
    const number = r.body.class.areas.find((x: any) => x.area === 'number');
    expect(number).toMatchObject({ students: 2 });
    expect(number.rate).toBeCloseTo((0.9 + 0.4) / 2);
    const bao = r.body.members.find((m: any) => m.nickname === '阿寶');
    expect(bao.weak[0].key).toBe('math:N-2-13');
    expect(bao.sessions).toBe(3);
    expect((await s.call('GET', `/api/teacher/rooms/${s.code}/analysis`, undefined, s.other.token)).status).toBe(404);
  });
});

describe('老師的 AI 分析', () => {
  it('全班：重點只會是弱項指標；提示裡沒有名字、暱稱、帳號 id', async () => {
    const sp = spy();
    const s = await setup({ generator: sp.generator });
    const r = await teacherAi(s);
    expect(r.body.status).toBe('done');
    expect(r.body.result.source).toBe('ai');
    expect(r.body.result.report.kind).toBe('teacherClass');
    expect(r.body.result.report.focus.length).toBeGreaterThan(0);
    const prompt = JSON.stringify(sp.calls[0]);
    for (const secret of ['阿寶', '小美', s.a.account.id, s.b.account.id]) expect(prompt).not.toContain(secret);
  });

  it('單一孩子：附全班平均；不是這一班的孩子回 404', async () => {
    const sp = spy();
    const s = await setup({ generator: sp.generator });
    const r = await teacherAi(s, { member: s.a.account.id });
    expect(r.body.result.report.kind).toBe('teacherStudent');
    expect(sp.calls[0].user).toContain('全班平均');
    expect(JSON.stringify(sp.calls[0])).not.toContain('阿寶');
    expect((await s.call('POST', `/api/teacher/rooms/${s.code}/ai-analysis`, { member: 'nobody' }, s.teacher)).status).toBe(404);
  });

  it('統計沒有明顯變化時用快取、不再呼叫 AI；弱項跨過一級就重新分析', async () => {
    const sp = spy();
    const s = await setup({ generator: sp.generator });
    await teacherAi(s);
    const again = await teacherAi(s);
    expect(again.body.result.source).toBe('cache');
    expect(sp.calls).toHaveLength(1);
    await setStats(s.a.account.id, { 'math:N-2-7': st(20, 18), 'math:N-2-13': st(10, 9), 'zh:Aa-Ⅰ-2': st(10, 6) });
    expect((await teacherAi(s)).body.result.source).toBe('ai');
    expect(sp.calls).toHaveLength(2);
  });

  it('每天上限（快取不算），隔天恢復；資料不夠回 400；沒有出題器回 404', async () => {
    const s = await setup({ teacherLimit: 1 });
    await teacherAi(s);
    await setStats(s.b.account.id, { 'math:N-2-7': st(20, 2) });
    const over = await s.call('POST', `/api/teacher/rooms/${s.code}/ai-analysis`, {}, s.teacher);
    expect(over.status).toBe(429);
    expect(over.body.code).toBe('ai_quota');
    s.clock.advance(24 * 3600 * 1000);
    expect((await teacherAi(s)).body.status).toBe('done');

    const empty = await createRoom(s.call, '空班');
    const r = await s.call('POST', `/api/teacher/rooms/${empty.code}/ai-analysis`, {}, empty.token);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('not_enough_data');

    const off = await setup({ generator: null });
    expect((await off.call('POST', `/api/teacher/rooms/${off.code}/ai-analysis`, {}, off.teacher)).status).toBe(404);
  });

  it('只有家長身分回 403', async () => {
    const s = await setup();
    const parent = await createUser(s.call, { parent: true, teacher: false });
    expect((await s.call('POST', `/api/teacher/rooms/${s.code}/ai-analysis`, {}, parent.token)).status).toBe(403);
  });
});

describe('孩子的 AI 分析', () => {
  it('拿到給孩子與家長的分析；每個建議都指到一個面向', async () => {
    const s = await setup();
    const r = await kidAi(s, s.a.token);
    expect(r.body.status).toBe('done');
    const report = r.body.result.report;
    expect(report.kind).toBe('kid');
    expect(report.cheer).toBeTruthy();
    expect(report.tips.length).toBeGreaterThan(0);
    expect(report.parentSummary).toBeTruthy();
  });

  it('AI 的句子有比較或貼標籤的字：改用規則建議，下次同樣的統計也直接用規則', async () => {
    const sp = spy(() => ({ cheer: '你比同學慢', tips: [{ area: 'measure', text: '你是最差的' }], parentSummary: 'x', parentTips: [] }));
    const s = await setup({ generator: sp.generator });
    expect((await kidAi(s, s.a.token)).body.result).toEqual({ source: 'rules' });
    expect((await kidAi(s, s.a.token)).body.result).toEqual({ source: 'rules' });
    expect(sp.calls).toHaveLength(1);
  });

  it('每天上限 5 次（快取不算）；別人拿不到我的結果', async () => {
    const s = await setup({ kidLimit: 1 });
    const sent = await s.call('POST', '/api/me/ai-analysis', {}, s.a.token);
    expect((await s.call('GET', `/api/me/ai-analysis/${sent.body.job}`, undefined, s.b.token)).status).toBe(404);
    let r = await s.call('GET', `/api/me/ai-analysis/${sent.body.job}`, undefined, s.a.token);
    while (r.body.status === 'running') r = await s.call('GET', `/api/me/ai-analysis/${sent.body.job}`, undefined, s.a.token);
    await setStats(s.a.account.id, { 'math:N-2-7': st(20, 2) });
    const over = await s.call('POST', '/api/me/ai-analysis', {}, s.a.token);
    expect(over.status).toBe(429);
  });
});

describe('資料表第 16 版與清理', () => {
  it('v15 → v16 多了 ai_reports；30 天前的分析結果刪掉', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 15 });
      await migrate(d);
      expect((await d.query('SELECT count(*)::int AS n FROM ai_reports'))[0].n).toBe(0);
    } finally {
      await d.close();
    }
    const s = await setup();
    await teacherAi(s);
    const count = async () => (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM ai_reports'))[0].n;
    expect(await count()).toBe(1);
    await pruneAiReports(db, new Date('2026-11-01T10:00:00+08:00'));
    expect(await count()).toBe(1);
    await pruneAiReports(db, new Date('2026-11-20T10:00:00+08:00'));
    expect(await count()).toBe(0);
  });
});
