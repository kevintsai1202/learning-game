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
/**
 * 一個資料表版本：statements 依序執行；before 在同一個交易裡、statements 之前執行
 * （例如刪表前把筆數寫進記錄，部署後看記錄就知道刪了什麼）
 */
interface Migration {
  version: number;
  statements: string[];
  before?: (tx: Queryable, log: (msg: string) => void) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
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
  {
    // 送禮物（P3）：送出時扣送禮人的金幣，收下才放進收禮人的收藏。帳號刪除時禮物紀錄保留（id 欄位改成空的，暱稱另外存），
    // 送禮人才看得到退款通知、收禮人仍然可以收下被移出的同學送的禮物
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS gifts (
        id text PRIMARY KEY,
        room_code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
        from_id text REFERENCES accounts(id) ON DELETE SET NULL,
        to_id text REFERENCES accounts(id) ON DELETE SET NULL,
        from_nickname text NOT NULL,
        to_nickname text NOT NULL,
        item_id text NOT NULL,
        price integer NOT NULL,
        status text NOT NULL,
        sender_seen boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL,
        resolved_at timestamptz
      )`,
      `CREATE INDEX IF NOT EXISTS gifts_to_status ON gifts (to_id, status)`,
      `CREATE INDEX IF NOT EXISTS gifts_from_created ON gifts (from_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS gifts_status_created ON gifts (status, created_at)`,
    ],
  },
  {
    // 大人帳號（A1，docs/plans/accounts.md）：家長、老師用自訂的帳號密碼登入，身分可以兩個都有。
    // 新的房間由老師帳號擁有，不再有管理密碼；改版前用管理密碼建的房間原封不動（沒有擁有者）。
    // 權杖多一種「大人」（user_id），大人權杖不屬於任何房間
    version: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        username text NOT NULL,
        username_key text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        email text,
        email_verified boolean NOT NULL DEFAULT false,
        is_parent boolean NOT NULL DEFAULT false,
        is_teacher boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL,
        last_login timestamptz,
        CHECK (is_parent OR is_teacher)
      )`,
      `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_id text REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE rooms ALTER COLUMN teacher_hash DROP NOT NULL`,
      `CREATE INDEX IF NOT EXISTS rooms_owner ON rooms (owner_id)`,
      `ALTER TABLE tokens ADD COLUMN IF NOT EXISTS user_id text REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE tokens ALTER COLUMN room_code DROP NOT NULL`,
      `CREATE INDEX IF NOT EXISTS tokens_user ON tokens (user_id)`,
    ],
  },
  {
    // 家長的雲端角色（A2，docs/plans/accounts.md 第 6 節）：角色可以不屬於任何班級，但要有家長帳號（兩者至少一個，
    // 否則沒有人能登入它）；沒加入班級就沒有孩子密碼。權杖記來源：class（孩子用班級代碼登入）、parent（家長登入後
    // 「在這台裝置玩」）；退出班級時只撤銷 class 的。孩子權杖的班級改從帳號讀，tokens.room_code 只是保留寫入
    version: 5,
    statements: [
      `ALTER TABLE accounts ALTER COLUMN room_code DROP NOT NULL`,
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_id text REFERENCES users(id) ON DELETE CASCADE`,
      `ALTER TABLE accounts ALTER COLUMN pin_hash DROP NOT NULL`,
      `ALTER TABLE accounts ADD CONSTRAINT accounts_class_or_parent CHECK (room_code IS NOT NULL OR parent_id IS NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS accounts_parent ON accounts (parent_id)`,
      `ALTER TABLE tokens ADD COLUMN IF NOT EXISTS via text NOT NULL DEFAULT 'class'`,
    ],
  },
  {
    // Email 驗證與忘記密碼（A3，docs/plans/accounts.md 第 7 節）：寄出的連結只存雜湊、有期限、只能用一次；
    // purpose 是 verify（驗證 email）或 reset（重設密碼），email 記寄到哪個地址（改 email 之後舊的驗證連結失效）。
    // 使用者決定 email 只能綁一個帳號（不分大小寫）：忘記密碼用 email 找一定只對到一個帳號。
    // v4 起註冊就必填 email，所以唯一索引不加 WHERE email IS NOT NULL
    version: 6,
    statements: [
      `CREATE TABLE IF NOT EXISTS email_tokens (
        token_hash text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose text NOT NULL,
        email text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS email_tokens_user ON email_tokens (user_id, purpose, created_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email))`,
    ],
  },
  {
    // Google 改綁大人帳號（A4，docs/plans/accounts.md 第 9 節）：一個 Google 只能綁一個大人帳號（google_sub 是主鍵），
    // 一個大人帳號可以綁多個 Google（爸爸、媽媽各綁一個）。拿掉「Google 直接綁孩子」（google_links）與
    // 改版前「Google 綁房間」（teacher_google_links）：刪之前把筆數寫進記錄（A5 上線前也要先查正式環境）
    version: 7,
    before: async (tx, log) => {
      for (const table of ['google_links', 'teacher_google_links']) {
        const exists = (await tx.query<{ ok: boolean }>('SELECT to_regclass($1) IS NOT NULL AS ok', [table]))[0]?.ok;
        if (!exists) continue;
        const n = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))[0].n;
        if (n > 0) log(`資料表第 7 版：刪除 ${table}（${n} 筆舊的 Google 綁定）`);
      }
    },
    statements: [
      `CREATE TABLE IF NOT EXISTS user_google_links (
        google_sub text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email text,
        linked_at timestamptz NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS user_google_links_user ON user_google_links (user_id)`,
      `DROP TABLE IF EXISTS google_links`,
      `DROP TABLE IF EXISTS teacher_google_links`,
    ],
  },
  {
    // 班級教材版本（老師 GM 的 G0，docs/plans/teacher-gm.md 第 4 節）：老師統一全班在班級島用的國語、數學版本與學期。
    // null 是沒有統一（既有班級升級後都是 null），班級島照各孩子自己的設定
    version: 8,
    statements: [`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS curriculum jsonb`],
  },
  {
    // 登入整理 L1（docs/plans/login-ux-review.md 第 6 節第 1 點）：用 Google 註冊的帳號不用設密碼（password_hash 是 null），
    // 之後可以在帳號設定用 Google 確認身分再設定密碼，或用「忘記密碼」寄到 Google 驗證過的 email 設定
    version: 9,
    statements: [`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`],
  },
  {
    // 多班級（docs/plans/multi-class.md）：一個孩子可以同時在好幾個班級（例如學校的班級＋安親班），最多 5 個（程式檢查）。
    // 每一班各自的暱稱（班上不能重複）與孩子密碼放在 class_members。既有資料搬過來（加入時間用帳號建立時間代替）。
    // accounts.room_code、pin_hash 先保留不清空（換版時舊的伺服器還會讀），之後不再讀也不再寫；
    // 「班級與家長至少一個」改由程式保證（最後一個班級被移出、又沒有家長的角色刪除），所以拿掉這個限制
    version: 10,
    statements: [
      `CREATE TABLE IF NOT EXISTS class_members (
        account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        room_code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
        nickname text NOT NULL,
        nickname_key text NOT NULL,
        pin_hash text,
        joined_at timestamptz NOT NULL,
        PRIMARY KEY (account_id, room_code),
        UNIQUE (room_code, nickname_key)
      )`,
      `INSERT INTO class_members (account_id, room_code, nickname, nickname_key, pin_hash, joined_at)
       SELECT id, room_code, nickname, nickname_key, pin_hash, created_at FROM accounts WHERE room_code IS NOT NULL
       ON CONFLICT DO NOTHING`,
      `ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_class_or_parent`,
    ],
  },
];

/**
 * 建表與升級（可以重複執行）。
 * upTo：只升到這一版（測試用，模擬「正式環境停在舊版、之後才升級」）；沒給就升到最新。
 * log：升級過程要留下的訊息（例如刪了幾筆舊資料）；預設寫到 console.warn
 */
export async function migrate(db: Db, opts: { upTo?: number; log?: (msg: string) => void } = {}): Promise<void> {
  const log = opts.log ?? ((msg: string) => console.warn(msg));
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (done.has(m.version) || (opts.upTo !== undefined && m.version > opts.upTo)) continue;
    await db.transaction(async (tx) => {
      if (m.before) await m.before(tx, log);
      for (const sql of m.statements) await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
    });
  }
}

/** 清空所有資料（測試用；資料表結構保留） */
export async function resetDb(db: Db): Promise<void> {
  await db.query('TRUNCATE rooms, accounts, applied_ops, tokens, gifts, email_tokens, user_google_links, users CASCADE');
}

/** 刪掉 30 天前的操作去重紀錄（伺服器啟動時與每天執行一次） */
export async function pruneAppliedOps(db: Db, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  await db.query('DELETE FROM applied_ops WHERE applied_at < $1::timestamptz', [cutoff]);
}
