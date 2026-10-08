/**
 * 「只送最新」的儲存佇列（src/ui/latestSaver.ts）：老師頁連續改兩個教材版本下拉時，
 * 第一次儲存的回應（重新整理後的伺服器舊值）會把畫面上剛選的值蓋掉，第二次就從舊值組出來送出。
 * 改成同一時間只送一筆、途中的修改只留最新一筆，全部送完才回到閒置（畫面這時才跟伺服器的值）。
 */
import { describe, expect, it, vi } from 'vitest';
import { createLatestSaver } from '../../src/ui/latestSaver';

/** 一個可以從外面決定何時完成的 Promise */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (err: unknown) => void } {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 等目前排著的 Promise 都跑完 */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('createLatestSaver', () => {
  it('閒置時第一筆馬上送出，送完回到閒置並通知', async () => {
    const d = deferred();
    const send = vi.fn(() => d.promise);
    const onIdle = vi.fn();
    const saver = createLatestSaver(send, onIdle);
    expect(saver.busy).toBe(false);
    saver.save('a');
    expect(send).toHaveBeenCalledWith('a');
    expect(saver.busy).toBe(true);
    d.resolve();
    await flush();
    expect(saver.busy).toBe(false);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('送的途中又存了三次：前一筆結束後只再送最後一筆，全部送完才通知閒置一次', async () => {
    const first = deferred();
    const second = deferred();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onIdle = vi.fn();
    const saver = createLatestSaver<string>(send, onIdle);
    saver.save('a');
    saver.save('b');
    saver.save('c');
    saver.save('d');
    expect(send.mock.calls).toEqual([['a']]);
    first.resolve();
    await flush();
    expect(send.mock.calls).toEqual([['a'], ['d']]);
    expect(saver.busy).toBe(true);
    expect(onIdle).not.toHaveBeenCalled();
    second.resolve();
    await flush();
    expect(saver.busy).toBe(false);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('送出失敗不會卡住：途中排的那筆照送，最後回到閒置', async () => {
    const first = deferred();
    const send = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    const onIdle = vi.fn();
    const saver = createLatestSaver<string>(send, onIdle);
    saver.save('a');
    saver.save('b');
    first.reject(new Error('網路斷了'));
    await flush();
    expect(send.mock.calls).toEqual([['a'], ['b']]);
    expect(saver.busy).toBe(false);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('閒置之後再存：又是馬上送', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const saver = createLatestSaver<string>(send);
    saver.save('a');
    await flush();
    saver.save('b');
    expect(send.mock.calls).toEqual([['a'], ['b']]);
  });
});
