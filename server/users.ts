/**
 * 大人帳號（家長、老師）的 HTTP 路由：註冊、登入、讀取與修改自己的資料、改密碼。
 * 登出共用 /api/logout（刪掉那張權杖）。規格見 docs/plans/accounts.md 的 A1。
 */
import type { Context, Hono } from 'hono';
import type { Db } from './db';
import { ApiError, readBody } from './http';
import { hashSecret, newUserId, verifySecret, type LoginLimiter } from './auth';
import { passwordChangeRequest, registerRequest, userLoginRequest, userPatchRequest, type UserInfo, type UserSessionResponse } from '../src/online/protocol';
import { checkEmail, checkPassword, checkUsername } from '../src/online/userRules';

/** 資料表 users 的一列 */
export interface UserRow {
  id: string;
  username: string;
  username_key: string;
  password_hash: string;
  email: string | null;
  email_verified: boolean;
  is_parent: boolean;
  is_teacher: boolean;
  created_at: Date;
  last_login: Date | null;
}

/** 大人帳號路由需要的東西（由 app.ts 傳進來，和其他路由共用同一份鎖定與流量限制） */
export interface UserRouteDeps {
  db: Db;
  now: () => Date;
  limiter: LoginLimiter;
  /** 擋同一個 IP 的大量請求 */
  checkFlood: (c: Context) => void;
  /** 鎖定中就丟 423 */
  assertNotLocked: (key: string) => void;
  /** 發一張大人權杖 */
  issueUserToken: (userId: string) => Promise<string>;
  /** 驗證大人權杖，回傳帳號 id 與權杖雜湊 */
  authenticateUser: (c: Context) => Promise<{ userId: string; hash: string }>;
}

/** 回給本人的帳號資料 */
export function userInfo(row: UserRow): UserInfo {
  return { id: row.id, username: row.username, email: row.email, emailVerified: row.email_verified, parent: row.is_parent, teacher: row.is_teacher };
}

/** 登入鎖定的鍵（不分大小寫，同一個帳號名稱共用） */
const lockKey = (username: string) => `user:${username.trim().toLowerCase()}`;

/** 註冊大人帳號的路由 */
export function registerUserRoutes(app: Hono, deps: UserRouteDeps): void {
  const { db, now, limiter } = deps;

  /** 讀權杖對應的帳號；帳號已經不存在回 401 */
  const loadMe = async (c: Context): Promise<{ row: UserRow; hash: string }> => {
    const who = await deps.authenticateUser(c);
    const row = (await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [who.userId]))[0];
    if (!row) throw new ApiError(401, 'unauthorized', '請重新登入');
    return { row, hash: who.hash };
  };

  app.post('/api/users', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, registerRequest);
    const name = checkUsername(body.username);
    if (!name.ok) throw new ApiError(400, 'bad_username', name.reason);
    const pwProblem = checkPassword(body.password);
    if (pwProblem) throw new ApiError(400, 'bad_password', pwProblem);
    const mail = checkEmail(body.email);
    if (!mail.ok) throw new ApiError(400, 'bad_email', mail.reason);
    if (!body.parent && !body.teacher) throw new ApiError(400, 'no_role', '請勾選「家長」或「老師」（可以兩個都勾）');

    const taken = await db.query('SELECT 1 FROM users WHERE username_key = $1', [name.key]);
    if (taken.length) throw new ApiError(409, 'username_taken', '這個帳號名稱已經有人用了，換一個吧');
    let rows: UserRow[];
    try {
      rows = await db.query<UserRow>(
        `INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $8::timestamptz) RETURNING *`,
        [newUserId(), name.username, name.key, await hashSecret(body.password), mail.email, body.parent, body.teacher, now().toISOString()],
      );
    } catch (err) {
      // 兩個人同時註冊同一個帳號名稱：唯一鍵衝突
      if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'username_taken', '這個帳號名稱已經有人用了，換一個吧');
      throw err;
    }
    return c.json<UserSessionResponse>({ token: await deps.issueUserToken(rows[0].id), user: userInfo(rows[0]) });
  });

  app.post('/api/users/login', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, userLoginRequest);
    const key = lockKey(body.username);
    deps.assertNotLocked(key);
    const row = (await db.query<UserRow>('SELECT * FROM users WHERE username_key = $1', [body.username.trim().toLowerCase()]))[0];
    // 沒有這個帳號與密碼錯回同一個錯誤，不透露帳號名稱存不存在
    if (!row || !(await verifySecret(body.password, row.password_hash))) {
      limiter.fail(key);
      throw new ApiError(401, 'bad_login', '帳號名稱或密碼不對');
    }
    limiter.reset(key);
    await db.query('UPDATE users SET last_login = $2::timestamptz WHERE id = $1', [row.id, now().toISOString()]);
    return c.json<UserSessionResponse>({ token: await deps.issueUserToken(row.id), user: userInfo(row) });
  });

  app.get('/api/users/me', async (c) => {
    const { row } = await loadMe(c);
    return c.json({ user: userInfo(row) });
  });

  app.patch('/api/users/me', async (c) => {
    const { row } = await loadMe(c);
    const body = await readBody(c, userPatchRequest);
    const parent = body.parent ?? row.is_parent;
    const teacher = body.teacher ?? row.is_teacher;
    if (!parent && !teacher) throw new ApiError(400, 'no_role', '家長、老師至少要保留一個身分');
    let email = row.email;
    let verified = row.email_verified;
    if (body.email !== undefined) {
      const mail = checkEmail(body.email);
      if (!mail.ok) throw new ApiError(400, 'bad_email', mail.reason);
      // 換了信箱就要重新驗證
      if (mail.email !== row.email) {
        email = mail.email;
        verified = false;
      }
    }
    const rows = await db.query<UserRow>('UPDATE users SET is_parent = $2, is_teacher = $3, email = $4, email_verified = $5 WHERE id = $1 RETURNING *', [
      row.id,
      parent,
      teacher,
      email,
      verified,
    ]);
    return c.json({ user: userInfo(rows[0]) });
  });

  app.post('/api/users/me/password', async (c) => {
    const { row, hash } = await loadMe(c);
    const body = await readBody(c, passwordChangeRequest);
    const pwProblem = checkPassword(body.next);
    if (pwProblem) throw new ApiError(400, 'bad_password', pwProblem);
    // 目前的密碼也算登入嘗試：猜錯太多次一樣會鎖
    const key = lockKey(row.username);
    deps.assertNotLocked(key);
    if (!(await verifySecret(body.current, row.password_hash))) {
      limiter.fail(key);
      throw new ApiError(401, 'bad_password', '目前的密碼不對');
    }
    limiter.reset(key);
    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [row.id, await hashSecret(body.next)]);
    // 舊密碼可能外流：其他裝置的登入一律失效，這台保留
    await db.query('DELETE FROM tokens WHERE user_id = $1 AND token_hash <> $2', [row.id, hash]);
    return c.json({ ok: true });
  });
}
