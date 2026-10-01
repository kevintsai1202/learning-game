/**
 * 描寫題：用自訂題庫放兩題英文字母描寫，照筆順畫完會判定答對。
 * 這支測試同時驗證「中心線 → 外框」的字形管線與寫字板座標換算。
 */
import { expect, test } from '@playwright/test';
import { createKid, currentQuestion, freshStart, importPack, screen, traceWrite } from './helpers';

test('照筆順描寫英文字母 L 與 A 會答對', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小芳');
  const id = await importPack(page, {
    format: 'learning-island-pack',
    version: 1,
    title: '字母描寫測試',
    questions: [
      { id: 'w-L', subject: 'en', skill: 'en.write', indicators: ['Aa-Ⅱ-2'], type: 'write', prompt: '照筆順寫出 L', target: 'L', script: 'latin' },
      { id: 'w-A', subject: 'en', skill: 'en.write', indicators: ['Aa-Ⅱ-2'], type: 'write', prompt: '照筆順寫出 A', target: 'A', script: 'latin' },
    ],
  });
  await page.evaluate((pid) => (window as any).__game.ui.getState().startActivity({ activityId: `pack.${pid}`, level: 1, seed: 1 }), id);
  await expect(page.getByTestId('write-pad')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'e2e/screenshots/09-write.png' });

  for (let i = 0; i < 2; i++) {
    const before = (await currentQuestion(page)).id;
    await traceWrite(page);
    await expect(page.getByTestId('feedback-good')).toBeVisible();
    // 等換到下一題（或結算）
    await expect.poll(async () => (await screen(page)) === 'result' || (await currentQuestion(page)).id !== before).toBe(true);
  }
  await expect.poll(() => screen(page)).toBe('result');
  const rec = await page.evaluate(() => (window as any).__game.game.getState().profile().history[0]);
  expect(rec.correct).toBe(2);
});
