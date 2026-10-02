/**
 * 資料庫存取：正式環境用 PostgreSQL（pg），測試與本機開發用 PGlite（WASM 版 PostgreSQL，跑在同一個程序）。
 * 兩者包成同一個介面，SQL 只寫一份（參數用 $1、$2）。
 */
import pg from 'pg';

/** 可以下查詢的對象（資料庫本身或交易） */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** 資料庫連線 */
export interface Db extends Queryable {
  /** 在交易裡執行；fn 丟出例外就 ROLLBACK */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * 開啟資料庫：有 url 就連 PostgreSQL；沒有就用 PGlite（dataDir 有給就存檔案，否則存在記憶體）。
 * PGlite 用動態 import，正式環境（有 DATABASE_URL）不會載入它。
 */
export async function openDb(opts: { url?: string; pgliteDir?: string }): Promise<Db> {
  if (opts.url) return openPg(opts.url);
  return openPglite(opts.pgliteDir);
}

/** PostgreSQL 連線池 */
function openPg(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pool.query(sql, params)).rows as T[];
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: Queryable = {
          async query<R>(sql: string, params: unknown[] = []) {
            return (await client.query(sql, params)).rows as R[];
          },
        };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * PGlite：只有一條連線，交易進行中若有別的查詢插進來會跑進同一個交易，
 * 所以所有查詢與交易都排隊（簡單的 promise 互斥鎖）。
 */
async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
  /** 最後一個排隊中的工作 */
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
  return {
    query: <T>(sql: string, params: unknown[] = []) => exclusive(async () => (await lite.query<T>(sql, params)).rows),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) =>
      exclusive(() =>
        lite.transaction((t) =>
          fn({
            async query<R>(sql: string, params: unknown[] = []) {
              return (await t.query<R>(sql, params)).rows;
            },
          }),
        ),
      ),
    close: () => exclusive(() => lite.close()),
  };
}

/** 資料表結構的版本：每一版是一串 SQL（一句一個元素），只會往後加，不修改已發布的版本 */
const MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS rooms (
        code text PRIMARY KEY,
        name text NOT NULL,
        teacher_hash text NOT NULL,
        join_open boolean NOT NULL DEFAULT true,
        chat_open boolean NOT NULL DEFAULT true,
        gifts_open boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS accounts (
        id text PRIMARY KEY,
        room_code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
        nickname text NOT NULL,
        nickname_key text NOT NULL,
        pin_hash text NOT NULL,
        profile jsonb NOT NULL,
        rev integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL,
        last_seen timestamptz NOT NULL,
        UNIQUE (room_code, nickname_key)
      )`,
      `CREATE TABLE IF NOT EXISTS applied_ops (
        account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        op_id text NOT NULL,
        rejected_reason text,
        applied_at timestamptz NOT NULL,
        PRIMARY KEY (account_id, op_id)
      )`,
      `CREATE INDEX IF NOT EXISTS applied_ops_applied_at ON applied_ops (applied_at)`,
      `CREATE TABLE IF NOT EXISTS tokens (
        token_hash text PRIMARY KEY,
        kind text NOT NULL,
        room_code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
        account_id text REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL
      )`,
    ],
  },
  {
    // Google 快速登入（備選）：家長綁孩子帳號、老師綁房間；一個 Google 可以綁多個，一個孩子／房間也可以綁多個 Google
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS google_links (
        google_sub text NOT NULL,
        account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        email text,
        linked_at timestamptz NOT NULL,
        PRIMARY KEY (google_sub, account_id)
      )`,
      `CREATE INDEX IF NOT EXISTS google_links_account ON google_links (account_id)`,
      `CREATE TABLE IF NOT EXISTS teacher_google_links (
        google_sub text NOT NULL,
        room_code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
        email text,
        linked_at timestamptz NOT NULL,
        PRIMARY KEY (google_sub, room_code)
      )`,
      `CREATE INDEX IF NOT EXISTS teacher_google_links_room ON teacher_google_links (room_code)`,
    ],
  },
];

/** 建表與升級（可以重複執行） */
export async function migrate(db: Db): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await db.transaction(async (tx) => {
      for (const sql of m.statements) await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
    });
  }
}

/** 清空所有資料（測試用；資料表結構保留） */
export async function resetDb(db: Db): Promise<void> {
  await db.query('TRUNCATE rooms, accounts, applied_ops, tokens, google_links, teacher_google_links CASCADE');
}

/** 刪掉 30 天前的操作去重紀錄（伺服器啟動時與每天執行一次） */
export async function pruneAppliedOps(db: Db, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  await db.query('DELETE FROM applied_ops WHERE applied_at < $1::timestamptz', [cutoff]);
}
