/**
 * 多人上線模擬的截圖腳本：建立角色進島 → 啟動模擬（10 位假同學：8 位在島上、2 位在建築裡）→
 * 截「孩子實際看到的跟拍視角」與「廣角」，並檢查名牌數、公頻則數、進建築就從島上消失、沒有頁面錯誤。
 * 模擬資料（暱稱、位置、對話）都是假的，見 src/online/presenceDemo.ts。截圖在 e2e/screenshots/crowd/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, freshStart } from './helpers';

const OUT = 'e2e/screenshots/crowd';

/** 建立角色進島、啟動模擬；回傳成員統計 */
async function startCrowd(page: Page): Promise<{ island: number; total: number; chat: number }> {
  await freshStart(page);
  await createKid(page, '小安');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    (window as any).__stopDemo = (window as any).__game.presenceDemo();
  });
  // 等角色出現、走路的人起步
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const s = (window as any).__game.presence.getState();
    const members = Object.values(s.members) as { zone: string | null }[];
    return { island: members.filter((m) => m.zone === null).length, total: members.length, chat: s.chat.length as number };
  });
}

test('多人上線模擬：同島的同學、名牌、對話氣泡、公頻（電腦／平板橫放）', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const counts = await startCrowd(page);

  // 名牌數＝不在建築裡的人數；公頻顯示最近 5 則；線上人數含自己
  expect(counts).toMatchObject({ island: 8, total: 10 });
  await expect(page.getByTestId('name-tag')).toHaveCount(counts.island);
  await expect(page.getByTestId('chat-line')).toHaveCount(Math.min(5, counts.chat));
  await expect(page.getByTestId('online-count')).toContainText(`${counts.total + 1} 人在線上`);
  await expect(page.getByTestId('chat-inside')).toContainText('毛毛在數學城堡');
  expect(await page.getByTestId('chat-bubble').count()).toBeGreaterThan(0);
  const panel = (await page.getByTestId('chat-panel').boundingBox())!;
  const hint = (await page.locator('.hud-hint').boundingBox())!;
  expect(panel.y + panel.height, '公頻不能蓋住底部提示').toBeLessThanOrEqual(hint.y);
  await page.screenshot({ path: `${OUT}/01-follow-cam.png` });

  // 廣角：只把鏡頭視角放大（跟拍邏輯不動），一張圖放進全部同學與公頻
  await page.evaluate(() => {
    const cam = (window as any).__game.camera;
    cam.fov = 62;
    cam.updateProjectionMatrix();
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/02-wide.png` });

  // 有人進建築：從島上消失，公頻名單顯示在哪裡
  await page.evaluate(() => (window as any).__game.presence.getState().setZone('demo-fox', 'life'));
  await expect(page.getByTestId('name-tag')).toHaveCount(counts.island - 1);
  await expect(page.getByTestId('chat-inside')).toContainText('小橘在生活村');

  // 停止模擬：同學全部離開、公頻收起來
  await page.evaluate(() => (window as any).__stopDemo());
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);
  await expect(page.getByTestId('name-tag')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe('手機直式', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('多人上線模擬：手機直式畫面', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const counts = await startCrowd(page);
    await expect(page.getByTestId('name-tag')).toHaveCount(counts.island);
    // 手機只顯示最近 3 則（其餘用 CSS 隱藏）
    await expect(page.locator('[data-testid="chat-line"]:visible')).toHaveCount(Math.min(3, counts.chat));
    // 公頻面板完整在畫面內，而且不蓋住底部的提示文字
    const box = (await page.getByTestId('chat-panel').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    const hint = (await page.locator('.hud-hint').boundingBox())!;
    expect(box.y + box.height, '公頻不能蓋住底部提示').toBeLessThanOrEqual(hint.y);
    await page.screenshot({ path: `${OUT}/03-phone.png` });
    await page.evaluate(() => (window as any).__stopDemo());
    expect(errors).toEqual([]);
  });
});
