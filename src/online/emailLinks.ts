/**
 * 信裡連結的網址參數（A3，docs/plans/accounts.md 第 7 節）：驗證信是 ?verify=…、重設密碼信是 ?reset=…。
 * 打開網頁時讀出來交給帳號頁處理，處理前先從網址拿掉（重新整理不會再送一次、權杖不留在瀏覽紀錄的網址上）。
 * 純函式，有單元測試。
 */

/** 信裡的連結：驗證 email 或重設密碼 */
export interface EmailLink {
  kind: 'verify' | 'reset';
  token: string;
}

/** 讀出網址參數裡的連結（location.search）；兩個都有時以重設密碼為主（有 30 分鐘的時效） */
export function readEmailLink(search: string): EmailLink | null {
  const params = new URLSearchParams(search);
  const reset = params.get('reset');
  if (reset) return { kind: 'reset', token: reset };
  const verify = params.get('verify');
  if (verify) return { kind: 'verify', token: verify };
  return null;
}

/** 把網址裡的 verify、reset 參數拿掉，其他參數與 # 保留 */
export function stripEmailLink(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('verify');
  url.searchParams.delete('reset');
  return url.toString();
}

/** 送給伺服器的前端網址：網域＋目前網頁所在的資料夾（信裡的連結指回這裡；伺服器會檢查網域在允許清單裡） */
export function appUrlOf(href: string): string {
  const url = new URL(href);
  return url.origin + url.pathname.replace(/[^/]*$/, '');
}
