/**
 * 帳號安全相關的小工具：密碼雜湊、權杖、房間代碼、暱稱檢查、登入鎖定、流量限制。
 * 4 位數密碼是給二年級孩子的方便措施，不是高強度防護；防暴力破解靠「房間＋暱稱」的登入鎖定。
 */
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt 參數（N=16384、r=8、p=1，金鑰 32 bytes） */
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_LEN = 32;

/** scrypt 的 Promise 版 */
function scryptAsync(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_LEN, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** 雜湊密碼，格式 scrypt$<salt>$<hash>（base64url） */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(secret, salt);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** 驗證密碼（固定時間比較） */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [algo, saltText, hashText] = stored.split('$');
  if (algo !== 'scrypt' || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const key = await scryptAsync(secret, Buffer.from(saltText, 'base64url'));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 產生登入權杖（32 bytes 亂數） */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 權杖的雜湊（資料庫只存這個） */
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 6 位數房間代碼（100000～999999，孩子可以用數字鍵盤輸入） */
export function newRoomCode(): string {
  return String(randomInt(100000, 1000000));
}

/** 帳號 id */
export function newAccountId(): string {
  return `a_${randomBytes(9).toString('base64url')}`;
}

/** 暱稱檢查結果：通過時附上整理後的暱稱與比對用的鍵 */
export type NicknameCheck = { ok: true; nickname: string; key: string } | { ok: false; reason: string };

/** 暱稱最多幾個字 */
export const NICKNAME_MAX = 12;

/**
 * 檢查暱稱：去掉前後空白、1～12 字；不能像電話號碼（6 個以上數字）或網址、email。
 * 比對鍵用 NFKC 正規化再轉小寫（全形英數與大小寫視為相同）。
 */
export function checkNickname(raw: string): NicknameCheck {
  const nickname = raw.trim();
  const length = [...nickname].length;
  if (length === 0) return { ok: false, reason: '請輸入暱稱' };
  if (length > NICKNAME_MAX) return { ok: false, reason: `暱稱最多 ${NICKNAME_MAX} 個字` };
  const key = nickname.normalize('NFKC').toLowerCase();
  if (/\d{6,}/.test(key.replace(/[\s\-.()]/g, ''))) return { ok: false, reason: '暱稱不能放電話號碼' };
  if (/(https?:|www\.|\.com|\.tw|\.net|\.org|@)/.test(key)) return { ok: false, reason: '暱稱不能放網址或 email' };
  return { ok: true, nickname, key };
}

/**
 * 登入鎖定：同一個鍵（例如「房間＋暱稱」）連續錯 maxFails 次，鎖 lockMs 毫秒。
 * 狀態在記憶體（伺服器只有一台；重啟後歸零可以接受）。
 */
export class LoginLimiter {
  private entries = new Map<string, { fails: number; lockedUntil: number }>();

  constructor(
    private readonly now: () => number,
    private readonly maxFails = 5,
    private readonly lockMs = 5 * 60_000,
  ) {}

  /** 還要鎖多久（毫秒）；沒有鎖定回傳 0 */
  lockedFor(key: string): number {
    const e = this.entries.get(key);
    return e ? Math.max(0, e.lockedUntil - this.now()) : 0;
  }

  /** 記一次失敗；達到次數就鎖定並重新計次 */
  fail(key: string): void {
    const e = this.entries.get(key) ?? { fails: 0, lockedUntil: 0 };
    e.fails += 1;
    if (e.fails >= this.maxFails) {
      e.fails = 0;
      e.lockedUntil = this.now() + this.lockMs;
    }
    this.entries.set(key, e);
    if (this.entries.size > 10_000) this.prune();
  }

  /** 成功登入或老師重設密碼後清除紀錄 */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /** 清掉沒有在鎖定中、也沒有失敗紀錄的項目，避免記憶體一直長 */
  private prune(): void {
    const t = this.now();
    for (const [k, e] of this.entries) if (e.lockedUntil <= t && e.fails === 0) this.entries.delete(k);
  }
}

/** 固定時間窗的流量限制（擋同一個 IP 的大量請求） */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly now: () => number,
    private readonly limit: number,
    private readonly windowMs = 60_000,
  ) {}

  /** 記一次請求；超過上限回傳 false */
  hit(key: string): boolean {
    const t = this.now();
    let w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      w = { start: t, count: 0 };
      this.windows.set(key, w);
      if (this.windows.size > 10_000) {
        for (const [k, v] of this.windows) if (t - v.start >= this.windowMs) this.windows.delete(k);
      }
    }
    w.count += 1;
    return w.count <= this.limit;
  }
}
