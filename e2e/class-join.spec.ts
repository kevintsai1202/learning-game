/**
 * 掃 QR code 加入班級（docs/plans/class-join.md；L2 家長自動化，docs/plans/login-ux-review.md）：
 * 老師班級頁有 QR code 與加入連結；家長打開連結 → 登入家長帳號 →
 * 只有一個孩子：自動加入並在這台裝置進班級島（不用按按鈕）；兩個孩子：點卡片就加入並進島（暱稱撞名才問）；
 * 沒有孩子：直接出現新建角色的表單。
 * 沒有密碼的孩子在老師成員表顯示「設定密碼」，老師設定後可以用班級代碼登入；還沒設定時登入畫面直接說還沒有密碼。
 * 截圖在 e2e/screenshots/class-join/（不進版控）。
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { SERVER, TEST_PASSWORD, createClassViaApi, flushDeviceLogs, loginTeacher, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/class-join';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 目前的畫面 */
const screenOf = (page: Page) => page.evaluate(() => (window as any).__game.ui.getState().screen as string);

/** 用裝置的存檔格式產生幾個角色（家長上傳用）：開一個暫時的頁面建好再讀出來 */
async function makeProfiles(browser: Browser, baseURL: string, names: string[]): Promise<unknown[]> {
  const tmp = await (await browser.newContext({ baseURL })).newPage();
  await tmp.goto('./');
  const out: unknown[] = [];
  for (const name of names) {
    out.push(
      await tmp.evaluate((n) => {
        (window as any).__game.game.getState().createProfile(n, { animal: 'bear', color: '#ffffff', hat: null });
        return JSON.parse(JSON.stringify((window as any).__game.game.getState().profile()));
      }, name),
    );
  }
  await tmp.context().close();
  return out;
}

test('家長掃 QR code：一個孩子自動進島、兩個孩子點卡片（撞名才問暱稱）、沒有孩子新建；老師設定密碼', async ({ browser, baseURL, request }) => {
  test.setTimeout(480_000);
  /** 直接呼叫伺服器 API（準備資料用） */
  const api = async (method: 'POST' | 'GET', path: string, data?: unknown, token?: string) => {
    const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  /** 註冊一位家長、上傳他的孩子，回傳帳號名稱 */
  const parentWith = async (kids: string[]) => {
    const name = uniqueUsername();
    const reg = await api('POST', '/api/users', { username: name, password: TEST_PASSWORD, email: `${name}@example.com`, parent: true, teacher: false });
    for (const profile of await makeProfiles(browser, baseURL!, kids)) await api('POST', '/api/parent/kids', { profile }, reg.token);
    return name;
  };
  /** 這台裝置打開加入連結、用家長帳號登入 */
  const openAndLogin = async (page: Page, joinUrl: string, username: string) => {
    await page.goto(joinUrl);
    await expect(page.getByTestId('join-login-note')).toContainText(room.code);
    expect(page.url()).not.toContain('join=');
    await page.getByTestId('account-username').fill(username);
    await page.getByTestId('account-password').fill(TEST_PASSWORD);
    await page.getByTestId('account-submit').click();
  };
  /** 老師成員表上的暱稱 */
  const roster = async () =>
    ((await api('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token)) as { members: { nickname: string }[] }).members.map((m) => m.nickname).sort();

  const room = await createClassViaApi(request, '二年一班');
  // 班上已經有一位叫「二寶」的同學（測暱稱撞名）
  await api('POST', '/api/join', { code: room.code, nickname: '二寶', pin: '1357', avatar: { animal: 'cat', color: '#ffffff', hat: null } });

  // ① 老師班級頁：QR code 與加入連結
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await expect(t.page.getByTestId('join-qr')).toBeVisible();
  const joinUrl = ((await t.page.getByTestId('join-url').textContent()) ?? '').trim();
  expect(joinUrl).toMatch(new RegExp(`\\?join=${room.code}$`));
  await t.page.getByTestId('join-qr-block').screenshot({ path: `${SHOTS}/01-teacher-qr.png` });

  // ② 只有一個孩子的家長：登入後自動加入、在這台裝置進班級島（不用按任何按鈕）
  const mom = await parentWith(['哥哥']);
  const a = await openDevice(browser, baseURL!);
  await openAndLogin(a.page, joinUrl, mom);
  await expect.poll(() => screenOf(a.page), { timeout: 30_000 }).toBe('island');
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.realtime.getState().island)).toBe('class');
  expect(await a.page.evaluate(() => (window as any).__game.game.getState().profile().cloud.rooms[0].code)).toBe(room.code);
  expect(await roster()).toEqual(['二寶', '哥哥']);
  expect(pageErrors(a.page)).toEqual([]);
  await a.context.close();

  // ③ 兩個孩子的家長：卡片（手機版面）；點「二寶」→ 和班上的人撞名 → 換一個暱稱 → 進島
  const dad = await parentWith(['大寶', '二寶']);
  const b = await openDevice(browser, baseURL!);
  await b.page.setViewportSize({ width: 390, height: 844 });
  await openAndLogin(b.page, joinUrl, dad);
  await expect(b.page.getByTestId('join-kid-大寶')).toBeVisible();
  await expect(b.page.getByTestId('join-kid-二寶')).toContainText('還沒加入班級');
  // 面板標題與帳號列的按鈕不能被切掉或蓋住；卡片在畫面寬度內、沒有橫向捲動
  const title = (await b.page.getByTestId('join-class-title').boundingBox())!;
  const logout = (await b.page.getByTestId('account-logout').boundingBox())!;
  expect(logout.y + logout.height <= title.y, `帳號按鈕和面板標題重疊：${JSON.stringify({ logout, title })}`).toBe(true);
  const card = (await b.page.getByTestId('join-kid-二寶').boundingBox())!;
  expect(card.x >= 0 && card.x + card.width <= 390, `卡片超出畫面：${JSON.stringify(card)}`).toBe(true);
  expect(await b.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await b.page.screenshot({ path: `${SHOTS}/02-parent-pick-phone.png` });
  await b.page.getByTestId('join-kid-二寶').click();
  await expect(b.page.getByTestId('join-nickname')).toHaveValue('二寶');
  await expect(b.page.getByTestId('join-error')).toContainText('暱稱');
  await b.page.getByTestId('join-nickname').fill('二寶寶');
  await b.page.screenshot({ path: `${SHOTS}/03-nickname-taken.png` });
  await b.page.getByTestId('join-submit').click();
  await expect.poll(() => screenOf(b.page), { timeout: 30_000 }).toBe('island');
  expect(await roster()).toEqual(['二寶', '二寶寶', '哥哥']);
  expect(pageErrors(b.page)).toEqual([]);
  await b.context.close();

  // ④ 沒有孩子的家長：直接出現新建角色的表單 → 建立並加入 → 進島
  const grandma = await parentWith([]);
  const c = await openDevice(browser, baseURL!);
  await openAndLogin(c.page, joinUrl, grandma);
  await expect(c.page.getByTestId('join-new-form')).toBeVisible();
  await c.page.getByTestId('join-new-name').fill('弟弟');
  await c.page.screenshot({ path: `${SHOTS}/04-create.png` });
  await c.page.getByTestId('join-submit').click();
  await expect.poll(() => screenOf(c.page), { timeout: 30_000 }).toBe('island');
  expect(await c.page.evaluate(() => (window as any).__game.game.getState().profile().name)).toBe('弟弟');
  expect(await roster()).toEqual(['二寶', '二寶寶', '哥哥', '弟弟']);

  // ⑤ 老師成員表：家長加入的孩子都沒有密碼（「設定密碼」）；設定後可以用班級代碼登入
  await t.page.getByTestId('teacher-reload').click();
  await expect(t.page.getByTestId('reset-pin-哥哥')).toHaveText('設定密碼');
  await t.page.getByTestId('reset-pin-哥哥').click();
  await t.page.getByTestId('new-pin-哥哥').fill('2468');
  await t.page.getByTestId('save-pin-哥哥').click();
  await expect(t.page.getByTestId('reset-pin-哥哥')).toHaveText('重設密碼');
  await expect(t.page.getByTestId('reset-pin-弟弟')).toHaveText('設定密碼');
  expect((await api('POST', '/api/login', { code: room.code, nickname: '哥哥', pin: '2468' })).room.code).toBe(room.code);

  // ⑥ 還沒有密碼的弟弟用班級代碼登入：畫面直接說還沒有設定密碼（使用者決定）
  await c.page.evaluate(() => (window as any).__game.ui.getState().goto('class'));
  await c.page.getByTestId('class-tab-login').click();
  await c.page.getByTestId('class-code').fill(room.code);
  await c.page.getByTestId('class-nickname').fill('弟弟');
  await c.page.getByTestId('class-pin').fill('1111');
  await c.page.getByTestId('class-submit').click();
  await expect(c.page.getByTestId('class-error')).toContainText('還沒有設定班級密碼');

  for (const d of [t, c]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([t.context.close(), c.context.close()]);
});
