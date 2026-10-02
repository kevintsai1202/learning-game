import { defineConfig } from 'vitest/config';

// 預錄語音盤點專用（npx vitest run --config vitest.voice.config.ts）：不放進一般的單元測試
export default defineConfig({
  test: {
    include: ['scripts/voice/**/*.test.ts'],
    environment: 'node',
  },
});
