/**
 * 雲端角色的本機資料：登入權杖與待送佇列（都放 localStorage，不放進存檔，所以家長的「備份」不會帶出權杖）。
 * 雲端角色的每個動作經 recordOp 寫進佇列，再通知同步迴圈（useCloud）送出。
 */
import { emptyOutbox, enqueue, type Outbox } from './sync';
import type { Op } from './ops';

/** 權杖的鍵：{ [accountId]: token } */
const TOKENS_KEY = 'learning-island-cloud';
/** 待送佇列的鍵前綴（後面接帳號 id） */
const OUTBOX_PREFIX = 'learning-island-outbox-';
/** 老師登入狀態（sessionStorage：教室共用電腦關掉分頁就登出） */
const TEACHER_KEY = 'learning-island-teacher';

function readJson<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | undefined, key: string, value: unknown): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* 儲存空間不足或被封鎖：這次只留在記憶體 */
  }
}

const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

/** 讀某個帳號的權杖 */
export function getToken(accountId: string): string | null {
  return readJson<Record<string, string>>(local(), TOKENS_KEY)?.[accountId] ?? null;
}

/** 記住某個帳號的權杖；token 為 null 時刪除 */
export function setToken(accountId: string, token: string | null): void {
  const all = readJson<Record<string, string>>(local(), TOKENS_KEY) ?? {};
  if (token) all[accountId] = token;
  else delete all[accountId];
  writeJson(local(), TOKENS_KEY, all);
}

/** 讀某個帳號的待送佇列 */
export function loadOutbox(accountId: string): Outbox {
  const box = readJson<Outbox>(local(), OUTBOX_PREFIX + accountId);
  return box && Array.isArray(box.inflight) && Array.isArray(box.pending) ? box : emptyOutbox();
}

/** 寫回某個帳號的待送佇列；空佇列直接刪掉 */
export function saveOutbox(accountId: string, box: Outbox): void {
  writeJson(local(), OUTBOX_PREFIX + accountId, box.inflight.length || box.pending.length ? box : null);
}

/** 佇列有新操作時通知的對象 */
const listeners = new Set<(accountId: string, op: Op) => void>();

/** 記下一個雲端角色的動作（放進佇列並通知同步迴圈） */
export function recordOp(accountId: string, op: Op): void {
  saveOutbox(accountId, enqueue(loadOutbox(accountId), op));
  for (const fn of listeners) fn(accountId, op);
}

/** 訂閱「有新操作」；回傳取消訂閱的函式 */
export function onRecorded(fn: (accountId: string, op: Op) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 老師的登入狀態 */
export interface TeacherSession {
  server: string;
  code: string;
  token: string;
}

export function getTeacherSession(): TeacherSession | null {
  return readJson<TeacherSession>(session(), TEACHER_KEY);
}

export function setTeacherSession(s: TeacherSession | null): void {
  writeJson(session(), TEACHER_KEY, s);
}
