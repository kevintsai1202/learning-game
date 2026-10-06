/**
 * 清掉正式資料庫裡 e2e 建的測試資料（scripts/deploy/purge-test-rooms.cjs，A5 上線後用）：
 * e2e 的大人帳號（帳號名稱 e2e_ 開頭、email 是「帳號名稱@example.com」、密碼 teach1234，三個都符合才算）連同它的班級與角色，
 * 以及改版前用管理密碼 teach123 建的測試房間。真正的資料不能動；測試班級裡有別人家長名下的角色時拒絕刪除。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { openTestDb, resetDb } from './helpers';
import { hashSecret } from '../../server/auth';
import { migrate, openDb, type Db } from '../../server/db';

/** 腳本是 CommonJS（在伺服器容器裡直接用 node 執行），用 require 載入 */
const { purgeTestData } = createRequire(import.meta.url)('../../scripts/deploy/purge-test-rooms.cjs') as {
  purgeTestData: (query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>, opts: { apply: boolean; log: (msg: string) => void }) => Promise<{ users: number; rooms: number; blocked: boolean }>;
};

let db: Db;
beforeAll(async () => {
  db = await openTestDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
});

const T = '2026-10-04T08:00:00.000Z';
/** 給腳本的查詢函式（回傳資料列） */
const query = (sql: string, params?: unknown[]) => db.query(sql, params);

/** 建一個大人帳號 */
async function user(id: string, username: string, email: string, password: string, roles: { parent: boolean; teacher: boolean }) {
  await db.query(
    'INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at) VALUES ($1, $2, lower($2), $3, $4, $5, $6, $7::timestamptz)',
    [id, username, await hashSecret(password), email, roles.parent, roles.teacher, T],
  );
}
/** 建一個班級（owner 是老師帳號 id；legacyPassword 是改版前的管理密碼） */
async function room(code: string, owner: string | null, legacyPassword?: string) {
  await db.query('INSERT INTO rooms (code, name, owner_id, teacher_hash, created_at) VALUES ($1, $1, $2, $3, $4::timestamptz)', [code, owner, legacyPassword ? await hashSecret(legacyPassword) : null, T]);
}
/**
 * 建一個角色（班級或家長至少一個）：和升級到第 10 版（多班級）後的資料一樣，舊欄位 room_code 記著班級，
 * 成員資格在 class_members。extraRooms 是另外加入的班級（只有成員資格）
 */
async function kid(id: string, roomCode: string | null, parent: string | null, extraRooms: string[] = []) {
  await db.query(
    `INSERT INTO accounts (id, room_code, parent_id, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
     VALUES ($1, $2, $3, $1, $1, NULL, '{}'::jsonb, 1, $4::timestamptz, $4::timestamptz)`,
    [id, roomCode, parent, T],
  );
  for (const code of [...(roomCode ? [roomCode] : []), ...extraRooms]) {
    await db.query('INSERT INTO class_members (account_id, room_code, nickname, nickname_key, joined_at) VALUES ($1, $2, $1, $1, $3::timestamptz)', [id, code, T]);
  }
}
/** 目前的資料筆數 */
async function counts() {
  const n = async (table: string) => ((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))[0].n);
  return { users: await n('users'), rooms: await n('rooms'), accounts: await n('accounts') };
}

/** 一組資料：e2e 的老師與家長（班級、班上的孩子、名下的角色）、真的老師與家長、改版前的測試房間與真房間 */
async function seed() {
  await user('u-e2e-t', 'e2e_mgt3x1ab', 'e2e_mgt3x1ab@example.com', 'teach1234', { parent: false, teacher: true });
  await user('u-e2e-p', 'e2e_mgt3x2cd', 'e2e_mgt3x2cd@example.com', 'teach1234', { parent: true, teacher: false });
  await room('111111', 'u-e2e-t');
  await kid('k-e2e-class', '111111', null);
  await kid('k-e2e-owned', '111111', 'u-e2e-p');
  await kid('k-e2e-cloud', null, 'u-e2e-p');
  // 真的帳號：帳號名稱像 e2e 但 email 或密碼不符，也不能動
  await user('u-real-t', 'teacher_lin', 'lin@school.example.tw', 'secret-pass', { parent: false, teacher: true });
  await user('u-real-x', 'e2e_lookalike', 'someone@gmail.com', 'teach1234', { parent: true, teacher: false });
  await room('222222', 'u-real-t');
  await kid('k-real', '222222', null);
  await room('333333', null, 'teach123');
  await kid('k-legacy-test', '333333', null);
  await room('444444', null, 'real-admin-pass');
}

describe('清掉 e2e 的測試資料', () => {
  it('預設只列出，不刪除', async () => {
    await seed();
    const before = await counts();
    const logs: string[] = [];
    const r = await purgeTestData(query, { apply: false, log: (m) => logs.push(m) });
    expect(r).toEqual({ users: 2, rooms: 2, blocked: false });
    expect(await counts()).toEqual(before);
    expect(logs.join('\n')).toContain('e2e_mgt3x1ab');
    expect(logs.join('\n')).toContain('333333');
  });

  it('--apply：刪掉 e2e 帳號（連同班級、班上角色、名下角色）與改版前的測試房間；真的資料都留著', async () => {
    await seed();
    await purgeTestData(query, { apply: true, log: () => undefined });
    expect((await db.query<{ id: string }>('SELECT id FROM users ORDER BY id')).map((r) => r.id)).toEqual(['u-real-t', 'u-real-x']);
    expect((await db.query<{ code: string }>('SELECT code FROM rooms ORDER BY code')).map((r) => r.code)).toEqual(['222222', '444444']);
    expect((await db.query<{ id: string }>('SELECT id FROM accounts ORDER BY id')).map((r) => r.id)).toEqual(['k-real']);
  });

  it('資料表還是改版前的版本（A5 上線前的正式環境，沒有大人帳號）：說明要上線後才能用，什麼都不動', async () => {
    const old = await openDb({});
    try {
      await migrate(old, { upTo: 3 });
      await old.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('555555', '舊', 'h', $1::timestamptz)", [T]);
      const logs: string[] = [];
      const r = await purgeTestData((sql, params) => old.query(sql, params), { apply: true, log: (m) => logs.push(m) });
      expect(r).toEqual({ users: 0, rooms: 0, blocked: true });
      expect(logs.join('\n')).toContain('上線後');
      expect((await old.query('SELECT code FROM rooms')).length).toBe(1);
    } finally {
      await old.close();
    }
  });

  it('多班級：已經離開測試班級的角色（舊欄位還指著那一班）不算成員、不會被誤刪；也在真班級的純班級角色留著，只拿掉測試班級', async () => {
    await seed();
    await user('u-real-p', 'mom_chen', 'mom@school.example.tw', 'secret-pass', { parent: true, teacher: false });
    // 真的家長名下、以前在測試班級（升級時舊欄位記著）、後來退出了：沒有成員資格
    await db.query(
      `INSERT INTO accounts (id, room_code, parent_id, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
       VALUES ('k-left', '111111', 'u-real-p', 'k-left', 'k-left', NULL, '{}'::jsonb, 1, $1::timestamptz, $1::timestamptz)`,
      [T],
    );
    // 沒有家長、同時在測試班級與真班級
    await kid('k-both', null, null, ['111111', '222222']);
    const r = await purgeTestData(query, { apply: true, log: () => undefined });
    expect(r.blocked).toBe(false);
    expect((await db.query<{ id: string }>('SELECT id FROM accounts ORDER BY id')).map((x) => x.id)).toEqual(['k-both', 'k-left', 'k-real']);
    expect((await db.query<{ room_code: string }>("SELECT room_code FROM class_members WHERE account_id = 'k-both'")).map((x) => x.room_code)).toEqual(['222222']);
  });

  it('沒有密碼的帳號（L1 起用 Google 註冊的）不算測試帳號，也不會出錯：就算帳號名稱與 email 都像 e2e 的也留著', async () => {
    await seed();
    await db.query(
      "INSERT INTO users (id, username, username_key, password_hash, email, is_parent, is_teacher, created_at) VALUES ('u-google', 'e2e_googleonly', 'e2e_googleonly', NULL, 'e2e_googleonly@example.com', true, false, $1::timestamptz)",
      [T],
    );
    const r = await purgeTestData(query, { apply: true, log: () => undefined });
    expect(r.users).toBe(2);
    expect((await db.query("SELECT id FROM users WHERE id = 'u-google'")).length).toBe(1);
  });

  it('測試班級裡有別人家長名下的角色：拒絕刪除（刪班級會連帶刪掉那個角色），什麼都不動', async () => {
    await seed();
    await user('u-real-p', 'mom_chen', 'mom@school.example.tw', 'secret-pass', { parent: true, teacher: false });
    await kid('k-real-owned', '111111', 'u-real-p');
    const before = await counts();
    const logs: string[] = [];
    const r = await purgeTestData(query, { apply: true, log: (m) => logs.push(m) });
    expect(r.blocked).toBe(true);
    expect(logs.join('\n')).toContain('k-real-owned');
    expect(await counts()).toEqual(before);
  });
});
