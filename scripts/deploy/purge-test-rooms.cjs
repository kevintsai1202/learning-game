/**
 * 清掉正式資料庫裡 e2e 建的測試資料（A5 上線後的資料表；改版前的測試房間也一起清）：
 * - e2e 的大人帳號：帳號名稱 e2e_ 開頭、email 是「帳號名稱@example.com」、密碼 teach1234（e2e/onlineDevice.ts 的 TEST_PASSWORD），
 *   三個都符合才算。刪帳號時，它的班級（rooms.owner_id）、班上的角色（accounts.room_code）、名下的角色（accounts.parent_id）、
 *   權杖、email 連結、Google 綁定都跟著刪（外鍵 CASCADE）。
 * - 改版前用管理密碼 teach123 建的測試房間（沒有擁有者）。
 * 安全檢查：要刪的班級裡如果有不是 e2e 家長名下的角色（真的家長讓孩子加入了測試班級），整個拒絕、什麼都不刪。
 * 預設只列出，加 --apply 才刪除。
 *
 * 在班級伺服器的容器裡執行（容器裡有 node、pg 與 DATABASE_URL）；外層用 scripts/deploy/purge-test-rooms.ps1 送進去，
 * 在容器裡還原成 /app/.purge-test-rooms.cjs 再執行（CommonJS，require 從 /app/node_modules 找 pg）。
 * 邏輯在 purgeTestData，tests/server/purgeTestData.test.ts 用 PGlite 測。
 */
const { scrypt, timingSafeEqual } = require('node:crypto');

/** e2e 大人帳號的密碼（e2e/onlineDevice.ts 的 TEST_PASSWORD） */
const TEST_USER_PASSWORD = 'teach1234';
/** 改版前 e2e 測試房間的管理密碼 */
const LEGACY_ROOM_PASSWORD = 'teach123';
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

/**
 * 找出測試資料，apply 時刪除。query(sql, params) 回傳資料列；log 印出找到什麼。
 * 回傳：測試帳號數、要刪的班級數（測試帳號的班級＋改版前的測試房間）、是否因為安全檢查而拒絕。
 */
async function purgeTestData(query, { apply, log }) {
  // 資料表還是改版前的版本（A5 上線前的正式環境沒有大人帳號、家長名下的角色）：這支腳本用不了
  const ready = (await query("SELECT to_regclass('user_google_links') IS NOT NULL AS ok"))[0]?.ok;
  if (!ready) {
    log('資料表還是改版前的版本：這支腳本要等 A5 上線後（伺服器會升級資料表）才能用；改版前的測試房間請用 main 分支的舊版腳本清。');
    return { users: 0, rooms: 0, blocked: true };
  }
  // e2e 的大人帳號：三個條件都符合才算
  const candidates = await query(
    "SELECT id, username, username_key, email, password_hash, is_parent, is_teacher, created_at FROM users WHERE username_key LIKE 'e2e\\_%' ORDER BY created_at, id",
  );
  const users = [];
  for (const u of candidates) if (u.email === `${u.username_key}@example.com` && (await matchesPassword(u.password_hash, TEST_USER_PASSWORD))) users.push(u);
  const userIds = users.map((u) => u.id);
  log(`測試帳號（帳號名稱 e2e_ 開頭、email 帳號名稱@example.com、密碼 ${TEST_USER_PASSWORD}）${users.length} 個：`);
  for (const u of users) log(`  ${u.username}  ${[u.is_teacher && '老師', u.is_parent && '家長'].filter(Boolean).join('／')}  ${new Date(u.created_at).toISOString()}`);

  const owned = userIds.length ? await query('SELECT code, name FROM rooms WHERE owner_id = ANY($1) ORDER BY code', [userIds]) : [];
  log(`測試帳號的班級 ${owned.length} 間：${owned.map((r) => `${r.code} ${r.name}`).join('、') || '沒有'}`);
  const legacy = [];
  for (const r of await query('SELECT code, name, teacher_hash FROM rooms WHERE owner_id IS NULL AND teacher_hash IS NOT NULL ORDER BY code')) {
    if (await matchesPassword(r.teacher_hash, LEGACY_ROOM_PASSWORD)) legacy.push(r);
  }
  log(`改版前的測試房間（管理密碼 ${LEGACY_ROOM_PASSWORD}）${legacy.length} 間：${legacy.map((r) => `${r.code} ${r.name}`).join('、') || '沒有'}`);
  const roomCodes = [...owned, ...legacy].map((r) => r.code);

  // 安全檢查：要刪的班級裡，不是測試家長名下的角色（刪班級會連帶刪掉它）
  const strangers = roomCodes.length
    ? await query('SELECT id, room_code, parent_id FROM accounts WHERE room_code = ANY($1) AND parent_id IS NOT NULL AND NOT (parent_id = ANY($2)) ORDER BY id', [roomCodes, userIds])
    : [];
  const result = { users: users.length, rooms: roomCodes.length, blocked: strangers.length > 0 };
  if (strangers.length) {
    log(`拒絕刪除：測試班級裡有別人家長名下的角色（刪班級會連帶刪掉）：${strangers.map((a) => `${a.id}（班級 ${a.room_code}）`).join('、')}。請先人工確認。`);
    return result;
  }
  if (!apply) {
    log('只列出；加 --apply 才會刪除。');
    return result;
  }
  // 先刪測試帳號（連同班級、班上與名下的角色），再刪改版前的測試房間
  if (userIds.length) log(`已刪除測試帳號 ${(await query('DELETE FROM users WHERE id = ANY($1) RETURNING id', [userIds])).length} 個。`);
  if (legacy.length) log(`已刪除改版前的測試房間 ${(await query('DELETE FROM rooms WHERE code = ANY($1) RETURNING code', [legacy.map((r) => r.code)])).length} 間。`);
  const left = (await query('SELECT (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM rooms) AS rooms, (SELECT count(*)::int FROM accounts) AS accounts'))[0];
  log(`剩下：大人帳號 ${left.users}、班級 ${left.rooms}、角色 ${left.accounts}`);
  return result;
}

/** 在伺服器容器裡執行：用 DATABASE_URL 連正式資料庫 */
async function main() {
  const { Client } = require('pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const r = await purgeTestData((sql, params) => db.query(sql, params).then((res) => res.rows), { apply: process.argv.includes('--apply'), log: (m) => console.log(m) });
    if (r.blocked) process.exitCode = 2;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('清理失敗：', err.message);
    process.exit(1);
  });
}

module.exports = { purgeTestData, matchesPassword };
