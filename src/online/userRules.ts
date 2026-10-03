/**
 * 大人帳號（家長、老師）的規則：帳號名稱、密碼、email。
 * 前端表單與伺服器共用（純函式，不 import 畫面、音訊、3D 的程式），錯誤原因是可以直接顯示的中文。
 * 規格見 docs/plans/accounts.md 第 3 節。
 */

/** 密碼至少幾個字 */
export const PASSWORD_MIN = 8;
/** 密碼最多幾個字（擋掉異常長的輸入） */
export const PASSWORD_MAX = 128;

/** 帳號名稱：4～20 個英文字母、數字或底線 */
const USERNAME_RE = /^[A-Za-z0-9_]{4,20}$/;
/** email：有 @、@ 後面有點、中間沒有空白（只擋明顯打錯的，真正的確認靠驗證信） */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 帳號名稱的檢查結果：通過時 key 是比對用的小寫 */
export type UsernameCheck = { ok: true; username: string; key: string } | { ok: false; reason: string };

/** 檢查帳號名稱（去掉前後空白；保留原本的大小寫顯示，比對不分大小寫） */
export function checkUsername(raw: string): UsernameCheck {
  const username = raw.trim();
  if (!USERNAME_RE.test(username)) return { ok: false, reason: '帳號名稱要 4～20 個英文字母、數字或底線（_）' };
  return { ok: true, username, key: username.toLowerCase() };
}

/** 檢查密碼；可以用就回傳 null，不行回傳原因 */
export function checkPassword(password: string): string | null {
  if (password.trim().length === 0 || password.length < PASSWORD_MIN) return `密碼至少要 ${PASSWORD_MIN} 個字`;
  if (password.length > PASSWORD_MAX) return `密碼最多 ${PASSWORD_MAX} 個字`;
  return null;
}

/** email 的檢查結果 */
export type EmailCheck = { ok: true; email: string } | { ok: false; reason: string };

/** 檢查 email（去掉前後空白） */
export function checkEmail(raw: string): EmailCheck {
  const email = raw.trim();
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, reason: 'email 的格式不對，請再檢查一次' };
  return { ok: true, email };
}
