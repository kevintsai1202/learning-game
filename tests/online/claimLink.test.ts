/**
 * 家長連結卡的連結（L4）：?claim=<一次性代碼>（伺服器的 newToken：32 bytes 的 base64url，43 個字）。
 */
import { describe, expect, it } from 'vitest';
import { claimUrlOf, readClaimCode, stripClaimCode } from '../../src/online/claimLink';

const CODE = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE';

describe('家長連結卡的連結', () => {
  it('讀出代碼；長度或字元不對、沒有就是 null', () => {
    expect(CODE).toHaveLength(43);
    expect(readClaimCode(`?claim=${CODE}`)).toBe(CODE);
    expect(readClaimCode(`?a=1&claim=${CODE}`)).toBe(CODE);
    expect(readClaimCode('?claim=short')).toBeNull();
    expect(readClaimCode(`?claim=${CODE.slice(0, 42)}!`)).toBeNull();
    expect(readClaimCode('')).toBeNull();
  });

  it('從網址拿掉 claim，其他參數與 # 保留', () => {
    expect(stripClaimCode(`https://learning-island.zeabur.app/?claim=${CODE}`)).toBe('https://learning-island.zeabur.app/');
    expect(stripClaimCode(`https://kevintsai1202.github.io/learning-game/?x=1&claim=${CODE}#a`)).toBe('https://kevintsai1202.github.io/learning-game/?x=1#a');
  });

  it('組連結：目前網頁所在的資料夾＋?claim=代碼', () => {
    expect(claimUrlOf('https://learning-island.zeabur.app/?x=1#y', CODE)).toBe(`https://learning-island.zeabur.app/?claim=${CODE}`);
    expect(claimUrlOf('https://kevintsai1202.github.io/learning-game/index.html', CODE)).toBe(`https://kevintsai1202.github.io/learning-game/?claim=${CODE}`);
  });
});
