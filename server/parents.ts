/**
 * 家長的雲端角色（A2，docs/plans/accounts.md 第 6 節）：把裝置上的角色上傳成雲端角色、列出名下的角色、
 * 「在這台裝置玩」、刪除、讓孩子退出班級。大人權杖＋家長身分；不是自己名下的角色和不存在的一樣回 404。
 */
import type { Context, Hono } from 'hono';
import type { Db, Queryable } from './db';
import { ApiError, readBody } from './http';
import { newAccountId } from './auth';
import { detachFromClass, emitGiftEvents, settlePendingGifts, type Events } from './gifts';
import {
  parentJoinClassRequest,
  uploadKidRequest,
  type ClassLookupResponse,
  type KidSummary,
  type ParentJoinClassResponse,
  type ParentKidsResponse,
  type SessionResponse,
} from '../src/online/protocol';
import { parseProfile, type CurriculumChoice, type Profile } from '../src/store/save';
import type { AccountRow } from './app';

/** 家長讓孩子退出班級時，孩子裝置上顯示的原因 */
export const PARENT_LEFT_REASON = '已經退出班級，進度都還在';
/** 家長刪除角色時，孩子裝置上顯示的原因 */
export const KID_DELETED_REASON = '這個角色已經被家長刪除';
/** 雲端角色的名字最多幾個字（和本機建立角色相同） */
const NAME_MAX = 12;

/** 家長路由需要的東西（由 app.ts 傳進來） */
export interface ParentRouteDeps {
  db: Db;
  now: () => Date;
  /** 驗證大人權杖 */
  authenticateUser: (c: Context) => Promise<{ userId: string; hash: string }>;
  /** 發一張孩子權杖（家長來源）並組成回應；roomCode 是角色目前的班級 */
  session: (account: AccountRow, roomCode: string | null) => Promise<SessionResponse>;
  onKick?: (accountId: string, reason: string) => void;
  onProfileChanged?: (accountId: string, rev: number, profile: Profile) => void;
  onGift?: (accountId: string) => void;
  /** 擋同一個 IP 的大量請求（查班級名稱用，避免一直猜代碼） */
  checkFlood: (c: Context) => void;
  /** 已有的雲端角色加入班級、不設密碼（和帶孩子權杖加入共用同一段邏輯，會通知即時中樞） */
  joinClass: (accountId: string, code: string, nickname: string) => Promise<{ row: AccountRow; room: { code: string; name: string } }>;
  /** 讀班級；找不到回 404 */
  loadRoom: (code: string) => Promise<{ code: string; name: string; join_open: boolean }>;
}

/** 去掉已經刪除的帳號再送出通知（被刪的角色沒有人可以收） */
export function emitExcept(deps: Pick<ParentRouteDeps, 'onProfileChanged' | 'onGift'>, events: Events, gone: Set<string>): void {
  emitGiftEvents(deps, { profiles: events.profiles.filter((p) => !gone.has(p.accountId)), gifts: events.gifts.filter((id) => !gone.has(id)) });
}

/** 掛上家長的路由 */
export function registerParentRoutes(app: Hono, deps: ParentRouteDeps): void {
  const { db, now } = deps;

  /** 大人權杖＋家長身分；只有老師身分回 403 */
  const authenticateParent = async (c: Context): Promise<string> => {
    const { userId } = await deps.authenticateUser(c);
    const row = (await db.query<{ is_parent: boolean }>('SELECT is_parent FROM users WHERE id = $1', [userId]))[0];
    if (!row) throw new ApiError(401, 'unauthorized', '請重新登入');
    if (!row.is_parent) throw new ApiError(403, 'not_parent', '這個帳號沒有家長身分，請先在帳號設定加上「家長」');
    return userId;
  };

  /** 讀自己名下的角色；別人的和不存在的一樣回 404 */
  const loadOwnKid = async (q: Queryable, id: string, parentId: string): Promise<AccountRow> => {
    const row = (await q.query<AccountRow>('SELECT * FROM accounts WHERE id = $1 AND parent_id = $2', [id, parentId]))[0];
    if (!row) throw new ApiError(404, 'no_kid', '找不到這個孩子');
    return row;
  };

  /** 家長名下的角色（含班級名稱與班級版本） */
  const kidRows = (where: string, params: unknown[]) =>
    db.query<AccountRow & { room_name: string | null; room_curriculum: CurriculumChoice | null }>(
      `SELECT a.*, r.name AS room_name, r.curriculum AS room_curriculum FROM accounts a LEFT JOIN rooms r ON r.code = a.room_code
       WHERE ${where} ORDER BY a.created_at, a.id`,
      params,
    );
  /** 一個角色的摘要（家長帳號頁的孩子清單） */
  const kidSummary = (a: AccountRow & { room_name: string | null; room_curriculum: CurriculumChoice | null }): KidSummary => ({
    id: a.id,
    profileId: a.profile.id,
    name: a.profile.name,
    avatar: a.profile.avatar,
    room: a.room_code ? { code: a.room_code, name: a.room_name ?? '', curriculum: a.room_curriculum ?? null } : null,
    coins: a.profile.coins,
    stars: Object.values(a.profile.bestStars).reduce((s, v) => s + v, 0),
    lastSeen: new Date(a.last_seen).toISOString(),
  });

  app.get('/api/parent/kids', async (c) => {
    const parent = await authenticateParent(c);
    const kids = (await kidRows('a.parent_id = $1', [parent])).map(kidSummary);
    return c.json<ParentKidsResponse>({ kids });
  });

  // ---------- 掃 QR code 加入班級（docs/plans/class-join.md） ----------

  /** 查班級名稱與是否開放加入（加入連結打開時顯示）：任何大人帳號都可以查（只有老師身分時畫面提示勾選家長）；擋大量請求 */
  app.get('/api/parent/classes/:code', async (c) => {
    deps.checkFlood(c);
    await deps.authenticateUser(c);
    const room = await deps.loadRoom(c.req.param('code'));
    return c.json<ClassLookupResponse>({ room: { code: room.code, name: room.name }, joinOpen: room.join_open });
  });

  /** 家長讓名下的雲端角色加入班級：不用密碼（孩子要用班級代碼登入時老師再設） */
  app.post('/api/parent/kids/:id/class', async (c) => {
    const parent = await authenticateParent(c);
    const kid = await loadOwnKid(db, c.req.param('id'), parent);
    const body = await readBody(c, parentJoinClassRequest);
    if (kid.room_code) throw new ApiError(409, 'already_in_class', '已經在班級裡了，要先退出原本的班級');
    await deps.joinClass(kid.id, body.code, body.nickname);
    const row = (await kidRows('a.id = $1', [kid.id]))[0];
    return c.json<ParentJoinClassResponse>({ kid: kidSummary(row) });
  });

  app.post('/api/parent/kids', async (c) => {
    const parent = await authenticateParent(c);
    const body = await readBody(c, uploadKidRequest);
    const parsed = parseProfile(body.profile);
    if (!parsed) throw new ApiError(400, 'bad_profile', '角色資料格式不符');
    // 本機的雲端標記不存到伺服器
    const { cloud: _local, ...profile } = parsed;
    const name = [...profile.name.trim()].slice(0, NAME_MAX).join('') || '孩子';
    const t = now().toISOString();
    const row = await db.transaction(async (tx) => {
      // 同一位家長的上傳排隊（鎖住家長的帳號列），查重與新增之間不會被另一個請求插隊；
      // 這個鎖只在這裡拿，期間只新增帳號、不鎖既有的帳號與禮物，和其他路由的鎖定順序不衝突
      const me = await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [parent]);
      if (!me.length) throw new ApiError(401, 'unauthorized', '請重新登入');
      // 同一個本機角色（同一個角色 id）只能上傳一次，同時按兩次也不會變成兩個分身
      const dup = await tx.query("SELECT 1 FROM accounts WHERE parent_id = $1 AND profile->>'id' = $2", [parent, profile.id]);
      if (dup.length) throw new ApiError(409, 'already_uploaded', '這個角色已經存到雲端了');
      const rows = await tx.query<AccountRow>(
        `INSERT INTO accounts (id, room_code, parent_id, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
         VALUES ($1, NULL, $2, $3, $4, NULL, $5::jsonb, 1, $6::timestamptz, $6::timestamptz) RETURNING *`,
        [newAccountId(), parent, name, name.toLowerCase(), JSON.stringify({ ...profile, name }), t],
      );
      return rows[0];
    });
    return c.json(await deps.session(row, null));
  });

  app.post('/api/parent/kids/:id/device', async (c) => {
    const parent = await authenticateParent(c);
    const kid = await loadOwnKid(db, c.req.param('id'), parent);
    return c.json(await deps.session(kid, kid.room_code));
  });

  app.delete('/api/parent/kids/:id', async (c) => {
    const parent = await authenticateParent(c);
    const events: Events = { profiles: [], gifts: [] };
    const kidId = await db.transaction(async (tx) => {
      const kid = await loadOwnKid(tx, c.req.param('id'), parent);
      // 在班級裡的先和班上結清禮物（兩個方向），再刪
      if (kid.room_code) await settlePendingGifts(tx, [kid.id], now(), events, { includeOutgoing: true });
      await tx.query('DELETE FROM accounts WHERE id = $1', [kid.id]);
      return kid.id;
    });
    emitExcept(deps, events, new Set([kidId]));
    deps.onKick?.(kidId, KID_DELETED_REASON);
    return c.json({ ok: true });
  });

  app.post('/api/parent/kids/:id/leave-class', async (c) => {
    const parent = await authenticateParent(c);
    const events: Events = { profiles: [], gifts: [] };
    const kidId = await db.transaction(async (tx) => {
      const kid = await loadOwnKid(tx, c.req.param('id'), parent);
      if (!kid.room_code) return null;
      await settlePendingGifts(tx, [kid.id], now(), events, { includeOutgoing: true });
      await detachFromClass(tx, kid.id);
      return kid.id;
    });
    if (!kidId) throw new ApiError(409, 'not_in_class', '這個孩子沒有加入班級');
    emitGiftEvents(deps, events);
    deps.onKick?.(kidId, PARENT_LEFT_REASON);
    return c.json({ ok: true });
  });
}
