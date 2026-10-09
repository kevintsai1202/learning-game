/**
 * 老師發獎勵（老師 GM 的 G3，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：
 * - 老師：POST /api/teacher/rooms/:code/rewards { to: 帳號 id 陣列 | 'all', coins?, sticker? }，
 *   交易裡鎖住目標孩子、用共用的 applyReward 改存檔（rev 加一）、每人記一筆獎勵；之後通知線上的裝置同步並讀獎勵
 * - 孩子：GET /api/rewards（還沒看過的）、POST /api/rewards/seen { ids }（看過了）
 * 獎勵紀錄保存到班級或孩子的角色刪除為止（外鍵 CASCADE）。
 */
import { randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import type { Db, Queryable } from './db';
import { ApiError, readBody, type Identity } from './http';
import { rewardRequest, rewardsSeenRequest, type RewardInfo, type RewardResponse, type RewardsResponse } from '../src/online/protocol';
import { applyReward } from '../src/store/rewards';
import { dateKey, type Profile } from '../src/store/save';

/** 註冊路由需要的東西（app.ts 提供） */
export interface RewardDeps {
  db: Db;
  now: () => Date;
  /** 驗證孩子的權杖 */
  authenticate: (c: Context, kind: 'kid') => Promise<Identity>;
  /** 驗證老師（大人權杖、有老師身分），回傳使用者 id */
  authenticateTeacher: (c: Context) => Promise<string>;
  /** 讀老師自己的班級（別人的班級回 404） */
  loadOwnRoom: (q: Queryable, code: string, ownerId: string) => Promise<{ code: string }>;
  /** 某位孩子的存檔在伺服器端改了 */
  onProfileChanged?: (accountId: string, rev: number, profile: Profile) => void;
  /** 某位孩子收到新的獎勵（線上的裝置重新讀取） */
  onReward?: (accountId: string) => void;
}

export function registerRewardRoutes(app: Hono, deps: RewardDeps): void {
  const { db, now } = deps;

  app.post('/api/teacher/rooms/:code/rewards', async (c) => {
    const owner = await deps.authenticateTeacher(c);
    const body = await readBody(c, rewardRequest);
    const t = now();
    const changed = await db.transaction(async (tx) => {
      const room = await deps.loadOwnRoom(tx, c.req.param('code'), owner);
      const members = (await tx.query<{ account_id: string }>('SELECT account_id FROM class_members WHERE room_code = $1', [room.code])).map((r) => r.account_id);
      const targets = body.to === 'all' ? members : [...new Set(body.to)];
      if (body.to !== 'all' && targets.some((id) => !members.includes(id))) throw new ApiError(400, 'not_member', '有孩子不在這個班級');
      if (!targets.length) throw new ApiError(400, 'no_members', '班上還沒有孩子');
      // 依 id 順序鎖住目標孩子（和送禮、加入、退出一樣先鎖帳號），鎖住之後再確認還在這一班
      const locked = await tx.query<{ id: string; profile: Profile }>('SELECT id, profile FROM accounts WHERE id = ANY($1) ORDER BY id FOR UPDATE', [targets]);
      const still = new Set(
        (await tx.query<{ account_id: string }>('SELECT account_id FROM class_members WHERE room_code = $1 AND account_id = ANY($2)', [room.code, targets])).map((r) => r.account_id),
      );
      const out: { id: string; rev: number; profile: Profile }[] = [];
      for (const kid of locked) {
        if (!still.has(kid.id)) continue;
        const profile = applyReward(kid.profile, { coins: body.coins, sticker: body.sticker }, dateKey(t));
        const rows = await tx.query<{ rev: number }>('UPDATE accounts SET profile = $2::jsonb, rev = rev + 1 WHERE id = $1 RETURNING rev', [kid.id, JSON.stringify(profile)]);
        await tx.query('INSERT INTO rewards (id, room_code, to_id, coins, item_id, created_at) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)', [
          randomUUID(),
          room.code,
          kid.id,
          body.coins ?? 0,
          body.sticker ?? null,
          t.toISOString(),
        ]);
        out.push({ id: kid.id, rev: rows[0].rev, profile });
      }
      return out;
    });
    for (const k of changed) {
      deps.onProfileChanged?.(k.id, k.rev, k.profile);
      deps.onReward?.(k.id);
    }
    return c.json<RewardResponse>({ given: changed.length });
  });

  /** 自己還沒看過的獎勵（最舊的在前面，最多 50 筆） */
  app.get('/api/rewards', async (c) => {
    const who = await deps.authenticate(c, 'kid');
    const rows = await db.query<{ id: string; coins: number; item_id: string | null; created_at: Date; class_name: string }>(
      `SELECT w.id, w.coins, w.item_id, w.created_at, r.name AS class_name FROM rewards w JOIN rooms r ON r.code = w.room_code
       WHERE w.to_id = $1 AND w.seen_at IS NULL ORDER BY w.created_at, w.id LIMIT 50`,
      [who.accountId],
    );
    const rewards: RewardInfo[] = rows.map((r) => ({ id: r.id, coins: r.coins, itemId: r.item_id, className: r.class_name, at: new Date(r.created_at).toISOString() }));
    return c.json<RewardsResponse>({ rewards });
  });

  /** 看過了（只標記自己的） */
  app.post('/api/rewards/seen', async (c) => {
    const who = await deps.authenticate(c, 'kid');
    const body = await readBody(c, rewardsSeenRequest);
    await db.query('UPDATE rewards SET seen_at = $3::timestamptz WHERE to_id = $1 AND id = ANY($2) AND seen_at IS NULL', [who.accountId, body.ids, now().toISOString()]);
    return c.json({ ok: true });
  });
}
