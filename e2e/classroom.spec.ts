/**
 * L3 教室密碼（docs/plans/login-ux-review.md 第 7～8 節）：老師在班級頁設定教室密碼 →
 * 學校平板掃 QR code（沒有大人登入）→「學校的平板，老師在旁邊」→ 老師輸入教室密碼 → 班上名單 →
 * 「新增學生」建立並進島 → 回選角畫面點「🏫 班級」直接回到名單（記住 8 小時）→ 點另一個孩子進島 →
 * 老師換教室密碼：平板上的孩子被踢下線、名單要重新輸入密碼 → 老師關掉「允許加入」：不能新增學生。
 * 掃碼的家長：「我是家長」→ 登入表單。截圖在 e2e/screenshots/classroom/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { SERVER, createClassViaApi, flushDeviceLogs, loginTeacher, openDevice, pageErrors } from './onlineDevice';

const SHOTS = 'e2e/screenshots/classroom';
const PASSWORD = 'bear2026';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 目前的畫面 */
const screenOf = (page: Page) => page.evaluate(() => (window as any).__game.ui.getState().screen as string);
/** 目前角色 */
const profileOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.game.getState().profile())));
/** 即時連線的狀態 */
const realtimeOf = (page: Page) => page.evaluate(() => (window as any).__game.realtime.getState().status as string);

test('教室密碼：老師設定、平板掃碼解鎖看名單、新增學生進島、記住 8 小時、換密碼後要重新輸入、關掉允許加入', async ({ browser, baseURL, request }) => {
  test.setTimeout(420_000);
  /** 直接呼叫伺服器 API（準備與驗證用） */
  const api = async (method: 'POST' | 'GET' | 'PATCH', path: string, data?: unknown, token?: string) => {
    const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  const room = await createClassViaApi(request, '二年三班');
  // 班上已經有一位用代碼加入的孩子
  await api('POST', '/api/join', { code: room.code, nickname: '小美', pin: '1234', avatar: { animal: 'cat', color: '#ffffff', hat: null } });

  // ① 老師在班級頁設定教室密碼（6 個字以上才能存）
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await expect(t.page.getByTestId('class-password-status')).toContainText('還沒設定');
  await t.page.getByTestId('class-password-set').click();
  await t.page.getByTestId('class-password-input').fill('abc12');
  await expect(t.page.getByTestId('class-password-save')).toBeDisabled();
  await t.page.getByTestId('class-password-input').fill(PASSWORD);
  await t.page.getByTestId('class-password-save').click();
  await expect(t.page.getByTestId('class-password-status')).toContainText('已設定');
  await t.page.screenshot({ path: `${SHOTS}/01-teacher-password.png` });

  // ② 學校平板掃 QR code：沒有大人登入 → 問「老師在旁邊／我是家長」→ 老師 → 代碼已填好，輸入教室密碼
  const tablet = await openDevice(browser, baseURL!);
  await tablet.page.goto(`./?join=${room.code}`);
  await expect(tablet.page.getByTestId('join-entry')).toContainText(room.code);
  await tablet.page.screenshot({ path: `${SHOTS}/02-join-entry.png` });
  await tablet.page.getByTestId('join-as-teacher').click();
  await expect(tablet.page.getByTestId('classroom-code')).toHaveValue(room.code);
  await tablet.page.getByTestId('classroom-password').fill('wrong-one');
  await tablet.page.getByTestId('classroom-unlock').click();
  await expect(tablet.page.getByTestId('classroom-error')).toContainText('教室密碼不對');
  await tablet.page.getByTestId('classroom-password').fill(PASSWORD);
  await tablet.page.getByTestId('classroom-unlock').click();
  // ③ 名單：小美在上面；新增學生「小華」→ 直接進島
  await expect(tablet.page.getByTestId('classroom-kid-小美')).toBeVisible();
  await tablet.page.screenshot({ path: `${SHOTS}/03-roster.png` });
  await tablet.page.getByTestId('classroom-new').click();
  await tablet.page.getByTestId('classroom-new-name').fill('小華');
  await tablet.page.getByRole('button', { name: '小兔' }).click();
  await tablet.page.getByTestId('classroom-create').click();
  await expect.poll(() => screenOf(tablet.page), { timeout: 30_000 }).toBe('island');
  const hua = await profileOf(tablet.page);
  expect(hua).toMatchObject({ name: '小華', cloud: { rooms: [{ code: room.code, name: '二年三班', nickname: '小華' }], island: room.code } });
  await expect.poll(() => realtimeOf(tablet.page), { timeout: 20_000 }).toBe('online');
  // 老師成員表看得到小華、沒有密碼
  const members = (await api('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token)).members as { nickname: string; hasPin: boolean }[];
  expect(members.find((m) => m.nickname === '小華')).toMatchObject({ hasPin: false });

  // ④ 第二個孩子要玩：回選角畫面點「🏫 班級」→ 不用再輸入密碼，直接是名單 → 點小美進島
  await tablet.page.evaluate(() => (window as any).__game.ui.getState().goto('profiles'));
  await tablet.page.getByTestId('open-class').click();
  await expect(tablet.page.getByTestId('classroom-roster')).toBeVisible();
  await tablet.page.getByTestId('classroom-kid-小美').click();
  await expect.poll(() => screenOf(tablet.page), { timeout: 30_000 }).toBe('island');
  expect(await profileOf(tablet.page)).toMatchObject({ name: '小美', cloud: { island: room.code } });
  await expect.poll(() => realtimeOf(tablet.page), { timeout: 20_000 }).toBe('online');

  // ⑤ 老師換教室密碼：平板上的小美被踢下線；再點「🏫 班級」要重新輸入密碼
  await api('PATCH', `/api/teacher/rooms/${room.code}`, { classPassword: 'rabbit2027' }, room.token);
  await expect.poll(() => realtimeOf(tablet.page), { timeout: 20_000 }).toBe('kicked');
  await tablet.page.evaluate(() => (window as any).__game.ui.getState().goto('profiles'));
  await tablet.page.getByTestId('open-class').click();
  await expect(tablet.page.getByTestId('classroom-password')).toBeVisible();
  await expect(tablet.page.getByTestId('classroom-error')).toContainText('重新輸入教室密碼');
  // 班級代碼留著（不用再掃一次 QR code）
  await expect(tablet.page.getByTestId('classroom-code')).toHaveValue(room.code);
  // 舊密碼不行，新密碼可以
  await tablet.page.getByTestId('classroom-password').fill(PASSWORD);
  await tablet.page.getByTestId('classroom-unlock').click();
  await expect(tablet.page.getByTestId('classroom-error')).toContainText('教室密碼不對');

  // ⑥ 老師關掉「允許新的孩子加入」：名單還能看、能進島，但不能新增學生
  await api('PATCH', `/api/teacher/rooms/${room.code}`, { joinOpen: false }, room.token);
  await tablet.page.getByTestId('classroom-password').fill('rabbit2027');
  await tablet.page.getByTestId('classroom-unlock').click();
  await expect(tablet.page.getByTestId('classroom-kid-小華')).toBeVisible();
  await expect(tablet.page.getByTestId('classroom-new')).toBeDisabled();
  await expect(tablet.page.getByTestId('classroom-closed')).toBeVisible();
  await tablet.page.screenshot({ path: `${SHOTS}/04-roster-closed.png` });

  // ⑦ 班級登入畫面（備援）有「老師輸入教室密碼」的入口，不再有「第一次加入」
  await tablet.page.getByTestId('classroom-relock').click();
  await tablet.page.getByTestId('classroom-back').click();
  await tablet.page.evaluate(() => (window as any).__game.ui.getState().goto('class'));
  await expect(tablet.page.getByTestId('class-tab-join')).toHaveCount(0);
  await tablet.page.getByTestId('class-classroom').click();
  await expect(tablet.page.getByTestId('classroom-screen')).toBeVisible();

  for (const d of [t, tablet]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([t.context.close(), tablet.context.close()]);
});

test('家長在自己手機掃 QR code：選「我是家長」→ 登入表單（手機寬度）', async ({ browser, baseURL, request }) => {
  const room = await createClassViaApi(request, '二年三班');
  const phone = await openDevice(browser, baseURL!, { touch: true });
  await phone.page.setViewportSize({ width: 390, height: 844 });
  await phone.page.goto(`./?join=${room.code}`);
  await expect(phone.page.getByTestId('join-entry')).toBeVisible();
  expect(await phone.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await phone.page.screenshot({ path: `${SHOTS}/05-join-entry-phone.png` });
  await phone.page.getByTestId('join-as-parent').click();
  await expect(phone.page.getByTestId('join-login-note')).toContainText(room.code);
  await expect(phone.page.getByTestId('account-username')).toBeVisible();
  // 教室密碼畫面底下也有「家長登入」：直接到登入表單
  await phone.page.goto(`./?join=${room.code}`);
  await phone.page.getByTestId('join-as-teacher').click();
  await phone.page.getByTestId('classroom-parent-login').click();
  await expect(phone.page.getByTestId('account-username')).toBeVisible();
  expect(pageErrors(phone.page)).toEqual([]);
  await phone.context.close();
});

test('老師帳號已登入的平板掃 QR code：加入面板多一顆「老師在旁邊」，直接到教室密碼畫面（代碼已填）', async ({ browser, baseURL, request }) => {
  const room = await createClassViaApi(request, '二年三班');
  const tablet = await openDevice(browser, baseURL!);
  await loginTeacher(tablet.page, room.username);
  await tablet.page.goto(`./?join=${room.code}`);
  await expect(tablet.page.getByTestId('join-not-parent')).toBeVisible();
  await tablet.page.getByTestId('join-classroom').click();
  await expect(tablet.page.getByTestId('classroom-screen')).toBeVisible();
  await expect(tablet.page.getByTestId('classroom-code')).toHaveValue(room.code);
  expect(pageErrors(tablet.page)).toEqual([]);
  await tablet.context.close();
});
