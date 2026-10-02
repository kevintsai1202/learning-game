/**
 * e2e 用的假 Google 登入：用 e2e/fixtures/google-test-key.json 的私鑰簽出格式和 Google 相同的 ID token。
 * 伺服器（playwright.config.ts 啟動的測試模式）用對應的公鑰驗證。
 */
import { readFileSync } from 'node:fs';
import { importJWK, SignJWT, type JWK } from 'jose';
import type { Page } from '@playwright/test';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/google-test-key.json', import.meta.url), 'utf8')) as { clientId: string; privateJwk: JWK };

/** 簽一張測試用的 Google ID token */
export async function signTestIdToken(sub: string, email: string): Promise<string> {
  const key = await importJWK(fixture.privateJwk, 'RS256');
  return new SignJWT({ email, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: fixture.privateJwk.kid })
    .setIssuer('https://accounts.google.com')
    .setAudience(fixture.clientId)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

/** 讓頁面上的 Google 測試按鈕按下去時送出這個 Google 帳號的 token */
export async function prepareGoogleAccount(page: Page, sub: string, email: string): Promise<void> {
  const token = await signTestIdToken(sub, email);
  await page.evaluate((t) => {
    window.__googleStubCredential = t;
  }, token);
}
