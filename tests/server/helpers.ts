/**
 * 伺服器測試共用工具。
 * 預設用 PGlite 記憶體資料庫；設了 TEST_DATABASE_URL 就改連真正的 PostgreSQL（驗證 pg 轉接層與交易鎖定）。
 */
import { createApp, type AppOptions } from '../../server/app';
import { migrate, openDb, resetDb, type Db } from '../../server/db';
import type { AvatarConfig } from '../../src/store/save';

/**
 * 開一個測試用資料庫並建好資料表。
 * 真正的 PostgreSQL：每個測試檔用自己的 schema（測試檔平行執行時才不會互相清掉資料），關閉時刪掉。
 */
export async function openTestDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const db = await openDb({});
    await migrate(db);
    return db;
  }
  const schema = `test_${Math.random().toString(36).slice(2, 10)}`;
  const admin = await openDb({ url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = await openDb({ url: `${url}${url.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}` });
  await migrate(db);
  return {
    ...db,
    close: async () => {
      await db.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.close();
    },
  };
}

export { resetDb };

/** 可以手動撥快的時鐘 */
export function fakeClock(start = '2026-10-02T10:00:00+08:00') {
  let t = new Date(start).getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** 建立測試用 app 與呼叫 API 的小工具 */
export function makeClient(db: Db, opts: Partial<AppOptions> = {}) {
  const app = createApp({ db, ...opts });
  /** 呼叫 API，回傳狀態碼與 JSON 內容 */
  async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
    const res = await app.request(path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, headers: res.headers };
  }
  return { app, call };
}

export const AVATAR: AvatarConfig = { animal: 'rabbit', color: '#ffffff', hat: null };

/** 建立一個房間，回傳代碼與老師權杖 */
export async function createRoom(call: ReturnType<typeof makeClient>['call'], name = '二年一班', password = 'teach123') {
  const r = await call('POST', '/api/rooms', { name, password });
  if (r.status !== 200) throw new Error(`建立房間失敗：${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { code: string; token: string };
}

/** 讓一位孩子加入房間，回傳權杖與帳號 */
export async function joinRoom(call: ReturnType<typeof makeClient>['call'], code: string, nickname = '小安', pin = '1234', extra: Record<string, unknown> = { avatar: AVATAR }) {
  const r = await call('POST', '/api/join', { code, nickname, pin, ...extra });
  if (r.status !== 200) throw new Error(`加入失敗：${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { token: string; account: { id: string; nickname: string }; profile: any; rev: number; room: { code: string; name: string } };
}
