import { defineConfig } from 'vitest/config';

// 單元測試只收 tests/ 底下的 *.test.ts(x)，避免撿到 e2e/ 的 Playwright 規格
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    // 伺服器測試在 beforeAll 啟動 PGlite（WASM 版 PostgreSQL）；全套平行跑時十幾個檔案同時啟動，10 秒的預設值不夠。
    // 2026-10-03 伺服器測試增加到 12 個檔案後，18 核心的機器上全套平行跑會有幾個超過 30 秒（單獨跑都在 10 秒內），放寬到 60 秒
    hookTimeout: 60_000,
    // 同樣原因，全套平行跑時 CPU 較擠，出題器掃全部活動、讀全部筆順檔、從舊版升級資料表這類測試會超過預設值（單獨跑都在 5 秒內）
    testTimeout: 60_000,
  },
});
