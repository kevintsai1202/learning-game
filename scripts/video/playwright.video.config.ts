/**
 * 錄影用的 Playwright 設定（班級島大型設施的介紹影片，docs/plans/grand-rides.md）：
 * 沿用 e2e 的前端與班級伺服器（playwright.config.ts 的 webServer），但只跑 scripts/video 裡的腳本，
 * 用顯示卡算圖（d3d11，比軟體 WebGL 快很多），畫面 1280×720。
 * 用法（PowerShell 7，先 npm run build）：
 *   npx playwright test --config scripts/video/playwright.video.config.ts
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

/** 專案根目錄（webServer 的指令在這裡跑） */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: /.*\.video\.ts$/,
  timeout: 3_600_000,
  outputDir: '../../test-results/video',
  use: {
    ...base.use,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: Array.isArray(base.webServer) ? base.webServer.map((w) => ({ ...w, cwd: ROOT })) : base.webServer,
});
