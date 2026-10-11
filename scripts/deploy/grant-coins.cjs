/**
 * 給正式資料庫裡的某個孩子金幣（測試用；使用者要求時才跑）。
 * - 用名字找孩子：帳號的暱稱、在各班的暱稱、角色名字，完全相同才算；名字用 base64（UTF-8）傳，避免中文經過 Windows 命令列變亂碼。
 * - 預設只看（READ ONLY 交易）：印出找到幾個、帳號 id 前 8 碼、現在的金幣。
 * - 加 --apply 才寫入：只在剛好找到一個時，鎖住那一列、金幣加上去、版本號加 1（和老師發獎勵的寫法一樣），
 *   孩子的裝置下一次同步時就拿到新的金幣。不寫獎勵紀錄（不會跳「熊熊老師給你」的卡片）。
 *
 * 在班級伺服器的容器裡執行（容器裡有 node、pg 與 DATABASE_URL）；外層用 scripts/deploy/grant-coins.ps1 送進去。
 * 參數：--name-b64 <base64> --coins <正整數，最多 100000> [--apply]
 */

/** 讀命令列參數 */
function parseArgs(argv) {
  const get = (key) => {
    const i = argv.indexOf(key);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const name = Buffer.from(get('--name-b64') ?? '', 'base64').toString('utf8').trim();
  const coins = Number(get('--coins'));
  if (!name) throw new Error('要給 --name-b64（名字的 base64）');
  if (!Number.isInteger(coins) || coins <= 0 || coins > 100000) throw new Error('--coins 要是 1～100000 的整數');
  return { name, coins, apply: argv.includes('--apply') };
}

/**
 * 找名字相同的孩子（帳號暱稱、各班暱稱、角色名字）；回傳 id、現在的金幣、版本號
 */
async function findKids(query, name) {
  return query(
    `SELECT DISTINCT a.id, (a.profile->>'coins')::int AS coins, a.rev
       FROM accounts a
       LEFT JOIN class_members m ON m.account_id = a.id
      WHERE a.nickname = $1 OR m.nickname = $1 OR a.profile->>'name' = $1`,
    [name],
  );
}

/** 在伺服器容器裡執行 */
async function main() {
  const { name, coins, apply } = parseArgs(process.argv.slice(2));
  const { Client } = require('pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const query = (sql, params) => db.query(sql, params).then((res) => res.rows);
  try {
    await db.query(apply ? 'BEGIN' : 'BEGIN TRANSACTION READ ONLY');
    const kids = await findKids(query, name);
    console.log(`找到 ${kids.length} 個孩子`);
    for (const k of kids) console.log(`  帳號 ${String(k.id).slice(0, 8)}…：金幣 ${k.coins}，版本 ${k.rev}`);
    if (!apply) {
      console.log('（只看；加 --apply 才會給金幣）');
      return;
    }
    if (kids.length !== 1) throw new Error('要剛好找到一個孩子才給金幣');
    const id = kids[0].id;
    const locked = (await query('SELECT profile FROM accounts WHERE id = $1 FOR UPDATE', [id]))[0];
    const profile = { ...locked.profile, coins: (Number(locked.profile.coins) || 0) + coins };
    const rows = await query('UPDATE accounts SET profile = $2::jsonb, rev = rev + 1 WHERE id = $1 RETURNING rev', [id, JSON.stringify(profile)]);
    await db.query('COMMIT');
    console.log(`已給 ${coins} 枚金幣：現在 ${profile.coins} 枚，版本 ${rows[0].rev}`);
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await db.query('ROLLBACK').catch(() => undefined);
    await db.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('失敗：', err.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, findKids };
