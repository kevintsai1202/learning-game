/**
 * 班級伺服器網址：localStorage 覆蓋（e2e 與開發用）> 建置時的 VITE_SERVER_URL > 沒有（線上功能不顯示）。
 * VITE_SERVER_URL=same-origin 表示「目前網頁的網址」：班級伺服器同時提供前端時（Zeabur 的 Docker 建置）用，換網域也不必重新建置。
 */

/** localStorage 覆蓋網址的鍵 */
export const SERVER_URL_KEY = 'learning-island-server-url';

/** 設定值 → 伺服器網址：same-origin 用目前網頁的網址；其他去掉空白與結尾斜線；沒有設定回傳 null */
export function resolveServerUrl(raw: string, origin: string): string | null {
  const url = raw.trim();
  if (url === 'same-origin') return origin;
  return url ? url.replace(/\/+$/, '') : null;
}

/** 目前的伺服器網址；沒有設定時回傳 null */
export function serverUrl(): string | null {
  let override: string | null = null;
  try {
    override = localStorage.getItem(SERVER_URL_KEY);
  } catch {
    /* 私密瀏覽：只看建置設定 */
  }
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return resolveServerUrl(override || (import.meta.env.VITE_SERVER_URL as string | undefined) || '', origin);
}

/** 線上功能（班級、雲端存檔）是否可用 */
export function onlineEnabled(): boolean {
  return serverUrl() !== null;
}
