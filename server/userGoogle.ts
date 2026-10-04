/**
 * Google 快速登入綁大人帳號（A4，docs/plans/accounts.md 第 9 節）的路由：
 * - 用 Google 註冊：帳號名稱、密碼、身分照樣要設（Google 只是快速登入，Google 出問題時還能用帳號密碼）；
 *   email 用 Google 驗證過的 email，算驗證過、不寄驗證信；同時綁好這個 Google
 * - 用 Google 登入：只能登入已經綁定的帳號；沒綁定回 404，說明先用帳號密碼登入再綁定、或用 Google 註冊
 * - 綁定、列出（email 遮罩）、解除：一個 Google 只能綁一個大人帳號，一個大人帳號可以綁多個 Google（爸爸、媽媽各一個）
 * Google 的 token 是 Google 簽的、猜不到，所以不用登入鎖定，只擋同一個 IP 的大量請求。
 */
import type { Context, Hono } from 'hono';
import type { Db } from './db';
import { ApiError, readBody } from './http';
import { hashSecret, newUserId } from './auth';
import { maskEmail, type GoogleIdentity } from './google';
import { userInfo, type UserRow } from './users';
import { googleRegisterRequest, googleTokenRequest, type UserGoogleLinksResponse, type UserSessionResponse } from '../src/online/protocol';
import { checkPassword, checkUsername } from '../src/online/userRules';

/** 大人帳號 Google 路由需要的東西（由 app.ts 傳進來） */
export interface UserGoogleRouteDeps {
  db: Db;
  now: () => Date;
  /** 擋同一個 IP 的大量請求 */
  checkFlood: (c: Context) => void;
  /** 驗證 Google ID token：伺服器沒開 Google 登入回 404，驗證失敗回 401 */
  verifyGoogleToken: (idToken: string) => Promise<GoogleIdentity>;
  /** 發一張大人權杖 */
  issueUserToken: (userId: string) => Promise<string>;
  /** 驗證大人權杖 */
  authenticateUser: (c: Context) => Promise<{ userId: string; hash: string }>;
}

/** 這個 Google 已經綁在別的帳號上 */
const GOOGLE_TAKEN = (forRegister: boolean) =>
  new ApiError(409, 'google_taken', forRegister ? '這個 Google 帳號已經綁定知識島的帳號了，請直接用 Google 登入' : '這個 Google 帳號已經綁定別的知識島帳號了');
/** Google 的 email 已經是別的帳號在用（email 只能綁一個帳號） */
const GOOGLE_EMAIL_TAKEN = () => new ApiError(409, 'email_taken', '這個 Google 的 email 已經有帳號了：請先用那個帳號登入，再到「帳號設定」綁定 Google');

/** 掛上大人帳號的 Google 路由 */
export function registerUserGoogleRoutes(app: Hono, deps: UserGoogleRouteDeps): void {
  const { db, now } = deps;

  /** 這個大人帳號綁定的 Google（email 遮罩） */
  const linksOf = async (userId: string): Promise<UserGoogleLinksResponse> => ({
    google: (
      await db.query<{ google_sub: string; email: string | null }>('SELECT google_sub, email FROM user_google_links WHERE user_id = $1 ORDER BY linked_at, google_sub', [userId])
    ).map((r) => ({ id: r.google_sub, email: r.email ? maskEmail(r.email) : '（沒有 email 的 Google 帳號）' })),
  });

  app.post('/api/users/google/login', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, googleTokenRequest);
    const g = await deps.verifyGoogleToken(body.idToken);
    const row = (await db.query<UserRow>('SELECT u.* FROM users u JOIN user_google_links l ON l.user_id = u.id WHERE l.google_sub = $1', [g.sub]))[0];
    if (!row) {
      throw new ApiError(
        404,
        'google_not_linked',
        '這個 Google 帳號還沒有綁定知識島的帳號。已經有帳號的話，請先用帳號名稱和密碼登入，再到「帳號設定」綁定 Google；還沒有帳號的話，可以在「註冊新帳號」用 Google 註冊。',
      );
    }
    await db.query('UPDATE users SET last_login = $2::timestamptz WHERE id = $1', [row.id, now().toISOString()]);
    return c.json<UserSessionResponse>({ token: await deps.issueUserToken(row.id), user: userInfo(row) });
  });

  app.post('/api/users/google/register', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, googleRegisterRequest);
    const g = await deps.verifyGoogleToken(body.idToken);
    const name = checkUsername(body.username);
    if (!name.ok) throw new ApiError(400, 'bad_username', name.reason);
    const pwProblem = checkPassword(body.password);
    if (pwProblem) throw new ApiError(400, 'bad_password', pwProblem);
    if (!body.parent && !body.teacher) throw new ApiError(400, 'no_role', '請勾選「家長」或「老師」（可以兩個都勾）');
    if (!g.email || !g.emailVerified) throw new ApiError(400, 'google_no_email', '這個 Google 帳號沒有驗證過的 email，請改用帳號名稱、密碼和 email 註冊');
    const email = g.email;

    /** 查是哪一個唯一鍵衝突（先查 Google，再查帳號名稱，最後是 email） */
    const conflict = async (): Promise<ApiError | null> => {
      if ((await db.query('SELECT 1 FROM user_google_links WHERE google_sub = $1', [g.sub])).length) return GOOGLE_TAKEN(true);
      if ((await db.query('SELECT 1 FROM users WHERE username_key = $1', [name.key])).length) return new ApiError(409, 'username_taken', '這個帳號名稱已經有人用了，換一個吧');
      if ((await db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])).length) return GOOGLE_EMAIL_TAKEN();
      return null;
    };
    const before = await conflict();
    if (before) throw before;

    const passwordHash = await hashSecret(body.password);
    const t = now().toISOString();
    let row: UserRow;
    try {
      row = await db.transaction(async (tx) => {
        const rows = await tx.query<UserRow>(
          `INSERT INTO users (id, username, username_key, password_hash, email, email_verified, is_parent, is_teacher, created_at, last_login)
           VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8::timestamptz, $8::timestamptz) RETURNING *`,
          [newUserId(), name.username, name.key, passwordHash, email, body.parent, body.teacher, t],
        );
        await tx.query('INSERT INTO user_google_links (google_sub, user_id, email, linked_at) VALUES ($1, $2, $3, $4::timestamptz)', [g.sub, rows[0].id, email, t]);
        return rows[0];
      });
    } catch (err) {
      // 同時有人用了同一個帳號名稱、email 或 Google：查是哪一個
      if ((err as { code?: string }).code === '23505') throw (await conflict()) ?? GOOGLE_TAKEN(true);
      throw err;
    }
    return c.json<UserSessionResponse>({ token: await deps.issueUserToken(row.id), user: userInfo(row) });
  });

  app.get('/api/users/me/google', async (c) => {
    const { userId } = await deps.authenticateUser(c);
    return c.json(await linksOf(userId));
  });

  app.post('/api/users/me/google', async (c) => {
    const { userId } = await deps.authenticateUser(c);
    const body = await readBody(c, googleTokenRequest);
    const g = await deps.verifyGoogleToken(body.idToken);
    // 已經綁在自己身上：更新 email 就好；綁在別人身上：不更新（WHERE 擋掉），再查一次回 409
    await db.query(
      `INSERT INTO user_google_links (google_sub, user_id, email, linked_at) VALUES ($1, $2, $3, $4::timestamptz)
       ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email WHERE user_google_links.user_id = EXCLUDED.user_id`,
      [g.sub, userId, g.email, now().toISOString()],
    );
    const owner = (await db.query<{ user_id: string }>('SELECT user_id FROM user_google_links WHERE google_sub = $1', [g.sub]))[0];
    if (owner?.user_id !== userId) throw GOOGLE_TAKEN(false);
    return c.json(await linksOf(userId));
  });

  app.delete('/api/users/me/google/:sub', async (c) => {
    const { userId } = await deps.authenticateUser(c);
    const removed = await db.query('DELETE FROM user_google_links WHERE user_id = $1 AND google_sub = $2 RETURNING google_sub', [userId, c.req.param('sub')]);
    if (!removed.length) throw new ApiError(404, 'no_google', '找不到這個 Google 綁定');
    return c.json(await linksOf(userId));
  });
}
