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

/** 自動產生的帳號名稱「本體」最多幾個字：留 4 位給撞名時加的數字，加起來不超過 20 */
const GENERATED_BASE_MAX = 16;

/**
 * 用 Google 註冊時，從 email 產生帳號名稱的本體（docs/plans/login-ux-review.md 第 6 節第 1 點：Google 註冊不用設帳號名稱與密碼）。
 * 取 @ 前面的英文字母、數字、底線（保留大小寫），最多 16 個字；剩不到 4 個字時前面加 user_，一個都不剩時用 user。
 * 結果一定符合 checkUsername 的規則；撞名時由 pickUsername 加數字。
 */
export function usernameBaseFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const cleaned = local.replace(/[^A-Za-z0-9_]/g, '').slice(0, GENERATED_BASE_MAX);
  if (cleaned.length >= 4) return cleaned;
  return cleaned ? `user_${cleaned}` : 'user';
}

/**
 * 從本體挑一個沒人用的帳號名稱：本體沒人用就用本體，不然從 2 開始往後加數字（最多 9999）。
 * taken 是已經有人用的帳號名稱（小寫，比對用的 username_key）。全部都被用掉時回傳 null（呼叫端改用亂數）。
 */
export function pickUsername(base: string, taken: Set<string>): string | null {
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n <= 9999; n++) {
    const name = `${base}${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  return null;
}
