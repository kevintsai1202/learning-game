/**
 * 給正式資料庫裡的孩子金幣（scripts/deploy/grant-coins.cjs，測試用的管理腳本）：參數檢查、用名字找孩子
 * （帳號暱稱、各班暱稱、角色名字）。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { migrate, openDb } from '../../server/db';

const { parseArgs, findKids } = createRequire(import.meta.url)('../../scripts/deploy/grant-coins.cjs') as {
  parseArgs: (argv: string[]) => { name: string; coins: number; apply: boolean };
  findKids: (query: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>, name: string) => Promise<{ id: string; coins: number; rev: number }[]>;
};

const T = '2026-10-11T08:00:00.000Z';
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('給孩子金幣的管理腳本', () => {
  it('參數：名字用 base64 傳；金幣 1～100000；預設只看', () => {
    expect(parseArgs(['--name-b64', b64('狗狗'), '--coins', '2000'])).toEqual({ name: '狗狗', coins: 2000, apply: false });
    expect(parseArgs(['--name-b64', b64('狗狗'), '--coins', '5', '--apply']).apply).toBe(true);
    expect(() => parseArgs(['--coins', '5'])).toThrow();
    expect(() => parseArgs(['--name-b64', b64('狗狗'), '--coins', '0'])).toThrow();
    expect(() => parseArgs(['--name-b64', b64('狗狗'), '--coins', '1.5'])).toThrow();
  });

  it('用名字找孩子：帳號暱稱或角色名字相同；不同名字找不到', async () => {
    const d = await openDb({});
    try {
      await migrate(d);
      for (const [id, nick, name, coins] of [
        ['a1', '狗狗', '狗狗', 12],
        ['a2', '小美', '小美', 3],
      ] as const) {
        await d.query(
          `INSERT INTO accounts (id, room_code, nickname, nickname_key, pin_hash, profile, rev, created_at, last_seen)
           VALUES ($1, NULL, $2, $2, NULL, $3::jsonb, 4, $4::timestamptz, $4::timestamptz)`,
          [id, nick, JSON.stringify({ name, coins }), T],
        );
      }
      const query = (sql: string, params?: unknown[]) => d.query(sql, params) as Promise<Record<string, unknown>[]>;
      expect(await findKids(query, '狗狗')).toEqual([{ id: 'a1', coins: 12, rev: 4 }]);
      expect(await findKids(query, '貓貓')).toEqual([]);
    } finally {
      await d.close();
    }
  });
});
