/**
 * 班級伺服器的 HTTP 路由（Hono）。createApp 不開網路埠，測試直接用 app.request() 呼叫。
 * 介面規格見 docs/plans/online.md 第 10 節。
 */
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import type { Db, Queryable } from './db';
import { ApiError, readBody, type Identity } from './http';
import { LoginLimiter, RateLimiter, checkNickname, hashSecret, newAccountId, newRoomCode, newToken, tokenHash, verifySecret } from './auth';
import { maskEmail, type GoogleConfig, type GoogleIdentity } from './google';
import { lookupToken } from './tokens';
import { emitGiftEvents, registerGiftRoutes, removeMemberWithRefunds } from './gifts';
import { registerStatic } from './static';
import type { RoomFlags } from '../src/online/realtime';
import { applyOp, parseOp } from '../src/online/ops';
import {
  createRoomRequest,
  googleTokenRequest,
  joinRequest,
  loginRequest,
  opsRequest,
  resetPinRequest,
  roomPatchRequest,
  teacherLoginRequest,
  type GoogleKidsResponse,
  type GoogleLinksResponse,
  type GoogleRoomsResponse,
  type MemberSummary,
  type OpsResponse,
  type RoomSettings,
  type ServerConfig,
  type SessionResponse,
} from '../src/online/protocol';
import { addProfile, createEmptySave, parseProfile, type Profile } from '../src/store/save';

/** createApp 的設定 */
export interface AppOptions {
  db: Db;
  /** 現在時間（測試可以換成假的時鐘） */
  now?: () => Date;
  /** 允許跨網域呼叫的前端網址 */
  allowedOrigins?: string[];
  /** 同一個 IP 每分鐘最多幾次登入類請求（建立房間、加入、登入） */
  floodLimit?: number;
  /** 某個帳號目前是否在線上（P2 的即時連線提供；沒有時一律 false） */
  isOnline?: (accountId: string) => boolean;
  /** 某個帳號的存檔在伺服器端改變了：即時中樞更新別人看到的外觀，並通知他自己的裝置同步（帶上新的存檔，中樞不必再查資料庫） */
  onProfileChanged?: (accountId: string, rev: number, profile: Profile) => void;
  /** 老師改了房間的聊天、送禮開關 */
  onRoomChanged?: (roomCode: string, flags: RoomFlags) => void;
  /** 某位孩子要被踢下線（老師移除成員或重設密碼），reason 會顯示給孩子 */
  onKick?: (accountId: string, reason: string) => void;
  /** 某位孩子的禮物狀態有變（收到新禮物，或送出的禮物有結果）：即時中樞通知他的裝置重新讀取 */
  onGift?: (accountId: string) => void;
  /** Google 快速登入（備選）；沒有時 Google 相關 API 回 404 */
  google?: GoogleConfig | null;
  /** 前端建置產物（dist/）的目錄：設定時伺服器同時提供前端（Zeabur 的 Docker 映像檔）；沒設定時不提供 */
  staticDir?: string;
}

/** 權杖有效天數 */
const TOKEN_DAYS = 180;
/** 房間名稱最多幾個字 */
const ROOM_NAME_MAX = 20;

/** 資料表 accounts 的一列 */
interface AccountRow {
  id: string;
  room_code: string;
  nickname: string;
  pin_hash: string;
  profile: Profile;
  rev: number;
  created_at: Date;
  last_seen: Date;
}

/** 資料表 rooms 的一列 */
interface RoomRow {
  code: string;
  name: string;
  teacher_hash: string;
  join_open: boolean;
  chat_open: boolean;
  gifts_open: boolean;
}

/**
 * 請求來源的 IP：Zeabur 前面有反向代理，取 X-Forwarded-For 的最後一個（代理加上的）；
 * 直接連線時用 socket 位址。只用來擋大量請求，不用來鎖帳號。
 */
function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',').pop()!.trim();
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'unknown';
}

/** 房間設定的回應格式 */
function roomSettings(r: RoomRow): RoomSettings {
  return { code: r.code, name: r.name, joinOpen: r.join_open, chatOpen: r.chat_open, giftsOpen: r.gifts_open };
}

/** 建立 Hono app */
export function createApp(opts: AppOptions) {
  const { db } = opts;
  const now = opts.now ?? (() => new Date());
  const nowMs = () => now().getTime();
  const limiter = new LoginLimiter(nowMs);
  const flood = new RateLimiter(nowMs, opts.floodLimit ?? 300);
  const allowed = new Set(opts.allowedOrigins ?? []);
  const isOnline = opts.isOnline ?? (() => false);

  /** 擋同一個 IP 的大量請求 */
  const checkFlood = (c: Context) => {
    if (!flood.hit(clientIp(c))) throw new ApiError(429, 'too_many', '請求太頻繁，請稍後再試');
  };

  /** 發一張權杖並存進資料庫 */
  const issueToken = async (q: Queryable, kind: 'kid' | 'teacher', roomCode: string, accountId: string | null) => {
    const token = newToken();
    const expires = new Date(nowMs() + TOKEN_DAYS * 24 * 3600 * 1000).toISOString();
    await q.query('INSERT INTO tokens (token_hash, kind, room_code, account_id, expires_at) VALUES ($1, $2, $3, $4, $5::timestamptz)', [tokenHash(token), kind, roomCode, accountId, expires]);
    return token;
  };

  /** 驗證 Authorization 標頭的權杖，種類不符或過期回 401 */
  const authenticate = async (c: Context, kind: 'kid' | 'teacher'): Promise<Identity> => {
    const m = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '');
    if (!m) throw new ApiError(401, 'unauthorized', '請重新登入');
    const found = await lookupToken(db, m[1], now());
    if (!found || found.kind !== kind) throw new ApiError(401, 'unauthorized', '請重新登入');
    return { roomCode: found.roomCode, accountId: found.accountId, hash: found.hash };
  };

  /** 讀房間；不存在回 404 */
  const loadRoom = async (q: Queryable, code: string): Promise<RoomRow> => {
    const room = (await q.query<RoomRow>('SELECT * FROM rooms WHERE code = $1', [code]))[0];
    if (!room) throw new ApiError(404, 'no_room', '找不到這個房間代碼');
    return room;
  };

  /** 加入或登入成功的回應 */
  const sessionResponse = async (account: AccountRow, room: RoomRow): Promise<SessionResponse> => ({
    token: await issueToken(db, 'kid', room.code, account.id),
    account: { id: account.id, nickname: account.nickname },
    profile: account.profile,
    rev: account.rev,
    room: { code: room.code, name: room.name },
  });

  /** 鎖定中就回 423 */
  const assertNotLocked = (key: string) => {
    const ms = limiter.lockedFor(key);
    if (ms > 0) throw new ApiError(423, 'locked', '錯太多次了，請過幾分鐘再試', Math.ceil(ms / 1000));
  };

  /** 驗證請求裡的 Google ID token；伺服器沒開 Google 登入回 404，驗證失敗回 401 */
  const verifyGoogle = async (c: Context): Promise<GoogleIdentity> => {
    if (!opts.google) throw new ApiError(404, 'google_disabled', '班級伺服器沒有開啟 Google 登入');
    const body = await readBody(c, googleTokenRequest);
    try {
      return await opts.google.verify(body.idToken);
    } catch {
      throw new ApiError(401, 'bad_google', '無法確認 Google 帳號，請再試一次');
    }
  };

  /** 顯示用的 email（遮罩；沒有 email 的帳號顯示說明文字） */
  const shownEmail = (email: string | null) => (email ? maskEmail(email) : '（沒有 email 的 Google 帳號）');

  /** 某位孩子綁定的 Google 帳號（遮罩後） */
  const kidGoogle = async (accountId: string): Promise<string[]> =>
    (await db.query<{ email: string | null }>('SELECT email FROM google_links WHERE account_id = $1 ORDER BY linked_at', [accountId])).map((r) => shownEmail(r.email));

  /** 某個房間綁定的老師 Google 帳號（遮罩後） */
  const roomGoogle = async (code: string): Promise<string[]> =>
    (await db.query<{ email: string | null }>('SELECT email FROM teacher_google_links WHERE room_code = $1 ORDER BY linked_at', [code])).map((r) => shownEmail(r.email));

  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: (origin) => (allowed.has(origin) ? origin : null),
      allowHeaders: ['content-type', 'authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024, onError: () => Promise.reject(new ApiError(413, 'too_large', '資料太大')) }));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.message, code: err.code, ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}) }, err.status);
    }
    console.error(err);
    return c.json({ error: '伺服器出了點問題，請稍後再試', code: 'internal' }, 500);
  });

  app.get('/healthz', (c) => c.json({ ok: true }));

  app.get('/api/config', (c) => c.json<ServerConfig>({ googleClientId: opts.google?.clientId ?? null }));

  // ---------- 老師 ----------

  app.post('/api/rooms', async (c) => {
    checkFlood(c);
    const body = await readBody(c, createRoomRequest);
    const name = body.name.trim();
    if (!name || [...name].length > ROOM_NAME_MAX) throw new ApiError(400, 'bad_name', `房間名稱要 1～${ROOM_NAME_MAX} 個字`);
    const teacherHash = await hashSecret(body.password);
    // 代碼撞到既有房間就重抽
    for (let i = 0; i < 20; i++) {
      const code = newRoomCode();
      const rows = await db.query<{ code: string }>(
        'INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT (code) DO NOTHING RETURNING code',
        [code, name, teacherHash, now().toISOString()],
      );
      if (rows.length) return c.json({ code, token: await issueToken(db, 'teacher', code, null) });
    }
    throw new Error('房間代碼產生失敗');
  });

  app.post('/api/teacher/login', async (c) => {
    checkFlood(c);
    const body = await readBody(c, teacherLoginRequest);
    const key = `teacher:${body.code}`;
    assertNotLocked(key);
    const room = (await db.query<RoomRow>('SELECT * FROM rooms WHERE code = $1', [body.code]))[0];
    if (!room || !(await verifySecret(body.password, room.teacher_hash))) {
      limiter.fail(key);
      throw new ApiError(401, 'bad_login', '房間代碼或管理密碼不對');
    }
    limiter.reset(key);
    return c.json({ token: await issueToken(db, 'teacher', room.code, null), room: roomSettings(room) });
  });

  app.get('/api/teacher/room', async (c) => {
    const who = await authenticate(c, 'teacher');
    const room = await loadRoom(db, who.roomCode);
    const rows = await db.query<AccountRow>('SELECT * FROM accounts WHERE room_code = $1 ORDER BY created_at, nickname', [room.code]);
    const members: MemberSummary[] = rows.map((a) => ({
      id: a.id,
      nickname: a.nickname,
      coins: a.profile.coins,
      stars: Object.values(a.profile.bestStars).reduce((s, v) => s + v, 0),
      wrongCount: Object.keys(a.profile.wrongBook).length,
      sessions: a.profile.history.length,
      createdAt: new Date(a.created_at).toISOString(),
      lastSeen: new Date(a.last_seen).toISOString(),
      online: isOnline(a.id),
    }));
    return c.json({ room: roomSettings(room), members, google: await roomGoogle(room.code) });
  });

  app.patch('/api/teacher/room', async (c) => {
    const who = await authenticate(c, 'teacher');
    const body = await readBody(c, roomPatchRequest);
    const rows = await db.query<RoomRow>(
      `UPDATE rooms SET join_open = COALESCE($2, join_open), chat_open = COALESCE($3, chat_open), gifts_open = COALESCE($4, gifts_open)
       WHERE code = $1 RETURNING *`,
      [who.roomCode, body.joinOpen ?? null, body.chatOpen ?? null, body.giftsOpen ?? null],
    );
    opts.onRoomChanged?.(who.roomCode, { chatOpen: rows[0].chat_open, giftsOpen: rows[0].gifts_open });
    return c.json({ room: roomSettings(rows[0]) });
  });

  app.post('/api/teacher/members/:id/pin', async (c) => {
    const who = await authenticate(c, 'teacher');
    const body = await readBody(c, resetPinRequest);
    const pinHash = await hashSecret(body.pin);
    const rows = await db.query<{ nickname_key: string }>('UPDATE accounts SET pin_hash = $3 WHERE id = $1 AND room_code = $2 RETURNING nickname_key', [
      c.req.param('id'),
      who.roomCode,
      pinHash,
    ]);
    if (!rows.length) throw new ApiError(404, 'no_member', '找不到這位成員');
    // 舊密碼可能被別人知道了：那位孩子其他裝置的登入一併失效
    await db.query('DELETE FROM tokens WHERE account_id = $1', [c.req.param('id')]);
    limiter.reset(`kid:${who.roomCode}:${rows[0].nickname_key}`);
    opts.onKick?.(c.req.param('id'), '老師重設了你的密碼，請用新密碼重新登入');
    return c.json({ ok: true });
  });

  app.delete('/api/teacher/members/:id', async (c) => {
    const who = await authenticate(c, 'teacher');
    // 別人送給他、還沒收的禮物要先退款，和刪帳號在同一個交易裡
    const events = await removeMemberWithRefunds(db, c.req.param('id'), who.roomCode, now());
    if (!events) throw new ApiError(404, 'no_member', '找不到這位成員');
    emitGiftEvents(opts, events);
    opts.onKick?.(c.req.param('id'), '老師把你移出房間了');
    return c.json({ ok: true });
  });

  app.post('/api/teacher/google/link', async (c) => {
    const who = await authenticate(c, 'teacher');
    const g = await verifyGoogle(c);
    await db.query(
      `INSERT INTO teacher_google_links (google_sub, room_code, email, linked_at) VALUES ($1, $2, $3, $4::timestamptz)
       ON CONFLICT (google_sub, room_code) DO UPDATE SET email = EXCLUDED.email, linked_at = EXCLUDED.linked_at`,
      [g.sub, who.roomCode, g.email, now().toISOString()],
    );
    return c.json<GoogleLinksResponse>({ google: await roomGoogle(who.roomCode) });
  });

  app.delete('/api/teacher/google/link', async (c) => {
    const who = await authenticate(c, 'teacher');
    await db.query('DELETE FROM teacher_google_links WHERE room_code = $1', [who.roomCode]);
    return c.json<GoogleLinksResponse>({ google: [] });
  });

  app.post('/api/teacher/google/login', async (c) => {
    checkFlood(c);
    const g = await verifyGoogle(c);
    const rooms = await db.query<{ code: string; name: string }>(
      'SELECT r.code, r.name FROM rooms r JOIN teacher_google_links t ON t.room_code = r.code WHERE t.google_sub = $1 ORDER BY r.created_at, r.code',
      [g.sub],
    );
    if (!rooms.length) throw new ApiError(404, 'google_not_linked', '這個 Google 帳號還沒有綁定任何房間。請先用房間代碼和管理密碼登入，再到管理頁綁定 Google。');
    const result: GoogleRoomsResponse = { rooms: [] };
    for (const r of rooms) result.rooms.push({ code: r.code, name: r.name, token: await issueToken(db, 'teacher', r.code, null) });
    return c.json(result);
  });

  // ---------- 孩子 ----------

  app.post('/api/join', async (c) => {
    checkFlood(c);
    const body = await readBody(c, joinRequest);
    const room = await loadRoom(db, body.code);
    if (!room.join_open) throw new ApiError(403, 'join_closed', '這個房間目前不開放加入，請問老師');
    const nick = checkNickname(body.nickname);
    if (!nick.ok) throw new ApiError(400, 'bad_nickname', nick.reason);

    let profile: Profile;
    if (body.profile !== undefined) {
      const parsed = parseProfile(body.profile);
      if (!parsed) throw new ApiError(400, 'bad_profile', '角色資料格式不符');
      // 本機的雲端標記不存到伺服器；名字一律用暱稱
      const { cloud: _local, ...rest } = parsed;
      profile = { ...rest, name: nick.nickname };
    } else {
      profile = addProfile(createEmptySave(), { name: nick.nickname, avatar: body.avatar! }, now()).profiles[0];
    }

    const taken = await db.query('SELECT 1 FROM accounts WHERE room_code = $1 AND nickname_key = $2', [room.code, nick.key]);
    if (taken.length) throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
    const id = newAccountId();
    const t = now().toISOString();
    let rows: AccountRow[];
    try {
      rows = await db.query<AccountRow>(
        `INSERT INTO accounts (id, room_code, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 1, $7::timestamptz, $7::timestamptz) RETURNING *`,
        [id, room.code, nick.nickname, nick.key, await hashSecret(body.pin), JSON.stringify(profile), t],
      );
    } catch (err) {
      // 兩個人同時用同一個暱稱加入：唯一鍵衝突
      if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
      throw err;
    }
    return c.json(await sessionResponse(rows[0], room));
  });

  app.post('/api/login', async (c) => {
    checkFlood(c);
    const body = await readBody(c, loginRequest);
    const nick = checkNickname(body.nickname);
    const key = `kid:${body.code}:${nick.ok ? nick.key : body.nickname}`;
    assertNotLocked(key);
    const account = nick.ok
      ? (await db.query<AccountRow>('SELECT * FROM accounts WHERE room_code = $1 AND nickname_key = $2', [body.code, nick.key]))[0]
      : undefined;
    if (!account || !(await verifySecret(body.pin, account.pin_hash))) {
      limiter.fail(key);
      throw new ApiError(401, 'bad_login', '房間代碼、暱稱或密碼不對');
    }
    limiter.reset(key);
    await db.query('UPDATE accounts SET last_seen = $2::timestamptz WHERE id = $1', [account.id, now().toISOString()]);
    return c.json(await sessionResponse(account, await loadRoom(db, account.room_code)));
  });

  app.post('/api/logout', async (c) => {
    const m = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '');
    if (m) await db.query('DELETE FROM tokens WHERE token_hash = $1', [tokenHash(m[1])]);
    return c.json({ ok: true });
  });

  app.get('/api/me', async (c) => {
    const who = await authenticate(c, 'kid');
    const account = (await db.query<AccountRow>('SELECT * FROM accounts WHERE id = $1', [who.accountId]))[0];
    if (!account) throw new ApiError(401, 'unauthorized', '請重新登入');
    const room = await loadRoom(db, account.room_code);
    return c.json({
      account: { id: account.id, nickname: account.nickname },
      profile: account.profile,
      rev: account.rev,
      room: { code: room.code, name: room.name },
      google: await kidGoogle(account.id),
    });
  });

  // ---------- 家長的 Google 快速登入 ----------

  app.post('/api/google/link', async (c) => {
    const who = await authenticate(c, 'kid');
    const g = await verifyGoogle(c);
    await db.query(
      `INSERT INTO google_links (google_sub, account_id, email, linked_at) VALUES ($1, $2, $3, $4::timestamptz)
       ON CONFLICT (google_sub, account_id) DO UPDATE SET email = EXCLUDED.email, linked_at = EXCLUDED.linked_at`,
      [g.sub, who.accountId, g.email, now().toISOString()],
    );
    return c.json<GoogleLinksResponse>({ google: await kidGoogle(who.accountId!) });
  });

  app.delete('/api/google/link', async (c) => {
    const who = await authenticate(c, 'kid');
    await db.query('DELETE FROM google_links WHERE account_id = $1', [who.accountId]);
    return c.json<GoogleLinksResponse>({ google: [] });
  });

  app.post('/api/google/login', async (c) => {
    checkFlood(c);
    const g = await verifyGoogle(c);
    const accounts = await db.query<AccountRow>(
      'SELECT a.* FROM accounts a JOIN google_links l ON l.account_id = a.id WHERE l.google_sub = $1 ORDER BY a.created_at, a.nickname',
      [g.sub],
    );
    if (!accounts.length) {
      throw new ApiError(404, 'google_not_linked', '這個 Google 帳號還沒有綁定任何孩子。請先用房間代碼、暱稱和密碼登入，再到家長專區的「班級帳號」綁定 Google。');
    }
    const result: GoogleKidsResponse = { kids: [] };
    for (const a of accounts) {
      await db.query('UPDATE accounts SET last_seen = $2::timestamptz WHERE id = $1', [a.id, now().toISOString()]);
      result.kids.push(await sessionResponse(a, await loadRoom(db, a.room_code)));
    }
    return c.json(result);
  });

  app.post('/api/ops', async (c) => {
    const who = await authenticate(c, 'kid');
    const body = await readBody(c, opsRequest);
    const t = now();
    const result = await db.transaction<OpsResponse & { changed: boolean }>(async (tx) => {
      // 鎖住這個帳號的那一列，同時來的請求排隊套用
      const row = (await tx.query<AccountRow>('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [who.accountId]))[0];
      if (!row) throw new ApiError(401, 'unauthorized', '請重新登入');
      let profile = row.profile;
      let changed = false;
      const rejected: OpsResponse['rejected'] = [];
      for (const raw of body.ops) {
        const op = parseOp(raw);
        if (!op) {
          const id = (raw as { id?: unknown } | null)?.id;
          if (typeof id === 'string') rejected.push({ id, reason: '格式不符' });
          continue;
        }
        // 套用過的（含被拒絕的）不再套用；被拒絕的照樣回報拒絕，裝置重送也不會之後才成功
        const seen = (await tx.query<{ rejected_reason: string | null }>('SELECT rejected_reason FROM applied_ops WHERE account_id = $1 AND op_id = $2', [row.id, op.id]))[0];
        if (seen) {
          if (seen.rejected_reason) rejected.push({ id: op.id, reason: seen.rejected_reason });
          continue;
        }
        const r = applyOp(profile, op, t);
        if (r.ok) {
          profile = r.profile;
          changed = true;
        } else {
          rejected.push({ id: op.id, reason: r.reason });
        }
        await tx.query('INSERT INTO applied_ops (account_id, op_id, rejected_reason, applied_at) VALUES ($1, $2, $3, $4::timestamptz)', [
          row.id,
          op.id,
          r.ok ? null : r.reason,
          t.toISOString(),
        ]);
      }
      // 存檔有變才升版本號；沒變（空批次或重送）只更新最後上線時間
      const updated = changed
        ? await tx.query<{ rev: number }>('UPDATE accounts SET profile = $2::jsonb, rev = rev + 1, last_seen = $3::timestamptz WHERE id = $1 RETURNING rev', [
            row.id,
            JSON.stringify(profile),
            t.toISOString(),
          ])
        : await tx.query<{ rev: number }>('UPDATE accounts SET last_seen = $2::timestamptz WHERE id = $1 RETURNING rev', [row.id, t.toISOString()]);
      return { profile, rev: updated[0].rev, rejected, changed };
    });
    if (result.changed) opts.onProfileChanged?.(who.accountId!, result.rev, result.profile);
    const { changed: _changed, ...response } = result;
    return c.json(response);
  });

  // ---------- 送禮物（P3） ----------
  registerGiftRoutes(app, { db, now, authenticate, isOnline, onProfileChanged: opts.onProfileChanged, onGift: opts.onGift });

  // ---------- 前端靜態檔（最後註冊，不蓋掉上面的路由） ----------
  if (opts.staticDir) registerStatic(app, opts.staticDir);

  return app;
}
