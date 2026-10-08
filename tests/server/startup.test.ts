/**
 * 伺服器啟動時等資料庫（server/startup.ts）：Zeabur 平台重建執行環境時，資料庫常比伺服器晚好
 * （2026-10-07 連線被拒、2026-10-08 主機名稱查不到），啟動時遇到連線錯誤就等一下再試；SQL 錯誤馬上失敗。
 */
import { describe, expect, it, vi } from 'vitest';
import { isConnectError, retryConnect } from '../../server/startup';

/** 帶錯誤代碼的錯誤（node 的系統錯誤與 pg 的錯誤都用 code） */
const errorWith = (code: string) => Object.assign(new Error(code), { code });

describe('isConnectError', () => {
  it('連線還沒好的錯誤：連線被拒、主機名稱查不到、逾時、斷線、資料庫正在啟動', () => {
    for (const code of ['ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', '57P03']) expect(isConnectError(errorWith(code))).toBe(true);
  });

  it('SQL 錯誤與其他錯誤不是', () => {
    expect(isConnectError(errorWith('42P01'))).toBe(false);
    expect(isConnectError(new Error('boom'))).toBe(false);
    expect(isConnectError('ECONNREFUSED')).toBe(false);
  });
});

describe('retryConnect', () => {
  it('連線錯誤兩次後成功：試 3 次、中間等兩次、每次重試都留下紀錄', async () => {
    const fn = vi.fn().mockRejectedValueOnce(errorWith('ECONNREFUSED')).mockRejectedValueOnce(errorWith('EAI_AGAIN')).mockResolvedValue('ok');
    const sleep = vi.fn(async () => undefined);
    const log = vi.fn();
    await expect(retryConnect(fn, { tries: 20, delayMs: 3000, sleep, log })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[3000], [3000]]);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1][0]).toContain('EAI_AGAIN');
  });

  it('不是連線錯誤（例如 SQL 錯誤）：第一次就丟出，不等', async () => {
    const fn = vi.fn().mockRejectedValue(errorWith('42P01'));
    const sleep = vi.fn(async () => undefined);
    await expect(retryConnect(fn, { tries: 20, delayMs: 3000, sleep, log: () => undefined })).rejects.toMatchObject({ code: '42P01' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('一直連不上：試滿次數後丟出最後一個錯誤', async () => {
    const fn = vi.fn().mockRejectedValue(errorWith('ECONNREFUSED'));
    const sleep = vi.fn(async () => undefined);
    await expect(retryConnect(fn, { tries: 4, delayMs: 3000, sleep, log: () => undefined })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(fn).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});
