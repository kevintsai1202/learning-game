/**
 * 上線監看：push main 之後，等 GitHub Pages 與 Zeabur 都部署完成、兩個正式網址的前端都換成新版、healthz 正常。
 * - 每 30 秒查一次，狀態改變才印一行；全部完成印「完成」並以 0 結束。
 * - GitHub Pages 的部署失敗、Zeabur 的部署 FAILED／CRASHED，或超過 20 分鐘還沒完成：印出原因並以 1 結束。
 * - 「新版」的判斷：網址的 index.html 引用的主程式（assets/index-雜湊.js）含有這次才有的字串。
 *   本機、Pages、Zeabur 各自建置，檔名的雜湊都不同，只能比對內容。
 * - 呼叫 gh 與 Zeabur CLI 時不開新視窗（windowsHide）。
 * 判斷的部分是純函式，tests/server/watchDeploy.test.ts 測。
 *
 * 執行（PowerShell 7，專案根目錄；gh 與 Zeabur CLI 要先登入）：
 *   node scripts/deploy/watch-deploy.cjs <提交（前 7 碼以上）> <新版主程式才有的字串>
 *   例：node scripts/deploy/watch-deploy.cjs 0767763 成以
 */
const { spawnSync } = require('node:child_process');

/** GitHub 儲存庫（Pages 的部署工作在這裡） */
const REPO = 'kevintsai1202/learning-game';
/** 兩個正式網址的前端 */
const PAGES = 'https://kevintsai1202.github.io/learning-game/';
const ZEABUR = 'https://learning-island.zeabur.app/';
/** island-server 服務（和 Invoke-ServerNode.ps1 相同） */
const SERVICE_ID = '6ac096ec3eaaf9d7d3e1def7';
/** 多久查一次、最多等多久 */
const INTERVAL_MS = 30_000;
const LIMIT_MS = 20 * 60_000;
/** Zeabur 部署失敗的狀態 */
const ZEABUR_FAILED = new Set(['FAILED', 'CRASHED']);

/** index.html 引用的主程式路徑（assets/index-雜湊.js）；找不到回 null */
function mainScriptOf(html) {
  const m = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html);
  return m ? m[0] : null;
}

/** `zeabur deployment list` 的表格（帶 ANSI 顏色碼）裡，這個提交那一列的狀態（第 3 欄）；沒有這個提交回 null */
function zeaburStatusOf(table, sha) {
  const short = sha.slice(0, 7);
  for (const raw of table.split(/\r?\n/)) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
    const cols = line.trim().split(/\s+/);
    if (/^[0-9a-f]{24}$/.test(cols[0]) && cols.length >= 3 && line.includes(short)) return cols[2];
  }
  return null;
}

/**
 * 一輪檢查的結論：{ done: true } 完成；{ failed: 原因 } 失敗；null 繼續等。
 * s.pages 是 Pages 部署工作（{ status, conclusion }，還沒出現是 null）；s.zeabur 是 Zeabur 部署狀態；
 * s.pagesNew、s.zeaburNew 是兩個前端是不是新版（'yes' 才算）；s.health 是 /healthz 的內容。
 */
function verdictOf(s) {
  if (s.pages && s.pages.status === 'completed' && s.pages.conclusion !== 'success') return { failed: `GitHub Pages 部署失敗（${s.pages.conclusion}）` };
  if (s.zeabur && ZEABUR_FAILED.has(s.zeabur)) return { failed: `Zeabur 部署失敗（${s.zeabur}）` };
  if (s.pagesNew === 'yes' && s.zeaburNew === 'yes' && s.zeabur === 'RUNNING' && s.health.includes('"ok":true')) return { done: true };
  return null;
}

/** 執行命令列工具（不開新視窗），回傳標準輸出；失敗回 null */
function run(command) {
  const r = spawnSync(command, { shell: true, encoding: 'utf8', windowsHide: true, timeout: 90_000 });
  return r.status === 0 ? r.stdout : null;
}

/** 這個提交的 Pages 部署工作（{ status, conclusion }）；還沒出現或查不到回 null */
function pagesRunOf(sha) {
  const out = run(`gh run list -R ${REPO} --workflow deploy.yml --branch main --limit 10 --json status,conclusion,headSha`);
  if (!out) return null;
  const hit = JSON.parse(out).find((r) => r.headSha.startsWith(sha));
  return hit ? { status: hit.status, conclusion: hit.conclusion } : null;
}

/** 讀網址的文字內容（逾時或錯誤丟出例外） */
async function text(url, ms) {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(ms) });
  return res.text();
}

/** 這個網址的前端是不是新版：'yes'、'no'、'no-script'（index.html 沒有主程式）、'error'（連不上） */
async function frontendIsNew(site, marker) {
  try {
    const js = mainScriptOf(await text(`${site}?t=${Date.now()}`, 15_000));
    if (!js) return 'no-script';
    return (await text(new URL(js, site).href, 30_000)).includes(marker) ? 'yes' : 'no';
  } catch {
    return 'error';
  }
}

/** /healthz 的內容（連不上是 'error'） */
async function healthOf() {
  try {
    return (await text(`${ZEABUR}healthz`, 10_000)).trim();
  } catch {
    return 'error';
  }
}

async function main() {
  const [sha, marker] = process.argv.slice(2);
  if (!sha || !/^[0-9a-f]{7,40}$/.test(sha) || !marker) {
    console.error('用法：node scripts/deploy/watch-deploy.cjs <提交（前 7 碼以上）> <新版主程式才有的字串>');
    process.exit(2);
  }
  const start = Date.now();
  let prev = '';
  for (;;) {
    const zeaburTable = run(`npx -y zeabur@latest deployment list --service-id ${SERVICE_ID} -i=false --auto_check_update=false`);
    const [pagesNew, zeaburNew, health] = await Promise.all([frontendIsNew(PAGES, marker), frontendIsNew(ZEABUR, marker), healthOf()]);
    const s = { pages: pagesRunOf(sha), zeabur: zeaburTable ? zeaburStatusOf(zeaburTable, sha) : null, pagesNew, zeaburNew, health };
    const pagesText = s.pages ? `${s.pages.status}/${s.pages.conclusion || '-'}` : '還沒有';
    const line = `Pages 部署 ${pagesText}・Zeabur ${s.zeabur ?? '還沒有'}・Pages 前端新版 ${pagesNew}・Zeabur 前端新版 ${zeaburNew}・healthz ${health}`;
    if (line !== prev) {
      console.log(`${new Date().toLocaleTimeString('zh-TW', { hour12: false })} ${line}`);
      prev = line;
    }
    const verdict = verdictOf(s);
    if (verdict && 'done' in verdict) {
      console.log('完成：兩個網址的前端都是新版，伺服器正常');
      return;
    }
    if (verdict) {
      console.error(`失敗：${verdict.failed}`);
      process.exit(1);
    }
    if (Date.now() - start > LIMIT_MS) {
      console.error('失敗：超過 20 分鐘還沒完成');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

module.exports = { mainScriptOf, zeaburStatusOf, verdictOf };

if (require.main === module) {
  main().catch((err) => {
    console.error(`失敗：${err.message}`);
    process.exit(1);
  });
}
