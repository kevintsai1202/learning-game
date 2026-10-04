/**
 * 用 Google 註冊時，註冊表單顯示 Google 的 email（A4）：從 ID token 讀出 email（只用來顯示；伺服器收到 token 會重新驗證）。
 */
import { describe, expect, it } from 'vitest';
import { emailOfIdToken } from '../../src/online/google';

/** 做一張只有內容、沒有簽章的 JWT（顯示用的函式不檢查簽章） */
const jwt = (payload: object) => `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c2ln`;

describe('從 Google 的 ID token 讀出 email', () => {
  it('讀得到 email（含中文名字的 token 也行）', () => {
    expect(emailOfIdToken(jwt({ sub: '1', email: 'mom.chen@gmail.com', name: '陳媽媽' }))).toBe('mom.chen@gmail.com');
  });

  it('不是 JWT、內容不是 JSON、沒有 email：回傳 null', () => {
    expect(emailOfIdToken('not-a-token')).toBeNull();
    expect(emailOfIdToken('a.b.c')).toBeNull();
    expect(emailOfIdToken(jwt({ sub: '1' }))).toBeNull();
  });
});
