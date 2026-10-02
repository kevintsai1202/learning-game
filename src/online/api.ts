/**
 * 呼叫班級伺服器的 HTTP API：統一處理逾時、連不上、錯誤訊息。
 */
import { serverUrl } from './config';
import type { ErrorResponse } from './protocol';

/** 請求逾時（毫秒） */
const TIMEOUT_MS = 15_000;

/** API 失敗；status 為 0 表示連不上伺服器（沒網路、伺服器沒開） */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/** api() 的選項 */
export interface ApiOptions {
  body?: unknown;
  token?: string | null;
  /** 伺服器網址；沒給時用目前設定的網址 */
  base?: string;
  /** 測試用：換掉 fetch（例如直接呼叫伺服器 app） */
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response> | Response;
}

/**
 * 呼叫 API。base 沒給時用目前設定的伺服器網址（雲端角色同步時改用角色記住的網址）。
 * 成功回傳 JSON；失敗丟出 ApiFailure（訊息是可以直接顯示的中文）。
 */
export async function api<T>(method: string, path: string, opts: ApiOptions = {}): Promise<T> {
  const base = opts.base ?? serverUrl();
  if (!base) throw new ApiFailure(0, 'no_server', '還沒有設定班級伺服器');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${base}${path}`, {
      method,
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiFailure(0, 'network', '連不上班級伺服器，請檢查網路');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ErrorResponse>) | null;
  if (!res.ok) {
    throw new ApiFailure(res.status, data?.code ?? 'error', data?.error ?? `伺服器回應錯誤（${res.status}）`, data?.retryAfter);
  }
  return data as T;
}
