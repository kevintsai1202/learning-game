/**
 * HTTP 路由共用的小工具：回給前端的錯誤、讀取並驗證 JSON 請求內容。
 * app.ts 與 gifts.ts 都用這裡，錯誤格式才會一致（onError 統一轉成 { error, code }）。
 */
import type { Context } from 'hono';
import type { z } from 'zod';

/** 會回給前端的錯誤（訊息是給孩子或大人看的中文） */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 423 | 429,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/** 讀取並驗證 JSON 請求內容 */
export async function readBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, 'bad_json', '資料格式不符');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiError(400, 'bad_request', '資料格式不符');
  return r.data;
}

/** 權杖驗證後的身分 */
export interface Identity {
  roomCode: string;
  accountId: string | null;
  hash: string;
}
