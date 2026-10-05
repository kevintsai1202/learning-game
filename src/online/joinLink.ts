/**
 * 掃 QR code 加入班級的連結（docs/plans/class-join.md）：老師班級頁的 QR code 是「目前網頁的網址＋?join=<班級代碼>」。
 * 打開網頁時讀出代碼交給帳號頁處理，處理前先從網址拿掉（重新整理不會再處理一次）。純函式，有單元測試。
 */
import { appUrlOf } from './emailLinks';

/** 讀出網址參數裡的班級代碼（location.search）；不是 6 位數字就當作沒有 */
export function readJoinCode(search: string): string | null {
  const code = new URLSearchParams(search).get('join');
  return code && /^\d{6}$/.test(code) ? code : null;
}

/** 把網址裡的 join 參數拿掉，其他參數與 # 保留 */
export function stripJoinCode(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('join');
  return url.toString();
}

/** 組加入連結：目前網頁所在的資料夾（GitHub Pages 的子路徑也對）＋?join=班級代碼 */
export function joinUrlOf(href: string, code: string): string {
  return `${appUrlOf(href)}?join=${code}`;
}
