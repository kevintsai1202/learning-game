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
import type { GoogleConfig, GoogleIdentity } from './google';
import { lookupToken, type TokenVia } from './tokens';
import { emitGiftEvents, registerGiftRoutes, removeMemberWithRefunds } from './gifts';
import { registerStatic } from './static';
import { registerUserRoutes } from './users';
import { registerParentRoutes } from './parents';
import { registerEmailRoutes } from './email';
import { registerUserGoogleRoutes } from './userGoogle';
import { createMailer, type Mailer } from './mail';
import type { RoomFlags } from '../src/online/realtime';
import { applyOp, parseOp } from '../src/online/ops';
import {
  attachClassRequest,
  createClassRequest,
  joinRequest,
  loginRequest,
  opsRequest,
  resetPinRequest,
  roomPatchRequest,
  type AttachResponse,
  type MemberSummary,
  type OpsResponse,
  type RoomInfo,
  type RoomSettings,
  type ServerConfig,
  type SessionResponse,
  type TeacherRoomResponse,
  type TeacherRoomsResponse,
} from '../src/online/protocol';
import { addProfile, createEmptySave, parseProfile, type CurriculumChoice, type Profile } from '../src/store/save';

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
  /** 某個帳號在哪裡（島嶼互訪 I1，即時中樞提供；老師的成員表用）：哪一種島＋建築，離線是 null */
  whereOf?: (accountId: string) => MemberSummary['where'];
  /** 某個帳號的存檔在伺服器端改變了：即時中樞更新別人看到的外觀，並通知他自己的裝置同步（帶上新的存檔，中樞不必再查資料庫） */
  onProfileChanged?: (accountId: string, rev: number, profile: Profile) => void;
  /** 老師改了房間的聊天、送禮開關 */
  onRoomChanged?: (roomCode: string, flags: RoomFlags) => void;
  /** 老師改了班級內容（目前是班級教材版本）：通知班上線上的孩子重新同步 */
  onRoomContent?: (roomCode: string) => void;
  /** 某個帳號加入了班級（掃 QR code 由家長加入、或帶孩子權杖加入）：即時中樞讓他重新上線，換成新的班級與朋友 */
  onClassChanged?: (accountId: string) => void;
  /** 某位孩子要被踢下線（老師移除成員或重設密碼），reason 會顯示給孩子；給了 via 就只踢那種權杖來源的連線 */
  onKick?: (accountId: string, reason: string, via?: TokenVia) => void;
  /** 某位孩子的禮物狀態有變（收到新禮物，或送出的禮物有結果）：即時中樞通知他的裝置重新讀取 */
  onGift?: (accountId: string) => void;
  /** Google 快速登入（備選）；沒有時 Google 相關 API 回 404 */
  google?: GoogleConfig | null;
  /** 寄信（驗證 email、忘記密碼；server/mail.ts 的 createMailer）；沒有時停用寄信 */
  mailer?: Mailer;
  /** 前端建置產物（dist/）的目錄：設定時伺服器同時提供前端（Zeabur 的 Docker 映像檔）；沒設定時不提供 */
  staticDir?: string;
}

/** 權杖有效天數 */
const TOKEN_DAYS = 180;
/** 有家長帳號的角色被老師移出班級時，孩子裝置上顯示的原因（進度留在家長名下） */
export const LEFT_CLASS_REASON = '老師把你移出班級了，進度都還在';
/** 房間名稱最多幾個字 */
const ROOM_NAME_MAX = 20;

/** 資料表 accounts 的一列 */
export interface AccountRow {
  id: string;
  /** 目前的班級；家長名下、還沒加入班級的雲端角色是 null */
  room_code: string | null;
  /** 家長帳號；純班級角色（孩子用代碼自己加入的）是 null */
  parent_id: string | null;
  nickname: string;
  /** 孩子密碼；沒加入班級時是 null */
  pin_hash: string | null;
  profile: Profile;
  rev: number;
  created_at: Date;
  last_seen: Date;
}

/** 資料表 rooms 的一列 */
interface RoomRow {
  code: string;
  name: string;
  /** 改版前用管理密碼建的房間才有（docs/plans/accounts.md） */
  teacher_hash: string | null;
  /** 擁有這個班級的老師帳號（改版前的房間是 null） */
  owner_id: string | null;
  join_open: boolean;
  chat_open: boolean;
  gifts_open: boolean;
  /** 老師設定的班級教材版本；null 是沒有統一（第 8 版新增） */
  curriculum: CurriculumChoice | null;
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

/** 回應給孩子裝置的班級資訊（代碼、名稱、班級教材版本） */
function roomInfo(r: RoomRow): RoomInfo {
  return { code: r.code, name: r.name, curriculum: r.curriculum ?? null };
}

/** 房間設定的回應格式 */
function roomSettings(r: RoomRow): RoomSettings {
  return { ...roomInfo(r), joinOpen: r.join_open, chatOpen: r.chat_open, giftsOpen: r.gifts_open };
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
  const mailer = opts.mailer ?? createMailer({}).mailer;

  /** 擋同一個 IP 的大量請求 */
  const checkFlood = (c: Context) => {
    if (!flood.hit(clientIp(c))) throw new ApiError(429, 'too_many', '請求太頻繁，請稍後再試');
  };

  /** 發一張權杖並存進資料庫：孩子的權杖屬於某個房間的帳號；大人（家長、老師）的權杖屬於大人帳號 */
  const issueToken = async (
    q: Queryable,
    who: { kind: 'kid'; roomCode: string | null; accountId: string; via: TokenVia } | { kind: 'user'; userId: string },
  ) => {
    const token = newToken();
    const expires = new Date(nowMs() + TOKEN_DAYS * 24 * 3600 * 1000).toISOString();
    await q.query('INSERT INTO tokens (token_hash, kind, room_code, account_id, user_id, via, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)', [
      tokenHash(token),
      who.kind,
      who.kind === 'kid' ? who.roomCode : null,
      who.kind === 'kid' ? who.accountId : null,
      who.kind === 'user' ? who.userId : null,
      who.kind === 'kid' ? who.via : 'class',
      expires,
    ]);
    return token;
  };

  /** 讀 Authorization 標頭的權杖並查詢；沒有、過期或停用的種類回 401 */
  const bearer = async (c: Context) => {
    const m = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '');
    if (!m) throw new ApiError(401, 'unauthorized', '請重新登入');
    const found = await lookupToken(db, m[1], now());
    if (!found) throw new ApiError(401, 'unauthorized', '請重新登入');
    return found;
  };

  /** 驗證孩子的權杖，而且這個角色要在班級裡（送禮、同學名單等班級功能用）；沒有班級回 403，大人權杖回 401 */
  const authenticate = async (c: Context, _kind: 'kid' = 'kid'): Promise<Identity> => {
    const found = await bearer(c);
    if (found.kind !== 'kid') throw new ApiError(401, 'unauthorized', '請重新登入');
    if (found.roomCode === null) throw new ApiError(403, 'no_class', '還沒加入班級');
    return { roomCode: found.roomCode, accountId: found.accountId, hash: found.hash };
  };

  /** 驗證孩子的權杖，班級可以是空的（同步、讀存檔、帶權杖加入班級用） */
  const authenticateKidAny = async (c: Context) => {
    const found = await bearer(c);
    if (found.kind !== 'kid') throw new ApiError(401, 'unauthorized', '請重新登入');
    return found;
  };

  /** 驗證大人（家長、老師）的權杖（孩子權杖回 401） */
  const authenticateUser = async (c: Context): Promise<{ userId: string; hash: string }> => {
    const found = await bearer(c);
    if (found.kind !== 'user') throw new ApiError(401, 'unauthorized', '請重新登入');
    return { userId: found.userId, hash: found.hash };
  };

  /** 班級代碼 → 回應用的班級資訊；沒有班級回傳 null */
  const roomInfoOf = async (code: string | null): Promise<RoomInfo | null> => {
    if (!code) return null;
    const room = (await db.query<RoomRow>('SELECT * FROM rooms WHERE code = $1', [code]))[0];
    return room ? roomInfo(room) : null;
  };

  /** 讀房間；不存在回 404 */
  const loadRoom = async (q: Queryable, code: string): Promise<RoomRow> => {
    const room = (await q.query<RoomRow>('SELECT * FROM rooms WHERE code = $1', [code]))[0];
    if (!room) throw new ApiError(404, 'no_room', '找不到這個房間代碼');
    return room;
  };

  /** 加入、登入、家長上傳或「在這台裝置玩」成功的回應：發一張孩子權杖（via 記來源） */
  const sessionResponse = async (account: AccountRow, room: RoomRow | null, via: TokenVia): Promise<SessionResponse> => ({
    token: await issueToken(db, { kind: 'kid', roomCode: room?.code ?? null, accountId: account.id, via }),
    account: { id: account.id, nickname: account.nickname },
    profile: account.profile,
    rev: account.rev,
    room: room ? roomInfo(room) : null,
  });

  /** 鎖定中就回 423 */
  const assertNotLocked = (key: string) => {
    const ms = limiter.lockedFor(key);
    if (ms > 0) throw new ApiError(423, 'locked', '錯太多次了，請過幾分鐘再試', Math.ceil(ms / 1000));
  };

  /** 驗證 Google ID token；伺服器沒開 Google 登入回 404，驗證失敗回 401 */
  const verifyGoogleToken = async (idToken: string): Promise<GoogleIdentity> => {
    if (!opts.google) throw new ApiError(404, 'google_disabled', '班級伺服器沒有開啟 Google 登入');
    try {
      return await opts.google.verify(idToken);
    } catch {
      throw new ApiError(401, 'bad_google', '無法確認 Google 帳號，請再試一次');
    }
  };

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

  // ---------- 大人帳號（家長、老師） ----------
  registerUserRoutes(app, {
    db,
    now,
    limiter,
    checkFlood,
    assertNotLocked,
    issueUserToken: (userId) => issueToken(db, { kind: 'user', userId }),
    authenticateUser,
    onKick: opts.onKick,
    onProfileChanged: opts.onProfileChanged,
    onGift: opts.onGift,
    mailer,
    allowedOrigins: allowed,
    verifyGoogleToken,
  });

  // ---------- Email 驗證與忘記密碼（A3） ----------
  registerEmailRoutes(app, { db, now, mailer, allowedOrigins: allowed, limiter, checkFlood, authenticateUser });

  // ---------- Google 快速登入綁大人帳號（A4） ----------
  registerUserGoogleRoutes(app, { db, now, checkFlood, verifyGoogleToken, issueUserToken: (userId) => issueToken(db, { kind: 'user', userId }), authenticateUser });

  // ---------- 家長的雲端角色（A2） ----------
  registerParentRoutes(app, {
    db,
    now,
    authenticateUser,
    session: async (account, roomCode) => sessionResponse(account, roomCode ? await loadRoom(db, roomCode) : null, 'parent'),
    onKick: opts.onKick,
    onProfileChanged: opts.onProfileChanged,
    onGift: opts.onGift,
    checkFlood: (c) => checkFlood(c),
    // 包一層：joinExisting 定義在後面，請求進來時才呼叫
    joinClass: (accountId, code, nickname) => joinExisting(accountId, code, nickname, null),
    loadRoom: (code) => loadRoom(db, code),
  });

  // ---------- 老師（大人帳號＋老師身分；一個老師可以有好幾個班級，只能管自己的） ----------

  /** 驗證老師：大人權杖＋老師身分；只有家長身分回 403 */
  const authenticateTeacher = async (c: Context): Promise<string> => {
    const { userId } = await authenticateUser(c);
    const row = (await db.query<{ is_teacher: boolean }>('SELECT is_teacher FROM users WHERE id = $1', [userId]))[0];
    if (!row) throw new ApiError(401, 'unauthorized', '請重新登入');
    if (!row.is_teacher) throw new ApiError(403, 'not_teacher', '這個帳號沒有老師身分，請先在帳號設定加上「老師」');
    return userId;
  };

  /** 讀老師自己的班級；別人的班級和不存在的代碼一樣回 404（不透露代碼存在） */
  const loadOwnRoom = async (q: Queryable, code: string, ownerId: string): Promise<RoomRow> => {
    const room = (await q.query<RoomRow>('SELECT * FROM rooms WHERE code = $1 AND owner_id = $2', [code, ownerId]))[0];
    if (!room) throw new ApiError(404, 'no_room', '找不到這個班級');
    return room;
  };

  app.get('/api/teacher/rooms', async (c) => {
    const owner = await authenticateTeacher(c);
    const rows = await db.query<RoomRow & { members: number }>(
      `SELECT r.*, (SELECT count(*)::int FROM accounts a WHERE a.room_code = r.code) AS members
       FROM rooms r WHERE r.owner_id = $1 ORDER BY r.created_at, r.code`,
      [owner],
    );
    return c.json<TeacherRoomsResponse>({ rooms: rows.map((r) => ({ ...roomSettings(r), members: r.members })) });
  });

  app.post('/api/teacher/rooms', async (c) => {
    const owner = await authenticateTeacher(c);
    const body = await readBody(c, createClassRequest);
    const name = body.name.trim();
    if (!name || [...name].length > ROOM_NAME_MAX) throw new ApiError(400, 'bad_name', `班級名稱要 1～${ROOM_NAME_MAX} 個字`);
    // 代碼撞到既有班級就重抽
    for (let i = 0; i < 20; i++) {
      const rows = await db.query<RoomRow>(
        'INSERT INTO rooms (code, name, owner_id, created_at) VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT (code) DO NOTHING RETURNING *',
        [newRoomCode(), name, owner, now().toISOString()],
      );
      if (rows.length) return c.json({ room: roomSettings(rows[0]) });
    }
    throw new Error('班級代碼產生失敗');
  });

  app.get('/api/teacher/rooms/:code', async (c) => {
    const owner = await authenticateTeacher(c);
    const room = await loadOwnRoom(db, c.req.param('code'), owner);
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
      where: opts.whereOf?.(a.id) ?? null,
      hasPin: a.pin_hash !== null,
    }));
    return c.json<TeacherRoomResponse>({ room: roomSettings(room), members });
  });

  app.patch('/api/teacher/rooms/:code', async (c) => {
    const owner = await authenticateTeacher(c);
    const room = await loadOwnRoom(db, c.req.param('code'), owner);
    const body = await readBody(c, roomPatchRequest);
    // 班級名稱：規則和建立班級相同
    const name = body.name === undefined ? null : body.name.trim();
    if (name !== null && (!name || [...name].length > ROOM_NAME_MAX)) throw new ApiError(400, 'bad_name', `班級名稱要 1～${ROOM_NAME_MAX} 個字`);
    // curriculum：沒給是不變，null 是取消統一（COALESCE 分不出這兩種，另外用 $5 標記有沒有給）
    const setCurriculum = body.curriculum !== undefined;
    const rows = await db.query<RoomRow>(
      `UPDATE rooms SET join_open = COALESCE($2, join_open), chat_open = COALESCE($3, chat_open), gifts_open = COALESCE($4, gifts_open),
              curriculum = CASE WHEN $5 THEN $6::jsonb ELSE curriculum END, name = COALESCE($7, name)
       WHERE code = $1 RETURNING *`,
      [room.code, body.joinOpen ?? null, body.chatOpen ?? null, body.giftsOpen ?? null, setCurriculum, body.curriculum ? JSON.stringify(body.curriculum) : null, name],
    );
    opts.onRoomChanged?.(room.code, { chatOpen: rows[0].chat_open, giftsOpen: rows[0].gifts_open });
    // 班級版本或名稱變了：線上的孩子重新同步，拿到新的班級版本與名稱
    if (setCurriculum || (name !== null && name !== room.name)) opts.onRoomContent?.(room.code);
    return c.json({ room: roomSettings(rows[0]) });
  });

  app.post('/api/teacher/rooms/:code/members/:id/pin', async (c) => {
    const owner = await authenticateTeacher(c);
    const room = await loadOwnRoom(db, c.req.param('code'), owner);
    const body = await readBody(c, resetPinRequest);
    const pinHash = await hashSecret(body.pin);
    const rows = await db.query<{ nickname_key: string }>('UPDATE accounts SET pin_hash = $3 WHERE id = $1 AND room_code = $2 RETURNING nickname_key', [
      c.req.param('id'),
      room.code,
      pinHash,
    ]);
    if (!rows.length) throw new ApiError(404, 'no_member', '找不到這位成員');
    // 舊密碼可能被別人知道了：用班級代碼登入的裝置一併失效；家長裝置上的不受影響（家長登入不靠孩子密碼）
    await db.query("DELETE FROM tokens WHERE account_id = $1 AND via = 'class'", [c.req.param('id')]);
    limiter.reset(`kid:${room.code}:${rows[0].nickname_key}`);
    // 只踢用班級代碼登入的連線：家長裝置的權杖沒有撤銷，連線也留著
    opts.onKick?.(c.req.param('id'), '老師重設了你的密碼，請用新密碼重新登入', 'class');
    return c.json({ ok: true });
  });

  app.delete('/api/teacher/rooms/:code/members/:id', async (c) => {
    const owner = await authenticateTeacher(c);
    const room = await loadOwnRoom(db, c.req.param('code'), owner);
    // 別人送給他、還沒收的禮物要先退款，和刪帳號在同一個交易裡
    const removed = await removeMemberWithRefunds(db, c.req.param('id'), room.code, now());
    if (!removed) throw new ApiError(404, 'no_member', '找不到這位成員');
    emitGiftEvents(opts, removed.events);
    opts.onKick?.(c.req.param('id'), removed.left ? LEFT_CLASS_REASON : '老師把你移出房間了');
    return c.json({ ok: true, left: removed.left });
  });

  // ---------- 孩子 ----------

  /**
   * 已有的雲端角色加入班級（帶孩子權杖加入、家長掃 QR code 加入共用）：設定班級、班上的暱稱與孩子密碼，
   * 存檔裡的名字改成暱稱。pin 是 null 時不設密碼（家長加入；孩子要用班級代碼登入時老師再設）。
   * 加入後通知即時中樞（存檔變了、換了班級）。回傳更新後的帳號與班級
   */
  const joinExisting = async (accountId: string, code: string, nickname: string, pin: string | null): Promise<{ row: AccountRow; room: RoomRow }> => {
    const room = await loadRoom(db, code);
    if (!room.join_open) throw new ApiError(403, 'join_closed', '這個房間目前不開放加入，請問老師');
    const nick = checkNickname(nickname);
    if (!nick.ok) throw new ApiError(400, 'bad_nickname', nick.reason);
    const taken = await db.query('SELECT 1 FROM accounts WHERE room_code = $1 AND nickname_key = $2', [room.code, nick.key]);
    if (taken.length) throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
    const pinHash = pin === null ? null : await hashSecret(pin);
    const t = now().toISOString();
    const row = await db.transaction(async (tx) => {
      const account = (await tx.query<AccountRow>('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [accountId]))[0];
      if (!account) throw new ApiError(401, 'unauthorized', '請重新登入');
      // 鎖住之後再確認一次：兩台裝置同時加入不同班級時，只有一個成功
      if (account.room_code) throw new ApiError(409, 'already_in_class', '已經在班級裡了，要先退出原本的班級');
      const profile = { ...account.profile, name: nick.nickname };
      try {
        return (
          await tx.query<AccountRow>(
            `UPDATE accounts SET room_code = $2, nickname = $3, nickname_key = $4, pin_hash = $5, profile = $6::jsonb, rev = rev + 1, last_seen = $7::timestamptz
             WHERE id = $1 RETURNING *`,
            [account.id, room.code, nick.nickname, nick.key, pinHash, JSON.stringify(profile), t],
          )
        )[0];
      } catch (err) {
        // 兩個人同時用同一個暱稱加入：唯一鍵衝突
        if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
        throw err;
      }
    });
    opts.onProfileChanged?.(row.id, row.rev, row.profile);
    opts.onClassChanged?.(row.id);
    return { row, room };
  };

  /** 帶孩子權杖加入班級：孩子自己設密碼；裝置沿用原本的權杖 */
  const attachToClass = async (c: Context) => {
    const who = await authenticateKidAny(c);
    const body = await readBody(c, attachClassRequest);
    if (who.roomCode) throw new ApiError(409, 'already_in_class', '已經在班級裡了，要先退出原本的班級');
    const { row, room } = await joinExisting(who.accountId, body.code, body.nickname, body.pin);
    return c.json<AttachResponse>({ account: { id: row.id, nickname: row.nickname }, profile: row.profile, rev: row.rev, room: roomInfo(room) });
  };

  app.post('/api/join', async (c) => {
    checkFlood(c);
    // 帶孩子權杖：已有的雲端角色加入班級（不另開新角色）
    if (c.req.header('authorization')) return attachToClass(c);
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
    return c.json(await sessionResponse(rows[0], room, 'class'));
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
    // 家長用家長帳號幫他加入、還沒有密碼：直接說清楚（使用者決定：登入畫面不能設密碼，被試出來也沒有風險；
    // 密碼只在加入時自己設，或由老師在管理頁設），不算猜錯
    if (account && !account.pin_hash) throw new ApiError(401, 'no_pin', '還沒有設定班級密碼，請老師在管理頁幫你設定');
    if (!account || !(await verifySecret(body.pin, account.pin_hash!))) {
      limiter.fail(key);
      throw new ApiError(401, 'bad_login', '房間代碼、暱稱或密碼不對');
    }
    limiter.reset(key);
    await db.query('UPDATE accounts SET last_seen = $2::timestamptz WHERE id = $1', [account.id, now().toISOString()]);
    return c.json(await sessionResponse(account, await loadRoom(db, account.room_code!), 'class'));
  });

  app.post('/api/logout', async (c) => {
    const m = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '');
    if (m) await db.query('DELETE FROM tokens WHERE token_hash = $1', [tokenHash(m[1])]);
    return c.json({ ok: true });
  });

  app.get('/api/me', async (c) => {
    const who = await authenticateKidAny(c);
    const account = (await db.query<AccountRow>('SELECT * FROM accounts WHERE id = $1', [who.accountId]))[0];
    if (!account) throw new ApiError(401, 'unauthorized', '請重新登入');
    return c.json({
      account: { id: account.id, nickname: account.nickname },
      profile: account.profile,
      rev: account.rev,
      room: await roomInfoOf(account.room_code),
      /** 有沒有家長帳號（有的話被移出班級時進度留著） */
      owned: account.parent_id !== null,
    });
  });

  app.post('/api/ops', async (c) => {
    const who = await authenticateKidAny(c);
    const body = await readBody(c, opsRequest);
    const t = now();
    const result = await db.transaction<Omit<OpsResponse, 'room'> & { changed: boolean; roomCode: string | null }>(async (tx) => {
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
      return { profile, rev: updated[0].rev, rejected, changed, roomCode: row.room_code };
    });
    if (result.changed) opts.onProfileChanged?.(who.accountId!, result.rev, result.profile);
    const { changed: _changed, roomCode, ...rest } = result;
    return c.json<OpsResponse>({ ...rest, room: await roomInfoOf(roomCode) });
  });

  // ---------- 送禮物（P3） ----------
  registerGiftRoutes(app, { db, now, authenticate, isOnline, onProfileChanged: opts.onProfileChanged, onGift: opts.onGift });

  // ---------- 前端靜態檔（最後註冊，不蓋掉上面的路由） ----------
  if (opts.staticDir) registerStatic(app, opts.staticDir);

  return app;
}
