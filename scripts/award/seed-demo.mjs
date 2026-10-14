/**
 * 給評審用的示範老師帳號（docs/award/apcea-2026/README.md 第 5、6 節）：在指定的班級伺服器建
 * 一位老師、一個班級、6 個示範孩子與示範作答（scripts/award/demoData.mjs），評審登入後能試 AI 出題與 AI 學習分析。
 * **對正式站是寫入動作**：不加 --apply 只檢查伺服器並列出要建什麼；加了才真的建。
 * 密碼不寫進任何檔案：沒給 --password 時隨機產生，只印在畫面上一次，請自己記在報名填寫文件（不要放回 repo）。
 * 評選結束後清掉：用這個帳號登入，在班級頁移除班級，再到帳號頁刪除帳號（帳號名稱不是 e2e_ 開頭，清測試資料的腳本不會刪）。
 * 用法（PowerShell 7）：
 *   node scripts/award/seed-demo.mjs --server https://learning-island.zeabur.app --email <你收得到信的 email>          # 只檢查
 *   node scripts/award/seed-demo.mjs --server https://learning-island.zeabur.app --email <email> --apply                # 真的建
 * 其他選項：--username（預設 apcea_demo）、--class（預設「二年一班（示範）」）、--password
 */
import { randomBytes } from 'node:crypto';
import { DEMO_KIDS, seedClass } from './demoData.mjs';

/** 讀命令列的 --名稱 值 */
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const server = (arg('server') ?? '').replace(/\/+$/, '');
const email = arg('email');
const username = arg('username', 'apcea_demo');
const className = arg('class', '二年一班（示範）');
/** 沒給密碼時隨機 12 碼（英數，避開容易看錯的 0、O、l、1） */
const password = arg('password') ?? Array.from(randomBytes(12), (b) => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 55]).join('');
const apply = process.argv.includes('--apply');

if (!server || !email) {
  console.error('要給 --server 與 --email（老師帳號註冊要 email，會寄驗證信到這個信箱）');
  process.exit(1);
}

// 檢查伺服器：開著、AI 有開
const config = await (await fetch(`${server}/api/config`)).json();
console.log(`伺服器 ${server}：AI 出題與分析${config.aiQuestions ? '有開' : '**沒開**（評審試不到 AI 功能）'}`);
console.log(`要建：老師帳號 ${username}（email ${email}）、班級「${className}」、示範孩子 ${DEMO_KIDS.map((k) => k.nickname).join('、')} 與作答紀錄`);
if (!apply) {
  console.log('（只檢查，沒有寫入。確認後加 --apply）');
  process.exit(0);
}

const room = await seedClass({ server, username, password, email, className });
console.log('\n建好了（請把下面這段記在自己的報名填寫文件，不要放回 repo）：');
console.log(`  網址：${server}/`);
console.log(`  老師帳號：${username}　密碼：${password}　班級：${className}`);
console.log(`  班級代碼：${room.code}　示範孩子：阿寶　密碼：${DEMO_KIDS[0].pin}`);
