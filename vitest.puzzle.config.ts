import { defineConfig } from 'vitest/config';

// 七巧板剪影的設計工具專用（npx vitest run --config vitest.puzzle.config.ts）：不放進一般的單元測試
export default defineConfig({
  test: {
    include: ['scripts/puzzle/**/*.test.ts'],
    environment: 'node',
  },
});
