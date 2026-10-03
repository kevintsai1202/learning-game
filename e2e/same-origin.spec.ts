/**
 * 班級伺服器同時提供的前端（Docker 建置用 VITE_SERVER_URL=same-origin）：不設任何覆蓋，打開網頁就自動連到同一個網址的伺服器。
 * 只在 BASE_URL 指向伺服器提供的前端時執行（playwright.remote.config.ts），例如：
 *   $env:BASE_URL = 'https://learning-island.zeabur.app/'; $env:E2E_SERVER_URL = 'https://learning-island.zeabur.app'
 *   npx playwright test --config playwright.remote.config.ts e2e/same-origin.spec.ts
 */
import { expect, test } from '@playwright/test';

test.skip(!process.env.BASE_URL || !process.env.E2E_SERVER_URL || !process.env.BASE_URL.startsWith(process.env.E2E_SERVER_URL), '只在伺服器同時提供前端時執行');

test('伺服器提供的前端：沒有覆蓋設定也會用同一個網址的伺服器（線上功能打開、讀得到伺服器設定）', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('start')).toBeVisible();
  // 線上功能打開：標題畫面有班級管理入口
  await expect(page.getByTestId('teacher-link')).toBeVisible();
  // 讀到的伺服器設定和直接問伺服器的一樣
  const expected = (await (await request.get(`${process.env.E2E_SERVER_URL}/api/config`)).json()) as { googleClientId: string | null };
  await expect.poll(() => page.evaluate(() => (window as any).__game.cloud.getState().googleClientId)).toBe(expected.googleClientId);
  expect(errors).toEqual([]);
});
