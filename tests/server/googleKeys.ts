/**
 * 測試用的「假 Google」：在程式裡產生金鑰，簽出格式和 Google 相同的 ID token。
 * 驗證端用這把公鑰，就能走完整的驗證邏輯（簽章、aud、iss、到期），不必連到 Google。
 */
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';

/** 測試用的 OAuth Client ID */
export const TEST_CLIENT_ID = 'test-client.apps.googleusercontent.com';

/** 產生一組測試金鑰，回傳公開的 JWKS 與簽 token 的函式 */
export async function makeGoogleKeys(kid = 'test-key-1') {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  /**
   * 簽一張 ID token。預設是 Google 的發行者、測試 Client ID、1 小時後到期；
   * 可以用 overrides 改掉任一欄位（測試拒絕的情況）。
   */
  async function sign(
    sub: string,
    email: string | null,
    overrides: { aud?: string; iss?: string; expiresIn?: string | number; iat?: number; emailVerified?: boolean } = {},
  ): Promise<string> {
    const jwt = new SignJWT(email ? { email, email_verified: overrides.emailVerified ?? true } : {})
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(overrides.iss ?? 'https://accounts.google.com')
      .setAudience(overrides.aud ?? TEST_CLIENT_ID)
      .setSubject(sub)
      .setIssuedAt(overrides.iat)
      .setExpirationTime(overrides.expiresIn ?? '1h');
    return jwt.sign(privateKey);
  }
  return { jwks: { keys: [jwk] }, sign };
}
