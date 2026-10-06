/**
 * 大人帳號（家長、老師）的 HTTP 路由：註冊、登入、讀取與修改自己的資料、改密碼。
 * 登出共用 /api/logout（刪掉那張權杖）。規格見 docs/plans/accounts.md 的 A1；
 * A3 起 email 只能綁一個帳號（不分大小寫），註冊與換 email 時寄驗證信（server/email.ts）。
 * L1 起用 Google 註冊的帳號沒有密碼（docs/plans/login-ux-review.md 第 6 節）：不能用密碼登入（回和密碼錯一樣的錯誤），
 * 改密碼（設定密碼）與刪除帳號改用綁定的 Google 再確認一次身分。
 */
import type { Context, Hono } from 'hono';
import type { Db } from './db';
import { ApiError, readBody } from './http';
import { hashSecret, newUserId, userLockKey, verifySecret, type LoginLimiter } from './auth';
import {
  deleteAccountRequest,
  passwordChangeRequest,
  registerRequest,
  userLoginRequest,
  userPatchRequest,
  type MailStatus,
  type UserInfo,
  type UserPatchResponse,
  type UserSessionResponse,
} from '../src/online/protocol';
import { checkEmail, checkPassword, checkUsername } from '../src/online/userRules';
import { settlePendingGifts, type Events } from './gifts';
import { KID_DELETED_REASON, emitExcept } from './parents';
import { sendVerifyMail } from './email';
import type { Mailer } from './mail';
import type { GoogleIdentity } from './google';
import type { Profile } from '../src/store/save';

/** email 已經綁在別的帳號上 */
const EMAIL_TAKEN = () => new ApiError(409, 'email_taken', '這個 email 已經有帳號了；如果是你的帳號，可以用「忘記密碼」找回');

/** 資料表 users 的一列 */
export interface UserRow {
  id: string;
  username: string;
  username_key: string;
  /** 密碼雜湊；用 Google 註冊、還沒設定密碼的帳號是 null */
  password_hash: string | null;
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
  /** 刪除帳號時：名下角色的裝置收到踢線、班上退款的人收到存檔與禮物通知 */
  onKick?: (accountId: string, reason: string) => void;
  onProfileChanged?: (accountId: string, rev: number, profile: Profile) => void;
  onGift?: (accountId: string) => void;
  /** 寄驗證信（A3） */
  mailer: Mailer;
  /** 允許的前端網域：驗證信裡的連結只指回這些網址 */
  allowedOrigins: Set<string>;
  /** 驗證 Google ID token（用 Google 再確認一次身分時用）：伺服器沒開 Google 登入回 404，驗證失敗回 401 */
  verifyGoogleToken: (idToken: string) => Promise<GoogleIdentity>;
}

/** 再確認一次身分的證明：密碼，或綁定的 Google 給的 ID token（兩個至少一個，由請求格式保證） */
interface Proof {
  password?: string;
  idToken?: string;
}

/** 回給本人的帳號資料 */
export function userInfo(row: UserRow): UserInfo {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    emailVerified: row.email_verified,
    hasPassword: row.password_hash !== null,
    parent: row.is_parent,
    teacher: row.is_teacher,
  };
}

/** 登入鎖定的鍵（不分大小寫，同一個帳號名稱共用） */
const lockKey = userLockKey;

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

  /**
   * 改密碼、刪除帳號前再確認一次身分。
   * - 有 idToken：必須是綁定在這個帳號上的 Google（沒有密碼的帳號只能用這個）；Google 的 token 猜不到，不算登入失敗次數。
   * - 用密碼：猜錯算登入失敗次數（太多次一樣鎖定）；這個帳號沒有密碼時直接回 bad_password，說明改用 Google。
   * wrongPassword 是密碼不對時顯示的訊息。
   */
  const reauth = async (row: UserRow, proof: Proof, wrongPassword: string): Promise<void> => {
    if (proof.idToken !== undefined) {
      const g = await deps.verifyGoogleToken(proof.idToken);
      const linked = await db.query('SELECT 1 FROM user_google_links WHERE google_sub = $1 AND user_id = $2', [g.sub, row.id]);
      if (!linked.length) throw new ApiError(401, 'bad_google', '這個 Google 帳號沒有綁定這個知識島帳號，請換一個 Google 帳號');
      return;
    }
    if (row.password_hash === null) throw new ApiError(401, 'bad_password', '這個帳號還沒有設定密碼，請用 Google 確認身分');
    const key = lockKey(row.username);
    deps.assertNotLocked(key);
    if (!(await verifySecret(proof.password ?? '', row.password_hash))) {
      limiter.fail(key);
      throw new ApiError(401, 'bad_password', wrongPassword);
    }
    limiter.reset(key);
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
    if ((await db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [mail.email])).length) throw EMAIL_TAKEN();
    let rows: UserRow[];
    try {
      rows = await db.query<UserRow>(
        `INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $8::timestamptz) RETURNING *`,
        [newUserId(), name.username, name.key, await hashSecret(body.password), mail.email, body.parent, body.teacher, now().toISOString()],
      );
    } catch (err) {
      // 兩個人同時註冊同一個帳號名稱或 email：唯一鍵衝突，查是哪一個
      if ((err as { code?: string }).code === '23505') {
        if ((await db.query('SELECT 1 FROM users WHERE username_key = $1', [name.key])).length) throw new ApiError(409, 'username_taken', '這個帳號名稱已經有人用了，換一個吧');
        throw EMAIL_TAKEN();
      }
      throw err;
    }
    const user = rows[0];
    const token = await deps.issueUserToken(user.id);
    // 寄驗證信：寄不出去也不擋註冊，畫面提示之後可以到帳號設定重寄
    const verifyMail = await sendVerifyMail(deps, { id: user.id, username: user.username, email: mail.email }, body.appUrl);
    return c.json<UserSessionResponse>({ token, user: userInfo(user), verifyMail });
  });

  app.post('/api/users/login', async (c) => {
    deps.checkFlood(c);
    const body = await readBody(c, userLoginRequest);
    const key = lockKey(body.username);
    deps.assertNotLocked(key);
    const row = (await db.query<UserRow>('SELECT * FROM users WHERE username_key = $1', [body.username.trim().toLowerCase()]))[0];
    // 沒有這個帳號、密碼錯、帳號沒有密碼（用 Google 註冊的）都回同一個錯誤，不透露帳號名稱存不存在
    if (!row || row.password_hash === null || !(await verifySecret(body.password, row.password_hash))) {
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
    /** 換了信箱（不分大小寫比較）：要重新驗證、寄驗證信到新的信箱 */
    let changed = false;
    if (body.email !== undefined) {
      const mail = checkEmail(body.email);
      if (!mail.ok) throw new ApiError(400, 'bad_email', mail.reason);
      if (mail.email.toLowerCase() !== (row.email ?? '').toLowerCase()) {
        if ((await db.query('SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2', [mail.email, row.id])).length) throw EMAIL_TAKEN();
        changed = true;
        verified = false;
      }
      // 同一個信箱只改大小寫：照存，不用重新驗證
      email = mail.email;
    }
    let rows: UserRow[];
    try {
      rows = await db.query<UserRow>('UPDATE users SET is_parent = $2, is_teacher = $3, email = $4, email_verified = $5 WHERE id = $1 RETURNING *', [row.id, parent, teacher, email, verified]);
    } catch (err) {
      // 同時有人註冊或改成同一個 email
      if ((err as { code?: string }).code === '23505') throw EMAIL_TAKEN();
      throw err;
    }
    const user = rows[0];
    let verifyMail: MailStatus | undefined;
    if (changed && user.email) verifyMail = await sendVerifyMail(deps, { id: user.id, username: user.username, email: user.email }, body.appUrl);
    return c.json<UserPatchResponse>({ user: userInfo(user), ...(verifyMail ? { verifyMail } : {}) });
  });

  app.post('/api/users/me/password', async (c) => {
    const { row, hash } = await loadMe(c);
    const body = await readBody(c, passwordChangeRequest);
    const pwProblem = checkPassword(body.next);
    if (pwProblem) throw new ApiError(400, 'bad_password', pwProblem);
    // 目前的密碼也算登入嘗試：猜錯太多次一樣會鎖；沒有密碼的帳號（用 Google 註冊的）用綁定的 Google 確認身分
    await reauth(row, { password: body.current, idToken: body.idToken }, '目前的密碼不對');
    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [row.id, await hashSecret(body.next)]);
    // 舊密碼可能外流：其他裝置的登入一律失效，這台保留
    await db.query('DELETE FROM tokens WHERE user_id = $1 AND token_hash <> $2', [row.id, hash]);
    return c.json({ ok: true });
  });

  /**
   * 刪除自己的帳號（docs/plans/accounts.md 第 6 節）：要再輸入一次密碼；名下的雲端角色一併刪除，在班級裡的先和班上結清禮物。
   * 還有班級時不能刪：刪掉老師帳號會連帶刪掉班級與班上所有角色（包括別人家長名下的）。
   * 通知在交易結束後才送，而且不送給被刪的角色（那些帳號已經不存在）。
   */
  app.delete('/api/users/me', async (c) => {
    const { row } = await loadMe(c);
    const body = await readBody(c, deleteAccountRequest);
    await reauth(row, body, '密碼不對');
    const classes = await db.query('SELECT 1 FROM rooms WHERE owner_id = $1 LIMIT 1', [row.id]);
    if (classes.length) throw new ApiError(409, 'has_classes', '這個帳號還有班級，要先移除班級才能刪除帳號（不然班上同學的角色會跟著不見）');
    const events: Events = { profiles: [], gifts: [] };
    const kidIds = await db.transaction(async (tx) => {
      // 名下所有角色和所有班級結清禮物（沒有班級的角色沒有待收的禮物，結清不做事；多班級起不看舊的 room_code 欄位）
      const kids = await tx.query<{ id: string }>('SELECT id FROM accounts WHERE parent_id = $1', [row.id]);
      await settlePendingGifts(tx, kids.map((k) => k.id), now(), events, { includeOutgoing: true });
      // 名下的角色、權杖跟著刪（外鍵 CASCADE）
      await tx.query('DELETE FROM users WHERE id = $1', [row.id]);
      return kids.map((k) => k.id);
    });
    emitExcept(deps, events, new Set(kidIds));
    for (const id of kidIds) deps.onKick?.(id, KID_DELETED_REASON);
    return c.json({ ok: true });
  });
}
