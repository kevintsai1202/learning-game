/**
 * 刪除正式資料庫裡指定的空房間（scripts/deploy/delete-empty-rooms.cjs，A5 上線前清掉改版前沒有擁有者的空房間用）：
 * 只刪指定代碼、沒有成員、沒有擁有者的房間；有任何一間不符合就整個拒絕。預設只列出，apply 才刪。
 * 改版前（第 3 版，目前的正式環境）與改版後（第 7 版）都要能用。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { migrate, openDb } from '../../server/db';
import { hashSecret } from '../../server/auth';

type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
/** 腳本是 CommonJS（在伺服器容器裡直接用 node 執行），用 require 載入 */
const { deleteEmptyRooms } = createRequire(import.meta.url)('../../scripts/deploy/delete-empty-rooms.cjs') as {
  deleteEmptyRooms: (query: Query, codes: string[], opts: { apply?: boolean; log?: (m: string) => void }) => Promise<{ deleted: number; rooms: string[] }>;
};

const T = '2026-10-04T08:00:00.000Z';

/** 第 3 版資料表：兩間空房間（其中一間有老師權杖）、一間有孩子的房間 */
async function legacyDb() {
  const d = await openDb({});
  await migrate(d, { upTo: 3 });
  for (const [code, name] of [
    ['713521', '020323'],
    ['869912', '020323'],
    ['222222', '二年一班'],
  ]) {
    await d.query('INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ($1, $2, $3, $4::timestamptz)', [code, name, await hashSecret('pw-1234'), T]);
  }
  await d.query(
    "INSERT INTO accounts (id, room_code, nickname, nickname_key, pin_hash, profile, created_at, last_seen) VALUES ('a1', '222222', '小美', '小美', 'x', '{}'::jsonb, $1::timestamptz, $1::timestamptz)",
    [T],
  );
  await d.query("INSERT INTO tokens (token_hash, kind, account_id, room_code, expires_at) VALUES ('h1', 'teacher', NULL, '713521', $1::timestamptz)", [T]);
  const query: Query = (sql, params) => d.query(sql, params);
  return { d, query };
}

describe('刪除指定的空房間', () => {
  it('預設只列出，不刪；加 apply 才刪除（老師權杖跟著房間刪掉）', async () => {
    const { d, query } = await legacyDb();
    try {
      const logs: string[] = [];
      const dry = await deleteEmptyRooms(query, ['713521', '869912'], { log: (m) => logs.push(m) });
      expect(dry).toEqual({ deleted: 0, rooms: ['713521', '869912'] });
      expect((await query('SELECT count(*)::int AS n FROM rooms'))[0].n).toBe(3);
      expect(logs.join('\n')).toContain('713521');
      const done = await deleteEmptyRooms(query, ['713521', '869912'], { apply: true, log: () => undefined });
      expect(done.deleted).toBe(2);
      expect((await query('SELECT code FROM rooms')).map((r) => r.code)).toEqual(['222222']);
      expect((await query('SELECT count(*)::int AS n FROM tokens'))[0].n).toBe(0);
    } finally {
      await d.close();
    }
  });

  it('指定的房間有成員、或代碼不存在：整個拒絕，什麼都不刪', async () => {
    const { d, query } = await legacyDb();
    try {
      await expect(deleteEmptyRooms(query, ['713521', '222222'], { apply: true, log: () => undefined })).rejects.toThrow(/222222/);
      await expect(deleteEmptyRooms(query, ['713521', '999999'], { apply: true, log: () => undefined })).rejects.toThrow(/999999/);
      await expect(deleteEmptyRooms(query, [], { apply: true, log: () => undefined })).rejects.toThrow();
      expect((await query('SELECT count(*)::int AS n FROM rooms'))[0].n).toBe(3);
    } finally {
      await d.close();
    }
  });

  it('改版後（第 7 版）：有擁有者（老師帳號的班級）的房間不能用這支腳本刪', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 7 });
      await d.query(
        "INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('u1', 'teacher1', 'teacher1', 'x', false, true, $1::timestamptz)",
        [T],
      );
      await d.query("INSERT INTO rooms (code, name, teacher_hash, owner_id, created_at) VALUES ('333333', '三年一班', NULL, 'u1', $1::timestamptz)", [T]);
      const query: Query = (sql, params) => d.query(sql, params);
      await expect(deleteEmptyRooms(query, ['333333'], { apply: true, log: () => undefined })).rejects.toThrow(/333333/);
    } finally {
      await d.close();
    }
  });

  it('多班級（第 10 版）：成員看 class_members；空房間刪除時，已經離開那一班（舊欄位還指著它）的角色不會被連帶刪掉', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 10 });
      await d.query("INSERT INTO users (id, username, username_key, password_hash, is_parent, is_teacher, created_at) VALUES ('p1', 'mom', 'mom', 'x', true, false, $1::timestamptz)", [T]);
      for (const code of ['555555', '666666']) await d.query('INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ($1, $1, NULL, $2::timestamptz)', [code, T]);
      // 舊欄位還指著 555555，但已經不是成員（退出了）；666666 有成員
      await d.query(
        `INSERT INTO accounts (id, room_code, parent_id, nickname, nickname_key, profile, created_at, last_seen)
         VALUES ('a1', '555555', 'p1', '安安', '安安', '{}'::jsonb, $1::timestamptz, $1::timestamptz)`,
        [T],
      );
      await d.query("INSERT INTO class_members (account_id, room_code, nickname, nickname_key, joined_at) VALUES ('a1', '666666', '安安', '安安', $1::timestamptz)", [T]);
      const query: Query = (sql, params) => d.query(sql, params);
      await expect(deleteEmptyRooms(query, ['666666'], { apply: true, log: () => undefined })).rejects.toThrow(/666666/);
      expect((await deleteEmptyRooms(query, ['555555'], { apply: true, log: () => undefined })).deleted).toBe(1);
      expect((await query("SELECT room_code FROM accounts WHERE id = 'a1'"))[0]).toEqual({ room_code: null });
      expect((await query("SELECT room_code FROM class_members WHERE account_id = 'a1'")).length).toBe(1);
    } finally {
      await d.close();
    }
  });
});
