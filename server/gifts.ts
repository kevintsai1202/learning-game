/**
 * 送禮物（P3）的路由、過期掃描與移出成員時的退款。規格見 docs/plans/online.md 第 7 節。
 *
 * 鎖定順序（避免真正的 PostgreSQL 上互相等待卡死）：
 * - 送禮只鎖帳號：送禮人與收禮人用一句 `WHERE id IN (…) ORDER BY id FOR UPDATE` 一起鎖
 * - 收下、不用了、過期、移出成員：先鎖禮物，再依 id 順序鎖帳號
 * 拿著帳號鎖的交易不會再去等禮物鎖，所以不會形成循環。
 */
import type { Context, Hono } from 'hono';
import type { Db, Queryable } from './db';
import { ApiError, readBody, type Identity } from './http';
import { ackGiftNoticesRequest, sendGiftRequest, type AcceptGiftResponse, type ClassmatesResponse, type GiftNotice, type GiftsResponse, type SendGiftResponse } from '../src/online/protocol';
import { GIFT_DAILY_LIMIT, GIFT_EXPIRE_DAYS, canReceive, findSticker, giftPrice, receiveGift } from '../src/store/gifts';
import { equippedOf } from '../src/store/catalog';
import { dateKey, type Profile } from '../src/store/save';

/** 資料表 gifts 的一列 */
interface GiftRow {
  id: string;
  room_code: string;
  from_id: string | null;
  to_id: string | null;
  from_nickname: string;
  to_nickname: string;
  item_id: string;
  price: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'returned' | 'cancelled';
  sender_seen: boolean;
  created_at: Date;
  resolved_at: Date | null;
}

/** 帳號（禮物相關的欄位） */
interface AccountLite {
  id: string;
  room_code: string;
  nickname: string;
  profile: Profile;
  rev: number;
}

/** 存檔改了：交易結束後要通知那位孩子的裝置同步 */
interface ProfileEvent {
  accountId: string;
  rev: number;
  profile: Profile;
}

/** 交易結束後要送出的通知：存檔有變的人、禮物狀態有變的人 */
interface Events {
  profiles: ProfileEvent[];
  gifts: string[];
}

/** 送禮路由需要的外部功能 */
export interface GiftDeps {
  db: Db;
  now: () => Date;
  /** 驗證孩子的權杖（app.ts 提供） */
  authenticate: (c: Context, kind: 'kid') => Promise<Identity>;
  isOnline: (accountId: string) => boolean;
  /** 某位孩子的存檔在伺服器端改了（送禮扣款、收下、退款） */
  onProfileChanged?: (accountId: string, rev: number, profile: Profile) => void;
  /** 某位孩子的禮物狀態有變（收到新禮物，或送出的禮物有結果） */
  onGift?: (accountId: string) => void;
}

/** 交易結束後送出通知 */
function emit(deps: Pick<GiftDeps, 'onProfileChanged' | 'onGift'>, events: Events): void {
  for (const e of events.profiles) deps.onProfileChanged?.(e.accountId, e.rev, e.profile);
  for (const id of new Set(events.gifts)) deps.onGift?.(id);
}

/** 今天（伺服器時區）0 點；每日上限從這裡開始算，和存檔的 dateKey 同一套日期 */
function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** 多久以前送出的禮物算過期 */
function expireCutoff(now: Date): Date {
  return new Date(now.getTime() - GIFT_EXPIRE_DAYS * 24 * 3600 * 1000);
}

/** 依 id 順序鎖住幾個帳號，回傳 id → 帳號 */
async function lockAccounts(tx: Queryable, ids: string[]): Promise<Map<string, AccountLite>> {
  if (!ids.length) return new Map();
  const rows = await tx.query<AccountLite>('SELECT id, room_code, nickname, profile, rev FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE', [[...new Set(ids)]]);
  return new Map(rows.map((r) => [r.id, r]));
}

/** 寫回某個帳號的存檔、版本號加一，回傳通知用的事件 */
async function saveProfile(tx: Queryable, id: string, profile: Profile, now: Date): Promise<ProfileEvent> {
  const rows = await tx.query<{ rev: number }>('UPDATE accounts SET profile = $2::jsonb, rev = rev + 1, last_seen = $3::timestamptz WHERE id = $1 RETURNING rev', [
    id,
    JSON.stringify(profile),
    now.toISOString(),
  ]);
  return { accountId: id, rev: rows[0].rev, profile };
}

/**
 * 結束一份待收下的禮物並退款給送禮人（不用了、過期、已經有了、收禮人被移出）。
 * 呼叫前要已經鎖住這份禮物；送禮人的帳號在這裡鎖（傳入 locked 表示已經鎖好了）。送禮人已被移出時不退款。
 */
async function refund(tx: Queryable, gift: GiftRow, status: GiftRow['status'], now: Date, events: Events, locked?: Map<string, AccountLite>): Promise<void> {
  await tx.query('UPDATE gifts SET status = $2, resolved_at = $3::timestamptz WHERE id = $1', [gift.id, status, now.toISOString()]);
  if (!gift.from_id) return;
  const sender = (locked ?? (await lockAccounts(tx, [gift.from_id]))).get(gift.from_id);
  if (!sender) return;
  const profile = { ...sender.profile, coins: sender.profile.coins + gift.price };
  // 同一個交易裡可能退好幾份給同一個人：更新 map 裡的存檔，下一份接著加
  locked?.set(sender.id, { ...sender, profile });
  events.profiles.push(await saveProfile(tx, sender.id, profile, now));
  events.gifts.push(sender.id);
}

/** 掛上送禮相關的路由 */
export function registerGiftRoutes(app: Hono, deps: GiftDeps): void {
  const { db, now } = deps;

  /** 全班同學（不含自己），選送禮對象用；線上的排前面 */
  app.get('/api/classmates', async (c) => {
    const who = await deps.authenticate(c, 'kid');
    const rows = await db.query<AccountLite>('SELECT id, room_code, nickname, profile, rev FROM accounts WHERE room_code = $1 AND id <> $2 ORDER BY created_at, nickname', [
      who.roomCode,
      who.accountId,
    ]);
    const classmates = rows.map((a) => ({
      id: a.id,
      nickname: a.nickname,
      avatar: equippedOf(a.profile),
      online: deps.isOnline(a.id),
      owned: a.profile.inventory.filter((id) => giftPrice(id) !== null),
    }));
    // 穩定排序：線上的在前，其餘照加入順序
    classmates.sort((x, y) => Number(y.online) - Number(x.online));
    return c.json<ClassmatesResponse>({ classmates });
  });

  /** 待收下的禮物、送出的禮物還沒看過的結果、今天送了幾份 */
  app.get('/api/gifts', async (c) => {
    const who = await deps.authenticate(c, 'kid');
    const t = now();
    const incoming = await db.query<GiftRow>("SELECT * FROM gifts WHERE to_id = $1 AND status = 'pending' AND created_at > $2::timestamptz ORDER BY created_at", [
      who.accountId,
      expireCutoff(t).toISOString(),
    ]);
    const done = await db.query<GiftRow>("SELECT * FROM gifts WHERE from_id = $1 AND status <> 'pending' AND NOT sender_seen ORDER BY resolved_at, id", [who.accountId]);
    const notices: GiftNotice[] = done.map((g) => (g.status === 'accepted' ? { id: g.id, kind: 'accepted', to: g.to_nickname, itemId: g.item_id } : { id: g.id, kind: 'refunded', price: g.price }));
    const sent = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM gifts WHERE from_id = $1 AND created_at >= $2::timestamptz', [who.accountId, startOfDay(t).toISOString()]);
    return c.json<GiftsResponse>({
      incoming: incoming.map((g) => ({ id: g.id, from: g.from_nickname, itemId: g.item_id, createdAt: new Date(g.created_at).toISOString() })),
      notices,
      sentToday: sent[0].n,
      dailyLimit: GIFT_DAILY_LIMIT,
    });
  });

  /** 送禮物：先扣送禮人的金幣，禮物變成待收下 */
  app.post('/api/gifts', async (c) => {
    const who = await deps.authenticate(c, 'kid');
    const body = await readBody(c, sendGiftRequest);
    const me = who.accountId!;
    if (body.to === me) throw new ApiError(400, 'gift_self', '不能送給自己');
    const t = now();
    const result = await db.transaction(async (tx) => {
      const accounts = await lockAccounts(tx, [me, body.to]);
      const sender = accounts.get(me);
      if (!sender) throw new ApiError(401, 'unauthorized', '請重新登入');
      // 同一個 id 重送（送出後沒收到回應）：回傳原本那份，不再扣錢
      const existing = (await tx.query<GiftRow>('SELECT * FROM gifts WHERE id = $1', [body.id]))[0];
      if (existing) {
        if (existing.from_id !== me) throw new ApiError(409, 'gift_id_taken', '請再送一次');
        return { created: false, gift: existing, profile: sender.profile, rev: sender.rev };
      }
      const room = (await tx.query<{ gifts_open: boolean }>('SELECT gifts_open FROM rooms WHERE code = $1', [sender.room_code]))[0];
      if (!room?.gifts_open) throw new ApiError(403, 'gifts_closed', '老師把送禮關起來了');
      const recipient = accounts.get(body.to);
      if (!recipient || recipient.room_code !== sender.room_code) throw new ApiError(404, 'no_classmate', '找不到這位同學');
      const price = giftPrice(body.itemId);
      if (price === null) throw new ApiError(400, 'not_giftable', '這個不能當禮物送');
      if (!canReceive(recipient.profile, body.itemId)) throw new ApiError(409, 'already_owned', `${recipient.nickname}已經有了`);
      if (!findSticker(body.itemId)) {
        const pending = await tx.query("SELECT 1 FROM gifts WHERE to_id = $1 AND item_id = $2 AND status = 'pending'", [recipient.id, body.itemId]);
        if (pending.length) throw new ApiError(409, 'already_pending', `${recipient.nickname}還有一份一樣的禮物沒收下`);
      }
      const sent = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM gifts WHERE from_id = $1 AND created_at >= $2::timestamptz', [me, startOfDay(t).toISOString()]);
      if (sent[0].n >= GIFT_DAILY_LIMIT) throw new ApiError(429, 'gift_limit', `今天已經送 ${GIFT_DAILY_LIMIT} 份禮物了，明天再送吧`);
      if (sender.profile.coins < price) throw new ApiError(409, 'not_enough', '金幣不夠');

      const saved = await saveProfile(tx, me, { ...sender.profile, coins: sender.profile.coins - price }, t);
      const gift = (
        await tx.query<GiftRow>(
          `INSERT INTO gifts (id, room_code, from_id, to_id, from_nickname, to_nickname, item_id, price, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9::timestamptz) RETURNING *`,
          [body.id, sender.room_code, me, recipient.id, sender.nickname, recipient.nickname, body.itemId, price, t.toISOString()],
        )
      )[0];
      return { created: true, gift, profile: saved.profile, rev: saved.rev };
    });
    if (result.created) emit(deps, { profiles: [{ accountId: me, rev: result.rev, profile: result.profile }], gifts: result.gift.to_id ? [result.gift.to_id] : [] });
    const g = result.gift;
    return c.json<SendGiftResponse>({ gift: { id: g.id, to: g.to_nickname, itemId: g.item_id, price: g.price }, profile: result.profile, rev: result.rev });
  });

  /** 鎖住一份送給我的禮物；不存在回 404，已經處理過回 409 */
  const lockMyPendingGift = async (tx: Queryable, giftId: string, me: string): Promise<GiftRow> => {
    const gift = (await tx.query<GiftRow>('SELECT * FROM gifts WHERE id = $1 AND to_id = $2 FOR UPDATE', [giftId, me]))[0];
    if (!gift) throw new ApiError(404, 'no_gift', '找不到這份禮物');
    if (gift.status !== 'pending') throw new ApiError(409, 'gift_done', '這份禮物已經處理過了');
    return gift;
  };

  /** 收下：貼紙加一或外觀放進收藏；已經有了就自動退回；放太久就當作過期 */
  app.post('/api/gifts/:id/accept', async (c) => {
    const who = await deps.authenticate(c, 'kid');
    const me = who.accountId!;
    const t = now();
    const events: Events = { profiles: [], gifts: [] };
    const result = await db.transaction(async (tx) => {
      const gift = await lockMyPendingGift(tx, c.req.param('id'), me);
      const accounts = await lockAccounts(tx, gift.from_id ? [me, gift.from_id] : [me]);
      const mine = accounts.get(me);
      if (!mine) throw new ApiError(401, 'unauthorized', '請重新登入');
      // 交易裡不能丟錯誤（會把退款一起撤銷），先回傳結果，交易結束後再回 409
      if (new Date(gift.created_at).getTime() <= expireCutoff(t).getTime()) {
        await refund(tx, gift, 'expired', t, events, accounts);
        return { kind: 'expired' as const };
      }
      if (!canReceive(mine.profile, gift.item_id)) {
        await refund(tx, gift, 'returned', t, events, accounts);
        return { kind: 'returned' as const, profile: mine.profile, rev: mine.rev };
      }
      const saved = await saveProfile(tx, me, receiveGift(mine.profile, { itemId: gift.item_id, from: gift.from_nickname }, dateKey(t)), t);
      await tx.query("UPDATE gifts SET status = 'accepted', resolved_at = $2::timestamptz WHERE id = $1", [gift.id, t.toISOString()]);
      events.profiles.push(saved);
      if (gift.from_id) events.gifts.push(gift.from_id);
      return { kind: 'accepted' as const, profile: saved.profile, rev: saved.rev };
    });
    emit(deps, events);
    if (result.kind === 'expired') throw new ApiError(409, 'gift_expired', '這份禮物放太久了，已經退回給朋友');
    return c.json<AcceptGiftResponse>({ status: result.kind, profile: result.profile, rev: result.rev });
  });

  /** 不用了：金幣退回送禮人 */
  app.post('/api/gifts/:id/decline', async (c) => {
    const who = await deps.authenticate(c, 'kid');
    const t = now();
    const events: Events = { profiles: [], gifts: [] };
    await db.transaction(async (tx) => {
      const gift = await lockMyPendingGift(tx, c.req.param('id'), who.accountId!);
      const expired = new Date(gift.created_at).getTime() <= expireCutoff(t).getTime();
      await refund(tx, gift, expired ? 'expired' : 'declined', t, events);
    });
    emit(deps, events);
    return c.json({ ok: true });
  });

  /** 送禮結果看過了 */
  app.post('/api/gifts/notices/ack', async (c) => {
    const who = await deps.authenticate(c, 'kid');
    const body = await readBody(c, ackGiftNoticesRequest);
    if (body.ids.length) {
      await db.query("UPDATE gifts SET sender_seen = true WHERE from_id = $1 AND id = ANY($2) AND status <> 'pending'", [who.accountId, body.ids]);
    }
    return c.json({ ok: true });
  });
}

/**
 * 過期掃描：7 天前送出、還沒收下的禮物退款給送禮人（伺服器啟動時與每小時執行）。
 * 每份禮物各自一個交易，一份出錯不影響其他份。回傳處理了幾份。
 */
export async function expireGifts(deps: Pick<GiftDeps, 'db' | 'onProfileChanged' | 'onGift'> & { now?: () => Date }): Promise<number> {
  const t = (deps.now ?? (() => new Date()))();
  const due = await deps.db.query<{ id: string }>("SELECT id FROM gifts WHERE status = 'pending' AND created_at <= $1::timestamptz ORDER BY created_at", [expireCutoff(t).toISOString()]);
  let count = 0;
  for (const { id } of due) {
    const events: Events = { profiles: [], gifts: [] };
    const done = await deps.db.transaction(async (tx) => {
      const gift = (await tx.query<GiftRow>("SELECT * FROM gifts WHERE id = $1 AND status = 'pending' FOR UPDATE", [id]))[0];
      if (!gift) return false;
      await refund(tx, gift, 'expired', t, events);
      return true;
    });
    if (done) count += 1;
    emit(deps, events);
  }
  return count;
}

/**
 * 老師移出成員：在同一個交易裡先把別人送給他、還沒收的禮物退款，再刪帳號。
 * 帳號不在這個房間時回傳 null（呼叫端回 404）；成功時回傳要送出的通知。
 *
 * 先鎖住和他有關的所有待收禮物（送給他的、他送出的），再鎖帳號：刪帳號時資料庫會把他送出的禮物的 from_id 改成空的，
 * 那些列如果沒先鎖，可能和「收禮人正在收下」的交易互相等待。極少數情況下，鎖禮物和鎖帳號之間剛好有人送禮給他，
 * 那份禮物會變成沒有收禮人的待收禮物，7 天後由過期掃描退款。
 */
export async function removeMemberWithRefunds(db: Db, accountId: string, roomCode: string, now: Date): Promise<Events | null> {
  const events: Events = { profiles: [], gifts: [] };
  const removed = await db.transaction(async (tx) => {
    const member = (await tx.query<{ id: string }>('SELECT id FROM accounts WHERE id = $1 AND room_code = $2', [accountId, roomCode]))[0];
    if (!member) return false;
    const related = await tx.query<GiftRow>("SELECT * FROM gifts WHERE (to_id = $1 OR from_id = $1) AND status = 'pending' ORDER BY id FOR UPDATE", [accountId]);
    const incoming = related.filter((g) => g.to_id === accountId);
    const locked = await lockAccounts(tx, [accountId, ...incoming.map((g) => g.from_id).filter((id): id is string => !!id)]);
    for (const gift of incoming) await refund(tx, gift, 'cancelled', now, events, locked);
    await tx.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    return true;
  });
  return removed ? events : null;
}

/** 送出移出成員後的通知（app.ts 用） */
export function emitGiftEvents(deps: Pick<GiftDeps, 'onProfileChanged' | 'onGift'>, events: Events): void {
  emit(deps, events);
}
