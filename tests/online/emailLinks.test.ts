/**
 * 信裡連結的網址參數（A3）：打開網頁時讀出 ?verify=／?reset=，處理完從網址拿掉；送給伺服器的前端網址。
 */
import { describe, expect, it } from 'vitest';
import { appUrlOf, readEmailLink, stripEmailLink } from '../../src/online/emailLinks';

describe('讀出信裡的連結', () => {
  it('?verify= 是驗證 email、?reset= 是重設密碼', () => {
    expect(readEmailLink('?verify=abc123')).toEqual({ kind: 'verify', token: 'abc123' });
    expect(readEmailLink('?reset=xyz')).toEqual({ kind: 'reset', token: 'xyz' });
  });

  it('沒有、空字串、只有其他參數：沒有連結', () => {
    expect(readEmailLink('')).toBeNull();
    expect(readEmailLink('?verify=')).toBeNull();
    expect(readEmailLink('?lang=zh')).toBeNull();
  });

  it('和其他參數一起也讀得到；兩個都有時以重設密碼為主（有時效、比較急）', () => {
    expect(readEmailLink('?lang=zh&verify=abc')).toEqual({ kind: 'verify', token: 'abc' });
    expect(readEmailLink('?verify=abc&reset=xyz')).toEqual({ kind: 'reset', token: 'xyz' });
  });
});

describe('處理完把連結參數從網址拿掉', () => {
  it('只拿掉 verify、reset，其他參數與 # 保留', () => {
    expect(stripEmailLink('https://kevintsai1202.github.io/learning-game/?verify=abc')).toBe('https://kevintsai1202.github.io/learning-game/');
    expect(stripEmailLink('http://localhost:4183/?lang=zh&reset=xyz#top')).toBe('http://localhost:4183/?lang=zh#top');
    expect(stripEmailLink('https://learning-island.zeabur.app/')).toBe('https://learning-island.zeabur.app/');
  });
});

describe('送給伺服器的前端網址', () => {
  it('網域＋目前網頁所在的資料夾（去掉檔名、參數與 #）', () => {
    expect(appUrlOf('https://kevintsai1202.github.io/learning-game/?verify=abc#x')).toBe('https://kevintsai1202.github.io/learning-game/');
    expect(appUrlOf('https://kevintsai1202.github.io/learning-game/index.html')).toBe('https://kevintsai1202.github.io/learning-game/');
    expect(appUrlOf('http://localhost:4183/')).toBe('http://localhost:4183/');
  });
});
