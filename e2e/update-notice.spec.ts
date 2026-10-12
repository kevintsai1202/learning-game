/**
 * 更新通知（docs/plans/update-notice.md）：攔截 version.json 假裝有新版。
 * - 版本一樣：不提示（反向檢查，避免比對寫錯一直跳）。
 * - 孩子在島上：提示倒數 10 秒自動重新整理，重新整理後回到島上、還是同一個角色。
 * - 答題中：只提示「做完回到島上就會更新」，不會重新整理；回到島上才倒數。
 * - 大人的帳號頁：只提示，不自動重新整理；按「立即更新」才重新整理，回到帳號頁。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, enterZone, freshStart } from './helpers';

/** 讓 version.json 回傳某個版本號（id 是 null 時照真的檔案） */
async function fakeVersion(page: Page, id: string | null): Promise<void> {
  await page.unroute('**/version.json*');
  if (id !== null) await page.route('**/version.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id }) }));
}
/** 叫網頁現在檢查一次 */
const check = (page: Page) => page.evaluate(() => (window as any).__game.update.check() as Promise<boolean>);
/** 網頁自己的版本號 */
const buildId = (page: Page) => page.evaluate(() => (window as any).__game.update.buildId as string);
/** 現在的畫面（重新整理途中還沒載入好時是 null） */
const screen = (page: Page) => page.evaluate(() => ((window as any).__game?.ui.getState().screen as string | undefined) ?? null).catch(() => null);
/** 記下這一次載入（重新整理後會不一樣） */
const markLoad = (page: Page) => page.evaluate(() => ((window as any).__loadMark = Math.random()));
const loadMark = (page: Page) => page.evaluate(() => (window as any).__loadMark ?? null).catch(() => null);

test('版本一樣不提示；孩子在島上倒數自動重新整理，回到島上、同一個角色', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小安');
  const id = await buildId(page);
  expect(id).not.toBe('');
  // 真的 version.json 和網頁的版本號一樣：不提示
  expect(await check(page)).toBe(false);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
  const profileId = await page.evaluate(() => (window as any).__game.game.getState().save.activeProfileId);

  // 假裝有新版：提示倒數，10 秒後自動重新整理
  await fakeVersion(page, 'newer-build');
  await markLoad(page);
  expect(await check(page)).toBe(true);
  await expect(page.getByTestId('update-banner')).toBeVisible();
  await expect(page.getByTestId('update-note')).toContainText('秒後自動更新');
  // 跳出的動畫跑完再截圖；手機尺寸也截一張（提示不能壓到上方一行的按鈕）
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/screenshots/update-banner.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/screenshots/update-banner-phone.png' });
  const banner = (await page.getByTestId('update-banner').boundingBox())!;
  for (const chip of await page.locator('.hud-chip').all()) {
    const b = await chip.boundingBox();
    if (b && b.width > 0) expect(b.y + b.height <= banner.y || b.y >= banner.y + banner.height || b.x + b.width <= banner.x || b.x >= banner.x + banner.width).toBe(true);
  }
  await expect.poll(() => loadMark(page), { timeout: 20_000 }).toBeNull();
  // 重新整理後回到島上、同一個角色；沒有再提示（剛載入不檢查）
  await expect.poll(() => screen(page), { timeout: 30_000 }).toBe('island');
  expect(await page.evaluate(() => (window as any).__game.game.getState().save.activeProfileId)).toBe(profileId);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('答題中只提示不重新整理，回到島上才倒數；大人的帳號頁只提示、按了才更新', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小美');
  await fakeVersion(page, 'newer-build');
  // 進一個活動開始答題（數學加法第 1 級）
  await enterZone(page, 'math');
  await page.getByTestId('activity-math.add').click();
  await page.getByTestId('level-1').click();
  await expect.poll(() => screen(page)).toBe('activity');
  await markLoad(page);
  expect(await check(page)).toBe(true);
  await expect(page.getByTestId('update-note')).toContainText('做完回到島上就會更新');
  await page.waitForTimeout(12_000);
  expect(await loadMark(page)).not.toBeNull();
  expect(await screen(page)).toBe('activity');
  // 回到島上：開始倒數，自動重新整理
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await expect(page.getByTestId('update-note')).toContainText('秒後自動更新');
  await expect.poll(() => loadMark(page), { timeout: 20_000 }).toBeNull();
  await expect.poll(() => screen(page), { timeout: 30_000 }).toBe('island');

  // 大人的帳號頁：只提示，等 12 秒也不會自動重新整理；按「立即更新」才重新整理，回到帳號頁
  await page.evaluate(() => (window as any).__game.ui.getState().goto('teacher'));
  await markLoad(page);
  expect(await check(page)).toBe(true);
  await expect(page.getByTestId('update-note')).not.toContainText('秒後自動更新');
  await page.waitForTimeout(12_000);
  expect(await loadMark(page)).not.toBeNull();
  await page.getByTestId('update-now').click();
  await expect.poll(() => loadMark(page), { timeout: 20_000 }).toBeNull();
  await expect.poll(() => screen(page), { timeout: 30_000 }).toBe('teacher');
});
