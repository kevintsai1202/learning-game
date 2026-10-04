/**
 * 刪除正式資料庫裡指定的空房間（A5 上線前清掉改版前用管理密碼建、沒有擁有者的空房間；2026-10-05 使用者決定刪 713521、869912）。
 * - 只刪指定的代碼；每一間都必須存在、沒有成員（孩子帳號）、沒有擁有者（老師帳號），有任何一間不符合就整個拒絕。
 * - 房間的權杖、Google 綁房間、禮物都設了 ON DELETE CASCADE，跟著房間一起刪。
 * - 預設只列出，加 --apply 才刪；整段在交易裡，出錯就全部撤銷。改版前（第 3 版）與改版後都能用。
 *
 * 在班級伺服器的容器裡執行（容器裡有 node、pg 與 DATABASE_URL）；外層用 scripts/deploy/delete-empty-rooms.ps1 送進去。
 * 邏輯在 deleteEmptyRooms，tests/server/deleteEmptyRooms.test.ts 用 PGlite 測。
 */

/** 日期只取年月日 */
const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '—');

/**
 * 刪除指定的空房間；query(sql, params) 回傳資料列，log 印出摘要。
 * 回傳 { deleted, rooms }（只列出時 deleted 是 0）。
 */
async function deleteEmptyRooms(query, codes, { apply = false, log = console.log } = {}) {
  if (!codes.length) throw new Error('沒有指定房間代碼');
  const hasOwner = (await query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'rooms' AND column_name = 'owner_id'"))[0].n > 0;
  const rows = await query(
    `SELECT r.code, r.name, r.created_at, ${hasOwner ? 'r.owner_id' : 'NULL AS owner_id'},
            (SELECT count(*)::int FROM accounts a WHERE a.room_code = r.code) AS members
       FROM rooms r WHERE r.code = ANY($1) ORDER BY r.code`,
    [codes],
  );
  const found = new Set(rows.map((r) => r.code));
  const missing = codes.filter((c) => !found.has(c));
  if (missing.length) throw new Error(`找不到房間：${missing.join('、')}（什麼都沒刪）`);
  const busy = rows.filter((r) => r.members > 0 || r.owner_id);
  if (busy.length) throw new Error(`這些房間有成員或擁有者，不能用這支腳本刪：${busy.map((r) => r.code).join('、')}（什麼都沒刪）`);
  for (const r of rows) log(`  ${r.code}  ${r.name}  成員 0  建立 ${day(r.created_at)}`);
  if (!apply) {
    log(`共 ${rows.length} 間空房間（只列出；加 --apply 才刪除）`);
    return { deleted: 0, rooms: rows.map((r) => r.code) };
  }
  const deleted = await query('DELETE FROM rooms WHERE code = ANY($1) RETURNING code', [codes]);
  log(`已刪除 ${deleted.length} 間空房間`);
  return { deleted: deleted.length, rooms: rows.map((r) => r.code) };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const codes = args.filter((a) => /^\d{6}$/.test(a));
  const { Client } = require('pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    await deleteEmptyRooms((sql, params) => db.query(sql, params).then((res) => res.rows), codes, { apply, log: (m) => console.log(m) });
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('刪除失敗：', err.message);
    process.exit(1);
  });
}

module.exports = { deleteEmptyRooms };
