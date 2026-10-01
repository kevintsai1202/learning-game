/**
 * 文字森林：跟著課本（康軒二上）第 1 課的單元練習，含描寫、認讀、部首、造詞等混合題，玩完一回合。
 * 另外看一下注音拼讀題的畫面（單獨的注音要用一般字型顯示）。
 */
import { expect, test } from '@playwright/test';
import { createKid, enterZone, finishQuiz, freshStart } from './helpers';

test('國語課本單元（康軒二上第 1 課）玩完一回合', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小安');
  await page.evaluate(() => {
    const g = (window as any).__game.game.getState();
    const p = g.profile();
    g.updateCurriculum(p.id, { ...p.curriculum, zh: 'kanghsuan-zh', term: '上' });
  });
  await enterZone(page, 'zh');
  await expect(page.getByText('跟著課本（康軒 二上）')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/screenshots/20-zh-menu.png' });
  await page.getByTestId('activity-unit:kanghsuan-zh:上:1').click();
  // 課本單元可選一般答題或射擊，這裡選一般答題（開始）
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'e2e/screenshots/21-zh-unit.png' });
  await finishQuiz(page);
  const h = await page.evaluate(() => (window as any).__game.game.getState().profile().history[0]);
  expect(h.activityId).toBe('unit:kanghsuan-zh:上:1');
  expect(h.total).toBeGreaterThanOrEqual(6);
});

test('注音拼讀題的畫面', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小華');
  await enterZone(page, 'zh');
  await page.getByTestId('activity-zh.zhuyin').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'e2e/screenshots/22-zh-zhuyin.png' });
  await finishQuiz(page);
});
