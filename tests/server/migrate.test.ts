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

describe('升級到第 5 版（家長的雲端角色）', () => {
  it('v4 的班級、孩子帳號與權杖都留著；舊權杖算「班級來源」；角色可以沒有班級但要有家長', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 4 });
      await d.query(
        "INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at) VALUES ('t1', 'Teacher', 'teacher', 'h', 't@example.com', false, true, $1::timestamptz)",
        [T],
      );
      await d.query("INSERT INTO rooms (code, name, owner_id, created_at) VALUES ('222222', '二年二班', 't1', $1::timestamptz)", [T]);
      await d.query(
        `INSERT INTO accounts (id, room_code, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
         VALUES ('acc2', '222222', '小美', '小美', 'scrypt$c$d', '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)`,
        [T],
      );
      await d.query("INSERT INTO tokens (token_hash, kind, room_code, account_id, expires_at) VALUES ($1, 'kid', '222222', 'acc2', '2027-01-01T00:00:00Z')", [
        tokenHash('kid-token-1111111111'),
      ]);

      await migrate(d);

      expect((await d.query<{ via: string }>("SELECT via FROM tokens WHERE account_id = 'acc2'"))[0].via).toBe('class');
      expect((await d.query<{ parent_id: string | null }>("SELECT parent_id FROM accounts WHERE id = 'acc2'"))[0].parent_id).toBeNull();
      // 有家長、沒有班級、沒有孩子密碼：可以
      await d.query(
        "INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at) VALUES ('p1', 'Mom', 'mom', 'h', 'm@example.com', true, false, $1::timestamptz)",
        [T],
      );
      await d.query(
        `INSERT INTO accounts (id, room_code, parent_id, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
         VALUES ('acc3', NULL, 'p1', '安安', '安安', NULL, '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)`,
        [T],
      );
      // 班級和家長都沒有：擋下（沒有人能登入它）
      await expect(
        d.query(
          `INSERT INTO accounts (id, room_code, parent_id, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
           VALUES ('acc4', NULL, NULL, '孤兒', '孤兒', NULL, '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)`,
          [T],
        ),
      ).rejects.toThrow();
    } finally {
      await d.close();
    }
  });

  it('v5 的大人帳號都留著；email 不分大小寫只能用一次；email 權杖表可以用（A3）', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 5 });
      for (const [id, name, email] of [
        ['u1', 'Mom', 'mom@example.com'],
        ['u2', 'Dad', 'Dad@Example.com'],
      ]) {
        await d.query(
          "INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at) VALUES ($1, $2, lower($2), 'h', $3, true, false, $4::timestamptz)",
          [id, name, email, T],
        );
      }

      await migrate(d);

      expect((await d.query<{ id: string }>('SELECT id FROM users ORDER BY id')).map((r) => r.id)).toEqual(['u1', 'u2']);
      // 同一個 email（大小寫不同也算）不能給第二個帳號
      await expect(
        d.query(
          "INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at) VALUES ('u3', 'Other', 'other', 'h', 'MOM@example.com', true, false, $1::timestamptz)",
          [T],
        ),
      ).rejects.toThrow();
      await d.query(
        "INSERT INTO email_tokens (token_hash, user_id, purpose, email, expires_at, created_at) VALUES ('h1', 'u1', 'verify', 'mom@example.com', $1::timestamptz, $1::timestamptz)",
        [T],
      );
      // 帳號刪除時權杖跟著刪
      await d.query("DELETE FROM users WHERE id = 'u1'");
      expect(await d.query('SELECT * FROM email_tokens')).toEqual([]);
    } finally {
      await d.close();
    }
  });

  it('v6 → v7（A4）：Google 改綁大人帳號；舊的「Google 綁孩子」表拿掉，刪之前把筆數寫進記錄；一個 Google 只能綁一個大人帳號', async () => {
    const d = await openDb({});
    const logs: string[] = [];
    try {
      await migrate(d, { upTo: 6 });
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('333333', '舊班', 'h', $1::timestamptz)", [T]);
      await d.query(
        `INSERT INTO accounts (id, room_code, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
         VALUES ('acc9', '333333', '小華', '小華', 'h', '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)`,
        [T],
      );
      await d.query("INSERT INTO google_links (google_sub, account_id, email, linked_at) VALUES ('g-old', 'acc9', 'old@gmail.com', $1::timestamptz)", [T]);
      for (const id of ['u1', 'u2']) {
        await d.query(
          "INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at) VALUES ($1, $1, $1, 'h', $1 || '@example.com', true, false, $2::timestamptz)",
          [id, T],
        );
      }

      await migrate(d, { log: (m) => logs.push(m) });

      expect(logs.join('\n')).toContain('google_links');
      expect(logs.join('\n')).toContain('1');
      await expect(d.query('SELECT 1 FROM google_links')).rejects.toThrow();
      await expect(d.query('SELECT 1 FROM teacher_google_links')).rejects.toThrow();
      await d.query("INSERT INTO user_google_links (google_sub, user_id, email, linked_at) VALUES ('g1', 'u1', 'a@gmail.com', $1::timestamptz)", [T]);
      await d.query("INSERT INTO user_google_links (google_sub, user_id, email, linked_at) VALUES ('g2', 'u1', 'b@gmail.com', $1::timestamptz)", [T]);
      // 同一個 Google 不能再綁第二個大人帳號
      await expect(d.query("INSERT INTO user_google_links (google_sub, user_id, email, linked_at) VALUES ('g1', 'u2', 'a@gmail.com', $1::timestamptz)", [T])).rejects.toThrow();
      // 帳號刪除時綁定跟著刪
      await d.query("DELETE FROM users WHERE id = 'u1'");
      expect(await d.query('SELECT * FROM user_google_links')).toEqual([]);
    } finally {
      await d.close();
    }
  });
  it('v7 → v8（老師 GM 的 G0）：既有班級沒有統一版本（null）；可以存班級版本', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 7 });
      await d.query(
        "INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('t1', 't1', 't1', 'h', false, true, $1::timestamptz)",
        [T],
      );
      await d.query("INSERT INTO rooms (code, name, teacher_hash, owner_id, created_at) VALUES ('444444', '二年四班', NULL, 't1', $1::timestamptz)", [T]);

      await migrate(d);

      expect((await d.query("SELECT curriculum FROM rooms WHERE code = '444444'"))[0].curriculum).toBeNull();
      await d.query("UPDATE rooms SET curriculum = $1::jsonb WHERE code = '444444'", [JSON.stringify({ zh: 'nani-zh', math: 'hanlin-math', term: '上' })]);
      expect((await d.query("SELECT curriculum FROM rooms WHERE code = '444444'"))[0].curriculum).toEqual({ zh: 'nani-zh', math: 'hanlin-math', term: '上' });
      // 可以重複執行
      await migrate(d);
    } finally {
      await d.close();
    }
  });
  it('v8 → v9（登入整理 L1）：用 Google 註冊的帳號可以沒有密碼；既有帳號的密碼照舊', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 8 });
      await d.query(
        "INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('u1', 'u1', 'u1', 'old-hash', true, false, $1::timestamptz)",
        [T],
      );
      // 第 8 版還不能沒有密碼
      await expect(
        d.query("INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('u0', 'u0', 'u0', NULL, true, false, $1::timestamptz)", [T]),
      ).rejects.toThrow();

      await migrate(d);

      expect((await d.query("SELECT password_hash FROM users WHERE id = 'u1'"))[0].password_hash).toBe('old-hash');
      await d.query(
        "INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('u2', 'u2', 'u2', NULL, true, false, $1::timestamptz)",
        [T],
      );
      expect((await d.query("SELECT password_hash FROM users WHERE id = 'u2'"))[0].password_hash).toBeNull();
      // 可以重複執行
      await migrate(d);
    } finally {
      await d.close();
    }
  });
});
