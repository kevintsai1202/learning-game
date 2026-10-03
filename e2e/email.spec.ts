/**
 * Email 驗證與忘記密碼（A3，docs/plans/accounts.md 第 7 節）：伺服器用測試信箱（TEST_MAIL_OUTBOX，playwright.config.ts 開），
 * 從信裡取出連結再用瀏覽器打開。對正式伺服器跑時（沒有測試信箱）自動略過。
 */
import { expect, test, type Page } from '@playwright/test';
import { SERVER, TEST_PASSWORD, flushDeviceLogs, linkIn, mailsTo, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/email';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 在標題畫面打開帳號頁，用畫面註冊一位家長；回傳帳號名稱與 email */
async function registerViaUi(page: Page): Promise<{ username: string; email: string }> {
  const username = uniqueUsername();
  const email = `${username}@example.com`;
  await page.getByTestId('teacher-link').click();
  await page.getByTestId('account-tab-register').click();
  await page.getByTestId('account-username').fill(username);
  await page.getByTestId('account-password').fill(TEST_PASSWORD);
  await page.getByTestId('account-confirm').fill(TEST_PASSWORD);
  await page.getByTestId('account-email').fill(email);
  await page.getByTestId('role-parent').click();
  await page.getByTestId('account-submit').click();
  await expect(page.getByTestId('parent-home')).toBeVisible();
  return { username, email };
}

test('註冊後收到驗證信，打開信裡的連結就驗證好；帳號設定顯示已驗證', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  test.skip((await mailsTo(request, 'nobody@example.com')) === null, '伺服器沒有開測試信箱');
  const d = await openDevice(browser, baseURL!);
  const { email } = await registerViaUi(d.page);
  await expect(d.page.getByTestId('verify-mail-note')).toContainText('驗證信已經寄到');
  const mails = await mailsTo(request, email);
  expect(mails).toHaveLength(1);
  const link = linkIn(mails![0].text, 'verify');
  // 連結指回這個前端（e2e 的 vite preview）
  expect(link.startsWith(`${new URL(baseURL!).origin}/?verify=`)).toBe(true);
  await d.page.goto(link);
  await expect(d.page.getByTestId('email-link-result')).toContainText('email 驗證好了');
  // 網址上的參數已經拿掉
  expect(new URL(d.page.url()).searchParams.has('verify')).toBe(false);
  await d.page.screenshot({ path: `${SHOTS}/01-verified.png` });
  await d.page.getByTestId('email-link-close').click();
  await d.page.getByTestId('account-settings').click();
  await expect(d.page.getByTestId('email-status')).toContainText('已驗證');
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});

test('忘記密碼：收到重設信，設定新密碼後要重新登入；舊密碼不能用、新密碼可以', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  test.skip((await mailsTo(request, 'nobody@example.com')) === null, '伺服器沒有開測試信箱');
  // 準備：用 API 註冊並驗證 email（只寄重設信給驗證過的 email）
  const username = uniqueUsername();
  const email = `${username}@example.com`;
  const reg = await request.post(`${SERVER}/api/users`, { data: { username, password: TEST_PASSWORD, email, parent: true, teacher: false, appUrl: `${baseURL}` } });
  expect(reg.ok(), `註冊 ${reg.status()}`).toBe(true);
  const verifyToken = new URL(linkIn((await mailsTo(request, email))![0].text, 'verify')).searchParams.get('verify');
  expect((await request.post(`${SERVER}/api/users/email/verify`, { data: { token: verifyToken } })).ok()).toBe(true);

  const d = await openDevice(browser, baseURL!);
  await d.page.getByTestId('teacher-link').click();
  await d.page.getByTestId('forgot-open').click();
  await d.page.getByTestId('forgot-login').fill(username);
  await d.page.getByTestId('forgot-submit').click();
  await expect(d.page.getByTestId('forgot-msg')).toContainText('重設密碼的信已經寄出');
  const reset = (await mailsTo(request, email))!.find((m) => m.text.includes('?reset='));
  expect(reset, '收到重設信').toBeTruthy();
  await d.page.goto(linkIn(reset!.text, 'reset'));
  await expect(d.page.getByTestId('email-link-panel')).toContainText('設定新密碼');
  const NEW_PASSWORD = 'brandnew2026';
  await d.page.getByTestId('reset-password').fill(NEW_PASSWORD);
  await d.page.getByTestId('reset-confirm').fill(NEW_PASSWORD);
  await d.page.getByTestId('reset-submit').click();
  await expect(d.page.getByTestId('email-link-result')).toContainText('密碼改好了');
  await d.page.screenshot({ path: `${SHOTS}/02-password-reset.png` });
  await d.page.getByTestId('email-link-close').click();
  // 舊密碼不能登入
  await d.page.getByTestId('account-username').fill(username);
  await d.page.getByTestId('account-password').fill(TEST_PASSWORD);
  await d.page.getByTestId('account-submit').click();
  await expect(d.page.getByTestId('account-error')).toContainText('帳號名稱或密碼不對');
  // 新密碼可以
  await d.page.getByTestId('account-password').fill(NEW_PASSWORD);
  await d.page.getByTestId('account-submit').click();
  await expect(d.page.getByTestId('account-name')).toContainText(username);
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});
