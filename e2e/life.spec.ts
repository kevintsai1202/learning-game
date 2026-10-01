/**
 * 生活村：選一個主題玩完一回合（單選、是非、排序題都會出現），結算後存檔。
 */
import { expect, test } from '@playwright/test';
import { createKid, enterZone, finishQuiz, freshStart } from './helpers';

test('生活村的交通安全玩完一回合會存檔', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小美');
  await enterZone(page, 'life');
  await expect(page.getByTestId('activity-life.traffic')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/11-life-menu.png' });
  await page.getByTestId('activity-life.traffic').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'e2e/screenshots/12-life-quiz.png' });
  await finishQuiz(page);
  await expect(page.getByTestId('result')).toBeVisible();
  const h = await page.evaluate(() => (window as any).__game.game.getState().profile().history[0]);
  expect(h.activityId).toBe('life.traffic');
  expect(h.correct).toBe(10);
});
