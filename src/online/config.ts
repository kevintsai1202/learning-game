/**
 * 班級伺服器網址：localStorage 覆蓋（e2e 與開發用）> 建置時的 VITE_SERVER_URL > 沒有（線上功能不顯示）。
 */

/** localStorage 覆蓋網址的鍵 */
export const SERVER_URL_KEY = 'learning-island-server-url';

/** 目前的伺服器網址（去掉結尾斜線）；沒有設定時回傳 null */
export function serverUrl(): string | null {
  let override: string | null = null;
  try {
    override = localStorage.getItem(SERVER_URL_KEY);
  } catch {
    /* 私密瀏覽：只看建置設定 */
  }
  const url = (override || (import.meta.env.VITE_SERVER_URL as string | undefined) || '').trim();
  return url ? url.replace(/\/+$/, '') : null;
}

/** 線上功能（班級、雲端存檔）是否可用 */
export function onlineEnabled(): boolean {
  return serverUrl() !== null;
}
