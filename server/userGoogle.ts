/**
 * Google 快速登入綁大人帳號（A4，docs/plans/accounts.md 第 9 節）的路由：
 * - 用 Google 註冊：只要選身分（L1 起不用設帳號名稱與密碼，docs/plans/login-ux-review.md 第 6 節第 1 點）；
 *   帳號名稱從 email 產生（撞名加數字），沒有密碼（之後可以在帳號設定用 Google 確認身分再設定，或用忘記密碼）；
 *   email 用 Google 驗證過的 email，算驗證過、不寄驗證信；同時綁好這個 Google
 * - 用 Google 登入：只能登入已經綁定的帳號；沒綁定回 404（前端接著走用 Google 註冊）
 * - 綁定、列出（email 遮罩）、解除：一個 Google 只能綁一個大人帳號，一個大人帳號可以綁多個 Google（爸爸、媽媽各一個）；
 *   沒有密碼的帳號不能解除最後一個 Google（不然就沒有辦法登入）
 * Google 的 token 是 Google 簽的、猜不到，所以不用登入鎖定，只擋同一個 IP 的大量請求。
 */
import { randomInt } from 'node:crypto';
import type { Context, Hono } from 'hono';
import type { Db } from './db';
import { ApiError, readBody } from './http';
import { newUserId } from './auth';
import { maskEmail, type GoogleIdentity } from './google';
import { userInfo, type UserRow } from './users';
import { googleRegisterRequest, googleTokenRequest, type UserGoogleLinksResponse, type UserSessionResponse } from '../src/online/protocol';
import { pickUsername, usernameBaseFromEmail } from '../src/online/userRules';

/** 產生帳號名稱時，遇到別人同時註冊同一個名稱（唯一鍵衝突）最多重試幾次 */
const USERNAME_ATTEMPTS = 3;

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
        '這個 Google 帳號還沒有綁定知識島的帳號。已經有帳號的話，請先用帳號名稱和密碼登入，再到「帳號設定」綁定 Google；還沒有帳號的話，可以直接用 Google 註冊。',
      );
    }
    await db.query('UPDATE users SET last_login = $2::timestamptz WHERE id = $1', [row.id, now().toISOString()]);
    return c.json<UserSessionResponse>({ token: await deps.issueUserToken(row.id), user: userInfo(row) });
  });

  app.post('/api/users/google/register', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, googleRegisterRequest);
    const g = await deps.verifyGoogleToken(body.idToken);
    if (!body.parent && !body.teacher) throw new ApiError(400, 'no_role', '請選「家長」或「老師」');
    if (!g.email || !g.emailVerified) throw new ApiError(400, 'google_no_email', '這個 Google 帳號沒有驗證過的 email，請改用帳號名稱、密碼和 email 註冊');
    const email = g.email;

    /** 查是 Google 還是 email 已經有人用了（帳號名稱是自動產生的，撞名時換一個重試，不算衝突） */
    const conflict = async (): Promise<ApiError | null> => {
      if ((await db.query('SELECT 1 FROM user_google_links WHERE google_sub = $1', [g.sub])).length) return GOOGLE_TAKEN(true);
      if ((await db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])).length) return GOOGLE_EMAIL_TAKEN();
      return null;
    };
    const before = await conflict();
    if (before) throw before;

    const base = usernameBaseFromEmail(email);
    const t = now().toISOString();
    for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++) {
      // 已經有人用的、以本體開頭的帳號名稱（不用 LIKE：底線在 LIKE 裡是萬用字元）
      const taken = new Set(
        (await db.query<{ username_key: string }>('SELECT username_key FROM users WHERE left(username_key, char_length($1)) = $1', [base.toLowerCase()])).map((r) => r.username_key),
      );
      // 本體加 2～9999 全被用掉（幾乎不會發生）：本體加 4 位亂數
      const username = pickUsername(base, taken) ?? `${base}${randomInt(1000, 10000)}`;
      try {
        const row = await db.transaction(async (tx) => {
          const rows = await tx.query<UserRow>(
            `INSERT INTO users (id, username, username_key, password_hash, email, email_verified, is_parent, is_teacher, created_at, last_login)
             VALUES ($1, $2, $3, NULL, $4, true, $5, $6, $7::timestamptz, $7::timestamptz) RETURNING *`,
            [newUserId(), username, username.toLowerCase(), email, body.parent, body.teacher, t],
          );
          await tx.query('INSERT INTO user_google_links (google_sub, user_id, email, linked_at) VALUES ($1, $2, $3, $4::timestamptz)', [g.sub, rows[0].id, email, t]);
          return rows[0];
        });
        return c.json<UserSessionResponse>({ token: await deps.issueUserToken(row.id), user: userInfo(row) });
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;
        // 同時有人用了同一個 email 或 Google：回報；只是帳號名稱被搶先用了：換一個再試
        const other = await conflict();
        if (other) throw other;
      }
    }
    throw new ApiError(409, 'username_busy', '現在註冊的人比較多，請再按一次 Google 按鈕');
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
    const sub = c.req.param('sub');
    // 先鎖帳號列再數綁定：同時解除兩個 Google、或同時設定密碼時，不會兩邊都以為「還有別的登入方式」
    const result = await db.transaction(async (tx) => {
      const me = (await tx.query<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1 FOR UPDATE', [userId]))[0];
      const links = await tx.query<{ google_sub: string }>('SELECT google_sub FROM user_google_links WHERE user_id = $1', [userId]);
      if (!links.some((l) => l.google_sub === sub)) return 'missing' as const;
      if (me && me.password_hash === null && links.length <= 1) return 'last' as const;
      await tx.query('DELETE FROM user_google_links WHERE user_id = $1 AND google_sub = $2', [userId, sub]);
      return 'removed' as const;
    });
    if (result === 'missing') throw new ApiError(404, 'no_google', '找不到這個 Google 綁定');
    if (result === 'last') throw new ApiError(409, 'last_login_method', '這是這個帳號唯一的登入方式：請先設定密碼，再解除這個 Google');
    return c.json(await linksOf(userId));
  });
}
