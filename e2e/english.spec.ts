/**
 * ABC 海灘：單字圖卡玩完一回合；聽字母活動用氣球射擊答一題。
 */
import { expect, test } from '@playwright/test';
import { answerCurrent, createKid, currentQuestion, enterZone, finishQuiz, freshStart } from './helpers';

test('英語單字圖卡玩完一回合會存檔', async ({ page }) => {
  await freshStart(page);
  await createKid(page, 'Amy');
  await enterZone(page, 'en');
  await page.screenshot({ path: 'e2e/screenshots/15-en-menu.png' });
  await page.getByTestId('activity-en.word-cards').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'e2e/screenshots/16-en-quiz.png' });
  await finishQuiz(page);
  const h = await page.evaluate(() => (window as any).__game.game.getState().profile().history[0]);
  expect(h.activityId).toBe('en.word-cards');
  expect(h.correct).toBe(10);
});

test('聽字母可以用氣球射擊玩', async ({ page }) => {
  await freshStart(page);
  await createKid(page, 'Ben');
  await enterZone(page, 'en');
  await page.getByTestId('activity-en.letter-listen').click();
  await page.getByTestId('shoot-1').click();
  await expect(page.locator('[data-testid="quiz"][data-mode="shooter"]')).toBeVisible();
  const q = await currentQuestion(page);
  expect(q.type).toBe('choice');
  await answerCurrent(page, true);
  await expect(page.getByTestId('feedback-good')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screenshots/17-en-shooter.png' });
});
