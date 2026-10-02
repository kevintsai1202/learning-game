/**
 * 登入權杖的查詢（HTTP 路由與 WebSocket 登入共用）：資料庫只存權杖的雜湊，過期的不算。
 */
import type { Queryable } from './db';
import { tokenHash } from './auth';

/** 權杖驗證後的身分 */
export interface TokenIdentity {
  kind: 'kid' | 'teacher';
  roomCode: string;
  /** 孩子權杖才有 */
  accountId: string | null;
  /** 權杖的雜湊（登出時刪除用） */
  hash: string;
}

/** 查權杖；不存在或過期回傳 null */
export async function lookupToken(q: Queryable, token: string, now: Date): Promise<TokenIdentity | null> {
  const hash = tokenHash(token);
  const row = (
    await q.query<{ kind: string; room_code: string; account_id: string | null }>(
      'SELECT kind, room_code, account_id FROM tokens WHERE token_hash = $1 AND expires_at > $2::timestamptz',
      [hash, now.toISOString()],
    )
  )[0];
  if (!row || (row.kind !== 'kid' && row.kind !== 'teacher')) return null;
  return { kind: row.kind, roomCode: row.room_code, accountId: row.account_id, hash };
}
