/**
 * 隱私權政策頁（Google 品牌驗證會審這一頁）：中英文都要有 Google 使用者資料的說明與有限使用（Limited Use）聲明；
 * 手機寬度時資料表格只在自己的框裡左右捲動，整頁不能橫向捲動。
 */
import { expect, test } from '@playwright/test';

test('隱私權政策：中英文都有 Google 使用者資料與有限使用聲明，手機寬度不會橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('./privacy.html');
  await expect(page.getByRole('heading', { level: 1, name: '知識島大冒險 隱私權政策' })).toBeVisible();

  const body = page.locator('body');
  // Google 使用者資料：要求的權限、保存的資料、有限使用聲明（中文版）
  await expect(body).toContainText('4. Google 使用者資料');
  await expect(body).toContainText('只保存 Google 帳號識別碼、電子郵件地址與綁定時間');
  await expect(body).toContainText('有限使用（Limited Use）規定');
  // 英文版（Google 審核人員看得懂的版本）
  await expect(page.locator('#english')).toContainText('Learning Island (知識島大冒險) Privacy Policy');
  await expect(page.locator('#english')).toContainText('including the Limited Use requirements');
  // 中英文各有一個連到 Google API 服務使用者資料政策的連結
  await expect(page.locator('a[href="https://developers.google.com/terms/api-services-user-data-policy"]')).toHaveCount(2);

  // 表格只在自己的框裡捲動，整頁不橫向捲動
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.locator('table').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/privacy-phone.png' });
});
