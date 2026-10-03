/**
 * 登入權杖的查詢（HTTP 路由與 WebSocket 登入共用）：資料庫只存權杖的雜湊，過期的不算。
 * 兩種權杖：孩子（屬於某個房間的帳號）與大人（家長、老師的帳號，不屬於房間）。
 * 改版前的老師權杖（kind 'teacher'，綁房間）已停用，查到一律當作無效。
 */
import type { Queryable } from './db';
import { tokenHash } from './auth';

/** 權杖驗證後的身分 */
export type TokenIdentity =
  | {
      kind: 'kid';
      roomCode: string;
      accountId: string;
      /** 權杖的雜湊（登出時刪除用） */
      hash: string;
    }
  | {
      kind: 'user';
      userId: string;
      hash: string;
    };

/** 查權杖；不存在、過期或是停用的種類回傳 null */
export async function lookupToken(q: Queryable, token: string, now: Date): Promise<TokenIdentity | null> {
  const hash = tokenHash(token);
  const row = (
    await q.query<{ kind: string; room_code: string | null; account_id: string | null; user_id: string | null }>(
      'SELECT kind, room_code, account_id, user_id FROM tokens WHERE token_hash = $1 AND expires_at > $2::timestamptz',
      [hash, now.toISOString()],
    )
  )[0];
  if (!row) return null;
  if (row.kind === 'kid' && row.room_code && row.account_id) return { kind: 'kid', roomCode: row.room_code, accountId: row.account_id, hash };
  if (row.kind === 'user' && row.user_id) return { kind: 'user', userId: row.user_id, hash };
  return null;
}
