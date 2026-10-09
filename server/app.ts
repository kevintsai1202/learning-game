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
import { isClassLogin, lookupClassroomToken, lookupToken, type TokenVia } from './tokens';
import { emitGiftEvents, registerGiftRoutes, removeMemberWithRefunds } from './gifts';
import { registerStatic } from './static';
import { registerUserRoutes } from './users';
import { registerParentRoutes } from './parents';
import { registerRewardRoutes } from './rewards';
import { registerEmailRoutes } from './email';
import { registerUserGoogleRoutes } from './userGoogle';
import { createMailer, type Mailer } from './mail';
import { MAX_CLASSES, classInfos, membershipsOf, revokeClassTokens, revokeClassroomTokens } from './classes';
import type { RoomFlags } from '../src/online/realtime';
import { applyOp, parseOp } from '../src/online/ops';
import {
  CLASSROOM_HOURS,
  attachClassRequest,
  classroomCreateRequest,
  classroomUnlockRequest,
  createClassRequest,
  joinRequest,
  loginRequest,
  opsRequest,
  resetPinRequest,
  roomPatchRequest,
  type AttachResponse,
  type ClassInfo,
  type ClassroomCreateResponse,
  type ClassroomMember,
  type ClassroomMembersResponse,
  type ClassroomUnlockResponse,
  type ClaimIssueResponse,
  CLAIM_DAYS,
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
  /**
   * 某個帳號在哪裡（島嶼互訪 I1，即時中樞提供；老師的成員表用）：哪一種島＋建築，離線是 null。
   * roomCode 是老師看的那一班：孩子在別班的班級島時回 otherClass（多班級，不寫是哪一班）
   */
  whereOf?: (accountId: string, roomCode: string) => MemberSummary['where'];
  /** 某個帳號的存檔在伺服器端改變了：即時中樞更新別人看到的外觀，並通知他自己的裝置同步（帶上新的存檔，中樞不必再查資料庫） */
  onProfileChanged?: (accountId: string, rev: number, profile: Profile) => void;
  /** 老師改了房間的聊天、送禮開關 */
  onRoomChanged?: (roomCode: string, flags: RoomFlags) => void;
  /** 老師改了班級內容（目前是班級教材版本）：通知班上線上的孩子重新同步 */
  onRoomContent?: (roomCode: string) => void;
  /** 某個帳號加入了班級（掃 QR code 由家長加入、或帶孩子權杖加入）：即時中樞讓他重新上線，換成新的班級與朋友 */
  onClassChanged?: (accountId: string) => void;
  /**
   * 某位孩子要被踢下線（刪除角色、老師重設密碼），reason 會顯示給孩子；給了 via 就只踢那種權杖來源的連線，
   * 再給 roomCode 就只踢用那一班代碼登入的連線（多班級：重設某一班的密碼不影響另一班的平板）
   */
  onKick?: (accountId: string, reason: string, via?: TokenVia, roomCode?: string) => void;
  /**
   * 某位孩子離開了某一班（老師移出、家長讓他退出；多班級）：用那一班代碼登入的連線踢下線，
   * 其他連線（家長裝置、別班登入的）重新上線拿新的班級與朋友，並顯示 reason
   */
  onLeftClass?: (accountId: string, roomCode: string, reason: string) => void;
  /** 某位孩子的禮物狀態有變（收到新禮物，或送出的禮物有結果）：即時中樞通知他的裝置重新讀取 */
  onGift?: (accountId: string) => void;
  /** 某位孩子收到老師的獎勵（老師 GM 的 G3）：即時中樞通知他的裝置讀取並顯示卡片 */
  onReward?: (accountId: string) => void;
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
  /** 舊欄位（多班級之前的班級）：第 10 版起不再讀也不再寫，班級在 class_members */
  room_code: string | null;
  /** 家長帳號；純班級角色（孩子用代碼自己加入的）是 null */
  parent_id: string | null;
  /** 舊欄位（多班級之前的班上暱稱）：只當角色的備用名字，各班的暱稱在 class_members */
  nickname: string;
  /** 舊欄位（多班級之前的孩子密碼）：第 10 版起不再讀也不再寫，各班的密碼在 class_members */
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
  /** 教室密碼的雜湊（L3，第 11 版新增）；null 是老師還沒設定，學校平板不能解鎖 */
  class_password_hash: string | null;
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
  return { ...roomInfo(r), joinOpen: r.join_open, chatOpen: r.chat_open, giftsOpen: r.gifts_open, hasClassPassword: r.class_password_hash !== null };
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

  /**
   * 發一張權杖並存進資料庫：孩子的權杖屬於某個帳號；大人（家長、老師）的權杖屬於大人帳號；
   * 教室權杖（L3）只綁一個班級、8 小時後失效。
   * 孩子的 roomCode 是「用哪一班登入」（class、tablet 權杖；移出、重設密碼、換教室密碼時只撤銷那一班的），家長來源的權杖是 null
   */
  const issueToken = async (
    q: Queryable,
    who: { kind: 'kid'; roomCode: string | null; accountId: string; via: TokenVia } | { kind: 'user'; userId: string } | { kind: 'classroom'; roomCode: string },
  ): Promise<{ token: string; expiresAt: string }> => {
    const token = newToken();
    const life = who.kind === 'classroom' ? CLASSROOM_HOURS * 3600 * 1000 : TOKEN_DAYS * 24 * 3600 * 1000;
    const expiresAt = new Date(nowMs() + life).toISOString();
    await q.query('INSERT INTO tokens (token_hash, kind, room_code, account_id, user_id, via, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)', [
      tokenHash(token),
      who.kind,
      who.kind === 'user' ? null : who.roomCode,
      who.kind === 'kid' ? who.accountId : null,
      who.kind === 'user' ? who.userId : null,
      who.kind === 'kid' ? who.via : 'class',
      expiresAt,
    ]);
    return { token, expiresAt };
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
    if (!found.rooms.length) throw new ApiError(403, 'no_class', '還沒加入班級');
    return { rooms: found.rooms, accountId: found.accountId, hash: found.hash };
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

  /**
   * 一個角色的所有班級（多班級）：rooms 是全部（第一個班級在前面），room 是第一個班級（給部署途中的舊版網頁）
   */
  const classesOf = async (q: Queryable, accountId: string): Promise<{ room: RoomInfo | null; rooms: ClassInfo[] }> => {
    const rooms = classInfos(await membershipsOf(q, accountId));
    const first = rooms[0];
    return { room: first ? { code: first.code, name: first.name, curriculum: first.curriculum } : null, rooms };
  };

  /** 讀房間；不存在回 404 */
  const loadRoom = async (q: Queryable, code: string): Promise<RoomRow> => {
    const room = (await q.query<RoomRow>('SELECT * FROM rooms WHERE code = $1', [code]))[0];
    if (!room) throw new ApiError(404, 'no_room', '找不到這個房間代碼');
    return room;
  };

  /**
   * 加入、登入、家長上傳或「在這台裝置玩」成功的回應：發一張孩子權杖（via 記來源；class 權杖記用哪一班登入）。
   * nickname 是這次登入用的名字：班級登入是那一班的暱稱，家長裝置是角色的名字
   */
  const sessionResponse = async (account: AccountRow, via: TokenVia, opts: { nickname: string; loginRoom?: string }): Promise<SessionResponse> => ({
    token: (await issueToken(db, { kind: 'kid', roomCode: isClassLogin(via) ? (opts.loginRoom ?? null) : null, accountId: account.id, via })).token,
    account: { id: account.id, nickname: opts.nickname },
    profile: account.profile,
    rev: account.rev,
    ...(await classesOf(db, account.id)),
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
    issueUserToken: async (userId) => (await issueToken(db, { kind: 'user', userId })).token,
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
  registerUserGoogleRoutes(app, {
    db,
    now,
    checkFlood,
    verifyGoogleToken,
    issueUserToken: async (userId) => (await issueToken(db, { kind: 'user', userId })).token,
    authenticateUser,
  });

  // ---------- 家長的雲端角色（A2） ----------
  registerParentRoutes(app, {
    db,
    now,
    authenticateUser,
    session: async (account) => sessionResponse(account, 'parent', { nickname: account.profile.name }),
    onKick: opts.onKick,
    onLeftClass: opts.onLeftClass,
    onProfileChanged: opts.onProfileChanged,
    onGift: opts.onGift,
    checkFlood: (c) => checkFlood(c),
    // 包一層：joinExisting 定義在後面，請求進來時才呼叫
    joinClass: (accountId, code, nickname) => joinExisting(accountId, code, nickname, null),
    loadRoom: (code) => loadRoom(db, code),
    onClassChanged: opts.onClassChanged,
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
      `SELECT r.*, (SELECT count(*)::int FROM class_members m WHERE m.room_code = r.code) AS members
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
    // 這一班的成員：暱稱與密碼是這一班的（多班級，各班各自的）；加入時間是加入這一班的時間
    const rows = await db.query<AccountRow & { member_nickname: string; member_pin: string | null; joined_at: Date }>(
      `SELECT a.*, m.nickname AS member_nickname, m.pin_hash AS member_pin, m.joined_at
       FROM class_members m JOIN accounts a ON a.id = m.account_id WHERE m.room_code = $1 ORDER BY m.joined_at, m.nickname`,
      [room.code],
    );
    const members: MemberSummary[] = rows.map((a) => ({
      id: a.id,
      nickname: a.member_nickname,
      coins: a.profile.coins,
      stars: Object.values(a.profile.bestStars).reduce((s, v) => s + v, 0),
      wrongCount: Object.keys(a.profile.wrongBook).length,
      sessions: a.profile.history.length,
      createdAt: new Date(a.joined_at).toISOString(),
      lastSeen: new Date(a.last_seen).toISOString(),
      online: isOnline(a.id),
      where: opts.whereOf?.(a.id, room.code) ?? null,
      hasPin: a.member_pin !== null,
      hasParent: a.parent_id !== null,
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
    // 教室密碼（L3）：只存雜湊；沒給是不變
    const passwordHash = body.classPassword === undefined ? null : await hashSecret(body.classPassword);
    const rows = await db.query<RoomRow>(
      `UPDATE rooms SET join_open = COALESCE($2, join_open), chat_open = COALESCE($3, chat_open), gifts_open = COALESCE($4, gifts_open),
              curriculum = CASE WHEN $5 THEN $6::jsonb ELSE curriculum END, name = COALESCE($7, name), class_password_hash = COALESCE($8, class_password_hash)
       WHERE code = $1 RETURNING *`,
      [room.code, body.joinOpen ?? null, body.chatOpen ?? null, body.giftsOpen ?? null, setCurriculum, body.curriculum ? JSON.stringify(body.curriculum) : null, name, passwordHash],
    );
    if (passwordHash !== null) {
      // 舊的教室密碼可能被別人知道了：教室權杖與平板上孩子的權杖全部失效，平板要重新輸入；鎖定紀錄一併清掉
      const kicked = await revokeClassroomTokens(db, room.code);
      limiter.reset(`classroom:${room.code}`);
      for (const id of kicked) opts.onKick?.(id, '老師換了教室密碼，請老師重新輸入', 'tablet', room.code);
    }
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
    // 密碼是這一班的（多班級：各班各自的密碼）
    const rows = await db.query<{ nickname_key: string }>('UPDATE class_members SET pin_hash = $3 WHERE account_id = $1 AND room_code = $2 RETURNING nickname_key', [
      c.req.param('id'),
      room.code,
      pinHash,
    ]);
    if (!rows.length) throw new ApiError(404, 'no_member', '找不到這位成員');
    // 舊密碼可能被別人知道了：用這一班代碼登入的裝置一併失效；家長裝置與用別班代碼登入的不受影響
    await revokeClassTokens(db, c.req.param('id'), room.code);
    limiter.reset(`kid:${room.code}:${rows[0].nickname_key}`);
    // 只踢用這一班代碼登入的連線：家長裝置、別班登入的連線留著
    opts.onKick?.(c.req.param('id'), '老師重設了你的密碼，請用新密碼重新登入', 'class', room.code);
    return c.json({ ok: true });
  });

  // 家長連結卡（L4）：還沒有家長的孩子產生一次性連結（7 天）；一個孩子同時只有一張，重新產生時舊的作廢
  app.post('/api/teacher/rooms/:code/members/:id/claim', async (c) => {
    const owner = await authenticateTeacher(c);
    const room = await loadOwnRoom(db, c.req.param('code'), owner);
    const member = (
      await db.query<{ id: string; parent_id: string | null; nickname: string; profile: Profile }>(
        'SELECT a.id, a.parent_id, m.nickname, a.profile FROM class_members m JOIN accounts a ON a.id = m.account_id WHERE m.room_code = $1 AND m.account_id = $2',
        [room.code, c.req.param('id')],
      )
    )[0];
    if (!member) throw new ApiError(404, 'no_member', '找不到這位成員');
    if (member.parent_id !== null) throw new ApiError(409, 'has_parent', '這個孩子已經有家長帳號了');
    const code = newToken();
    const t = now();
    const expiresAt = new Date(t.getTime() + CLAIM_DAYS * 24 * 3600 * 1000).toISOString();
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM claim_codes WHERE account_id = $1', [member.id]);
      await tx.query('INSERT INTO claim_codes (code_hash, account_id, room_code, expires_at, created_at) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)', [
        tokenHash(code),
        member.id,
        room.code,
        expiresAt,
        t.toISOString(),
      ]);
    });
    return c.json<ClaimIssueResponse>({ code, expiresAt, kid: { nickname: member.nickname, avatar: member.profile.avatar } });
  });

  app.delete('/api/teacher/rooms/:code/members/:id', async (c) => {
    const owner = await authenticateTeacher(c);
    const room = await loadOwnRoom(db, c.req.param('code'), owner);
    // 別人送給他、還沒收的禮物要先退款，和刪帳號在同一個交易裡
    const removed = await removeMemberWithRefunds(db, c.req.param('id'), room.code, now());
    if (!removed) throw new ApiError(404, 'no_member', '找不到這位成員');
    emitGiftEvents(opts, removed.events);
    // 角色刪除了（沒有家長、也沒有其他班級）：踢下線；只是離開這一班：用這一班代碼登入的踢下線，其他連線重新上線
    if (removed.left) opts.onLeftClass?.(c.req.param('id'), room.code, LEFT_CLASS_REASON);
    else opts.onKick?.(c.req.param('id'), '老師把你移出房間了');
    return c.json({ ok: true, left: removed.left });
  });

  // ---------- 學校平板（L3 教室密碼，docs/plans/login-ux-review.md 第 7.2 節） ----------

  /** 驗證教室權杖（只有這四個 API 收它；老師、孩子的權杖一律 401），回傳它綁的班級 */
  const authenticateClassroom = async (c: Context): Promise<RoomRow> => {
    const m = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '');
    const found = m ? await lookupClassroomToken(db, m[1], now()) : null;
    if (!found) throw new ApiError(401, 'unauthorized', '請老師重新輸入教室密碼');
    return loadRoom(db, found.roomCode);
  };

  /** 平板名單上的一位孩子：這一班的暱稱與角色的外觀 */
  const classroomMember = (row: { id: string; nickname: string; profile: Profile }): ClassroomMember => ({ id: row.id, nickname: row.nickname, avatar: row.profile.avatar });

  // 老師輸入教室密碼：對了拿到 8 小時的教室權杖。錯 5 次鎖 5 分鐘（和孩子登入同一套）；還沒設定密碼不算猜錯
  app.post('/api/class/:code/unlock', async (c) => {
    checkFlood(c);
    const room = await loadRoom(db, c.req.param('code'));
    const body = await readBody(c, classroomUnlockRequest);
    const key = `classroom:${room.code}`;
    assertNotLocked(key);
    if (room.class_password_hash === null) throw new ApiError(404, 'no_classroom_password', '老師還沒有設定教室密碼，請老師在班級頁設定');
    if (!(await verifySecret(body.password, room.class_password_hash))) {
      limiter.fail(key);
      throw new ApiError(401, 'bad_password', '教室密碼不對');
    }
    limiter.reset(key);
    const issued = await issueToken(db, { kind: 'classroom', roomCode: room.code });
    return c.json<ClassroomUnlockResponse>({ token: issued.token, room: { code: room.code, name: room.name }, expiresAt: issued.expiresAt });
  });

  // 班上名單：這一班每位孩子的暱稱與外觀（認人用，不含學習資料）
  app.get('/api/class/members', async (c) => {
    const room = await authenticateClassroom(c);
    const rows = await db.query<{ id: string; nickname: string; profile: Profile }>(
      'SELECT a.id, m.nickname, a.profile FROM class_members m JOIN accounts a ON a.id = m.account_id WHERE m.room_code = $1 ORDER BY m.joined_at, m.nickname',
      [room.code],
    );
    return c.json<ClassroomMembersResponse>({ room: { code: room.code, name: room.name }, joinOpen: room.join_open, members: rows.map(classroomMember) });
  });

  // 點名單上的孩子：這台平板拿到他的孩子權杖（via 'tablet'，綁這一班；換教室密碼時撤銷）
  app.post('/api/class/members/:id/device', async (c) => {
    const room = await authenticateClassroom(c);
    const rows = await db.query<AccountRow & { member_nickname: string }>(
      'SELECT a.*, m.nickname AS member_nickname FROM class_members m JOIN accounts a ON a.id = m.account_id WHERE m.room_code = $1 AND m.account_id = $2',
      [room.code, c.req.param('id')],
    );
    if (!rows.length) throw new ApiError(404, 'no_member', '找不到這位孩子');
    await db.query('UPDATE accounts SET last_seen = $2::timestamptz WHERE id = $1', [rows[0].id, now().toISOString()]);
    return c.json(await sessionResponse(rows[0], 'tablet', { nickname: rows[0].member_nickname, loginRoom: room.code }));
  });

  // 老師在平板上新增學生：沒有家長、沒有密碼、只在這一班（之後家長用連結卡接手，L4）。老師關掉「允許加入」就不能建
  app.post('/api/class/members', async (c) => {
    const room = await authenticateClassroom(c);
    const body = await readBody(c, classroomCreateRequest);
    if (!room.join_open) throw new ApiError(403, 'join_closed', '老師關掉了「允許新的孩子加入」，請老師在班級頁打開');
    const nick = checkNickname(body.nickname);
    if (!nick.ok) throw new ApiError(400, 'bad_nickname', nick.reason);
    const profile = addProfile(createEmptySave(), { name: nick.nickname, avatar: body.avatar }, now()).profiles[0];
    const id = newAccountId();
    const t = now().toISOString();
    try {
      await db.transaction(async (tx) => {
        const taken = await tx.query('SELECT 1 FROM class_members WHERE room_code = $1 AND nickname_key = $2', [room.code, nick.key]);
        if (taken.length) throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
        await tx.query(
          `INSERT INTO accounts (id, room_code, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
           VALUES ($1, NULL, $2, $3, NULL, $4::jsonb, 1, $5::timestamptz, $5::timestamptz)`,
          [id, nick.nickname, nick.key, JSON.stringify(profile), t],
        );
        await tx.query('INSERT INTO class_members (account_id, room_code, nickname, nickname_key, pin_hash, joined_at) VALUES ($1, $2, $3, $4, NULL, $5::timestamptz)', [
          id,
          room.code,
          nick.nickname,
          nick.key,
          t,
        ]);
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
      throw err;
    }
    return c.json<ClassroomCreateResponse>({ member: { id, nickname: nick.nickname, avatar: body.avatar } });
  });

  // ---------- 孩子 ----------

  /**
   * 已有的雲端角色加入一個班級（帶孩子權杖加入、家長掃 QR code 加入共用；多班級，docs/plans/multi-class.md）：
   * 新增一筆成員資格（這一班的暱稱與孩子密碼），存檔裡的名字不改（角色的名字；班上顯示這一班的暱稱）。
   * pin 是 null 時不設密碼（家長加入；孩子要用班級代碼登入時老師再設）。已經是這一班的成員 409 already_member，
   * 已經有 MAX_CLASSES 個班級 409 too_many_classes（鎖住帳號後再數一次：兩台裝置同時加入也不會超過）。
   * 加入後通知即時中樞讓那個帳號重新上線（拿新的班級與朋友）。回傳帳號與班級
   */
  const joinExisting = async (accountId: string, code: string, nickname: string, pin: string | null): Promise<{ row: AccountRow; room: RoomRow; nickname: string }> => {
    const room = await loadRoom(db, code);
    if (!room.join_open) throw new ApiError(403, 'join_closed', '這個房間目前不開放加入，請問老師');
    const nick = checkNickname(nickname);
    if (!nick.ok) throw new ApiError(400, 'bad_nickname', nick.reason);
    const pinHash = pin === null ? null : await hashSecret(pin);
    const t = now().toISOString();
    const row = await db.transaction(async (tx) => {
      const account = (await tx.query<AccountRow>('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [accountId]))[0];
      if (!account) throw new ApiError(401, 'unauthorized', '請重新登入');
      // 鎖住之後再數：兩台裝置同時加入時，上限與重複加入都算得準
      const mine = await tx.query<{ room_code: string }>('SELECT room_code FROM class_members WHERE account_id = $1', [account.id]);
      if (mine.some((m) => m.room_code === room.code)) throw new ApiError(409, 'already_member', '已經在這個班級裡了');
      if (mine.length >= MAX_CLASSES) throw new ApiError(409, 'too_many_classes', `一個孩子最多加入 ${MAX_CLASSES} 個班級，要先退出其中一個`);
      const taken = await tx.query('SELECT 1 FROM class_members WHERE room_code = $1 AND nickname_key = $2', [room.code, nick.key]);
      if (taken.length) throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
      try {
        await tx.query(
          'INSERT INTO class_members (account_id, room_code, nickname, nickname_key, pin_hash, joined_at) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)',
          [account.id, room.code, nick.nickname, nick.key, pinHash, t],
        );
      } catch (err) {
        // 兩個人同時用同一個暱稱加入：唯一鍵衝突
        if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
        throw err;
      }
      return (await tx.query<AccountRow>('UPDATE accounts SET last_seen = $2::timestamptz WHERE id = $1 RETURNING *', [account.id, t]))[0];
    });
    opts.onClassChanged?.(row.id);
    return { row, room, nickname: nick.nickname };
  };

  /**
   * 帶孩子權杖加入班級：孩子自己設密碼；裝置沿用原本的權杖。
   * 沒有家長帳號、已經有班級的角色要加入第二個班級：回 409 need_parent，請家長用家長帳號掃 QR code（使用者決定，multi-class.md 第 8 節第 3 點）
   */
  const attachToClass = async (c: Context) => {
    const who = await authenticateKidAny(c);
    const body = await readBody(c, attachClassRequest);
    if (who.rooms.length) {
      const owner = (await db.query<{ parent_id: string | null }>('SELECT parent_id FROM accounts WHERE id = $1', [who.accountId]))[0];
      if (!owner?.parent_id) throw new ApiError(409, 'need_parent', '要加入第二個班級，請家長用家長帳號掃老師給的 QR code');
    }
    const { row, room, nickname } = await joinExisting(who.accountId, body.code, body.nickname, body.pin);
    const { rooms } = await classesOf(db, row.id);
    return c.json<AttachResponse>({ account: { id: row.id, nickname }, profile: row.profile, rev: row.rev, room: roomInfo(room), rooms });
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

    const taken = await db.query('SELECT 1 FROM class_members WHERE room_code = $1 AND nickname_key = $2', [room.code, nick.key]);
    if (taken.length) throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
    const id = newAccountId();
    const t = now().toISOString();
    const pinHash = await hashSecret(body.pin);
    let account: AccountRow;
    try {
      // 新的純班級角色：帳號本身不記班級（舊欄位留空），成員資格記在 class_members
      account = await db.transaction(async (tx) => {
        const rows = await tx.query<AccountRow>(
          `INSERT INTO accounts (id, room_code, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
           VALUES ($1, NULL, $2, $3, NULL, $4::jsonb, 1, $5::timestamptz, $5::timestamptz) RETURNING *`,
          [id, nick.nickname, nick.key, JSON.stringify(profile), t],
        );
        await tx.query(
          'INSERT INTO class_members (account_id, room_code, nickname, nickname_key, pin_hash, joined_at) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)',
          [id, room.code, nick.nickname, nick.key, pinHash, t],
        );
        return rows[0];
      });
    } catch (err) {
      // 兩個人同時用同一個暱稱加入：唯一鍵衝突
      if ((err as { code?: string }).code === '23505') throw new ApiError(409, 'nickname_taken', '這個暱稱已經有人用了，換一個吧');
      throw err;
    }
    return c.json(await sessionResponse(account, 'class', { nickname: nick.nickname, loginRoom: room.code }));
  });

  app.post('/api/login', async (c) => {
    checkFlood(c);
    const body = await readBody(c, loginRequest);
    const nick = checkNickname(body.nickname);
    const key = `kid:${body.code}:${nick.ok ? nick.key : body.nickname}`;
    assertNotLocked(key);
    // 找這一班的成員（暱稱與密碼是這一班的；多班級）
    const account = nick.ok
      ? (
          await db.query<AccountRow & { member_nickname: string; member_pin: string | null }>(
            `SELECT a.*, m.nickname AS member_nickname, m.pin_hash AS member_pin
             FROM class_members m JOIN accounts a ON a.id = m.account_id WHERE m.room_code = $1 AND m.nickname_key = $2`,
            [body.code, nick.key],
          )
        )[0]
      : undefined;
    // 家長用家長帳號幫他加入、還沒有密碼：直接說清楚（使用者決定：登入畫面不能設密碼，被試出來也沒有風險；
    // 密碼只在加入時自己設，或由老師在管理頁設），不算猜錯
    if (account && !account.member_pin) throw new ApiError(401, 'no_pin', '還沒有設定班級密碼，請老師在管理頁幫你設定');
    if (!account || !(await verifySecret(body.pin, account.member_pin!))) {
      limiter.fail(key);
      throw new ApiError(401, 'bad_login', '房間代碼、暱稱或密碼不對');
    }
    limiter.reset(key);
    await db.query('UPDATE accounts SET last_seen = $2::timestamptz WHERE id = $1', [account.id, now().toISOString()]);
    return c.json(await sessionResponse(account, 'class', { nickname: account.member_nickname, loginRoom: body.code }));
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
    const classes = await classesOf(db, account.id);
    return c.json({
      account: { id: account.id, nickname: classes.rooms[0]?.nickname ?? account.profile.name },
      profile: account.profile,
      rev: account.rev,
      // room 是第一個班級（給舊版網頁），rooms 是所有班級（多班級）
      ...classes,
      /** 有沒有家長帳號（有的話被移出班級時進度留著） */
      owned: account.parent_id !== null,
    });
  });

  app.post('/api/ops', async (c) => {
    const who = await authenticateKidAny(c);
    const body = await readBody(c, opsRequest);
    const t = now();
    const result = await db.transaction<Omit<OpsResponse, 'room' | 'rooms'> & { changed: boolean }>(async (tx) => {
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
    const { changed: _changed, ...rest } = result;
    // 班級跟著回應：在別台裝置加入、退出班級，或被老師移出時，這台裝置靠它更新本機（room 給舊版網頁）
    return c.json<OpsResponse>({ ...rest, ...(await classesOf(db, who.accountId)) });
  });

  // ---------- 送禮物（P3） ----------
  registerGiftRoutes(app, { db, now, authenticate, isOnline, onProfileChanged: opts.onProfileChanged, onGift: opts.onGift });
  registerRewardRoutes(app, { db, now, authenticate, authenticateTeacher, loadOwnRoom, onProfileChanged: opts.onProfileChanged, onReward: opts.onReward });

  // ---------- 前端靜態檔（最後註冊，不蓋掉上面的路由） ----------
  if (opts.staticDir) registerStatic(app, opts.staticDir);

  return app;
}
