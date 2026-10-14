/**
 * 比賽展示影片的錄影設定（docs/award/apcea-2026/README.md 第 7 節）：
 * - 前端沿用 e2e 的 vite preview（http://localhost:4183，先 npm run build）。
 * - 班級伺服器另外起在 8790 埠，**用真的 Muse**：從 .env 讀 LLM_ 開頭的變數，不設假出題器（TEST_AI_FAKE）。
 *   e2e 的伺服器（8787）開著假出題器，影片裡不能出現假的測試題目，所以不共用；兩者同時設伺服器也會拒絕啟動。
 * - 用顯示卡算圖（d3d11），畫面 1280×720；只跑 scripts/award 裡的 *.award.ts。
 * 用法（PowerShell 7）：npm run build; npx playwright test --config scripts/award/playwright.award.config.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

/** 專案根目錄（webServer 的指令在這裡跑） */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** 錄影專用的班級伺服器埠號與網址 */
const PORT = 8790;
const SERVER = `http://localhost:${PORT}`;

// e2e/onlineDevice.ts 的 SERVER 讀這個環境變數（設定檔在主程序與每個 worker 都會載入）
process.env.E2E_SERVER_URL ??= SERVER;

/** 從 .env 讀 LLM_ 開頭的變數（Muse 的網址、金鑰、模型、推理強度）；沒有金鑰時錄影腳本會直接失敗 */
function llmEnv(): Record<string, string> {
  const file = `${ROOT}.env`;
  if (!existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^(LLM_[A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: /.*\.award\.ts$/,
  timeout: 3_600_000,
  retries: 0,
  outputDir: '../../test-results/award',
  use: {
    ...base.use,
    baseURL: 'http://localhost:4183',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: [
    { command: 'npm run preview', url: 'http://localhost:4183', reuseExistingServer: true, timeout: 60_000, cwd: ROOT },
    {
      command: 'npm run server:build && npm run server:start',
      url: `${SERVER}/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: ROOT,
      env: { PORT: String(PORT), ALLOWED_ORIGINS: 'http://localhost:4183', ...llmEnv() },
    },
  ],
});
