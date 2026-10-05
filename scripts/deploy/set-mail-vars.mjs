/**
 * 把本機 .env 的寄信設定（MAIL_SMTP_USERNAME、MAIL_SMTP_PASSWORD）設到 Zeabur 的 island-server（A5 上線前；之後換應用程式密碼也可以再跑）。
 * - 用 `zeabur variable create`：只新增或更新這兩個變數，不像 `variable env -f` 會取代全部變數。
 * - 不印出任何值：腳本只印變數名稱與結果，CLI 的輸出也把兩個值換成 ***。應用程式密碼的空白先去掉（伺服器也會去掉）。
 * - 值裡有命令列特殊字元時拒絕執行（Windows 的 npx 要經過 cmd.exe）。
 * - 新的值要等下一次部署或重新啟動服務才生效。
 *
 * 用法（PowerShell 7，專案根目錄；Zeabur CLI 要先登入）：node scripts/deploy/set-mail-vars.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** island-server 服務（見 server/CLAUDE.md 的「Zeabur 部署」） */
const SERVICE_ID = '6ac096ec3eaaf9d7d3e1def7';

/** 讀 .env（KEY=VALUE，忽略註解與空行，去掉值兩邊的引號） */
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2')];
    }),
);
const user = env.MAIL_SMTP_USERNAME ?? '';
const pass = (env.MAIL_SMTP_PASSWORD ?? '').replace(/\s+/g, '');
if (!user || !pass) {
  console.error('.env 裡缺少 MAIL_SMTP_USERNAME 或 MAIL_SMTP_PASSWORD');
  process.exit(1);
}
if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(user) || !/^[A-Za-z0-9]+$/.test(pass)) {
  console.error('MAIL_SMTP_USERNAME 或 MAIL_SMTP_PASSWORD 含有命令列特殊字元，請改在 Zeabur 後台手動設定（不印出值）');
  process.exit(1);
}

const r = spawnSync('npx', ['-y', 'zeabur@latest', 'variable', 'create', '--id', SERVICE_ID, '-k', `MAIL_SMTP_USERNAME=${user}`, '-k', `MAIL_SMTP_PASSWORD=${pass}`, '-y', '-i=false'], {
  shell: true,
  encoding: 'utf8',
});
/** CLI 的輸出把兩個值遮掉、去掉顏色碼再印 */
const masked = `${r.stdout ?? ''}${r.stderr ?? ''}`
  .split(pass)
  .join('***')
  .split(user)
  .join('***')
  .replace(/\x1b\[[0-9;]*m/g, '');
console.log(masked.trim().slice(-800));
console.log(r.status === 0 ? '已設定 MAIL_SMTP_USERNAME、MAIL_SMTP_PASSWORD（下次部署或重新啟動後生效）' : `設定失敗（結束代碼 ${r.status}）`);
process.exit(r.status ?? 1);
