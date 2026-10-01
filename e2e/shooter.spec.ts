/**
 * 氣球射擊模式：在 3D 舞台點正確答案的氣球作答；下方小籤也能作答。
 * 氣球位置從 window.__game.quiz.targets 讀取，用相機投影成螢幕座標後點擊（不寫死座標）。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, currentQuestion, enterZone, freshStart } from './helpers';

/** 點第 index 顆氣球（依目前位置投影到螢幕） */
async function clickBalloon(page: Page, index: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => (window as any).__game.quiz.targets.length)).toBeGreaterThan(index);
  const pt = await page.evaluate((i) => {
    const g = (window as any).__game;
    const t = g.quiz.targets[i];
    const v = g.camera.position.clone().set(t.x, t.y, t.z).project(g.camera);
    const rect = g.gl.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }, index);
  await page.mouse.click(pt.x, pt.y);
}

test('射擊模式：點中正確答案的氣球會答對，小籤也能作答', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '射手');
  await enterZone(page, 'math');
  await page.getByTestId('activity-math.times').click();
  await page.getByTestId('shoot-1').click();
  await expect(page.locator('[data-testid="quiz"][data-mode="shooter"]')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/screenshots/14-shooter.png' });

  const q1 = await currentQuestion(page);
  expect(q1.type).toBe('choice');
  expect(q1.options.length).toBeGreaterThanOrEqual(3);
  await clickBalloon(page, q1.answer);
  await expect(page.getByTestId('feedback-good')).toBeVisible();
  await expect(page.getByTestId('shooter-score')).toContainText('100');

  // 換題後改用下方小籤作答
  await expect.poll(async () => (await currentQuestion(page)).id).not.toBe(q1.id);
  const q2 = await currentQuestion(page);
  await page.getByTestId(`choice-${q2.answer}`).click();
  await expect(page.getByTestId('feedback-good')).toBeVisible();
});

test.describe('直式畫面', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('射擊模式在手機直式畫面，氣球都在畫面內', async ({ page }) => {
    await freshStart(page);
    await createKid(page, '射手');
    await enterZone(page, 'math');
    await page.getByTestId('activity-math.add').click();
    await page.getByTestId('shoot-1').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/screenshots/m4-shooter.png' });
    const inView = await page.evaluate(() => {
      const g = (window as any).__game;
      return g.quiz.targets.map((t: any) => {
        const v = g.camera.position.clone().set(t.x, t.y, t.z).project(g.camera);
        return Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
      });
    });
    expect(inView.every(Boolean)).toBe(true);
  });
});
