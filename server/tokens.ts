/**
 * 登入權杖的查詢（HTTP 路由與 WebSocket 登入共用）：資料庫只存權杖的雜湊，過期的不算。
 * 兩種權杖：孩子（雲端角色）與大人（家長、老師的帳號，不屬於班級）。
 * 孩子權杖的「班級」從成員資格讀（class_members，加入、退出班級立刻生效）：多班級（docs/plans/multi-class.md）起是一個清單，
 * 第一個班級（最早加入的）在前面；沒有班級是空清單。
 * tokens.room_code 對 class 權杖是「用哪一班的代碼登入」（移出、重設密碼時只撤銷那一班的）；家長權杖的這一欄不代表什麼。
 * 改版前的老師權杖（kind 'teacher'，綁房間）已停用，查到一律當作無效。
 */
import type { Queryable } from './db';
import { tokenHash } from './auth';

/** 孩子權杖的來源：class 是孩子用班級代碼登入（學校平板），parent 是家長登入後「在這台裝置玩」 */
export type TokenVia = 'class' | 'parent';

/** 權杖驗證後的身分 */
export type TokenIdentity =
  | {
      kind: 'kid';
      accountId: string;
      /** 這個角色所在的班級，第一個班級在前面；沒有班級（只有家長帳號）是空清單 */
      rooms: string[];
      via: TokenVia;
      /** class 權杖是用哪一班的代碼登入的；家長權杖是 null */
      tokenRoom: string | null;
      /** 權杖的雜湊（登出時刪除用） */
      hash: string;
    }
  | {
      kind: 'user';
      userId: string;
      hash: string;
    };

/** 查權杖；不存在、過期、角色已刪除或是停用的種類回傳 null */
export async function lookupToken(q: Queryable, token: string, now: Date): Promise<TokenIdentity | null> {
  const hash = tokenHash(token);
  const row = (
    await q.query<{ kind: string; via: string; account_id: string | null; user_id: string | null; token_room: string | null; account_exists: boolean; rooms: string[] | null }>(
      `SELECT t.kind, t.via, t.account_id, t.user_id, t.room_code AS token_room, (a.id IS NOT NULL) AS account_exists,
              (SELECT array_agg(m.room_code ORDER BY m.joined_at, m.room_code) FROM class_members m WHERE m.account_id = t.account_id) AS rooms
       FROM tokens t LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.token_hash = $1 AND t.expires_at > $2::timestamptz`,
      [hash, now.toISOString()],
    )
  )[0];
  if (!row) return null;
  if (row.kind === 'kid' && row.account_id && row.account_exists) {
    const via: TokenVia = row.via === 'parent' ? 'parent' : 'class';
    return { kind: 'kid', accountId: row.account_id, rooms: row.rooms ?? [], via, tokenRoom: via === 'class' ? row.token_room : null, hash };
  }
  if (row.kind === 'user' && row.user_id) return { kind: 'user', userId: row.user_id, hash };
  return null;
}
