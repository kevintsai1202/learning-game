/**
 * 掃 QR code 加入班級的連結（docs/plans/class-join.md）：?join=<6 位數班級代碼>。
 */
import { describe, expect, it } from 'vitest';
import { joinUrlOf, readJoinCode, stripJoinCode } from '../../src/online/joinLink';

describe('加入連結', () => {
  it('讀出 6 位數的班級代碼；格式不對或沒有就是 null', () => {
    expect(readJoinCode('?join=123456')).toBe('123456');
    expect(readJoinCode('?a=1&join=654321')).toBe('654321');
    expect(readJoinCode('?join=12345')).toBeNull();
    expect(readJoinCode('?join=abcdef')).toBeNull();
    expect(readJoinCode('')).toBeNull();
  });

  it('從網址拿掉 join，其他參數與 # 保留', () => {
    expect(stripJoinCode('https://learning-island.zeabur.app/?join=123456')).toBe('https://learning-island.zeabur.app/');
    expect(stripJoinCode('https://kevintsai1202.github.io/learning-game/?x=1&join=123456#a')).toBe('https://kevintsai1202.github.io/learning-game/?x=1#a');
  });

  it('組加入連結：目前網頁所在的資料夾＋?join=代碼（GitHub Pages 的子路徑也對）', () => {
    expect(joinUrlOf('https://learning-island.zeabur.app/?x=1#y', '123456')).toBe('https://learning-island.zeabur.app/?join=123456');
    expect(joinUrlOf('https://kevintsai1202.github.io/learning-game/index.html', '654321')).toBe('https://kevintsai1202.github.io/learning-game/?join=654321');
  });
});
