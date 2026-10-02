/**
 * 成就獎章（R1）：玩完第一回合得到「初次冒險」→ 結算畫面慶祝 → 獎章簿（得到的彩色、沒得到的灰色並寫還差多少）→
 * 選稱號 → 島上名牌顯示稱號 → 重新整理後還在。截圖在 e2e/screenshots/badges/（不進版控）。
 */
import { expect, test } from '@playwright/test';
import { createKid, enterZone, finishQuiz, freshStart, screen } from './helpers';

const OUT = 'e2e/screenshots/badges';

test('第一回合得到獎章、獎章簿顯示進度、選稱號後名牌顯示', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page, '小安');

  // 數學加法第 1 級：10 題全部一次答對
  await enterZone(page, 'math');
  await page.getByTestId('activity-math.add').click();
  await page.getByTestId('level-1').click();
  await finishQuiz(page);
  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByTestId('new-badge-first-adventure')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/01-result-new-badge.png` });

  // 獎章簿：1／18；答對 100 題還差 90 題
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await page.getByTestId('hud-badges').click();
  await expect.poll(() => screen(page)).toBe('badges');
  await expect(page.getByTestId('badge-count')).toHaveText('1／18');
  await expect(page.getByTestId('badge-first-adventure')).toHaveAttribute('data-earned', '1');
  await expect(page.getByTestId('badge-correct-100')).toHaveAttribute('data-earned', '0');
  await expect(page.getByTestId('badge-correct-100')).toContainText('還差 90 題');
  await page.screenshot({ path: `${OUT}/02-badge-book.png` });

  // 選稱號：島上名牌顯示「冒險新手」
  await page.getByTestId('title-first-adventure').click();
  await page.getByTestId('badges-back').click();
  await expect(page.getByTestId('hud-title')).toHaveText('冒險新手');
  await page.screenshot({ path: `${OUT}/03-hud-title.png` });

  // 重新整理後還在（存檔）
  await page.reload();
  await page.getByTestId('start').click();
  await page.getByTestId('profile-card').first().click();
  await expect.poll(() => screen(page)).toBe('island');
  await expect(page.getByTestId('hud-title')).toHaveText('冒險新手');
  expect(errors).toEqual([]);
});
