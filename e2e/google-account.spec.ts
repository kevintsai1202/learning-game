/**
 * Google 快速登入綁大人帳號（A4，docs/plans/accounts.md 第 9 節）：用 e2e/fixtures 的假金鑰簽 token，
 * Google 按鈕換成測試按鈕（openDevice 設好 learning-island-google-stub）。按鈕送出的 token 放在 window 上，
 * 換頁（page.goto、重新整理）就不見了，所以每次按之前都要 prepareGoogleAccount。
 */
import { expect, test } from '@playwright/test';
import { prepareGoogleAccount } from './googleStub';
import { TEST_PASSWORD, flushDeviceLogs, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/google-account';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

test('用 Google 註冊：email 自動帶入 Google 的而且算驗證過（不寄驗證信）；之後可以直接用 Google 登入', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const d = await openDevice(browser, baseURL!);
  const username = uniqueUsername();
  const sub = `sub-${username}`;
  const email = `${username}@gmail.com`;
  await d.page.getByTestId('teacher-link').click();
  await d.page.getByTestId('account-tab-register').click();
  await prepareGoogleAccount(d.page, sub, email);
  await d.page.getByTestId('account-google-register').click();
  await expect(d.page.getByTestId('account-google-email')).toContainText(email);
  await expect(d.page.getByTestId('account-email')).toHaveCount(0);
  await d.page.getByTestId('account-username').fill(username);
  await d.page.getByTestId('account-password').fill(TEST_PASSWORD);
  await d.page.getByTestId('account-confirm').fill(TEST_PASSWORD);
  await d.page.getByTestId('role-parent').click();
  await d.page.screenshot({ path: `${SHOTS}/01-register-with-google.png` });
  await d.page.getByTestId('account-submit').click();
  await expect(d.page.getByTestId('parent-home')).toBeVisible();
  // email 已經驗證過：沒有「驗證信已經寄到」的提示，帳號設定顯示已驗證、已綁定 Google
  await expect(d.page.getByTestId('verify-mail-note')).toHaveCount(0);
  await d.page.getByTestId('account-settings').click();
  await expect(d.page.getByTestId('email-status')).toContainText('已驗證');
  await expect(d.page.getByTestId('google-links')).toContainText('已綁定');
  // 登出後用 Google 登入
  await d.page.getByTestId('account-logout').click();
  await prepareGoogleAccount(d.page, sub, email);
  await d.page.getByTestId('account-google-login').click();
  await expect(d.page.getByTestId('account-name')).toContainText(username);
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});

test('帳號密碼註冊後在帳號設定綁定 Google；登出後用 Google 登入；解除後就不能用那個 Google 登入', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const d = await openDevice(browser, baseURL!);
  const username = uniqueUsername();
  const sub = `sub-${username}`;
  await d.page.getByTestId('teacher-link').click();
  await d.page.getByTestId('account-tab-register').click();
  await d.page.getByTestId('account-username').fill(username);
  await d.page.getByTestId('account-password').fill(TEST_PASSWORD);
  await d.page.getByTestId('account-confirm').fill(TEST_PASSWORD);
  await d.page.getByTestId('account-email').fill(`${username}@example.com`);
  await d.page.getByTestId('role-parent').click();
  await d.page.getByTestId('account-submit').click();
  await expect(d.page.getByTestId('parent-home')).toBeVisible();
  // 綁定 Google（和帳號的 email 不同也可以）
  await d.page.getByTestId('account-settings').click();
  await expect(d.page.getByTestId('google-links')).toContainText('還沒有綁定');
  await prepareGoogleAccount(d.page, sub, 'papa.lin@gmail.com');
  await d.page.getByTestId('settings-google-link').click();
  await expect(d.page.getByTestId('google-links')).toContainText('pa***@gmail.com');
  await d.page.screenshot({ path: `${SHOTS}/02-settings-linked.png` });
  // 登出 → 用 Google 登入，回到家長模式
  await d.page.getByTestId('account-logout').click();
  await prepareGoogleAccount(d.page, sub, 'papa.lin@gmail.com');
  await d.page.getByTestId('account-google-login').click();
  await expect(d.page.getByTestId('account-name')).toContainText(username);
  await expect(d.page.getByTestId('parent-home')).toBeVisible();
  // 解除綁定 → 再用那個 Google 登入會說明還沒綁定
  await d.page.getByTestId('account-settings').click();
  await d.page.getByTestId(`google-unlink-${sub}`).click();
  await expect(d.page.getByTestId('google-links')).toContainText('還沒有綁定');
  await d.page.getByTestId('account-logout').click();
  await prepareGoogleAccount(d.page, sub, 'papa.lin@gmail.com');
  await d.page.getByTestId('account-google-login').click();
  await expect(d.page.getByTestId('account-error')).toContainText('還沒有綁定知識島的帳號');
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});
