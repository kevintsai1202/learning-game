import { beforeAll, describe, expect, it } from 'vitest';
import { createLocalJWKSet } from 'jose';
import { createGoogleVerifier, googleFromEnv, maskEmail } from '../../server/google';
import { makeGoogleKeys, TEST_CLIENT_ID } from './googleKeys';

let keys: Awaited<ReturnType<typeof makeGoogleKeys>>;
let other: Awaited<ReturnType<typeof makeGoogleKeys>>;
beforeAll(async () => {
  keys = await makeGoogleKeys();
  other = await makeGoogleKeys('other-key');
});

/** 用測試公鑰驗證的驗證器 */
const verifier = () => createGoogleVerifier({ clientId: TEST_CLIENT_ID, keys: createLocalJWKSet(keys.jwks) });

describe('Google ID token 驗證', () => {
  it('Google 簽的、給這個 Client ID 的 token：取得帳號識別碼與 email', async () => {
    const token = await keys.sign('google-sub-1', 'parent@gmail.com');
    await expect(verifier()(token)).resolves.toEqual({ sub: 'google-sub-1', email: 'parent@gmail.com' });
  });

  it('發給別的網站（aud 不同）要拒絕', async () => {
    const token = await keys.sign('google-sub-1', 'parent@gmail.com', { aud: 'someone-else.apps.googleusercontent.com' });
    await expect(verifier()(token)).rejects.toThrow();
  });

  it('過期的 token 要拒絕', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = await keys.sign('google-sub-1', 'parent@gmail.com', { iat: past, expiresIn: past + 3600 });
    await expect(verifier()(token)).rejects.toThrow();
  });

  it('不是 Google 發行的（iss 不同）要拒絕', async () => {
    const token = await keys.sign('google-sub-1', 'parent@gmail.com', { iss: 'https://evil.example' });
    await expect(verifier()(token)).rejects.toThrow();
  });

  it('別把金鑰簽的（偽造）要拒絕；亂打的字串也要拒絕', async () => {
    const forged = await other.sign('google-sub-1', 'parent@gmail.com');
    await expect(verifier()(forged)).rejects.toThrow();
    await expect(verifier()('not-a-token')).rejects.toThrow();
  });

  it('沒有 email 的帳號也可以（只用識別碼登入）', async () => {
    const token = await keys.sign('google-sub-2', null);
    await expect(verifier()(token)).resolves.toEqual({ sub: 'google-sub-2', email: null });
  });

  it('發行者寫成不含 https 的 accounts.google.com 也接受（Google 文件列的兩種寫法）', async () => {
    const token = await keys.sign('google-sub-3', 'p@gmail.com', { iss: 'accounts.google.com' });
    await expect(verifier()(token)).resolves.toMatchObject({ sub: 'google-sub-3' });
  });
});

describe('Google 登入的環境變數', () => {
  it('沒有 GOOGLE_CLIENT_ID：不開 Google 登入', () => {
    expect(googleFromEnv({})).toBeNull();
  });

  it('只有 GOOGLE_CLIENT_ID：正式模式（用 Google 的公開金鑰）', () => {
    const g = googleFromEnv({ GOOGLE_CLIENT_ID: TEST_CLIENT_ID });
    expect(g).toMatchObject({ clientId: TEST_CLIENT_ID, testMode: false });
  });

  it('設了 GOOGLE_TEST_JWKS 但沒有 ALLOW_TEST_GOOGLE=1：拒絕啟動', () => {
    expect(() => googleFromEnv({ GOOGLE_CLIENT_ID: TEST_CLIENT_ID, GOOGLE_TEST_JWKS: JSON.stringify(keys.jwks) })).toThrow(/ALLOW_TEST_GOOGLE/);
    expect(() => googleFromEnv({ GOOGLE_CLIENT_ID: TEST_CLIENT_ID, GOOGLE_TEST_JWKS: JSON.stringify(keys.jwks), ALLOW_TEST_GOOGLE: 'true' })).toThrow(/ALLOW_TEST_GOOGLE/);
  });

  it('兩個變數都設：測試模式，用測試公鑰驗證', async () => {
    const g = googleFromEnv({ GOOGLE_CLIENT_ID: TEST_CLIENT_ID, GOOGLE_TEST_JWKS: JSON.stringify(keys.jwks), ALLOW_TEST_GOOGLE: '1' })!;
    expect(g.testMode).toBe(true);
    await expect(g.verify(await keys.sign('google-sub-1', 'parent@gmail.com'))).resolves.toMatchObject({ sub: 'google-sub-1' });
  });

  it('GOOGLE_TEST_JWKS 格式錯誤：拒絕啟動', () => {
    expect(() => googleFromEnv({ GOOGLE_CLIENT_ID: TEST_CLIENT_ID, GOOGLE_TEST_JWKS: '{oops', ALLOW_TEST_GOOGLE: '1' })).toThrow();
  });
});

describe('email 遮罩', () => {
  it('只留前兩個字與網域', () => {
    expect(maskEmail('kevintsai@gmail.com')).toBe('ke***@gmail.com');
    expect(maskEmail('ab@gmail.com')).toBe('a***@gmail.com');
    expect(maskEmail('a@x.tw')).toBe('a***@x.tw');
    expect(maskEmail('沒有小老鼠')).toBe('***');
  });
});
