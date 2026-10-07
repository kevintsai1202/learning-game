/**
 * 家長連結卡的連結（L4，docs/plans/login-ux-review.md 第 7.3 節方案 A）：老師成員表產生的「目前網頁的網址＋?claim=<一次性代碼>」。
 * 打開網頁時讀出代碼交給帳號頁處理，處理前先從網址拿掉（重新整理不會再處理一次）。純函式，有單元測試。
 */
import { appUrlOf } from './emailLinks';

/** 代碼的格式：伺服器 newToken 產生的 32 bytes base64url（43 個字） */
const CLAIM_CODE = /^[A-Za-z0-9_-]{43}$/;

/** 讀出網址參數裡的連結代碼（location.search）；格式不對或沒有就是 null */
export function readClaimCode(search: string): string | null {
  const code = new URLSearchParams(search).get('claim');
  return code && CLAIM_CODE.test(code) ? code : null;
}

/** 把網址裡的 claim 參數拿掉，其他參數與 # 保留 */
export function stripClaimCode(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('claim');
  return url.toString();
}

/** 組連結：目前網頁所在的資料夾（GitHub Pages 的子路徑也對）＋?claim=代碼 */
export function claimUrlOf(href: string, code: string): string {
  return `${appUrlOf(href)}?claim=${code}`;
}
