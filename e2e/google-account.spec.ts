/**
 * Google 快速登入綁大人帳號（A4，docs/plans/accounts.md 第 9 節；L1 登入整理，docs/plans/login-ux-review.md）：
 * 用 e2e/fixtures 的假金鑰簽 token，Google 按鈕換成測試按鈕（openDevice 設好 learning-island-google-stub）。按鈕送出的 token 放在 window 上，
 * 換頁（page.goto、重新整理）就不見了，所以每次按之前都要 prepareGoogleAccount。
 * L1：登入表單只有一顆 Google 按鈕（在「登入」旁邊）；沒綁過的 Google 直接建立帳號（不用帳號名稱與密碼），
 * 掃 QR code 進來的自動是家長，否則選老師或家長；登入家長帳號後家長專區不用 PIN。
 */
import { expect, test } from '@playwright/test';
import { prepareGoogleAccount } from './googleStub';
import { TEST_PASSWORD, createClassViaApi, flushDeviceLogs, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/google-account';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

test('用 Google 註冊（不用帳號名稱與密碼）：選家長 → 家長頁；家長專區免 PIN；之後用 Google 確認身分設定密碼，帳號名稱＋密碼也能登入', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const d = await openDevice(browser, baseURL!);
  const name = uniqueUsername();
  const sub = `sub-${name}`;
  const email = `${name}@gmail.com`;
  // 標題畫面只有一個大人入口（線上版沒有角落的「家長專區」）
  await expect(d.page.getByTestId('parent-link')).toHaveCount(0);
  await d.page.getByTestId('teacher-link').click();
  // 登入表單：Google 按鈕就在「登入」旁邊，沒有「登入／註冊」兩個分頁
  await expect(d.page.getByTestId('account-google-login')).toBeVisible();
  await expect(d.page.getByTestId('account-tab-login')).toHaveCount(0);
  await d.page.screenshot({ path: `${SHOTS}/01-login-form.png` });
  // 沒綁過的 Google：問老師還是家長
  await prepareGoogleAccount(d.page, sub, email);
  await d.page.getByTestId('account-google-login').click();
  await expect(d.page.getByTestId('google-role-pick')).toBeVisible();
  await d.page.screenshot({ path: `${SHOTS}/02-role-pick.png` });
  await d.page.getByTestId('google-role-parent').click();
  await expect(d.page.getByTestId('parent-home')).toBeVisible();
  // 帳號名稱從 email 產生；email 已經驗證過：沒有「驗證信已經寄到」的提示
  const username = ((await d.page.getByTestId('account-name').locator('strong').textContent()) ?? '').trim();
  expect(username).toBe(name.slice(0, 16));
  await expect(d.page.getByTestId('verify-mail-note')).toHaveCount(0);

  // 登入家長帳號時，家長專區不用 PIN
  await d.page.getByTestId('parent-zone-link').click();
  await expect(d.page.getByTestId('tab-report')).toBeVisible();
  await expect(d.page.getByTestId('pin-msg')).toHaveCount(0);
  await d.page.getByTestId('parent-back').click();
  await d.page.getByTestId('teacher-link').click();

  // 帳號設定：已驗證、已綁定、還沒有密碼；唯一的 Google 不能解除
  await d.page.getByTestId('account-settings').click();
  await expect(d.page.getByTestId('email-status')).toContainText('已驗證');
  await expect(d.page.getByTestId('google-links')).toContainText('已綁定');
  await expect(d.page.getByTestId(`google-unlink-${sub}`)).toHaveCount(0);
  await expect(d.page.getByTestId('settings-password-title')).toContainText('設定密碼');
  // 設定密碼：填新密碼，再用 Google 確認身分
  await d.page.getByTestId('settings-set-password').click();
  await d.page.getByTestId('settings-next').fill(TEST_PASSWORD);
  await d.page.getByTestId('settings-confirm').fill(TEST_PASSWORD);
  await prepareGoogleAccount(d.page, sub, email);
  await d.page.getByTestId('settings-reauth-google').click();
  await expect(d.page.getByTestId('settings-msg')).toContainText('密碼設定好了');
  await expect(d.page.getByTestId('settings-password-title')).toContainText('改密碼');
  await d.page.screenshot({ path: `${SHOTS}/03-password-set.png` });

  // 登出 → 帳號名稱＋密碼登入 → 登出 → 用 Google 登入
  await d.page.getByTestId('account-logout').click();
  await d.page.getByTestId('account-username').fill(username);
  await d.page.getByTestId('account-password').fill(TEST_PASSWORD);
  await d.page.getByTestId('account-submit').click();
  await expect(d.page.getByTestId('account-name')).toContainText(username);
  await d.page.getByTestId('account-logout').click();
  await prepareGoogleAccount(d.page, sub, email);
  await d.page.getByTestId('account-google-login').click();
  await expect(d.page.getByTestId('account-name')).toContainText(username);
  // 登出後，家長專區又要 PIN（從登入畫面的連結進去）
  await d.page.getByTestId('account-logout').click();
  await d.page.getByTestId('account-parent-zone').click();
  await expect(d.page.getByTestId('pin-msg')).toBeVisible();
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});

test('掃 QR code 進來用 Google：不用選身分，直接成為家長、出現加入班級面板', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  const room = await createClassViaApi(request, '二年三班');
  const d = await openDevice(browser, baseURL!);
  const name = uniqueUsername();
  await d.page.goto(`./?join=${room.code}`);
  await expect(d.page.getByTestId('join-login-note')).toContainText(room.code);
  await prepareGoogleAccount(d.page, `sub-${name}`, `${name}@gmail.com`);
  await d.page.getByTestId('account-google-login').click();
  await expect(d.page.getByTestId('join-class-title')).toContainText('二年三班');
  await expect(d.page.getByTestId('google-role-pick')).toHaveCount(0);
  await expect(d.page.getByTestId('join-not-parent')).toHaveCount(0);
  await expect(d.page.getByTestId('parent-home')).toBeVisible();
  await d.page.screenshot({ path: `${SHOTS}/04-join-with-google.png` });
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});

test('帳號密碼註冊後在帳號設定綁定 Google；登出後用 Google 登入；解除後再用那個 Google 會問要不要建立新帳號', async ({ browser, baseURL }) => {
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
  await expect(d.page.getByTestId('settings-password-title')).toContainText('改密碼');
  await prepareGoogleAccount(d.page, sub, 'papa.lin@gmail.com');
  await d.page.getByTestId('settings-google-link').click();
  await expect(d.page.getByTestId('google-links')).toContainText('pa***@gmail.com');
  await d.page.screenshot({ path: `${SHOTS}/05-settings-linked.png` });
  // 登出 → 用 Google 登入，回到家長模式
  await d.page.getByTestId('account-logout').click();
  await prepareGoogleAccount(d.page, sub, 'papa.lin@gmail.com');
  await d.page.getByTestId('account-google-login').click();
  await expect(d.page.getByTestId('account-name')).toContainText(username);
  await expect(d.page.getByTestId('parent-home')).toBeVisible();
  // 有密碼的帳號可以解除唯一的 Google；解除後再用那個 Google，會問老師還是家長（等於建立新帳號），按取消回到登入
  await d.page.getByTestId('account-settings').click();
  await d.page.getByTestId(`google-unlink-${sub}`).click();
  await expect(d.page.getByTestId('google-links')).toContainText('還沒有綁定');
  await d.page.getByTestId('account-logout').click();
  await prepareGoogleAccount(d.page, sub, 'papa.lin@gmail.com');
  await d.page.getByTestId('account-google-login').click();
  await expect(d.page.getByTestId('google-role-pick')).toBeVisible();
  await d.page.getByTestId('google-role-cancel').click();
  await expect(d.page.getByTestId('account-submit')).toBeVisible();
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});
