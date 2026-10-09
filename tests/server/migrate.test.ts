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
      // 多班級（第 10 版）：班級從成員資格讀；舊權杖算用這一班代碼登入的
      expect(who).toMatchObject({ kind: 'kid', rooms: ['123456'], tokenRoom: '123456', accountId: 'acc1' });
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

      // 升到第 9 版：「班級與家長至少一個」的限制在第 5～9 版；第 10 版（多班級）拿掉，見 v9 → v10 的測試
      await migrate(d, { upTo: 9 });

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
  it('v9 → v10（多班級）：既有的班級、暱稱、孩子密碼搬進 class_members；沒有班級的不搬；舊欄位保留；角色可以沒有班級也沒有家長（由程式保證）', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 9 });
      await d.query(
        "INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('t1', 't1', 't1', 'h', false, true, $1::timestamptz), ('p1', 'p1', 'p1', 'h', true, false, $1::timestamptz)",
        [T],
      );
      await d.query("INSERT INTO rooms (code, name, owner_id, created_at) VALUES ('555555', '二年五班', 't1', $1::timestamptz)", [T]);
      await d.query(
        `INSERT INTO accounts (id, room_code, parent_id, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen) VALUES
         ('k1', '555555', NULL, '小安', '小安', 'pin-hash', '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz),
         ('k2', '555555', 'p1', '小明', '小明', NULL, '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz),
         ('k3', NULL, 'p1', '妹妹', '妹妹', NULL, '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)`,
        [T],
      );

      await migrate(d);

      const members = await d.query<{ account_id: string; room_code: string; nickname: string; nickname_key: string; pin_hash: string | null; joined_at: Date }>(
        'SELECT account_id, room_code, nickname, nickname_key, pin_hash, joined_at FROM class_members ORDER BY account_id',
      );
      expect(members.map((m) => [m.account_id, m.room_code, m.nickname, m.nickname_key, m.pin_hash])).toEqual([
        ['k1', '555555', '小安', '小安', 'pin-hash'],
        ['k2', '555555', '小明', '小明', null],
      ]);
      expect(new Date(members[0].joined_at).toISOString()).toBe(new Date(T).toISOString());
      // 舊欄位保留（換版時舊的伺服器還在讀）
      expect((await d.query("SELECT room_code, pin_hash FROM accounts WHERE id = 'k1'"))[0]).toEqual({ room_code: '555555', pin_hash: 'pin-hash' });
      // 同一班的暱稱不能重複；同一個角色不能重複加入同一班
      await expect(d.query("INSERT INTO class_members (account_id, room_code, nickname, nickname_key, joined_at) VALUES ('k3', '555555', '小安', '小安', $1::timestamptz)", [T])).rejects.toThrow();
      await expect(d.query("INSERT INTO class_members (account_id, room_code, nickname, nickname_key, joined_at) VALUES ('k1', '555555', '別名', '別名', $1::timestamptz)", [T])).rejects.toThrow();
      // 「班級與家長至少一個」的限制拿掉了（多班級之後由程式保證）
      await d.query("INSERT INTO accounts (id, nickname, nickname_key, profile, rev, created_at, last_seen) VALUES ('k4', '新', '新', '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)", [T]);
      // 刪掉角色時成員資格跟著刪
      await d.query("DELETE FROM accounts WHERE id = 'k2'");
      expect((await d.query("SELECT 1 FROM class_members WHERE account_id = 'k2'")).length).toBe(0);
      // 可以重複執行
      await migrate(d);
      expect((await d.query('SELECT count(*)::int AS n FROM class_members'))[0].n).toBe(1);
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
  it('v10 → v11（L3 教室密碼）：班級多一欄教室密碼的雜湊，既有班級是 null；可以存', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 10 });
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('777777', '二年七班', 'h', $1::timestamptz)", [T]);

      await migrate(d);

      expect((await d.query("SELECT class_password_hash FROM rooms WHERE code = '777777'"))[0].class_password_hash).toBeNull();
      await d.query("UPDATE rooms SET class_password_hash = 'scrypt$x$y' WHERE code = '777777'");
      expect((await d.query("SELECT class_password_hash FROM rooms WHERE code = '777777'"))[0].class_password_hash).toBe('scrypt$x$y');
      await migrate(d);
    } finally {
      await d.close();
    }
  });
  it('v11 → v12（L4 家長連結卡）：新增 claim_codes；孩子或班級刪除時跟著刪', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 11 });
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('888888', '二年八班', 'h', $1::timestamptz)", [T]);
      await d.query(
        "INSERT INTO accounts (id, room_code, nickname, nickname_key, profile, rev, created_at, last_seen) VALUES ('k8', NULL, '小安', '小安', '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)",
        [T],
      );

      await migrate(d);

      await d.query("INSERT INTO claim_codes (code_hash, account_id, room_code, expires_at, created_at) VALUES ('h1', 'k8', '888888', $1::timestamptz, $1::timestamptz)", [T]);
      expect((await d.query('SELECT used_at FROM claim_codes'))[0].used_at).toBeNull();
      await d.query("DELETE FROM accounts WHERE id = 'k8'");
      expect((await d.query('SELECT 1 FROM claim_codes')).length).toBe(0);
      await migrate(d);
    } finally {
      await d.close();
    }
  });

  it('v12 → v13（老師 GM 的 G3 發獎勵）：新增 rewards；孩子或班級刪除時跟著刪', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 12 });
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('777777', '二年七班', 'h', $1::timestamptz)", [T]);
      await d.query(
        "INSERT INTO accounts (id, room_code, nickname, nickname_key, profile, rev, created_at, last_seen) VALUES ('k7', NULL, '小安', '小安', '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)",
        [T],
      );

      await migrate(d);

      await d.query("INSERT INTO rewards (id, room_code, to_id, coins, item_id, created_at) VALUES ('r1', '777777', 'k7', 10, NULL, $1::timestamptz)", [T]);
      expect((await d.query('SELECT seen_at FROM rewards'))[0].seen_at).toBeNull();
      await d.query("DELETE FROM rooms WHERE code = '777777'");
      expect((await d.query('SELECT 1 FROM rewards')).length).toBe(0);
      await migrate(d);
    } finally {
      await d.close();
    }
  });
});
