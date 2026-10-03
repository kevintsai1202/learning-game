/**
 * 資料表升級（第 4 版：大人帳號）：正式環境是「v1～v3 已套用、再加 v4」這條路，
 * 舊資料（用管理密碼建的房間、孩子帳號與權杖）升級後要原封不動，新的房間改由老師帳號擁有。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, openDb, type Db } from '../../server/db';
import { lookupToken } from '../../server/tokens';
import { tokenHash } from '../../server/auth';

/** 已經升到最新版的資料庫（後兩個測試共用；全套平行跑時少開一個 PGlite） */
let latest: Db;
beforeAll(async () => {
  latest = await openDb({});
  await migrate(latest);
});
afterAll(async () => {
  await latest.close();
});

/** 測試資料的時間 */
const T = '2026-10-03T08:00:00.000Z';

describe('升級到第 4 版', () => {
  it('v3 的舊房間、孩子帳號與權杖都留著；舊房間沒有擁有者', async () => {
    // 這個測試要從 v3 開始，用自己的空資料庫
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 3 });
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('123456', '舊班級', 'scrypt$aaa$bbb', $1::timestamptz)", [T]);
      await d.query(
        `INSERT INTO accounts (id, room_code, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
         VALUES ('acc1', '123456', '小安', '小安', 'scrypt$c$d', '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)`,
        [T],
      );
      await d.query("INSERT INTO tokens (token_hash, kind, room_code, account_id, expires_at) VALUES ($1, 'kid', '123456', 'acc1', '2027-01-01T00:00:00Z')", [
        tokenHash('kid-token-0000000000'),
      ]);

      await migrate(d);

      const room = (await d.query<{ name: string; teacher_hash: string | null; owner_id: string | null }>("SELECT name, teacher_hash, owner_id FROM rooms WHERE code = '123456'"))[0];
      expect(room).toEqual({ name: '舊班級', teacher_hash: 'scrypt$aaa$bbb', owner_id: null });
      expect((await d.query("SELECT 1 FROM accounts WHERE id = 'acc1'")).length).toBe(1);
      const who = await lookupToken(d, 'kid-token-0000000000', new Date('2026-10-04T00:00:00Z'));
      expect(who).toMatchObject({ kind: 'kid', roomCode: '123456', accountId: 'acc1' });
    } finally {
      await d.close();
    }
  });

  it('新的房間由老師帳號擁有，不需要管理密碼；可以重複執行', async () => {
    await migrate(latest);
    await latest.query(
      "INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at) VALUES ('u1', 'Teacher_Wang', 'teacher_wang', 'scrypt$x$y', 'wang@example.com', false, true, $1::timestamptz)",
      [T],
    );
    await latest.query("INSERT INTO rooms (code, name, owner_id, created_at) VALUES ('654321', '二年一班', 'u1', $1::timestamptz)", [T]);
    expect((await latest.query<{ owner_id: string }>("SELECT owner_id FROM rooms WHERE code = '654321'"))[0].owner_id).toBe('u1');
  });

  it('大人帳號至少要有一個身分；帳號名稱不分大小寫不能重複', async () => {
    await expect(
      latest.query("INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('u2', 'nobody', 'nobody', 'h', false, false, $1::timestamptz)", [T]),
    ).rejects.toThrow();
    await latest.query("INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('u3', 'Mom', 'mom', 'h', true, false, $1::timestamptz)", [T]);
    await expect(
      latest.query("INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('u4', 'MOM', 'mom', 'h', true, false, $1::timestamptz)", [T]),
    ).rejects.toThrow();
  });
});
