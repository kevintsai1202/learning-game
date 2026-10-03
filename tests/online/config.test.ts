import { describe, expect, it } from 'vitest';
import { resolveServerUrl } from '../../src/online/config';

describe('班級伺服器網址', () => {
  it('same-origin：用目前網頁的網址（班級伺服器同時提供前端時）', () => {
    expect(resolveServerUrl('same-origin', 'https://learning-island.zeabur.app')).toBe('https://learning-island.zeabur.app');
    expect(resolveServerUrl(' same-origin ', 'http://localhost:18080')).toBe('http://localhost:18080');
  });

  it('一般網址：去掉前後空白與結尾斜線', () => {
    expect(resolveServerUrl('https://learning-island.zeabur.app/', 'https://kevintsai1202.github.io')).toBe('https://learning-island.zeabur.app');
    expect(resolveServerUrl('  http://localhost:8787//  ', 'x')).toBe('http://localhost:8787');
  });

  it('沒有設定：回傳 null（線上功能不顯示）', () => {
    expect(resolveServerUrl('', 'https://kevintsai1202.github.io')).toBeNull();
    expect(resolveServerUrl('   ', 'https://kevintsai1202.github.io')).toBeNull();
  });
});
