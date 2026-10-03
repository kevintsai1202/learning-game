/**
 * Email 驗證與忘記密碼（A3，docs/plans/accounts.md 第 7 節）的路由與共用函式。
 * - 寄出的連結權杖只存雜湊（email_tokens），有期限、只能用一次：驗證 24 小時、重設 30 分鐘
 * - 每個帳號每種信每分鐘 1 封、每天 10 封（用 email_tokens 計數，伺服器重啟也算數）
 * - 忘記密碼一律回同一句話，不透露帳號是否存在：被頻率限制時也照常回應（不寄、不建權杖，計數本身不洩漏）；
 *   只寄給驗證過的 email；不等寄信完成就回應（回應時間不會因為帳號存在而明顯變長）
 * - 信裡的連結指回前端送來的網址（appUrl），網域必須在允許清單裡，否則用 GitHub Pages 的網址：不能拿來做釣魚連結
 * - 會同時鎖帳號與權杖時，先鎖 users 再鎖 email_tokens（和刪除帳號時外鍵 CASCADE 的順序一樣）
 */
import type { Context, Hono } from 'hono';
import type { Db, Queryable } from './db';
import { ApiError, readBody } from './http';
import { hashSecret, newToken, tokenHash, userLockKey, type LoginLimiter } from './auth';
import { MailError, type Mailer, type MailMessage } from './mail';
import { checkPassword } from '../src/online/userRules';
import { forgotPasswordRequest, resendVerifyRequest, resetPasswordRequest, verifyEmailRequest, type MailStatus } from '../src/online/protocol';

/** 沒有可用的前端網址時，信裡的連結指向 GitHub Pages */
export const DEFAULT_APP_URL = 'https://kevintsai1202.github.io/learning-game/';
/** 驗證連結的效期 */
export const VERIFY_TTL_MS = 24 * 3600_000;
/** 重設連結的效期 */
export const RESET_TTL_MS = 30 * 60_000;
/** 每個帳號每種信：每分鐘、每天最多幾封 */
const PER_MINUTE = 1;
const PER_DAY = 10;

/** 信的用途 */
type Purpose = 'verify' | 'reset';

/** 資料表 email_tokens 的一列 */
interface EmailTokenRow {
  token_hash: string;
  user_id: string;
  purpose: Purpose;
  email: string;
  expires_at: Date;
  used_at: Date | null;
}

/** Email 路由需要的東西（由 app.ts 傳進來） */
export interface EmailRouteDeps {
  db: Db;
  now: () => Date;
  mailer: Mailer;
  /** 允許的前端網域（ALLOWED_ORIGINS） */
  allowedOrigins: Set<string>;
  limiter: LoginLimiter;
  /** 擋同一個 IP 的大量請求 */
  checkFlood: (c: Context) => void;
  /** 驗證大人權杖 */
  authenticateUser: (c: Context) => Promise<{ userId: string; hash: string }>;
  /** 寄信失敗的記錄（只記固定訊息，不記信的內容） */
  log?: (msg: string) => void;
}

/** 寄驗證信需要的東西（註冊、改 email 時 users.ts 也會用） */
export type MailDeps = Pick<EmailRouteDeps, 'db' | 'now' | 'mailer' | 'allowedOrigins' | 'log'>;

/**
 * 信裡連結的網址：前端送來的 appUrl，網域在允許清單裡才採用，只取網域＋路徑（去掉檔名、參數與 #）；
 * 沒給、格式不對或不在清單裡，就用 GitHub Pages 的網址
 */
export function appBaseUrl(appUrl: string | undefined, allowed: Set<string>): string {
  if (!appUrl) return DEFAULT_APP_URL;
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    return DEFAULT_APP_URL;
  }
  if (!allowed.has(url.origin)) return DEFAULT_APP_URL;
  return url.origin + url.pathname.replace(/[^/]*$/, '');
}

/** 頻率限制：還要等幾秒才能再寄這種信（0＝可以寄） */
async function waitSeconds(q: Queryable, userId: string, purpose: Purpose, now: Date): Promise<number> {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const rows = await q.query<{ created_at: Date }>('SELECT created_at FROM email_tokens WHERE user_id = $1 AND purpose = $2 AND created_at > $3::timestamptz ORDER BY created_at', [
    userId,
    purpose,
    dayAgo.toISOString(),
  ]);
  const times = rows.map((r) => new Date(r.created_at).getTime());
  const t = now.getTime();
  let until = 0;
  if (times.length >= PER_DAY) until = times[times.length - PER_DAY] + 24 * 3600_000;
  const lastMinute = times.filter((x) => x > t - 60_000);
  if (lastMinute.length >= PER_MINUTE) until = Math.max(until, lastMinute[lastMinute.length - PER_MINUTE] + 60_000);
  return until > t ? Math.ceil((until - t) / 1000) : 0;
}

/** 建一張連結權杖（資料庫只存雜湊），回傳原始權杖 */
async function issueEmailToken(q: Queryable, userId: string, purpose: Purpose, email: string, now: Date, ttlMs: number): Promise<string> {
  const raw = newToken();
  await q.query('INSERT INTO email_tokens (token_hash, user_id, purpose, email, expires_at, created_at) VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)', [
    tokenHash(raw),
    userId,
    purpose,
    email,
    new Date(now.getTime() + ttlMs).toISOString(),
    now.toISOString(),
  ]);
  return raw;
}

/** 驗證信 */
function verifyMailOf(username: string, email: string, link: string): MailMessage {
  return {
    to: email,
    subject: '【知識島大冒險】請驗證你的 email',
    text: [
      `${username} 你好：`,
      '',
      '請打開下面的連結，驗證這個 email（24 小時內有效）：',
      link,
      '',
      '驗證之後，忘記密碼時就能用這個 email 重設。',
      '如果你沒有註冊知識島大冒險的帳號，不用理會這封信。',
    ].join('\n'),
  };
}

/** 重設密碼的信 */
function resetMailOf(username: string, email: string, link: string): MailMessage {
  return {
    to: email,
    subject: '【知識島大冒險】重設密碼',
    text: [
      `${username} 你好：`,
      '',
      '我們收到重設密碼的申請。請在 30 分鐘內打開下面的連結，設定新的密碼：',
      link,
      '',
      '重設之後，所有裝置的登入都會登出，要用新密碼重新登入。',
      '如果不是你申請的，不用理會這封信，密碼不會改變。',
    ].join('\n'),
  };
}

/** 寄一封驗證信到帳號目前的 email（呼叫前要先確認頻率限制）；寄信失敗丟 MailError */
async function deliverVerifyMail(deps: MailDeps, user: { id: string; username: string; email: string }, appUrl: string | undefined): Promise<void> {
  const raw = await issueEmailToken(deps.db, user.id, 'verify', user.email, deps.now(), VERIFY_TTL_MS);
  await deps.mailer.send(verifyMailOf(user.username, user.email, `${appBaseUrl(appUrl, deps.allowedOrigins)}?verify=${raw}`));
}

/**
 * 寄驗證信（註冊、改 email 時用）：停用、頻率限制、寄信失敗都不丟例外，回傳結果讓畫面提示
 * （註冊與改 email 不會因為寄信失敗而失敗，之後可以到帳號設定重寄）
 */
export async function sendVerifyMail(deps: MailDeps, user: { id: string; username: string; email: string }, appUrl: string | undefined): Promise<MailStatus> {
  if (deps.mailer.kind === 'disabled') return 'disabled';
  if ((await waitSeconds(deps.db, user.id, 'verify', deps.now())) > 0) return 'limited';
  try {
    await deliverVerifyMail(deps, user, appUrl);
    return 'sent';
  } catch (err) {
    (deps.log ?? console.error)(`驗證信沒有寄出：${err instanceof MailError ? err.message : '寄信失敗'}`);
    return 'failed';
  }
}

/** 掛上 email 驗證與忘記密碼的路由 */
export function registerEmailRoutes(app: Hono, deps: EmailRouteDeps): void {
  const { db, now, mailer } = deps;
  const log = deps.log ?? ((msg: string) => console.error(msg));

  /** 重寄驗證信（登入狀態，可以老實回報頻率限制） */
  app.post('/api/users/me/verify/resend', async (c) => {
    const who = await deps.authenticateUser(c);
    const body = await readBody(c, resendVerifyRequest);
    const row = (await db.query<{ id: string; username: string; email: string | null; email_verified: boolean }>('SELECT id, username, email, email_verified FROM users WHERE id = $1', [who.userId]))[0];
    if (!row) throw new ApiError(401, 'unauthorized', '請重新登入');
    if (!row.email) throw new ApiError(400, 'no_email', '還沒有填 email');
    if (row.email_verified) throw new ApiError(409, 'already_verified', '這個 email 已經驗證過了');
    if (mailer.kind === 'disabled') throw new ApiError(503, 'mail_unavailable', '伺服器沒有設定寄信');
    const wait = await waitSeconds(db, row.id, 'verify', now());
    if (wait > 0) throw new ApiError(429, 'too_many_mails', `寄太多次了，請 ${wait} 秒後再試`, wait);
    try {
      await deliverVerifyMail(deps, { id: row.id, username: row.username, email: row.email }, body.appUrl);
    } catch (err) {
      throw new ApiError(502, 'mail_failed', err instanceof MailError ? err.message : '寄信失敗');
    }
    return c.json({ ok: true });
  });

  /** 打開驗證連結（不用登入：可能在另一台裝置的信箱打開） */
  app.post('/api/users/email/verify', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, verifyEmailRequest);
    const hash = tokenHash(body.token);
    const t = now();
    const ok = await db.transaction(async (tx) => {
      // 先查是誰的連結（不鎖），再依「帳號→權杖」的順序鎖住並重新確認
      const found = (await tx.query<{ user_id: string }>("SELECT user_id FROM email_tokens WHERE token_hash = $1 AND purpose = 'verify'", [hash]))[0];
      if (!found) return false;
      const user = (await tx.query<{ email: string | null }>('SELECT email FROM users WHERE id = $1 FOR UPDATE', [found.user_id]))[0];
      const tok = (await tx.query<EmailTokenRow>('SELECT * FROM email_tokens WHERE token_hash = $1 FOR UPDATE', [hash]))[0];
      // 用過、過期，或帳號的 email 已經換了（舊信裡的連結失效）
      if (!user?.email || !tok || tok.used_at || new Date(tok.expires_at).getTime() <= t.getTime() || tok.email.toLowerCase() !== user.email.toLowerCase()) return false;
      await tx.query('UPDATE email_tokens SET used_at = $2::timestamptz WHERE token_hash = $1', [hash, t.toISOString()]);
      await tx.query('UPDATE users SET email_verified = true WHERE id = $1', [found.user_id]);
      return true;
    });
    if (!ok) throw new ApiError(400, 'bad_token', '這個驗證連結已經失效（超過 24 小時、用過了，或 email 改過），請到帳號設定重寄驗證信');
    return c.json({ ok: true });
  });

  /** 忘記密碼：帳號名稱或 email（不分大小寫）；一律回同一句話 */
  app.post('/api/users/password/forgot', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, forgotPasswordRequest);
    const login = body.login.trim();
    const row = (
      await db.query<{ id: string; username: string; email: string | null; email_verified: boolean }>(
        login.includes('@') ? 'SELECT id, username, email, email_verified FROM users WHERE lower(email) = lower($1)' : 'SELECT id, username, email, email_verified FROM users WHERE username_key = $1',
        [login.includes('@') ? login : login.toLowerCase()],
      )
    )[0];
    if (row?.email && row.email_verified && mailer.kind !== 'disabled') {
      const t = now();
      if ((await waitSeconds(db, row.id, 'reset', t)) === 0) {
        const raw = await issueEmailToken(db, row.id, 'reset', row.email, t, RESET_TTL_MS);
        const mail = resetMailOf(row.username, row.email, `${appBaseUrl(body.appUrl, deps.allowedOrigins)}?reset=${raw}`);
        // 不等寄信完成就回應（權杖已經寫進資料庫）
        void mailer.send(mail).catch((err: unknown) => log(`重設信沒有寄出：${err instanceof MailError ? err.message : '寄信失敗'}`));
      }
    }
    return c.json({ ok: true });
  });

  /** 打開重設連結後設定新密碼（不用登入）；成功後所有裝置的登入失效 */
  app.post('/api/users/password/reset', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, resetPasswordRequest);
    // 密碼不合規則時不動連結，改好再送一次還能用
    const pwProblem = checkPassword(body.password);
    if (pwProblem) throw new ApiError(400, 'bad_password', pwProblem);
    const passwordHash = await hashSecret(body.password);
    const hash = tokenHash(body.token);
    const t = now();
    const username = await db.transaction(async (tx) => {
      const found = (await tx.query<{ user_id: string }>("SELECT user_id FROM email_tokens WHERE token_hash = $1 AND purpose = 'reset'", [hash]))[0];
      if (!found) return null;
      const user = (await tx.query<{ id: string; username_key: string; email: string | null }>('SELECT id, username_key, email FROM users WHERE id = $1 FOR UPDATE', [found.user_id]))[0];
      const tok = (await tx.query<EmailTokenRow>('SELECT * FROM email_tokens WHERE token_hash = $1 FOR UPDATE', [hash]))[0];
      if (!user?.email || !tok || tok.used_at || new Date(tok.expires_at).getTime() <= t.getTime() || tok.email.toLowerCase() !== user.email.toLowerCase()) return null;
      await tx.query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, passwordHash]);
      // 這個帳號其他還沒用的重設連結一起作廢；所有裝置的登入失效（包括正在重設的這台，要用新密碼重新登入）
      await tx.query("UPDATE email_tokens SET used_at = $2::timestamptz WHERE user_id = $1 AND purpose = 'reset' AND used_at IS NULL", [user.id, t.toISOString()]);
      await tx.query('DELETE FROM tokens WHERE user_id = $1', [user.id]);
      return user.username_key;
    });
    if (!username) throw new ApiError(400, 'bad_token', '這個重設連結已經失效（超過 30 分鐘或用過了），請重新申請');
    // 密碼換了：之前猜錯造成的登入鎖定一起解除
    deps.limiter.reset(userLockKey(username));
    return c.json({ ok: true });
  });

  // 測試信箱（只有 TEST_MAIL_OUTBOX＋ALLOW_TEST_MAIL 的測試模式；e2e 從這裡讀驗證與重設連結）
  if (mailer.kind === 'outbox') {
    app.get('/api/test/mails', (c) => c.json({ mails: mailer.outbox ?? [] }));
  }
}
