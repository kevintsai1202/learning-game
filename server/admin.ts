/**
 * 營運者監控入口的路由（docs/plans/admin.md）：
 * - POST /api/admin/login：Google ID token → 檢查 email 在 ADMIN_EMAILS 裡、而且 Google 驗證過 → 發 8 小時的 admin 權杖
 * - POST /api/admin/logout：刪掉這張 admin 權杖
 * - GET /api/admin/overview：人數、活躍、每日趨勢、科目分布、AI 用量、匿名造訪、現在線上
 * - GET /api/admin/accounts：班級、孩子、大人的明細（不回密碼雜湊、孩子密碼、完整 email、Google sub、存檔全文）
 * - POST /api/visit：匿名造訪計數（不用登入；每台裝置每天一列，只存隨機 id 的雜湊）
 * 監控頁只能看、不能改：沒有任何會改資料的 admin API。
 * 沒設 ADMIN_EMAILS 或沒開 Google 時，admin 的 API 一律 404 admin_disabled（造訪計數照常）。
 */
import { createHash } from 'node:crypto';
import type { Context, Hono } from 'hono';
import type { Db, Queryable } from './db';
import { ApiError, readBody } from './http';
import { maskEmail, type GoogleIdentity } from './google';
import { lookupAdminToken } from './tokens';
import { activeCounts, isAdminEmail, kidUsage, lastDays, summarizeKids, taiwanDay, visitHost, type UsageSource } from './adminStats';
import { googleTokenRequest } from '../src/online/protocol';
import { visitRequest, type AdminAccounts, type AdminLoginResponse, type AdminOverview } from '../src/online/adminProtocol';

/** admin 權杖幾小時後失效 */
export const ADMIN_TOKEN_HOURS = 8;
/** 匿名造訪留幾天 */
const VISIT_KEEP_DAYS = 90;
/** 明細每張表最多回幾列 */
const ROW_LIMIT = 1000;

export interface AdminDeps {
  db: Db;
  now: () => Date;
  /** ADMIN_EMAILS 解析後的清單（小寫）；空的就關掉 admin 的 API */
  adminEmails: readonly string[];
  /** 有沒有開 Google 登入（沒開就關掉 admin 的 API） */
  googleEnabled: boolean;
  /** 驗證 Google ID token（app.ts 的 verifyGoogleToken：沒開 404、驗不過 401） */
  verifyGoogleToken: (idToken: string) => Promise<GoogleIdentity>;
  /** 發一張 admin 權杖並存進資料庫 */
  issueAdminToken: () => Promise<{ token: string; expiresAt: string }>;
  /** 擋同一個 IP 的大量請求 */
  checkFlood: (c: Context) => void;
  /** 現在連著即時中樞的人數（main.ts 由 hub.stats() 提供；測試可以不給） */
  liveStats?: () => { kids: number; teachers: number };
}

/** 刪掉 90 天前的匿名造訪（伺服器啟動時與每天執行一次） */
export async function pruneVisits(db: Queryable, now: Date): Promise<void> {
  const cutoff = taiwanDay(new Date(now.getTime() - VISIT_KEEP_DAYS * 24 * 3600 * 1000));
  await db.query('DELETE FROM visits WHERE day < $1::date', [cutoff]);
}

/** 資料庫的時間欄位 → ISO 字串（null 照樣是 null） */
const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

export function registerAdminRoutes(app: Hono, deps: AdminDeps): void {
  const { db, now } = deps;
  const enabled = deps.googleEnabled && deps.adminEmails.length > 0;

  /** 沒開監控就回 404 */
  const assertEnabled = () => {
    if (!enabled) throw new ApiError(404, 'admin_disabled', '這台班級伺服器沒有開啟營運者監控');
  };

  /** 驗證 admin 權杖；沒有、過期或不是 admin 權杖回 401 */
  const authenticateAdmin = async (c: Context) => {
    assertEnabled();
    const m = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '');
    const found = m ? await lookupAdminToken(db, m[1], now()) : null;
    if (!found) throw new ApiError(401, 'unauthorized', '請重新登入');
    return found;
  };

  app.post('/api/admin/login', async (c) => {
    assertEnabled();
    deps.checkFlood(c);
    const body = await readBody(c, googleTokenRequest);
    const g = await deps.verifyGoogleToken(body.idToken);
    if (!isAdminEmail(deps.adminEmails, g.email, g.emailVerified)) throw new ApiError(403, 'not_admin', '這個 Google 帳號沒有營運者權限');
    return c.json<AdminLoginResponse>(await deps.issueAdminToken());
  });

  app.post('/api/admin/logout', async (c) => {
    const { hash } = await authenticateAdmin(c);
    await db.query("DELETE FROM tokens WHERE token_hash = $1 AND kind = 'admin'", [hash]);
    return c.json({ ok: true });
  });

  app.get('/api/admin/overview', async (c) => {
    await authenticateAdmin(c);
    const t = now();
    const days30 = lastDays(t, 30);
    const days7 = lastDays(t, 7);
    const [adults] = await db.query<{ n: number; teachers: number; parents: number }>(
      'SELECT count(*)::int AS n, count(*) FILTER (WHERE is_teacher)::int AS teachers, count(*) FILTER (WHERE is_parent)::int AS parents FROM users',
    );
    const [kids] = await db.query<{ n: number; in_class: number; parent_only: number }>(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM class_members m WHERE m.account_id = a.id))::int AS in_class,
              count(*) FILTER (WHERE a.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM class_members m WHERE m.account_id = a.id))::int AS parent_only
       FROM accounts a`,
    );
    const [classes] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM rooms');
    const kidSeen = await db.query<{ last_seen: Date }>('SELECT last_seen FROM accounts');
    const adultSeen = await db.query<{ last_login: Date | null }>('SELECT last_login FROM users');
    // 孩子的使用量只取存檔裡要用的兩個欄位，在伺服器算成數字，不回存檔
    const usage = await db.query<{ history: unknown; play_log: unknown }>("SELECT profile->'history' AS history, profile->'playLog' AS play_log FROM accounts");
    const summary = summarizeKids(
      usage.map((u) => ({ history: u.history, playLog: u.play_log }) as UsageSource),
      t,
      30,
    );
    // 匿名造訪
    const visitDays = await db.query<{ day: string; n: number }>('SELECT day::text AS day, count(*)::int AS n FROM visits WHERE day >= $1::date GROUP BY day', [days30[0]]);
    const distinct = async (from: string) => (await db.query<{ n: number }>('SELECT count(DISTINCT device_hash)::int AS n FROM visits WHERE day >= $1::date', [from]))[0].n;
    const hosts = await db.query<{ host: string; n: number }>('SELECT host, count(DISTINCT device_hash)::int AS n FROM visits WHERE day >= $1::date GROUP BY host', [days30[0]]);
    const visitsOn = new Map(visitDays.map((v) => [v.day, v.n]));
    // AI 用量：出題（ai_usage 只留 7 天）、學習分析（ai_reports 留 30 天）
    const aiDays = await db.query<{ day: string; n: number }>('SELECT day::text AS day, sum(count)::int AS n FROM ai_usage WHERE day >= $1::date GROUP BY day', [days7[0]]);
    const aiOn = new Map(aiDays.map((a) => [a.day, a.n]));
    const reports = await db.query<{ kind: string; created_at: Date }>('SELECT kind, created_at FROM ai_reports WHERE created_at >= $1::timestamptz', [
      new Date(`${days30[0]}T00:00:00+08:00`).toISOString(),
    ]);
    const analyses = new Map(days30.map((day) => [day, { day, teacher: 0, kid: 0 }]));
    for (const r of reports) {
      const a = analyses.get(taiwanDay(new Date(r.created_at)));
      if (a) a[r.kind === 'kid' ? 'kid' : 'teacher']++;
    }
    return c.json<AdminOverview>({
      generatedAt: t.toISOString(),
      counts: {
        adults: adults.n,
        teachers: adults.teachers,
        parents: adults.parents,
        kids: kids.n,
        kidsInClass: kids.in_class,
        kidsParentOnly: kids.parent_only,
        classes: classes.n,
      },
      active: { kids: activeCounts(kidSeen.map((r) => new Date(r.last_seen)), t), adults: activeCounts(adultSeen.map((r) => (r.last_login ? new Date(r.last_login) : null)), t) },
      online: deps.liveStats ? deps.liveStats() : null,
      days: summary.days.map((d) => ({ ...d, visits: visitsOn.get(d.day) ?? 0 })),
      subjects: summary.subjects,
      ai: { questions: days7.map((day) => ({ day, count: aiOn.get(day) ?? 0 })), analyses: [...analyses.values()] },
      visits: { today: await distinct(days30[29]), d7: await distinct(days7[0]), d30: await distinct(days30[0]), hosts: Object.fromEntries(hosts.map((h) => [h.host, h.n])) },
    });
  });

  app.get('/api/admin/accounts', async (c) => {
    await authenticateAdmin(c);
    const t = now();
    const classes = await db.query<{ code: string; name: string; teacher: string | null; members: number; packs: number; created_at: Date; last_seen: Date | null }>(
      `SELECT r.code, r.name, u.username AS teacher, r.created_at,
              (SELECT count(*)::int FROM class_members m WHERE m.room_code = r.code) AS members,
              (SELECT count(*)::int FROM class_packs p WHERE p.room_code = r.code) AS packs,
              (SELECT max(a.last_seen) FROM class_members m JOIN accounts a ON a.id = m.account_id WHERE m.room_code = r.code) AS last_seen
       FROM rooms r LEFT JOIN users u ON u.id = r.owner_id
       ORDER BY last_seen DESC NULLS LAST, r.created_at DESC LIMIT $1`,
      [ROW_LIMIT + 1],
    );
    // 孩子：只取名字、金幣與算使用量要的兩個欄位，不取存檔全文
    const kids = await db.query<{ name: string | null; coins: number | null; history: unknown; play_log: unknown; has_parent: boolean; created_at: Date; last_seen: Date; classes: string[] | null }>(
      `SELECT a.profile->>'name' AS name, (a.profile->>'coins')::int AS coins, a.profile->'history' AS history, a.profile->'playLog' AS play_log,
              (a.parent_id IS NOT NULL) AS has_parent, a.created_at, a.last_seen,
              (SELECT array_agg(r.name ORDER BY m.joined_at, m.room_code) FROM class_members m JOIN rooms r ON r.code = m.room_code WHERE m.account_id = a.id) AS classes
       FROM accounts a ORDER BY a.last_seen DESC LIMIT $1`,
      [ROW_LIMIT + 1],
    );
    // 大人：不取密碼雜湊，也不碰 Google 綁定（隱私權政策第 4 節：Google 使用者資料不給人看）；email 回遮罩過的
    const adults = await db.query<{ username: string; email: string | null; email_verified: boolean; is_teacher: boolean; is_parent: boolean; created_at: Date; last_login: Date | null; classes: number; kids: number }>(
      `SELECT u.username, u.email, u.email_verified, u.is_teacher, u.is_parent, u.created_at, u.last_login,
              (SELECT count(*)::int FROM rooms r WHERE r.owner_id = u.id) AS classes,
              (SELECT count(*)::int FROM accounts a WHERE a.parent_id = u.id) AS kids
       FROM users u ORDER BY u.last_login DESC NULLS LAST, u.created_at DESC LIMIT $1`,
      [ROW_LIMIT + 1],
    );
    return c.json<AdminAccounts>({
      classes: classes.slice(0, ROW_LIMIT).map((r) => ({
        code: r.code,
        name: r.name,
        teacher: r.teacher,
        members: r.members,
        packs: r.packs,
        createdAt: iso(r.created_at)!,
        lastSeen: iso(r.last_seen),
      })),
      kids: kids.slice(0, ROW_LIMIT).map((k) => ({
        name: k.name ?? '',
        classes: k.classes ?? [],
        hasParent: k.has_parent,
        createdAt: iso(k.created_at)!,
        lastSeen: iso(k.last_seen)!,
        ...kidUsage({ history: k.history, playLog: k.play_log } as UsageSource, t),
        coins: k.coins ?? 0,
      })),
      adults: adults.slice(0, ROW_LIMIT).map((u) => ({
        username: u.username,
        email: u.email ? maskEmail(u.email) : null,
        emailVerified: u.email_verified,
        teacher: u.is_teacher,
        parent: u.is_parent,
        createdAt: iso(u.created_at)!,
        lastLogin: iso(u.last_login),
        classes: u.classes,
        kids: u.kids,
      })),
      truncated: classes.length > ROW_LIMIT || kids.length > ROW_LIMIT || adults.length > ROW_LIMIT,
    });
  });

  // 匿名造訪計數：日期由伺服器用台灣時間算，不用裝置送來的；只存隨機 id 的雜湊與網址分類
  app.post('/api/visit', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, visitRequest);
    const t = now();
    await db.query('INSERT INTO visits (day, device_hash, host, first_at) VALUES ($1::date, $2, $3, $4::timestamptz) ON CONFLICT (day, device_hash) DO NOTHING', [
      taiwanDay(t),
      createHash('sha256').update(body.device).digest('hex'),
      visitHost(c.req.header('origin')),
      t.toISOString(),
    ]);
    return c.json({ ok: true });
  });
}
