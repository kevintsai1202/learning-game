/**
 * 對「外部的班級伺服器」跑線上版 e2e：本機只啟動前端（vite preview），伺服器用 E2E_SERVER_URL 指定，
 * 例如本機的 Docker 映像檔，或部署到 Zeabur 的正式伺服器。步驟見 docs/deploy-zeabur.md。
 *
 * 執行（PowerShell 7，要先 npm run build）：
 *   $env:E2E_SERVER_URL = 'https://<名稱>.zeabur.app'
 *   npx playwright test --config playwright.remote.config.ts e2e/realtime.spec.ts e2e/gifts.spec.ts e2e/online.spec.ts --grep-invert Google
 *   Remove-Item Env:E2E_SERVER_URL
 *
 * 伺服器的 ALLOWED_ORIGINS 要暫時加上 http://localhost:4183。
 * 對正式伺服器一定要加 --grep-invert Google：Google 測試模式（GOOGLE_TEST_JWKS＋ALLOW_TEST_GOOGLE）絕不能在正式環境打開。
 * 測試會在伺服器的資料庫建房間（二年一班等），正式伺服器跑完要清掉（docs/deploy-zeabur.md 最後一步）。
 */
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

if (!process.env.E2E_SERVER_URL) throw new Error('請先設定 E2E_SERVER_URL（要測試的班級伺服器網址）');

export default defineConfig({
  ...base,
  // 遠端伺服器比本機慢一些：單一測試給多一點時間
  timeout: 300_000,
  webServer: [
    {
      command: 'npm run preview',
      url: 'http://localhost:4183',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
