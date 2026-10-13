/**
 * 班級題庫（G4）與老師 AI 出題（docs/plans/ai-questions.md 第 3 節）：
 * - 老師：GET／POST／PATCH／DELETE /api/teacher/rooms/:code/packs[/:id]（題庫包用 contentPackSchema 檢查，每班最多 30 包）
 * - 老師：POST /api/teacher/rooms/:code/ai-questions 回工作編號，GET …/ai-questions/:job 拿草稿（不存）；
 *   每天的題數上限在同一句 SQL 預扣，出題失敗或題目被丟掉時退回
 * - 孩子：GET /api/rooms/:code/content（自己班級啟用中的題庫與版本號）
 * 班級內容改了就讓 rooms.content_rev 加一（和改動在同一個交易），交易結束後通知班上線上的孩子重新抓。
 */
import { randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import type { Db, Queryable } from './db';
import { ApiError, readBody, type Identity } from './http';
import { AiError, type QuestionGenerator } from './ai';
import { createJobStore } from './aiJobs';
import { aiOutputSchema, aiRequestSchema, buildAiPrompt, convertAiOutput } from '../src/content/aiQuestions';
import { contentPackSchema, formatIssues, type ContentPack } from '../src/content/schema';
import { INDICATORS, indicatorLabel } from '../src/content/indicators';
import { hasZhuyin } from '../src/content/zhuyinCharset';
import {
  CLASS_PACKS_MAX,
  packCreateRequest,
  packPatchRequest,
  type AiJobResponse,
  type AiJobStatus,
  type AiQuestionsResponse,
  type ClassContentResponse,
  type ClassPackDetail,
  type ClassPackSummary,
} from '../src/online/protocol';

/** 註冊路由需要的東西（app.ts 提供） */
export interface ClassContentDeps {
  db: Db;
  now: () => Date;
  /** 驗證孩子的權杖（沒有班級回 403） */
  authenticate: (c: Context, kind: 'kid') => Promise<Identity>;
  /** 驗證老師（大人權杖、有老師身分），回傳使用者 id */
  authenticateTeacher: (c: Context) => Promise<string>;
  /** 讀老師自己的班級（別人的班級回 404） */
  loadOwnRoom: (q: Queryable, code: string, ownerId: string) => Promise<{ code: string }>;
  /** 出題器；null 是沒開 AI 出題 */
  generator: QuestionGenerator | null;
  /** 每位老師每天最多出幾題 */
  aiDailyQuestions: number;
  /** 班級內容改了：通知班上線上的孩子重新抓 */
  onRoomContent?: (roomCode: string) => void;
}

/** 每位老師同時最多幾個出題工作（畫面是一批出完再出下一批） */
const AI_JOBS_PER_TEACHER = 2;

/** 資料表 class_packs 的一列 */
interface PackRow {
  id: string;
  room_code: string;
  title: string;
  pack: ContentPack;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/** 老師清單上的摘要 */
function summaryOf(r: PackRow): ClassPackSummary {
  return { id: r.id, title: r.title, enabled: r.enabled, count: r.pack.questions.length, updatedAt: new Date(r.updated_at).toISOString() };
}

/** 檢查題庫包的格式；錯的話回 400 並列出哪一題哪一欄 */
function parsePack(raw: unknown): ContentPack {
  const r = contentPackSchema.safeParse(raw);
  if (!r.success) throw new ApiError(400, 'bad_pack', `題庫格式不對：${formatIssues(r.error).join('；')}`);
  return r.data as ContentPack;
}

/** 台灣日期（YYYY-MM-DD）：AI 出題的每日額度照台灣的一天算 */
function taiwanDay(d: Date): string {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 每天的出題數紀錄保留幾天（隱私權政策第 2 節） */
const AI_USAGE_KEEP_DAYS = 7;

/** 刪掉 7 天前的 AI 出題數紀錄（伺服器啟動時與每天執行一次） */
export async function pruneAiUsage(db: Queryable, now: Date): Promise<void> {
  const cutoff = taiwanDay(new Date(now.getTime() - AI_USAGE_KEEP_DAYS * 24 * 3600 * 1000));
  await db.query('DELETE FROM ai_usage WHERE day < $1::date', [cutoff]);
}

/** 班級內容的版本號加一（和改動在同一個交易裡） */
async function bumpContentRev(q: Queryable, roomCode: string): Promise<void> {
  await q.query('UPDATE rooms SET content_rev = content_rev + 1 WHERE code = $1', [roomCode]);
}

export function registerClassContentRoutes(app: Hono, deps: ClassContentDeps): void {
  const { db, now } = deps;
  /** 某一包題庫的網址前綴 */
  const packsPath = '/api/teacher/rooms/:code/packs';

  /** 讀老師自己班級裡的一包題庫；沒有回 404 */
  const loadPack = async (q: Queryable, roomCode: string, id: string): Promise<PackRow> => {
    const row = (await q.query<PackRow>('SELECT * FROM class_packs WHERE id = $1 AND room_code = $2', [id, roomCode]))[0];
    if (!row) throw new ApiError(404, 'no_pack', '找不到這包題庫');
    return row;
  };

  app.get(packsPath, async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const room = await deps.loadOwnRoom(db, c.req.param('code'), owner);
    const rows = await db.query<PackRow>('SELECT * FROM class_packs WHERE room_code = $1 ORDER BY created_at, id', [room.code]);
    return c.json({ packs: rows.map(summaryOf) });
  });

  app.get(`${packsPath}/:id`, async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const room = await deps.loadOwnRoom(db, c.req.param('code'), owner);
    const row = await loadPack(db, room.code, c.req.param('id'));
    return c.json<{ pack: ClassPackDetail }>({ pack: { ...summaryOf(row), pack: row.pack } });
  });

  app.post(packsPath, async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const body = await readBody(c, packCreateRequest);
    const pack = parsePack(body.pack);
    const t = now().toISOString();
    const { room, row } = await db.transaction(async (tx) => {
      const room = await deps.loadOwnRoom(tx, c.req.param('code'), owner);
      // 鎖住班級再數題庫，同時新增時不會超過上限
      await tx.query('SELECT code FROM rooms WHERE code = $1 FOR UPDATE', [room.code]);
      const n = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM class_packs WHERE room_code = $1', [room.code]))[0].n;
      if (n >= CLASS_PACKS_MAX) throw new ApiError(400, 'too_many_packs', `每個班級最多 ${CLASS_PACKS_MAX} 包題庫，請先刪掉用不到的`);
      const rows = await tx.query<PackRow>(
        `INSERT INTO class_packs (id, room_code, title, pack, enabled, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6::timestamptz, $6::timestamptz) RETURNING *`,
        [randomUUID(), room.code, pack.title, JSON.stringify(pack), body.enabled ?? true, t],
      );
      await bumpContentRev(tx, room.code);
      return { room, row: rows[0] };
    });
    deps.onRoomContent?.(room.code);
    return c.json({ pack: summaryOf(row) });
  });

  app.patch(`${packsPath}/:id`, async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const body = await readBody(c, packPatchRequest);
    const replaced = body.pack === undefined ? null : parsePack(body.pack);
    const { room, row } = await db.transaction(async (tx) => {
      const room = await deps.loadOwnRoom(tx, c.req.param('code'), owner);
      const old = await loadPack(tx, room.code, c.req.param('id'));
      // 名稱存在兩個地方（欄位與題庫包裡的 title），一起改
      const pack = replaced ?? old.pack;
      const title = body.title ?? (replaced ? replaced.title : old.title);
      const rows = await tx.query<PackRow>(
        'UPDATE class_packs SET title = $2, pack = $3::jsonb, enabled = $4, updated_at = $5::timestamptz WHERE id = $1 RETURNING *',
        [old.id, title, JSON.stringify({ ...pack, title }), body.enabled ?? old.enabled, now().toISOString()],
      );
      await bumpContentRev(tx, room.code);
      return { room, row: rows[0] };
    });
    deps.onRoomContent?.(room.code);
    return c.json({ pack: summaryOf(row) });
  });

  app.delete(`${packsPath}/:id`, async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const room = await db.transaction(async (tx) => {
      const room = await deps.loadOwnRoom(tx, c.req.param('code'), owner);
      const old = await loadPack(tx, room.code, c.req.param('id'));
      await tx.query('DELETE FROM class_packs WHERE id = $1', [old.id]);
      await bumpContentRev(tx, room.code);
      return room;
    });
    deps.onRoomContent?.(room.code);
    return c.json({ ok: true });
  });

  /** 孩子：自己班級啟用中的題庫（不是這一班的成員和不存在的代碼一樣回 404） */
  app.get('/api/rooms/:code/content', async (c) => {
    const who = await deps.authenticate(c, 'kid');
    const code = c.req.param('code');
    if (!who.rooms.includes(code)) throw new ApiError(404, 'no_room', '找不到這個班級');
    const rev = (await db.query<{ content_rev: number }>('SELECT content_rev FROM rooms WHERE code = $1', [code]))[0]?.content_rev ?? 0;
    const rows = await db.query<PackRow>('SELECT * FROM class_packs WHERE room_code = $1 AND enabled ORDER BY created_at, id', [code]);
    return c.json<ClassContentResponse>({ rev, packs: rows.map((r) => ({ id: r.id, title: r.title, pack: r.pack })) });
  });

  /** 進行中的 AI 出題工作（記憶體；server/aiJobs.ts）：POST 先回工作編號，畫面再用 GET 查結果 */
  const jobs = createJobStore<AiQuestionsResponse>(now);

  /** 老師 AI 出題：檢查、預扣額度後在背景出題，回傳工作編號；草稿不存，出題失敗或題目被丟掉時退回額度 */
  app.post('/api/teacher/rooms/:code/ai-questions', async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const room = await deps.loadOwnRoom(db, c.req.param('code'), owner);
    const generator = deps.generator;
    if (!generator) throw new ApiError(404, 'ai_off', '這台伺服器沒有開啟 AI 出題');
    const body = await readBody(c, aiRequestSchema);
    const unknown = body.indicators.filter((k) => !(k in INDICATORS));
    if (unknown.length) throw new ApiError(400, 'bad_indicator', `找不到課綱指標：${unknown.join('、')}`);
    if (jobs.running(owner) >= AI_JOBS_PER_TEACHER) throw new ApiError(429, 'ai_busy', '上一批題目還在出，請等它出完');
    const limit = deps.aiDailyQuestions;
    const quotaError = () => new ApiError(429, 'ai_quota', `今天的 AI 出題額度（${limit} 題）用完了，明天再試`);
    if (body.count > limit) throw quotaError();
    const day = taiwanDay(now());
    // 預扣：沒有這一天的紀錄就新增；有的話加上去之後不超過上限才更新（超過時不回傳任何列）
    const reserved = await db.query<{ count: number }>(
      `INSERT INTO ai_usage (user_id, day, count) VALUES ($1, $2::date, $3)
       ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + EXCLUDED.count WHERE ai_usage.count + EXCLUDED.count <= $4
       RETURNING count`,
      [owner, day, body.count, limit],
    );
    if (!reserved.length) throw quotaError();
    /** 退回額度 */
    const refund = async (n: number) => {
      if (n > 0) await db.query('UPDATE ai_usage SET count = GREATEST(count - $3, 0) WHERE user_id = $1 AND day = $2::date', [owner, day, n]);
    };
    // 背景出題：結果放進工作，等畫面來拿
    const id = jobs.start(owner, room.code, async () => {
      let raw: unknown;
      try {
        raw = await generator.generate({ ...buildAiPrompt(body, indicatorLabel), schema: aiOutputSchema(body.indicators, body.types), req: body });
      } catch (e) {
        await refund(body.count).catch(console.error);
        throw new Error(e instanceof AiError ? `出題 ${e.reason} ${e.detail}` : (e as Error).message);
      }
      const result = convertAiOutput(raw, body, { seed: Math.floor(Math.random() * 2 ** 31), idPrefix: `ai-${randomUUID().slice(0, 8)}`, hasZhuyin });
      const unused = body.count - result.drafts.length;
      await refund(unused).catch(console.error);
      if (result.dropped.length) console.warn('AI 出題有題目被丟掉', result.dropped.join(' / '));
      return { ...result, remaining: Math.max(0, limit - (reserved[0].count - unused)) };
    });
    return c.json<AiJobResponse>({ job: id });
  });

  /** 查 AI 出題的結果：還在出回 running；完成或失敗回結果並刪掉工作。只有出題的老師、同一個班級拿得到 */
  app.get('/api/teacher/rooms/:code/ai-questions/:job', async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const room = await deps.loadOwnRoom(db, c.req.param('code'), owner);
    const job = jobs.take(c.req.param('job'), owner, room.code);
    if (!job) throw new ApiError(404, 'no_job', '找不到這次出題，請重新出題');
    if (job.status === 'running') return c.json<AiJobStatus>({ status: 'running' });
    if (job.status === 'failed') return c.json<AiJobStatus>({ status: 'failed', error: 'AI 出題失敗，請再試一次' });
    return c.json<AiJobStatus>({ status: 'done', ...job.result });
  });
}
