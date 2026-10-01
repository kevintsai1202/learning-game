/**
 * 直式手機／平板版面：觸控裝置要出現搖桿，答題卡放在舞台下方且整張看得到。
 */
import { expect, test } from '@playwright/test';
import { createKid, enterZone, freshStart } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('直式畫面：島上有搖桿，答題卡與數字鍵盤完整顯示', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小安');
  await expect(page.locator('.joystick')).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/screenshots/m1-island.png' });

  await enterZone(page, 'math');
  await page.screenshot({ path: 'e2e/screenshots/m2-menu.png' });
  await page.getByTestId('activity-math.add').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'e2e/screenshots/m3-quiz.png' });
  // 數字鍵盤的確認鍵要在畫面內（不用捲動就按得到）
  const ok = await page.getByTestId('key-✓').boundingBox();
  expect(ok).not.toBeNull();
  expect(ok!.y + ok!.height).toBeLessThanOrEqual(844);
});
