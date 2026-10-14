/**
 * 營運者監控頁（docs/plans/admin.md）：
 * - 不在 ADMIN_EMAILS 的 Google 帳號被拒；營運者（e2e 的伺服器設成 admin-e2e@example.com）登入後看到總覽與明細
 * - 孩子開遊戲時送出匿名造訪，監控頁的造訪數算得到
 * - 登出回到登入畫面
 * 截圖在 e2e/screenshots/admin/（不進版控）。
 */
import { expect, test, type Browser } from '@playwright/test';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, openDevice, pageErrors } from './onlineDevice';
import { prepareGoogleAccount } from './googleStub';

const SHOTS = 'e2e/screenshots/admin';
/** playwright.config.ts 的伺服器設的 ADMIN_EMAILS */
const ADMIN_EMAIL = 'admin-e2e@example.com';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 開監控頁：伺服器網址與 Google 測試按鈕寫進 localStorage */
async function openAdmin(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  await context.addInitScript((url) => {
    localStorage.setItem('learning-island-server-url', url);
    localStorage.setItem('learning-island-google-stub', '1');
  }, SERVER);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./admin.html');
  return { context, page, errors };
}

test('營運者監控：別的 Google 帳號被拒；營運者看到人數、造訪與明細；登出', async ({ browser, baseURL, request }) => {
  // 準備：一個班級、一位孩子上線（開遊戲時送出匿名造訪）
  const room = await createClassViaApi(request, '監控測試班');
  const join = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'cat', color: '#ffffff', hat: null } } });
  expect(join.ok()).toBe(true);
  const kid = await openDevice(browser, baseURL!);
  await loginAndEnter(kid.page, room.code, '阿寶', '1111');
  await expect.poll(() => kid.page.evaluate(() => localStorage.getItem('learning-island-visit'))).not.toBeNull();

  const admin = await openAdmin(browser, baseURL!);
  const { page } = admin;
  await expect(page.getByTestId('admin-login')).toBeVisible();

  // 不在清單的 Google 帳號
  await prepareGoogleAccount(page, 'g-someone', 'someone@example.com');
  await page.getByTestId('admin-google').click();
  await expect(page.getByTestId('admin-error')).toContainText('沒有營運者權限');
  await expect(page.getByTestId('admin-dashboard')).toHaveCount(0);

  // 營運者
  await prepareGoogleAccount(page, 'g-admin', ADMIN_EMAIL);
  await page.getByTestId('admin-google').click();
  await expect(page.getByTestId('admin-overview')).toBeVisible();
  await expect(page.getByTestId('admin-count-classes')).not.toContainText(/^班級0$/);
  await expect(page.getByTestId('admin-count-kids')).toContainText('孩子');
  // 造訪：今天至少一台（孩子的裝置）
  const visitsToday = Number((await page.getByTestId('admin-visits').locator('.admin-card-value').innerText()).split('／')[0]);
  expect(visitsToday).toBeGreaterThanOrEqual(1);
  // 孩子在線上
  await expect(page.getByTestId('admin-online').locator('.admin-card-value')).not.toHaveText('0');
  await page.screenshot({ path: `${SHOTS}/01-overview.png`, fullPage: true });

  // 明細：孩子、大人、班級
  await expect(page.getByTestId('admin-kids')).toContainText('阿寶');
  await page.getByTestId('admin-tab-adults').click();
  await expect(page.getByTestId(`admin-adult-${room.username}`)).toContainText('老師');
  await expect(page.getByTestId(`admin-adult-${room.username}`)).toContainText('***@example.com');
  await page.getByTestId('admin-tab-classes').click();
  await expect(page.getByTestId(`admin-class-${room.code}`)).toContainText('監控測試班');
  await page.screenshot({ path: `${SHOTS}/02-classes.png`, fullPage: true });

  // 重新整理後還在（權杖在 sessionStorage）；登出回到登入畫面
  await page.reload();
  await expect(page.getByTestId('admin-overview')).toBeVisible();
  await page.getByTestId('admin-logout').click();
  await expect(page.getByTestId('admin-login')).toBeVisible();

  expect(admin.errors).toEqual([]);
  expect(pageErrors(kid.page)).toEqual([]);
  await admin.context.close();
  await kid.context.close();
});
