/**
 * 班級題庫（G4）與老師 AI 出題（docs/plans/ai-questions.md）：
 * - 老師：新增、讀取、修改、停用、刪除班級題庫；AI 出題拿草稿（不存）、每天的題數上限、出題失敗退回額度
 * - 孩子：抓自己班級啟用中的題庫；班級資訊帶 contentRev，內容變了就加一並通知線上的孩子
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom, createUser, fakeClock, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import { migrate, openDb, type Db } from '../../server/db';
import { createFakeGenerator, type QuestionGenerator } from '../../server/ai';
import { pruneAiUsage } from '../../server/classContent';
import type { ContentPack } from '../../src/content/schema';

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

/** 一包合格的題庫 */
const PACK: ContentPack = {
  format: 'learning-island-pack',
  version: 1,
  title: '乘法練習',
  questions: [
    { id: 'q1', subject: 'math', skill: 'math.class', indicators: ['N-2-7'], type: 'number', prompt: '4 × 3 = ?', answer: 12 },
    { id: 'q2', subject: 'math', skill: 'math.class', indicators: ['N-2-7'], type: 'choice', prompt: '5 × 2 是多少？', options: [{ text: '10' }, { text: '7' }], answer: 0 },
  ],
};

/** 老師出題的請求 */
const AI_REQ = { indicators: ['math:N-2-7', 'life:Ba-Ⅰ-1'], count: 4, types: ['choice', 'number', 'order'], difficulty: 2 };

/** 建班級（小安在班上）、另一位老師的班級；出題器預設用假的 */
async function setup(opts: { generator?: QuestionGenerator | null; aiDailyQuestions?: number } = {}) {
  const clock = fakeClock('2026-10-13T10:00:00+08:00');
  const onRoomContent = vi.fn();
  const client = makeClient(db, {
    now: clock.now,
    onRoomContent,
    ai: opts.generator === undefined ? createFakeGenerator() : opts.generator,
    aiDailyQuestions: opts.aiDailyQuestions,
  });
  const { code, token: teacher } = await createRoom(client.call);
  const kid = await joinRoom(client.call, code, '小安', '1111');
  const other = await createRoom(client.call, '二年二班');
  return { ...client, clock, onRoomContent, code, teacher, kid, other };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

const packs = (s: Ctx, code = s.code) => `/api/teacher/rooms/${code}/packs`;
/** 老師送出 AI 出題（回工作編號，或檢查沒過的錯誤） */
const ai = (s: Ctx, body: unknown, token = s.teacher, code = s.code) => s.call('POST', `/api/teacher/rooms/${code}/ai-questions`, body, token);
/** 送出 AI 出題並等結果：送出失敗就回那個錯誤；成功就一直查到不是 running */
async function aiRun(s: Ctx, body: unknown, token = s.teacher, code = s.code) {
  const sent = await ai(s, body, token, code);
  if (sent.status !== 200) return sent;
  for (let i = 0; i < 200; i++) {
    const r = await s.call('GET', `/api/teacher/rooms/${code}/ai-questions/${sent.body.job}`, undefined, token);
    if (r.status !== 200 || r.body.status !== 'running') return r;
    await new Promise((ok) => setTimeout(ok, 5));
  }
  throw new Error('出題一直沒有結果');
}
/** 孩子讀班級內容 */
const content = (s: Ctx, token = s.kid.token, code = s.code) => s.call('GET', `/api/rooms/${code}/content`, undefined, token);
/** 孩子的班級資訊裡的 contentRev */
const kidRev = async (s: Ctx) => (await s.call('GET', '/api/me', undefined, s.kid.token)).body.rooms[0].contentRev as number;

describe('資料表第 15 版', () => {
  it('v14 → v15：既有班級的 contentRev 是 0，多了班級題庫與 AI 用量的表', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 14 });
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('777777', '二年七班', 'h', now())");
      await migrate(d);
      expect((await d.query("SELECT content_rev FROM rooms WHERE code = '777777'"))[0].content_rev).toBe(0);
      expect((await d.query('SELECT count(*)::int AS n FROM class_packs'))[0].n).toBe(0);
      expect((await d.query('SELECT count(*)::int AS n FROM ai_usage'))[0].n).toBe(0);
      await migrate(d);
    } finally {
      await d.close();
    }
  });
});

describe('伺服器設定', () => {
  it('有出題器時 aiQuestions 是 true，沒有時是 false', async () => {
    const s = await setup();
    expect((await s.call('GET', '/api/config')).body.aiQuestions).toBe(true);
    const s2 = makeClient(db, { ai: null });
    expect((await s2.call('GET', '/api/config')).body.aiQuestions).toBe(false);
  });
});

describe('班級題庫', () => {
  it('新增、列出、讀取、改名、停用、刪除；每次都讓 contentRev 加一並通知班上', async () => {
    const s = await setup();
    expect(await kidRev(s)).toBe(0);
    const created = await s.call('POST', packs(s), { pack: PACK }, s.teacher);
    expect(created.status).toBe(200);
    const id = created.body.pack.id as string;
    expect(created.body.pack).toMatchObject({ title: '乘法練習', enabled: true, count: 2 });
    expect(s.onRoomContent).toHaveBeenCalledWith(s.code);
    expect(await kidRev(s)).toBe(1);

    const list = await s.call('GET', packs(s), undefined, s.teacher);
    expect(list.body.packs).toEqual([expect.objectContaining({ id, title: '乘法練習', enabled: true, count: 2 })]);
    const one = await s.call('GET', `${packs(s)}/${id}`, undefined, s.teacher);
    expect(one.body.pack.pack.questions).toHaveLength(2);

    const renamed = await s.call('PATCH', `${packs(s)}/${id}`, { title: '十十乘法', enabled: false }, s.teacher);
    expect(renamed.body.pack).toMatchObject({ title: '十十乘法', enabled: false });
    expect((await s.call('GET', `${packs(s)}/${id}`, undefined, s.teacher)).body.pack.pack.title).toBe('十十乘法');

    const edited = await s.call('PATCH', `${packs(s)}/${id}`, { pack: { ...PACK, questions: [PACK.questions[0]] } }, s.teacher);
    expect(edited.body.pack.count).toBe(1);

    expect((await s.call('DELETE', `${packs(s)}/${id}`, undefined, s.teacher)).status).toBe(200);
    expect((await s.call('GET', packs(s), undefined, s.teacher)).body.packs).toEqual([]);
    expect(await kidRev(s)).toBe(4);
  });

  it('格式錯的題庫回 400 並列出哪裡錯', async () => {
    const s = await setup();
    const bad = { ...PACK, questions: [{ ...PACK.questions[1], answer: 5 }] };
    const r = await s.call('POST', packs(s), { pack: bad }, s.teacher);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('bad_pack');
    expect(r.body.error).toContain('答案索引');
  });

  it('別人的班級、不是老師、孩子的權杖都不行', async () => {
    const s = await setup();
    expect((await s.call('POST', packs(s), { pack: PACK }, s.other.token)).status).toBe(404);
    const parent = await createUser(s.call, { parent: true, teacher: false });
    expect((await s.call('POST', packs(s), { pack: PACK }, parent.token)).status).toBe(403);
    expect((await s.call('POST', packs(s), { pack: PACK }, s.kid.token)).status).toBe(401);
  });

  it('每班最多 30 包', async () => {
    const s = await setup();
    for (let i = 0; i < 30; i++) expect((await s.call('POST', packs(s), { pack: { ...PACK, title: `第 ${i} 包` } }, s.teacher)).status).toBe(200);
    const r = await s.call('POST', packs(s), { pack: PACK }, s.teacher);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('too_many_packs');
  });

  it('孩子只拿得到自己班級啟用中的題庫', async () => {
    const s = await setup();
    const a = (await s.call('POST', packs(s), { pack: PACK }, s.teacher)).body.pack.id;
    const b = (await s.call('POST', packs(s), { pack: { ...PACK, title: '停用的' } }, s.teacher)).body.pack.id;
    await s.call('PATCH', `${packs(s)}/${b}`, { enabled: false }, s.teacher);
    const r = await content(s);
    expect(r.status).toBe(200);
    expect(r.body.rev).toBe(3);
    expect(r.body.packs.map((p: { id: string }) => p.id)).toEqual([a]);
    expect(r.body.packs[0].pack.questions).toHaveLength(2);
    // 不是這一班的成員
    expect((await content(s, s.kid.token, s.other.code)).status).toBe(404);
  });
});

describe('老師 AI 出題', () => {
  it('送出拿工作編號，查到草稿（不存）：指標在勾選範圍內，並回報今天還能出幾題', async () => {
    const s = await setup();
    const r = await aiRun(s, AI_REQ);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('done');
    expect(r.body.drafts).toHaveLength(4);
    for (const d of r.body.drafts) {
      expect(['N-2-7', 'Ba-Ⅰ-1']).toContain(d.question.indicators[0]);
      expect(d.question.source).toContain('AI');
    }
    expect(r.body.remaining).toBe(196);
    expect((await s.call('GET', packs(s), undefined, s.teacher)).body.packs).toEqual([]);
  });

  it('結果只給出題的老師，拿過一次就沒了', async () => {
    const s = await setup();
    const { job } = (await ai(s, AI_REQ)).body;
    const path = `/api/teacher/rooms/${s.code}/ai-questions/${job}`;
    // 別的老師用自己的班級代碼也查不到
    expect((await s.call('GET', `/api/teacher/rooms/${s.other.code}/ai-questions/${job}`, undefined, s.other.token)).status).toBe(404);
    let r = await s.call('GET', path, undefined, s.teacher);
    while (r.body.status === 'running') r = await s.call('GET', path, undefined, s.teacher);
    expect(r.body.status).toBe('done');
    expect((await s.call('GET', path, undefined, s.teacher)).status).toBe(404);
  });

  it('同一位老師同時最多兩批，第三批回 429', async () => {
    const stuck: QuestionGenerator = { generate: () => new Promise(() => {}) };
    const s = await setup({ generator: stuck });
    expect((await ai(s, AI_REQ)).status).toBe(200);
    expect((await ai(s, AI_REQ)).status).toBe(200);
    const third = await ai(s, AI_REQ);
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('ai_busy');
  });

  it('請求格式錯、指標不存在回 400；沒有出題器回 404', async () => {
    const s = await setup();
    expect((await ai(s, { ...AI_REQ, count: 99 })).status).toBe(400);
    const unknown = await ai(s, { ...AI_REQ, indicators: ['math:N-9-9'] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('bad_indicator');
    const off = await setup({ generator: null });
    const r = await ai(off, AI_REQ);
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('ai_off');
  });

  it('別人的班級回 404、只有家長身分回 403', async () => {
    const s = await setup();
    expect((await ai(s, AI_REQ, s.other.token)).status).toBe(404);
    const parent = await createUser(s.call, { parent: true, teacher: false });
    expect((await ai(s, AI_REQ, parent.token)).status).toBe(403);
  });

  it('每天的題數上限（台灣日期），隔天恢復', async () => {
    const s = await setup({ aiDailyQuestions: 6 });
    expect((await aiRun(s, AI_REQ)).body.remaining).toBe(2);
    const over = await ai(s, AI_REQ);
    expect(over.status).toBe(429);
    expect(over.body.code).toBe('ai_quota');
    s.clock.advance(24 * 3600 * 1000);
    expect((await aiRun(s, AI_REQ)).body.status).toBe('done');
  });

  it('每天的出題數紀錄保留 7 天（隱私權政策第 2 節）', async () => {
    const s = await setup();
    await aiRun(s, AI_REQ);
    const count = async () => (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM ai_usage'))[0].n;
    expect(await count()).toBe(1);
    await pruneAiUsage(db, new Date('2026-10-19T10:00:00+08:00'));
    expect(await count()).toBe(1);
    await pruneAiUsage(db, new Date('2026-10-21T10:00:00+08:00'));
    expect(await count()).toBe(0);
  });

  it('出題失敗：查到 failed，預扣的額度退回', async () => {
    const broken: QuestionGenerator = { generate: async () => Promise.reject(new Error('上游壞了')) };
    const s = await setup({ generator: broken, aiDailyQuestions: 6 });
    const r = await aiRun(s, AI_REQ);
    expect(r.body.status).toBe('failed');
    expect(r.body.error).toContain('AI 出題失敗');
    // 同一位老師的額度：失敗那次退回了，換正常的出題器仍可出 4 題、剩 2 題
    const again = makeClient(db, { now: s.clock.now, ai: createFakeGenerator(), aiDailyQuestions: 6 });
    const sent = await again.call('POST', `/api/teacher/rooms/${s.code}/ai-questions`, AI_REQ, s.teacher);
    let res = await again.call('GET', `/api/teacher/rooms/${s.code}/ai-questions/${sent.body.job}`, undefined, s.teacher);
    while (res.body.status === 'running') res = await again.call('GET', `/api/teacher/rooms/${s.code}/ai-questions/${sent.body.job}`, undefined, s.teacher);
    expect(res.body.remaining).toBe(2);
  });
});
