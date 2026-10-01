/**
 * 3D 垃圾分類：點舞台上的 3D 垃圾桶作答（不用下方按鈕）。
 * 依桶子在畫面上的位置點擊：用 three 的相機把桶子座標投影成螢幕座標。
 */
import { expect, test } from '@playwright/test';
import { createKid, currentQuestion, enterZone, freshStart } from './helpers';

test('點 3D 垃圾桶可以作答，答對會出現稱讚', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小安');
  await enterZone(page, 'life');
  await page.getByTestId('activity-life.recycle3d').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/screenshots/13-recycle.png' });
  const q = await currentQuestion(page);
  // 桶子 x：-1.3、0、1.3；z 3.1；桶身中心高度約 0.6
  const pt = await page.evaluate((i) => {
    const g = (window as any).__game;
    const gl = g.gl as any;
    const cam = g.camera;
    const xs = [-1.3, 0, 1.3];
    const v = new cam.position.constructor(xs[i], 0.6, 3.1).project(cam);
    const rect = gl.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }, q.answer);
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByTestId('feedback-good')).toBeVisible();
});
