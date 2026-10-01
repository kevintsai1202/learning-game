/**
 * 跟著課本：預設數學南一二上；家長專區換成康軒後，數學城堡的單元跟著換。
 */
import { expect, test } from '@playwright/test';
import { createKid, enterZone, finishQuiz, freshStart, screen } from './helpers';

test('數學城堡依版本列出課本單元，可以玩單元練習；家長可以換版本', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小安');
  // 固定為上學期，避免測試結果隨日期改變
  await page.evaluate(() => {
    const g = (window as any).__game.game.getState();
    const p = g.profile();
    g.updateCurriculum(p.id, { ...p.curriculum, term: '上' });
  });
  await enterZone(page, 'math');
  await expect(page.getByText('跟著課本（南一 二上）')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/18-curriculum-menu.png' });
  await page.getByTestId('activity-unit:nani-math:上:2').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await finishQuiz(page);
  const h = await page.evaluate(() => (window as any).__game.game.getState().profile().history[0]);
  expect(h.activityId).toBe('unit:nani-math:上:2');

  // 家長專區換成康軒數學
  await page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
  for (const k of ['1', '2', '3', '4', '1', '2', '3', '4']) await page.getByTestId(`pin-${k}`).click();
  await page.getByTestId('tab-curriculum').click();
  await page.getByTestId('edition-math').selectOption('kanghsuan-math');
  await page.screenshot({ path: 'e2e/screenshots/19-curriculum-tab.png' });
  await page.getByTestId('parent-back').click();
  await expect.poll(() => screen(page)).toBe('island');
  await enterZone(page, 'math');
  await expect(page.getByText('跟著課本（康軒 二上）')).toBeVisible();
  await expect(page.getByTestId('activity-unit:kanghsuan-math:上:1')).toContainText('200 以內的數');
});
