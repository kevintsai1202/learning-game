import { readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

/** e2e 專用的假 Google 金鑰（伺服器用公鑰驗證，測試用私鑰簽 ID token；正式環境不接受） */
const googleTest = JSON.parse(readFileSync(new URL('./e2e/fixtures/google-test-key.json', import.meta.url), 'utf8')) as { clientId: string; publicJwks: unknown };

// e2e 設定：對 build 後的產物（vite preview）跑，不用 dev server
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // headless 用軟體 WebGL（SwiftShader）很吃 CPU，平行跑會互相拖慢到逾時，所以一次只跑一個
  workers: 1,
  outputDir: 'test-results',
  use: {
    // 設定 BASE_URL 可以改測線上網址，此時不啟動本機 preview
    baseURL: process.env.BASE_URL ?? 'http://localhost:4183',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      // headless 需要軟體 WebGL；自動播放政策放寬，讓 AudioContext 不必等手勢
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  // 本機：同時啟動前端（vite preview）與班級伺服器（PGlite 記憶體資料庫，每次啟動都是空的）。
  // 線上功能只有 online.spec.ts 會用（它把伺服器網址寫進 localStorage），其他測試不受影響。
  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: 'npm run preview',
          url: 'http://localhost:4183',
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: 'npm run server:build && npm run server:start',
          url: 'http://localhost:8787/healthz',
          reuseExistingServer: true,
          timeout: 120_000,
          // Google 登入用測試模式（兩個變數都要設才會開）；正式環境絕不能設
          env: {
            PORT: '8787',
            ALLOWED_ORIGINS: 'http://localhost:4183',
            GOOGLE_CLIENT_ID: googleTest.clientId,
            GOOGLE_TEST_JWKS: JSON.stringify(googleTest.publicJwks),
            ALLOW_TEST_GOOGLE: '1',
            // 測試信箱（A3）：驗證信與重設信放在記憶體，e2e 從 GET /api/test/mails 讀；兩個都要設，正式環境絕不能設
            TEST_MAIL_OUTBOX: '1',
            ALLOW_TEST_MAIL: '1',
          },
        },
      ],
});
