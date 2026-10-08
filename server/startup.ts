/**
 * 伺服器啟動時等資料庫：Zeabur 平台重建執行環境（Pod sandbox changed）時，資料庫常比伺服器晚好，
 * 2026-10-07 是連線被拒（ECONNREFUSED）、2026-10-08 是資料庫主機名稱查不到（EAI_AGAIN），伺服器一啟動就崩潰、靠平台重試才恢復。
 * 啟動時遇到這類連線錯誤就等一下再試；SQL 錯誤（例如資料表升級寫錯）馬上失敗，排查時才不會被誤導。
 * 純函式（等待與紀錄由呼叫端注入），有單元測試（tests/server/startup.test.ts）。
 */

/** 「資料庫還沒好」的錯誤代碼：連線被拒、主機名稱查不到或暫時查不到、逾時、斷線、主機到不了；57P03 是 PostgreSQL 正在啟動 */
const CONNECT_CODES = new Set(['ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', '57P03']);

/** 是不是資料庫還沒好的連線錯誤（node 的系統錯誤與 pg 的錯誤都把代碼放在 code） */
export function isConnectError(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return typeof code === 'string' && CONNECT_CODES.has(code);
}

/** 重試的設定：最多試幾次、每次等多久；sleep 與 log 可以換掉（測試用） */
export interface RetryOptions {
  tries: number;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

/** 執行 fn；連線錯誤時等 delayMs 再試，最多 tries 次（試滿丟出最後一個錯誤）；其他錯誤馬上丟出 */
export async function retryConnect<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? ((msg: string) => console.warn(msg));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isConnectError(err) || attempt >= opts.tries) throw err;
      log(`資料庫還沒好（第 ${attempt} 次連線失敗：${(err as { code: string }).code}），${opts.delayMs / 1000} 秒後再試`);
      await sleep(opts.delayMs);
    }
  }
}
