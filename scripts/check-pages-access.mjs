/**
 * 檢查目前所在網路能不能連到 GitHub Pages（github.io）：防火牆（例如 FortiGate）可能做 SSL 檢查或網頁過濾。
 * 每個網址測兩件事：
 *   1. 憑證簽發者：正常應該是公開的 CA（例如 GitHub Pages 用的 Sectigo、DigiCert、Let's Encrypt）；
 *      如果是 Fortinet 等防火牆自己的 CA，表示連線被攔截解密
 *   2. 回應內容：是網站本身，還是防火牆的封鎖頁（標題 Web Filter Violation），封鎖頁會列出分類
 * 只讀取公開網頁，不送出任何資料；為了看到封鎖頁內容，讀取時不驗證憑證。
 *
 * 用法（PowerShell 7，專案根目錄）：node scripts/check-pages-access.mjs [其他網址…]
 */
import https from 'node:https';
import tls from 'node:tls';

const DEFAULT_URLS = [
  // 這個專案與同一帳號的其他網站
  'https://kevintsai1202.github.io/learning-game/',
  'https://kevintsai1202.github.io/',
  'https://kevintsai1202.github.io/mini-plm-promo/',
  // 其他人的 github.io（判斷是整個 github.io 被擋，還是只擋特定帳號或網址）
  'https://octocat.github.io/',
  'https://microsoft.github.io/',
  'https://google.github.io/',
  'https://pages.github.com/',
  // GitHub 本身與相關網域（對照組）
  'https://github.com/',
  'https://raw.githubusercontent.com/',
];
const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_URLS;

/** 取得主機的憑證簽發者（不驗證憑證，才看得到防火牆的憑證） */
function certIssuer(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15000 }, () => {
      const c = socket.getPeerCertificate();
      resolve({ issuer: [c.issuer?.O, c.issuer?.CN].filter(Boolean).join(' / '), trusted: socket.authorized });
      socket.end();
    });
    socket.on('error', (e) => resolve({ issuer: `連線失敗：${e.code ?? e.message}`, trusted: false }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ issuer: '逾時', trusted: false });
    });
  });
}

/** 讀取網頁，回傳狀態碼、標題，以及是不是防火牆封鎖頁（含分類） */
function page(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { rejectUnauthorized: false, timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (check-pages-access)' } }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const title = (body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim();
        const blocked = /Web Filter Violation|FortiGuard|Access Blocked/i.test(body);
        const text = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const category = blocked ? (text.match(/Category\s+(.+?)\s+URL/i)?.[1] ?? '').trim() : '';
        resolve({ status: res.statusCode, title, blocked, category });
      });
    });
    req.on('error', (e) => resolve({ status: 0, title: `錯誤：${e.code ?? e.message}`, blocked: false, category: '' }));
    req.on('timeout', () => req.destroy(new Error('逾時')));
  });
}

for (const url of urls) {
  const host = new URL(url).host;
  const [cert, p] = await Promise.all([certIssuer(host), page(url)]);
  const verdict = p.blocked ? `被封鎖（分類：${p.category || '未知'}）` : p.status ? `可以連（HTTP ${p.status}）` : '連不上';
  console.log(`${url}\n  憑證：${cert.issuer}${cert.trusted ? '（受信任）' : '（不受信任）'}\n  結果：${verdict}${p.title && !p.blocked ? `，標題「${p.title.slice(0, 40)}」` : ''}`);
}
