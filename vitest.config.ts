import { defineConfig } from 'vitest/config';

// 單元測試只收 tests/ 底下的 *.test.ts(x)，避免撿到 e2e/ 的 Playwright 規格
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
