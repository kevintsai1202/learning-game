/**
 * 唯讀檢查正式資料庫（scripts/deploy/inspect-prod-data.cjs，A5 上線前用）：資料表版本、班級分類
 * （改版前的測試房間、改版前沒有擁有者的真房間、老師帳號的班級）、孩子帳號數、Google 綁定的筆數。
 * 改版前（第 3 版，目前的正式環境）與改版後（第 7 版）都要能用；只回傳筆數與班級代碼、名稱，不回傳暱稱與 email。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { migrate, openDb } from '../../server/db';
import { hashSecret } from '../../server/auth';

/** 腳本是 CommonJS（在伺服器容器裡直接用 node 執行），用 require 載入 */
const { inspect } = createRequire(import.meta.url)('../../scripts/deploy/inspect-prod-data.cjs') as {
  inspect: (query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>, log: (msg: string) => void) => Promise<Record<string, unknown>>;
};

const T = '2026-10-03T08:00:00.000Z';

describe('唯讀檢查正式資料庫', () => {
  it('改版前（第 3 版）：分出測試房間與沒有擁有者的真房間，算出 Google 綁孩子、綁房間的筆數；輸出不含暱稱與 email', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 3 });
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('111111', 'e2e 測試', $1, $2::timestamptz)", [await hashSecret('teach123'), T]);
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('222222', '二年一班', $1, $2::timestamptz)", [await hashSecret('real-admin-pass'), T]);
      for (const [id, room, nick] of [
        ['a1', '111111', '測試小安'],
        ['a2', '222222', '真的小美'],
        ['a3', '222222', '真的小華'],
      ]) {
        await d.query(
          `INSERT INTO accounts (id, room_code, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
           VALUES ($1, $2, $3, $3, 'h', '{}'::jsonb, 1, $4::timestamptz, $4::timestamptz)`,
          [id, room, nick, T],
        );
      }
      await d.query("INSERT INTO google_links (google_sub, account_id, email, linked_at) VALUES ('g1', 'a1', 'test.mom@gmail.com', $1::timestamptz), ('g2', 'a2', 'real.mom@gmail.com', $1::timestamptz)", [T]);
      await d.query("INSERT INTO teacher_google_links (google_sub, room_code, email, linked_at) VALUES ('g3', '222222', 'teacher@gmail.com', $1::timestamptz)", [T]);

      const logs: string[] = [];
      const r = await inspect((sql, params) => d.query(sql, params), (m) => logs.push(m));
      expect(r).toMatchObject({
        version: 3,
        rooms: { total: 2, test: 1, legacyReal: 1, owned: 0 },
        legacyRealRooms: [{ code: '222222', name: '二年一班', members: 2 }],
        accounts: 3,
        googleLinks: { rows: 2, accounts: 2, inTestRooms: 1 },
        teacherGoogleLinks: { rows: 1 },
        users: null,
      });
      const out = logs.join('\n');
      expect(out).toContain('222222');
      for (const secret of ['真的小美', 'real.mom@gmail.com', 'teacher@gmail.com', '測試小安']) expect(out).not.toContain(secret);
    } finally {
      await d.close();
    }
  });

  it('改版後（第 7 版）：老師帳號的班級另外算，Google 綁孩子的表已經沒有了，多一個大人帳號數', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 7, log: () => undefined });
      await d.query("INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at) VALUES ('u1', 'teacher_lin', 'teacher_lin', 'h', 'lin@example.com', false, true, $1::timestamptz)", [T]);
      await d.query("INSERT INTO rooms (code, name, owner_id, created_at) VALUES ('333333', '二年二班', 'u1', $1::timestamptz)", [T]);
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('444444', '舊的班', $1, $2::timestamptz)", [await hashSecret('real-admin-pass'), T]);
      const r = await inspect((sql, params) => d.query(sql, params), () => undefined);
      expect(r).toMatchObject({ version: 7, rooms: { total: 2, test: 0, legacyReal: 1, owned: 1 }, googleLinks: null, teacherGoogleLinks: null, users: 1 });
    } finally {
      await d.close();
    }
  });

  it('多班級（第 10 版）：真房間的成員數看 class_members（不看舊欄位）', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { log: () => undefined });
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('444444', '舊的班', $1, $2::timestamptz)", [await hashSecret('real-admin-pass'), T]);
      await d.query(
        `INSERT INTO accounts (id, room_code, nickname, nickname_key, profile, created_at, last_seen) VALUES
         ('a1', NULL, '小美', '小美', '{}'::jsonb, $1::timestamptz, $1::timestamptz),
         ('a2', '444444', '小安', '小安', '{}'::jsonb, $1::timestamptz, $1::timestamptz)`,
        [T],
      );
      await d.query("INSERT INTO class_members (account_id, room_code, nickname, nickname_key, joined_at) VALUES ('a1', '444444', '小美', '小美', $1::timestamptz)", [T]);
      const r = await inspect((sql, params) => d.query(sql, params), () => undefined);
      expect(r.legacyRealRooms).toEqual([{ code: '444444', name: '舊的班', members: 1 }]);
    } finally {
      await d.close();
    }
  });
});
