/**
 * 效能量測（不當作驗收門檻）：島嶼場景每幀的 draw call 與三角形數，印在測試輸出。
 * 平板上 draw call 太多（數百以上）會掉幀，數字變大時要考慮合併靜態幾何。
 */
import { test } from '@playwright/test';
import { createKid, freshStart } from './helpers';

test('量測島嶼場景的 draw call', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '量測');
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const gl = (window as any).__game.gl;
    return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
  });
  console.log('島嶼場景', JSON.stringify(info));
});
