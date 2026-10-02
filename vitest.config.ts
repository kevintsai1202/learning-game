import { defineConfig } from 'vitest/config';

// 單元測試只收 tests/ 底下的 *.test.ts(x)，避免撿到 e2e/ 的 Playwright 規格
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    // 伺服器測試在 beforeAll 啟動 PGlite（WASM 版 PostgreSQL）；全套平行跑時幾個檔案同時啟動，10 秒的預設值不夠
    hookTimeout: 30_000,
    // 同樣原因，全套平行跑時 CPU 較擠，出題器掃全部活動、讀全部筆順檔這類測試會超過 5 秒的預設值（單獨跑都在 5 秒內）
    testTimeout: 30_000,
  },
});
