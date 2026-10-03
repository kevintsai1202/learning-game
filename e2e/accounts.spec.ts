/**
 * 大人帳號（A1，docs/plans/accounts.md）：老師在畫面上註冊（表單錯誤在畫面上就擋下）→ 建兩個班級 →
 * 孩子加入其中一班、老師點進去看得到 → 沒勾「保持登入」：同一個分頁重新整理還在、另開分頁要重新登入 →
 * 加上家長身分後可以切換 → 改密碼後舊密碼不能登入、新密碼可以。
 */
import { expect, test } from '@playwright/test';
import { SERVER, TEST_PASSWORD, flushDeviceLogs, openDevice, pageErrors, registerTeacherAndCreateClass } from './onlineDevice';

const SHOTS = 'e2e/screenshots/accounts';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

test('老師帳號：註冊、建兩個班級、孩子加入、沒勾保持登入、加上家長身分、改密碼', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const t = await openDevice(browser, baseURL!);

  // 註冊表單的錯誤在畫面上就擋下（帳號名稱不能用中文）
  await t.page.getByTestId('teacher-link').click();
  await t.page.getByTestId('account-tab-register').click();
  await t.page.getByTestId('account-username').fill('王老師');
  await t.page.getByTestId('account-password').fill(TEST_PASSWORD);
  await t.page.getByTestId('account-submit').click();
  await expect(t.page.getByTestId('account-error')).toContainText('4～20');
  await t.page.screenshot({ path: `${SHOTS}/01-register-error.png` });
  await t.page.getByTestId('teacher-back').click();

  // 註冊並建立第一個班級
  const { code, username } = await registerTeacherAndCreateClass(t.page, '二年一班');
  await t.page.screenshot({ path: `${SHOTS}/02-class-created.png` });

  // 第二個班級；清單裡兩班都在
  await t.page.getByTestId('class-back').click();
  await t.page.getByTestId('class-name').fill('安親班');
  await t.page.getByTestId('class-create').click();
  await expect(t.page.getByTestId('room-code-display')).toHaveText(/^\d{6}$/);
  await expect(t.page.getByTestId('room-code-display')).not.toHaveText(code);
  await t.page.getByTestId('class-back').click();
  await expect(t.page.getByTestId('class-list')).toContainText('二年一班');
  await expect(t.page.getByTestId('class-list')).toContainText('安親班');

  // 孩子加入第一班（API 準備），老師點進去看得到
  const join = await request.post(`${SERVER}/api/join`, { data: { code, nickname: '小安', pin: '1234', avatar: { animal: 'rabbit', color: '#ffffff', hat: null } } });
  expect(join.ok(), `加入 ${join.status()}`).toBe(true);
  await t.page.getByTestId(`class-${code}`).click();
  await expect(t.page.getByTestId('member-小安')).toBeVisible();
  await t.page.screenshot({ path: `${SHOTS}/03-class-dashboard.png` });

  // 沒勾保持登入：同一個分頁重新整理後還是登入的
  await t.page.reload();
  await expect(t.page.getByTestId('start')).toBeVisible();
  await t.page.getByTestId('teacher-link').click();
  await expect(t.page.getByTestId('account-name')).toContainText(username);
  // 另開一個分頁（同一台裝置）：要重新登入
  const tab2 = await t.context.newPage();
  await tab2.goto('./');
  await tab2.getByTestId('teacher-link').click();
  await expect(tab2.getByTestId('account-submit')).toBeVisible();
  await expect(tab2.getByTestId('account-name')).toHaveCount(0);
  await tab2.close();

  // 加上家長身分：出現身分切換；家長頁目前是即將開放的說明
  await t.page.getByTestId('account-settings').click();
  await t.page.getByTestId('role-add-parent').click();
  await expect(t.page.getByTestId('account-roles')).toContainText('家長');
  await t.page.getByTestId('mode-parent').click();
  await expect(t.page.getByTestId('parent-home')).toBeVisible();
  await t.page.getByTestId('mode-teacher').click();
  await expect(t.page.getByTestId('class-list')).toBeVisible();

  // 改密碼 → 登出 → 舊密碼不能登入、新密碼可以
  await t.page.getByTestId('settings-current').fill(TEST_PASSWORD);
  await t.page.getByTestId('settings-next').fill('newpass5678');
  await t.page.getByTestId('settings-confirm').fill('newpass5678');
  await t.page.getByTestId('settings-password-save').click();
  await expect(t.page.getByTestId('settings-msg')).toContainText('密碼改好了');
  await t.page.getByTestId('account-logout').click();
  await t.page.getByTestId('account-username').fill(username);
  await t.page.getByTestId('account-password').fill(TEST_PASSWORD);
  await t.page.getByTestId('account-submit').click();
  await expect(t.page.getByTestId('account-error')).toContainText('帳號名稱或密碼不對');
  await t.page.getByTestId('account-password').fill('newpass5678');
  await t.page.getByTestId('account-submit').click();
  await expect(t.page.getByTestId('account-name')).toContainText(username);

  expect(pageErrors(t.page)).toEqual([]);
  await t.context.close();
});
