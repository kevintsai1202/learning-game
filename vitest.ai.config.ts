import { defineConfig } from 'vitest/config';

// 老師 AI 出題的真實 API 試跑（npx vitest run --config vitest.ai.config.ts）：會花錢、要連網，不放進一般的單元測試
export default defineConfig({
  test: {
    include: ['scripts/ai/**/*.test.ts'],
    environment: 'node',
    testTimeout: 300_000,
  },
});
