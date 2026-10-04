/**
 * Google 快速登入（備選）：驗證前端從 Google Identity Services 拿到的 ID token。
 * 伺服器只取 Google 帳號的識別碼（sub）與 email，用途只有快速登入。規格見 docs/plans/online.md 3.1 節。
 */
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose';

/** 驗證成功後得到的 Google 帳號資訊 */
export interface GoogleIdentity {
  /** Google 帳號的固定識別碼（不會因為改 email 而變） */
  sub: string;
  email: string | null;
  /** Google 驗證過這個 email（token 的 email_verified）；用 Google 註冊時才能把 email 當成驗證過的 */
  emailVerified: boolean;
}

/** 驗證 ID token；失敗丟出例外 */
export type GoogleVerifier = (idToken: string) => Promise<GoogleIdentity>;

/** 伺服器的 Google 登入設定 */
export interface GoogleConfig {
  /** OAuth Client ID（前端從 /api/config 取得） */
  clientId: string;
  verify: GoogleVerifier;
  /** 是否為測試模式（用測試公鑰驗證，只能在 e2e 用） */
  testMode: boolean;
}

/** Google 的公開金鑰網址 */
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
/** Google 文件列出的兩種發行者寫法 */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * 建立驗證器：檢查簽章（keys）、aud（必須是我們的 Client ID）、iss（必須是 Google）、到期時間。
 */
export function createGoogleVerifier(opts: { clientId: string; keys: JWTVerifyGetKey }): GoogleVerifier {
  return async (idToken) => {
    const { payload } = await jwtVerify(idToken, opts.keys, {
      issuer: GOOGLE_ISSUERS,
      audience: opts.clientId,
      // 裝置與伺服器的時鐘可能差一點
      clockTolerance: 60,
    });
    if (!payload.sub) throw new Error('ID token 沒有 sub');
    const email = typeof payload.email === 'string' ? payload.email : null;
    // Google 的 email_verified 有時是字串 "true"
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    return { sub: payload.sub, email, emailVerified: !!email && verified };
  };
}

/**
 * 依環境變數決定 Google 登入的設定：
 * - 沒有 GOOGLE_CLIENT_ID：不開 Google 登入（回傳 null）
 * - 一般情況：用 Google 的公開金鑰驗證
 * - 設了 GOOGLE_TEST_JWKS：e2e 的測試模式，改用這組測試公鑰驗證；
 *   必須同時設 ALLOW_TEST_GOOGLE=1，否則拒絕啟動（兩個變數都要故意設才會開，避免正式環境誤開）
 */
export function googleFromEnv(env: Record<string, string | undefined>): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return null;
  const testJwks = env.GOOGLE_TEST_JWKS;
  if (testJwks) {
    if (env.ALLOW_TEST_GOOGLE !== '1') {
      throw new Error('設了 GOOGLE_TEST_JWKS（測試用的 Google 金鑰）但沒有設 ALLOW_TEST_GOOGLE=1，拒絕啟動。正式環境不能設 GOOGLE_TEST_JWKS。');
    }
    const jwks = JSON.parse(testJwks) as JSONWebKeySet;
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) throw new Error('GOOGLE_TEST_JWKS 格式錯誤：要有 keys 陣列');
    return { clientId, verify: createGoogleVerifier({ clientId, keys: createLocalJWKSet(jwks) }), testMode: true };
  }
  return { clientId, verify: createGoogleVerifier({ clientId, keys: createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)) }), testMode: false };
}

/** 遮住 email 的中間（ke***@gmail.com）；畫面上顯示已綁定的帳號用 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const keep = local.length > 2 ? 2 : 1;
  return `${local.slice(0, keep)}***${email.slice(at)}`;
}
