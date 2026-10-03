/**
 * 班級伺服器同時提供前端（dist/ 的靜態檔）：GitHub Pages 被學校網路擋住時，改用伺服器的網址也能玩。
 * 只在設定 STATIC_DIR 時開啟（Zeabur 的 Docker 映像檔有設；本機開發與 e2e 的伺服器不設，行為不變）。
 * 註冊在所有 API 路由之後，不會蓋掉 /api；/ws 由 HTTP 伺服器的 upgrade 處理，不經過這裡。
 */
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

/** 檔名帶雜湊、內容不會變的檔案：快取一年 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** 其他靜態檔（筆順資料、背景音樂、授權全文）：快取一天 */
const ONE_DAY = 'public, max-age=86400';

/**
 * 依網址路徑（或檔案路徑；Windows 的反斜線先統一成斜線）決定快取：
 * - 網頁（index.html、privacy.html）與語音對照表：不快取，改版馬上生效
 * - assets/（Vite 建置時檔名都帶雜湊）與預錄語音（檔名是內容雜湊）：快取一年
 * - 其他：一天
 */
export function cacheControlOf(filePath: string): string {
  const p = filePath.replace(/\\/g, '/');
  if (p.endsWith('.html') || p.endsWith('/audio/voice/manifest.json')) return 'no-cache';
  if (p.includes('/assets/') || /\/audio\/voice\/[0-9a-f]{16}\.mp3$/.test(p)) return IMMUTABLE;
  return ONE_DAY;
}

/**
 * 掛上靜態檔（要在所有路由之後呼叫）。
 * 快取標頭在拿到回應之後補上：serveStatic 的 onFound 是在回應建立之後才呼叫，那時設的標頭不會生效。
 */
export function registerStatic(app: Hono, root: string): void {
  const files = serveStatic({ root });
  app.use('*', async (c, next) => {
    const res = await files(c, next);
    // 找到檔案時回傳回應（200，或音檔跳轉的 206）；找不到時交給後面的 404
    if (res instanceof Response && (res.status === 200 || res.status === 206)) {
      const urlPath = c.req.path.endsWith('/') ? `${c.req.path}index.html` : c.req.path;
      res.headers.set('Cache-Control', cacheControlOf(urlPath));
    }
    return res;
  });
}
