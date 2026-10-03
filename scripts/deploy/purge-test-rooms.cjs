/**
 * 清掉正式資料庫裡 e2e 建的測試房間：只挑「管理密碼是 teach123」的房間（e2e 一律用這個密碼），真正的房間不會動。
 * 預設只列出，加 --apply 才刪除；刪房間時，帳號、權杖、禮物、Google 綁定、同步紀錄會跟著刪（外鍵 CASCADE）。
 *
 * 在班級伺服器的容器裡執行（容器裡有 node、pg 與 DATABASE_URL）；外層用 scripts/deploy/purge-test-rooms.ps1 送進去，
 * 在容器裡還原成 /app/.purge-test-rooms.cjs 再執行（CommonJS，require 從 /app/node_modules 找 pg）。
 */
const { scrypt, timingSafeEqual } = require('node:crypto');
const { Client } = require('pg');

/** e2e 測試房間的管理密碼 */
const TEST_PASSWORD = 'teach123';
/** 和 server/auth.ts 相同的 scrypt 參數 */
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;
const apply = process.argv.includes('--apply');

/** 管理密碼是不是測試密碼（格式 scrypt$<salt>$<hash>，base64url） */
function isTestPassword(stored) {
  const [algo, saltText, hashText] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltText || !hashText) return Promise.resolve(false);
  const expected = Buffer.from(hashText, 'base64url');
  return new Promise((resolve, reject) =>
    scrypt(TEST_PASSWORD, Buffer.from(saltText, 'base64url'), KEY_LEN, SCRYPT, (err, key) =>
      err ? reject(err) : resolve(key.length === expected.length && timingSafeEqual(key, expected)),
    ),
  );
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const rooms = (
      await db.query(
        `SELECT r.code, r.name, r.teacher_hash, r.created_at, (SELECT count(*)::int FROM accounts a WHERE a.room_code = r.code) AS members
         FROM rooms r ORDER BY r.created_at`,
      )
    ).rows;
    const test = [];
    for (const r of rooms) if (await isTestPassword(r.teacher_hash)) test.push(r);
    console.log(`全部房間 ${rooms.length} 間，測試房間（管理密碼 ${TEST_PASSWORD}）${test.length} 間：`);
    for (const r of test) console.log(`  ${r.code}  ${r.name}  成員 ${r.members}  ${new Date(r.created_at).toISOString()}`);
    const real = rooms.filter((r) => !test.includes(r));
    console.log(`其他房間 ${real.length} 間（不會動）：${real.map((r) => `${r.code} ${r.name}`).join('、') || '沒有'}`);
    if (!apply) {
      console.log('只列出；加 --apply 才會刪除。');
      return;
    }
    if (test.length) {
      const res = await db.query('DELETE FROM rooms WHERE code = ANY($1)', [test.map((r) => r.code)]);
      console.log(`已刪除 ${res.rowCount} 間測試房間。`);
    }
    const left = (await db.query('SELECT (SELECT count(*)::int FROM rooms) AS rooms, (SELECT count(*)::int FROM accounts) AS accounts, (SELECT count(*)::int FROM gifts) AS gifts')).rows[0];
    console.log(`剩下：房間 ${left.rooms}、帳號 ${left.accounts}、禮物 ${left.gifts}`);
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error('清理失敗：', err.message);
  process.exit(1);
});
