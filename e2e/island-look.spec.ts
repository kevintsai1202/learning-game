/**
 * L5 班級島與我的島分得出來（docs/plans/login-ux-review.md 第 4.5 節）：
 * 有班級的孩子：班級島有綠色的所在地標籤、班級旗子、原本的配樂；切到自己的島出現進島橫幅、藍色標籤、黃昏、
 * 門牌與小屋、另一首配樂；從建築回到同一座島不再顯示橫幅。沒有班級的孩子：不顯示標籤與橫幅、原本的配樂，但有自己的門牌與小屋。
 * 截圖在 e2e/screenshots/island-look/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, openDevice, pageErrors } from './onlineDevice';
import { createKid, freshStart } from './helpers';

const SHOTS = 'e2e/screenshots/island-look';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 現在想播的配樂 */
const musicOf = (page: Page) => page.evaluate(() => (window as any).__game.music.wanted as string | null);

test('有班級的孩子：班級島與自己的島的標籤、旗子、門牌與小屋、橫幅、配樂都不同', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年三班');
  const join = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '小安', pin: '1234', avatar: { animal: 'cat', color: '#ffffff', hat: null } } });
  expect(join.ok()).toBe(true);

  const d = await openDevice(browser, baseURL!);
  await loginAndEnter(d.page, room.code, '小安', '1234');

  // 班級島：橫幅、綠色標籤、旗子、原本的配樂；沒有小屋
  await expect(d.page.getByTestId('island-banner')).toContainText('二年三班的班級島');
  await expect(d.page.getByTestId('island-banner')).toHaveCount(0, { timeout: 5_000 });
  await expect(d.page.getByTestId('hud-location')).toHaveAttribute('data-island', 'class');
  await expect(d.page.getByTestId('hud-location')).toContainText('班級島・二年三班');
  await expect(d.page.getByTestId('island-flag')).toContainText('二年三班');
  await expect(d.page.getByTestId('island-home')).toHaveCount(0);
  expect(await musicOf(d.page)).toBe('island');
  await d.page.screenshot({ path: `${SHOTS}/01-class-island.png` });

  // 切到自己的島：橫幅、藍色標籤、門牌與小屋、另一首配樂；旗子不見
  await d.page.getByTestId('hud-island').click();
  await expect(d.page.getByTestId('island-banner')).toContainText('小安的島');
  await d.page.screenshot({ path: `${SHOTS}/02-banner-mine.png` });
  await expect(d.page.getByTestId('island-banner')).toHaveCount(0, { timeout: 5_000 });
  await expect(d.page.getByTestId('hud-location')).toHaveAttribute('data-island', 'mine');
  await expect(d.page.getByTestId('hud-location')).toContainText('小安的島');
  await expect(d.page.getByTestId('island-plate')).toContainText('小安的島');
  await expect(d.page.getByTestId('island-home')).toContainText('小安的家');
  await expect(d.page.getByTestId('island-flag')).toHaveCount(0);
  expect(await musicOf(d.page)).toBe('home');
  await d.page.screenshot({ path: `${SHOTS}/03-own-island.png` });

  // 進建築再出來：同一座島不再顯示橫幅；建築裡的配樂也還是自己的島那一首
  await d.page.evaluate(() => (window as any).__game.ui.getState().enterZone('math'));
  expect(await musicOf(d.page)).toBe('home');
  await d.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await d.page.waitForTimeout(600);
  await expect(d.page.getByTestId('island-banner')).toHaveCount(0);

  // 手機寬度：標籤與橫幅都在畫面裡
  await d.page.setViewportSize({ width: 390, height: 844 });
  const chip = (await d.page.getByTestId('hud-location').boundingBox())!;
  expect(chip.x >= 0 && chip.x + chip.width <= 390, `所在地標籤超出畫面：${JSON.stringify(chip)}`).toBe(true);
  await d.page.getByTestId('hud-island').click();
  const banner = (await d.page.getByTestId('island-banner').locator('span').boundingBox())!;
  expect(banner.x >= 0 && banner.x + banner.width <= 390, `橫幅超出畫面：${JSON.stringify(banner)}`).toBe(true);
  expect(await d.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await d.page.screenshot({ path: `${SHOTS}/04-banner-phone.png` });

  // 回到班級島：配樂換回來
  await expect(d.page.getByTestId('hud-location')).toHaveAttribute('data-island', 'class');
  expect(await musicOf(d.page)).toBe('island');

  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});

test('沒有班級的孩子：不顯示所在地標籤與橫幅、原本的配樂，有自己的門牌與小屋', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小安');
  await expect(page.getByTestId('island-plate')).toContainText('小安的島');
  await expect(page.getByTestId('island-home')).toContainText('小安的家');
  await expect(page.getByTestId('island-flag')).toHaveCount(0);
  await expect(page.getByTestId('hud-location')).toHaveCount(0);
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('island-banner')).toHaveCount(0);
  expect(await musicOf(page)).toBe('island');
  await page.screenshot({ path: `${SHOTS}/05-solo-island.png` });
});

test('同學在同一座島上時換島：同學名牌、旗子、門牌與小屋一起換掉，頁面不出錯', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年三班');
  for (const [nickname, pin] of [
    ['小安', '1111'],
    ['小美', '2222'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal: 'cat', color: '#ffffff', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  const a = await openDevice(browser, baseURL!);
  const b = await openDevice(browser, baseURL!);
  /** 錯誤的完整堆疊（找原因用） */
  const stacks: string[] = [];
  a.page.on('pageerror', (e) => stacks.push(e.stack ?? e.message));
  await loginAndEnter(a.page, room.code, '小安', '1111');
  await loginAndEnter(b.page, room.code, '小美', '2222');
  // 看得到同學的名牌
  await expect(a.page.getByTestId('name-tag')).toHaveCount(1, { timeout: 20_000 });
  for (let i = 0; i < 2; i++) {
    // 第二輪用手機寬度（視窗大小改變，3D 畫布跟著改尺寸）
    if (i === 1) await a.page.setViewportSize({ width: 390, height: 844 });
    await a.page.getByTestId('hud-island').click();
    await expect(a.page.getByTestId('hud-location')).toHaveAttribute('data-island', 'mine');
    await expect(a.page.getByTestId('name-tag')).toHaveCount(0, { timeout: 20_000 });
    await a.page.getByTestId('hud-island').click();
    await expect(a.page.getByTestId('hud-location')).toHaveAttribute('data-island', 'class');
    await expect(a.page.getByTestId('name-tag')).toHaveCount(1, { timeout: 20_000 });
  }
  // 重新整理後直接回到自己的島（牌子在 3D 畫布剛建好時就掛上），再切回班級島（牌子卸下、同學的名牌出現）
  await a.page.getByTestId('hud-island').click();
  await expect(a.page.getByTestId('hud-location')).toHaveAttribute('data-island', 'mine');
  a.page.on('console', (m) => m.text().startsWith('DEBUG-') && console.log(m.text()));
  await a.page.reload();
  await a.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await expect(a.page.getByTestId('island-home')).toBeAttached();
  await a.page.getByTestId('hud-island').click();
  await expect(a.page.getByTestId('hud-location')).toHaveAttribute('data-island', 'class');
  await expect(a.page.getByTestId('name-tag')).toHaveCount(1, { timeout: 20_000 });
  await a.page.waitForTimeout(1_000);
  if (stacks.length) console.log(`頁面錯誤的堆疊：\n${stacks.join('\n---\n')}`);
  expect(pageErrors(a.page)).toEqual([]);
  await Promise.all([a.context.close(), b.context.close()]);
});
