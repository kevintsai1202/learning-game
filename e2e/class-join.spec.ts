/**
 * 掃 QR code 加入班級（docs/plans/class-join.md）：老師班級頁有 QR code 與加入連結；家長打開連結 → 登入家長帳號 →
 * 選雲端角色加入（不用密碼）→ 在這台裝置玩，進到班級島；也可以新建角色加入；
 * 沒有密碼的孩子在老師成員表顯示「設定密碼」，老師設定後可以用班級代碼登入。
 * 截圖在 e2e/screenshots/class-join/（不進版控）。
 */
import { expect, test } from '@playwright/test';
import { SERVER, TEST_PASSWORD, createClassViaApi, flushDeviceLogs, loginTeacher, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/class-join';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

test('家長掃 QR code：登入家長帳號、選雲端角色加入、在這台裝置玩；新建角色加入；老師設定密碼', async ({ browser, baseURL, request }) => {
  test.setTimeout(420_000);
  /** 直接呼叫伺服器 API（準備資料用） */
  const api = async (method: 'POST' | 'GET', path: string, data?: unknown, token?: string) => {
    const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  const room = await createClassViaApi(request, '二年一班');
  // 家長帳號與一個雲端角色（用裝置的存檔格式產生再上傳）
  const momName = uniqueUsername();
  const mom = await api('POST', '/api/users', { username: momName, password: TEST_PASSWORD, email: `${momName}@example.com`, parent: true, teacher: false });
  const tmp = await (await browser.newContext({ baseURL })).newPage();
  await tmp.goto('./');
  const profile = await tmp.evaluate(() => {
    (window as any).__game.game.getState().createProfile('哥哥', { animal: 'bear', color: '#ffffff', hat: null });
    return JSON.parse(JSON.stringify((window as any).__game.game.getState().profile()));
  });
  await tmp.context().close();
  await api('POST', '/api/parent/kids', { profile }, mom.token);

  // ① 老師班級頁：QR code 與加入連結
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await expect(t.page.getByTestId('join-qr')).toBeVisible();
  const joinUrl = ((await t.page.getByTestId('join-url').textContent()) ?? '').trim();
  expect(joinUrl).toMatch(new RegExp(`\\?join=${room.code}$`));
  await t.page.getByTestId('join-qr-block').screenshot({ path: `${SHOTS}/01-teacher-qr.png` });

  // ② 家長打開加入連結：網址參數拿掉、到帳號頁，提示登入家長帳號
  const p = await openDevice(browser, baseURL!);
  await p.page.goto(joinUrl);
  await expect(p.page.getByTestId('join-login-note')).toContainText(room.code);
  expect(p.page.url()).not.toContain('join=');
  await p.page.getByTestId('account-username').fill(momName);
  await p.page.getByTestId('account-password').fill(TEST_PASSWORD);
  await p.page.getByTestId('account-submit').click();

  // ③ 加入班級面板：選雲端角色「哥哥」，暱稱預設是名字，不用密碼
  await expect(p.page.getByTestId('join-class-title')).toContainText('二年一班');
  await p.page.getByTestId('join-kid-哥哥').click();
  await expect(p.page.getByTestId('join-nickname')).toHaveValue('哥哥');
  await p.page.screenshot({ path: `${SHOTS}/02-parent-pick.png` });
  await p.page.getByTestId('join-submit').click();
  await expect(p.page.getByTestId('join-done')).toContainText('已經加入「二年一班」');

  // ④ 在這台裝置玩：進到班級島
  await p.page.getByTestId('join-play').click();
  await expect.poll(() => p.page.evaluate(() => (window as any).__game.ui.getState().screen)).toBe('island');
  await expect.poll(() => p.page.evaluate(() => (window as any).__game.realtime.getState().island)).toBe('class');
  expect(await p.page.evaluate(() => (window as any).__game.game.getState().profile().cloud.room)).toBe(room.code);

  // ⑤ 新建角色加入（同一位家長再打開一次連結）
  await p.page.goto(joinUrl);
  await expect(p.page.getByTestId('join-class-title')).toContainText('二年一班');
  await expect(p.page.getByTestId('join-kid-哥哥')).toBeDisabled();
  await p.page.getByTestId('join-new').click();
  await p.page.getByTestId('join-new-name').fill('妹妹');
  await expect(p.page.getByTestId('join-nickname')).toHaveValue('妹妹');
  await p.page.getByTestId('join-submit').click();
  await expect(p.page.getByTestId('join-done')).toContainText('「妹妹」已經加入');
  await p.page.getByTestId('join-cancel').click();
  await expect(p.page.getByTestId('join-class')).toHaveCount(0);
  // 新建的角色沒有放進家長這台裝置的存檔
  expect(await p.page.evaluate(() => (window as any).__game.game.getState().save.profiles.map((x: { name: string }) => x.name))).toEqual(['哥哥']);

  // ⑥ 老師成員表：兩個孩子都沒有密碼（「設定密碼」）；設定後可以用班級代碼登入
  await t.page.getByTestId('teacher-reload').click();
  await expect(t.page.getByTestId('reset-pin-哥哥')).toHaveText('設定密碼');
  await t.page.getByTestId('reset-pin-哥哥').click();
  await t.page.getByTestId('new-pin-哥哥').fill('2468');
  await t.page.getByTestId('save-pin-哥哥').click();
  await expect(t.page.getByTestId('reset-pin-哥哥')).toHaveText('重設密碼');
  await expect(t.page.getByTestId('reset-pin-妹妹')).toHaveText('設定密碼');
  expect((await api('POST', '/api/login', { code: room.code, nickname: '哥哥', pin: '2468' })).room.code).toBe(room.code);

  for (const d of [t, p]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([t.context.close(), p.context.close()]);
});
