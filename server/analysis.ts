/**
 * 學習報告（docs/plans/learning-report.md 第 4 節）：
 * - 老師：GET /api/teacher/rooms/:code/analysis（全班與每個孩子的面向統計，不呼叫 AI）
 * - 老師：POST /api/teacher/rooms/:code/ai-analysis（{ member? }，沒給是全班）回工作編號，GET …/ai-analysis/:job 查結果
 * - 孩子：POST /api/me/ai-analysis 回工作編號，GET /api/me/ai-analysis/:job 查結果（給孩子與家長；AI 句子不合格改用規則建議）
 * 送給 AI 的只有匿名統計（src/content/aiAnalysis.ts）；每次真的呼叫 AI 的結果存 ai_reports，指紋一樣就用快取、不再呼叫，
 * 也用它數每天的次數（快取命中不新增、不算次數）。
 */
import { randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import type { Db, Queryable } from './db';
import { ApiError, readBody } from './http';
import type { QuestionGenerator } from './ai';
import { createJobStore } from './aiJobs';
import { areaStats, classAreaStats, classWeakIndicators, weakIndicators, type IndicatorMap } from '../src/content/learningAreas';
import {
  analysisFingerprint,
  analysisReady,
  analysisSchema,
  buildAnalysisPrompt,
  classInput,
  convertAnalysis,
  studentInput,
  type AnalysisInput,
  type AnalysisReport,
} from '../src/content/aiAnalysis';
import { indicatorLabel } from '../src/content/indicators';
import { aiAnalysisRequest, type AnalysisJobStatus, type AnalysisResult, type TeacherAnalysisResponse } from '../src/online/protocol';
import type { Profile } from '../src/store/save';

/** 每天的上限（不含快取） */
export interface AnalysisLimits {
  /** 每位老師每天幾次 */
  teacher: number;
  /** 每個孩子每天幾次 */
  kid: number;
}

/** 預設的每天上限 */
export const ANALYSIS_DAILY: AnalysisLimits = { teacher: 30, kid: 5 };
/** 分析結果保留幾天 */
const REPORT_KEEP_DAYS = 30;
/** 同時最多幾個分析工作（老師、孩子各自） */
const JOBS_PER_OWNER = 2;

/** 註冊路由需要的東西（app.ts 提供） */
export interface AnalysisDeps {
  db: Db;
  now: () => Date;
  /** 驗證孩子的權杖（沒有班級也可以），回傳帳號 id */
  authenticateKid: (c: Context) => Promise<string>;
  /** 驗證老師（大人權杖、有老師身分），回傳使用者 id */
  authenticateTeacher: (c: Context) => Promise<string>;
  /** 讀老師自己的班級（別人的班級回 404） */
  loadOwnRoom: (q: Queryable, code: string, ownerId: string) => Promise<{ code: string }>;
  /** 出題器（AI）；null 是沒開 */
  generator: QuestionGenerator | null;
  limits: AnalysisLimits;
}

/** 班上一個孩子（暱稱與存檔） */
interface MemberRow {
  id: string;
  nickname: string;
  profile: Profile;
}

/** 存在 ai_reports 的結果：AI 的分析，或孩子的 AI 句子不合格時記下「改用規則」 */
type StoredResult = AnalysisReport | { rules: true };

/** 台灣日期的那一天 0 點（數每天次數用） */
function taiwanDayStart(d: Date): string {
  const day = new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+08:00`).toISOString();
}

/** 刪掉 30 天前的分析結果（伺服器啟動時與每天執行一次） */
export async function pruneAiReports(db: Queryable, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - REPORT_KEEP_DAYS * 24 * 3600 * 1000).toISOString();
  await db.query('DELETE FROM ai_reports WHERE created_at < $1::timestamptz', [cutoff]);
}

export function registerAnalysisRoutes(app: Hono, deps: AnalysisDeps): void {
  const { db, now } = deps;
  /** 進行中的分析工作（記憶體） */
  const jobs = createJobStore<AnalysisResult>(now);

  /** 班上的孩子（依加入順序） */
  const membersOf = (code: string) =>
    db.query<MemberRow>(
      `SELECT a.id, m.nickname, a.profile FROM class_members m JOIN accounts a ON a.id = m.account_id
       WHERE m.room_code = $1 ORDER BY m.joined_at, m.nickname`,
      [code],
    );
  /** 一個孩子的指標統計（舊存檔可能沒有） */
  const indicatorsOf = (p: Profile): IndicatorMap => p.indicators ?? {};

  /** 找快取：同一種分析、同一個對象、指紋一樣的最新一筆 */
  const cached = async (kind: string, room: string | null, account: string | null, fingerprint: string): Promise<StoredResult | null> => {
    const rows = await db.query<{ result: StoredResult }>(
      `SELECT result FROM ai_reports WHERE kind = $1 AND fingerprint = $2
         AND room_code IS NOT DISTINCT FROM $3 AND account_id IS NOT DISTINCT FROM $4
       ORDER BY created_at DESC LIMIT 1`,
      [kind, fingerprint, room, account],
    );
    return rows[0]?.result ?? null;
  };

  /** 存一筆真的呼叫 AI 的結果 */
  const save = (input: AnalysisInput, ids: { room: string | null; account: string | null; user: string | null }, fingerprint: string, result: StoredResult) =>
    db.query(
      'INSERT INTO ai_reports (id, kind, room_code, account_id, user_id, fingerprint, result, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)',
      [randomUUID(), input.kind, ids.room, ids.account, ids.user, fingerprint, JSON.stringify(result), now().toISOString()],
    );

  /** 呼叫 AI 並檢查；孩子的句子不合格回 null（改用規則），老師的不合格丟出錯誤 */
  const callAi = async (generator: QuestionGenerator, input: AnalysisInput): Promise<AnalysisReport | null> => {
    const raw = await generator.generate({ ...buildAnalysisPrompt(input), schema: analysisSchema(input), name: 'analysis', analysis: input });
    const report = convertAnalysis(input, raw);
    if (!report && input.kind !== 'kid') throw new Error('AI 分析的格式不對');
    if (!report) console.warn('孩子的 AI 分析沒有通過檢查，改用規則建議');
    return report;
  };

  /** 把存起來的結果換成回應 */
  const fromStored = (r: StoredResult, source: 'ai' | 'cache'): AnalysisResult => ('rules' in r ? { source: 'rules' } : { source, report: r });

  /** 回應查結果 */
  const peek = (job: ReturnType<typeof jobs.take>, c: Context) => {
    if (!job) throw new ApiError(404, 'no_job', '找不到這次分析，請重新分析');
    if (job.status === 'running') return c.json<AnalysisJobStatus>({ status: 'running' });
    if (job.status === 'failed') return c.json<AnalysisJobStatus>({ status: 'failed', error: 'AI 分析失敗，請再試一次' });
    return c.json<AnalysisJobStatus>({ status: 'done', result: job.result });
  };

  const notEnough = () => new ApiError(400, 'not_enough_data', '作答資料還不夠，等孩子多玩幾回合再分析');

  // ---------- 老師 ----------

  app.get('/api/teacher/rooms/:code/analysis', async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const room = await deps.loadOwnRoom(db, c.req.param('code'), owner);
    const rows = await membersOf(room.code);
    const list = rows.map((r) => indicatorsOf(r.profile));
    return c.json<TeacherAnalysisResponse>({
      class: { students: rows.length, areas: classAreaStats(list), weak: classWeakIndicators(list) },
      members: rows.map((r) => ({
        id: r.id,
        nickname: r.nickname,
        areas: areaStats(indicatorsOf(r.profile)),
        weak: weakIndicators(indicatorsOf(r.profile)),
        sessions: r.profile.history?.length ?? 0,
      })),
    });
  });

  app.post('/api/teacher/rooms/:code/ai-analysis', async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const room = await deps.loadOwnRoom(db, c.req.param('code'), owner);
    const generator = deps.generator;
    if (!generator) throw new ApiError(404, 'ai_off', '這台伺服器沒有開啟 AI');
    const body = await readBody(c, aiAnalysisRequest);
    const rows = await membersOf(room.code);
    const all = classInput(
      rows.map((r) => indicatorsOf(r.profile)),
      indicatorLabel,
    );
    let input: AnalysisInput;
    if (body.member) {
      const m = rows.find((r) => r.id === body.member);
      if (!m) throw new ApiError(404, 'no_member', '這位孩子不在這個班級');
      // 只給全班平均，不給名單
      input = { kind: 'teacherStudent', student: studentInput({ indicators: indicatorsOf(m.profile), history: m.profile.history ?? [] }, now(), indicatorLabel), classAreas: all.areas };
    } else {
      input = { kind: 'teacherClass', class: all };
    }
    if (!analysisReady(input)) throw notEnough();
    const account = body.member ?? null;
    const fingerprint = analysisFingerprint(input);
    const hit = await cached(input.kind, room.code, account, fingerprint);
    if (hit) return c.json({ job: jobs.start(owner, room.code, async () => fromStored(hit, 'cache')) });
    if (jobs.running(owner) >= JOBS_PER_OWNER) throw new ApiError(429, 'ai_busy', '上一個分析還在跑，請等它跑完');
    const used = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM ai_reports WHERE user_id = $1 AND created_at >= $2::timestamptz', [owner, taiwanDayStart(now())]))[0].n;
    if (used >= deps.limits.teacher) throw new ApiError(429, 'ai_quota', `今天的 AI 分析次數（${deps.limits.teacher} 次）用完了，明天再試`);
    const id = jobs.start(owner, room.code, async () => {
      const report = (await callAi(generator, input))!;
      await save(input, { room: room.code, account, user: owner }, fingerprint, report);
      return { source: 'ai', report };
    });
    return c.json({ job: id });
  });

  app.get('/api/teacher/rooms/:code/ai-analysis/:job', async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const room = await deps.loadOwnRoom(db, c.req.param('code'), owner);
    return peek(jobs.take(c.req.param('job'), owner, room.code), c);
  });

  // ---------- 孩子（與家長） ----------

  app.post('/api/me/ai-analysis', async (c) => {
    const accountId = await deps.authenticateKid(c);
    const generator = deps.generator;
    if (!generator) throw new ApiError(404, 'ai_off', '這台伺服器沒有開啟 AI');
    const row = (await db.query<{ profile: Profile }>('SELECT profile FROM accounts WHERE id = $1', [accountId]))[0];
    if (!row) throw new ApiError(401, 'unauthorized', '請重新登入');
    const input: AnalysisInput = { kind: 'kid', student: studentInput({ indicators: indicatorsOf(row.profile), history: row.profile.history ?? [] }, now(), indicatorLabel) };
    if (!analysisReady(input)) throw notEnough();
    const fingerprint = analysisFingerprint(input);
    const hit = await cached('kid', null, accountId, fingerprint);
    if (hit) return c.json({ job: jobs.start(accountId, 'me', async () => fromStored(hit, 'cache')) });
    if (jobs.running(accountId) >= JOBS_PER_OWNER) throw new ApiError(429, 'ai_busy', '上一個分析還在跑，請等它跑完');
    const used = (
      await db.query<{ n: number }>("SELECT count(*)::int AS n FROM ai_reports WHERE kind = 'kid' AND account_id = $1 AND created_at >= $2::timestamptz", [accountId, taiwanDayStart(now())])
    )[0].n;
    if (used >= deps.limits.kid) throw new ApiError(429, 'ai_quota', `今天的 AI 分析次數（${deps.limits.kid} 次）用完了，明天再試`);
    const id = jobs.start(accountId, 'me', async () => {
      const report = await callAi(generator, input);
      const stored: StoredResult = report ?? { rules: true };
      await save(input, { room: null, account: accountId, user: null }, fingerprint, stored);
      return fromStored(stored, 'ai');
    });
    return c.json({ job: id });
  });

  app.get('/api/me/ai-analysis/:job', async (c) => {
    const accountId = await deps.authenticateKid(c);
    return peek(jobs.take(c.req.param('job'), accountId, 'me'), c);
  });
}
