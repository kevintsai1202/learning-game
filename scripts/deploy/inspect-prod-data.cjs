/**
 * 唯讀檢查正式資料庫（A5 上線前；docs/plans/accounts.md 第 9 節 A5 的「上線前」第 3 步）：
 * - 資料表版本
 * - 班級：改版前用管理密碼 teach123 建的測試房間、改版前沒有擁有者的真房間（改版後沒有登入方式，要先加認領流程）、老師帳號的班級
 * - 孩子帳號數；Google 綁孩子（google_links）、Google 綁房間（teacher_google_links）的筆數（第 7 版會刪掉這兩張表）
 * - 大人帳號數（改版後才有）
 * 整段在 READ ONLY 交易裡執行，不會改任何東西；只印筆數、班級代碼與名稱、日期，不印孩子的暱稱與 email。
 * 改版前（第 3 版）與改版後（第 7 版）都能用。
 *
 * 在班級伺服器的容器裡執行（容器裡有 node、pg 與 DATABASE_URL）；外層用 scripts/deploy/inspect-prod-data.ps1 送進去。
 * 邏輯在 inspect，tests/server/inspectProdData.test.ts 用 PGlite 測。
 */
const { scrypt, timingSafeEqual } = require('node:crypto');

/** 改版前 e2e 測試房間的管理密碼 */
const LEGACY_TEST_PASSWORD = 'teach123';
/** 和 server/auth.ts 相同的 scrypt 參數 */
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;

/** 雜湊（格式 scrypt$<salt>$<hash>，base64url）是不是這個密碼 */
function matchesPassword(stored, password) {
  const [algo, saltText, hashText] = String(stored ?? '').split('$');
  if (algo !== 'scrypt' || !saltText || !hashText) return Promise.resolve(false);
  const expected = Buffer.from(hashText, 'base64url');
  return new Promise((resolve, reject) =>
    scrypt(password, Buffer.from(saltText, 'base64url'), KEY_LEN, SCRYPT, (err, key) => (err ? reject(err) : resolve(key.length === expected.length && timingSafeEqual(key, expected)))),
  );
}

/** 日期只取年月日 */
const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '—');

/**
 * 檢查資料庫（只讀）；query(sql, params) 回傳資料列，log 印出摘要。回傳摘要物件（沒有暱稱與 email）。
 */
async function inspect(query, log) {
  const has = async (name) => (await query('SELECT to_regclass($1) IS NOT NULL AS ok', [name]))[0].ok;
  const hasColumn = async (table, column) =>
    (await query('SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2', [table, column]))[0].n > 0;

  const version = (await query('SELECT max(version)::int AS v FROM schema_migrations'))[0].v;
  log(`資料表版本：${version}`);

  // 班級：老師帳號的（改版後才有 owner_id）、改版前的測試房間、改版前沒有擁有者的真房間
  const owner = (await hasColumn('rooms', 'owner_id')) ? 'r.owner_id' : 'NULL::text AS owner_id';
  const rooms = await query(
    `SELECT r.code, r.name, r.teacher_hash, r.created_at, ${owner},
       (SELECT count(*)::int FROM accounts a WHERE a.room_code = r.code) AS members,
       (SELECT max(a.last_seen) FROM accounts a WHERE a.room_code = r.code) AS last_seen
     FROM rooms r ORDER BY r.created_at, r.code`,
  );
  const test = [];
  const legacyReal = [];
  const owned = [];
  for (const r of rooms) {
    if (r.owner_id) owned.push(r);
    else if (await matchesPassword(r.teacher_hash, LEGACY_TEST_PASSWORD)) test.push(r);
    else legacyReal.push(r);
  }
  log(`班級 ${rooms.length} 間：改版前的測試房間（管理密碼 ${LEGACY_TEST_PASSWORD}）${test.length} 間、改版前沒有擁有者的真房間 ${legacyReal.length} 間、老師帳號的班級 ${owned.length} 間`);
  for (const r of legacyReal) log(`  真房間 ${r.code}  ${r.name}  成員 ${r.members}  建立 ${day(r.created_at)}  最後上線 ${day(r.last_seen)}`);

  const accounts = (await query('SELECT count(*)::int AS n FROM accounts'))[0].n;
  log(`孩子帳號 ${accounts} 個`);

  // Google 綁孩子（第 7 版刪掉）：只算筆數，以及有幾個孩子在測試房間
  let googleLinks = null;
  if (await has('google_links')) {
    googleLinks = (
      await query(
        `SELECT count(*)::int AS rows, count(DISTINCT l.google_sub)::int AS googles, count(DISTINCT l.account_id)::int AS accounts,
           count(DISTINCT l.account_id) FILTER (WHERE a.room_code = ANY($1))::int AS "inTestRooms"
         FROM google_links l JOIN accounts a ON a.id = l.account_id`,
        [test.map((r) => r.code)],
      )
    )[0];
    log(`Google 綁孩子（google_links）：${googleLinks.rows} 筆、${googleLinks.googles} 個 Google、${googleLinks.accounts} 個孩子（其中在測試房間 ${googleLinks.inTestRooms} 個）`);
  } else {
    log('Google 綁孩子（google_links）：資料表已經沒有了');
  }
  let teacherGoogleLinks = null;
  if (await has('teacher_google_links')) {
    teacherGoogleLinks = (await query('SELECT count(*)::int AS rows, count(DISTINCT room_code)::int AS rooms FROM teacher_google_links'))[0];
    log(`Google 綁房間（teacher_google_links）：${teacherGoogleLinks.rows} 筆、${teacherGoogleLinks.rooms} 間房間`);
  } else {
    log('Google 綁房間（teacher_google_links）：資料表已經沒有了');
  }

  const users = (await has('users')) ? (await query('SELECT count(*)::int AS n FROM users'))[0].n : null;
  log(users === null ? '大人帳號：資料表還沒有（A5 上線後才有）' : `大人帳號 ${users} 個`);

  return {
    version,
    rooms: { total: rooms.length, test: test.length, legacyReal: legacyReal.length, owned: owned.length },
    legacyRealRooms: legacyReal.map((r) => ({ code: r.code, name: r.name, members: r.members })),
    accounts,
    googleLinks,
    teacherGoogleLinks,
    users,
  };
}

/** 在伺服器容器裡執行：用 DATABASE_URL 連正式資料庫，整段在 READ ONLY 交易裡 */
async function main() {
  const { Client } = require('pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN TRANSACTION READ ONLY');
    await inspect((sql, params) => db.query(sql, params).then((res) => res.rows), (m) => console.log(m));
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
    await db.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('檢查失敗：', err.message);
    process.exit(1);
  });
}

module.exports = { inspect };
