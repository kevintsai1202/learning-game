/**
 * 教室權杖的本機紀錄（L3 教室密碼，docs/plans/login-ux-review.md 第 7.2 節、第 8 節第 3 點）：
 * 學校平板掃 QR code、老師輸入教室密碼後，拿到的教室權杖記在這台平板 8 小時（到期時間由伺服器給），
 * 期間從選角畫面點「🏫 班級」直接看到班上名單，不用再掃、再輸入。只記最近解鎖的一個班級。
 * 「記住 8 小時」只管能不能再開名單；已經點進去的孩子的權杖另外記（和其他孩子權杖一樣 180 天）。
 */

/** 解鎖後記住的班級 */
export interface ClassroomSession {
  code: string;
  name: string;
  token: string;
  /** ISO 時間；過了就當作沒有 */
  expiresAt: string;
}

/** localStorage 的鍵 */
const KEY = 'learning-island-classroom';
/** 最近解鎖過的班級代碼（教室權杖過期後也留著：老師只要再輸入密碼，不用再掃一次 QR code） */
const CODE_KEY = 'learning-island-classroom-code';

const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

/** 從儲存的原始字串解析；沒有、格式錯誤、過期都回 null */
export function parseClassroomSession(raw: string | null | undefined, now: Date): ClassroomSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ClassroomSession>;
    if (typeof v.code !== 'string' || typeof v.name !== 'string' || typeof v.token !== 'string' || typeof v.expiresAt !== 'string') return null;
    const t = Date.parse(v.expiresAt);
    if (!Number.isFinite(t) || t <= now.getTime()) return null;
    return { code: v.code, name: v.name, token: v.token, expiresAt: v.expiresAt };
  } catch {
    return null;
  }
}

/** 這台平板記住的、還沒過期的教室權杖 */
export function loadClassroom(now = new Date()): ClassroomSession | null {
  try {
    return parseClassroomSession(local()?.getItem(KEY), now);
  } catch {
    return null;
  }
}

/** 記住教室權杖（null 是清掉：老師按「換班級」或權杖已失效；最近的班級代碼留著） */
export function saveClassroom(session: ClassroomSession | null): void {
  try {
    if (session) {
      local()?.setItem(KEY, JSON.stringify(session));
      local()?.setItem(CODE_KEY, session.code);
    } else local()?.removeItem(KEY);
  } catch {
    /* 儲存空間不足或被封鎖：這次只留在記憶體 */
  }
}

/** 這台平板最近解鎖過的班級代碼（6 位數）；沒有回 null */
export function lastClassroomCode(): string | null {
  try {
    const v = local()?.getItem(CODE_KEY);
    return v && /^\d{6}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
