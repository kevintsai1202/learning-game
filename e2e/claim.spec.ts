/**
 * L4 家長連結卡（docs/plans/login-ux-review.md 第 7.3 節方案 A）：
 * 老師在平板上建了學生「小華」→ 老師成員表按「家長連結」拿到連結卡 → 家長在自己手機打開連結、用 Google 註冊（不用選身分）→
 * 一顆「把『小華』連到我的帳號」→ 在這台手機進二年三班的班級島 → 家長頁看得到小華 → 老師成員表標示有家長、不再有「家長連結」→
 * 同一張卡再打開：「已經用過了」。截圖在 e2e/screenshots/claim/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { prepareGoogleAccount } from './googleStub';
import { SERVER, createClassViaApi, flushDeviceLogs, loginTeacher, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/claim';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 目前的畫面 */
const screenOf = (page: Page) => page.evaluate(() => (window as any).__game.ui.getState().screen as string);

test('家長連結卡：老師發卡、家長用 Google 註冊後一顆按鈕接手並進島、老師看到有家長、同一張卡不能再用', async ({ browser, baseURL, request }) => {
  test.setTimeout(360_000);
  /** 直接呼叫伺服器 API（準備資料用） */
  const api = async (method: 'POST' | 'PATCH', path: string, data?: unknown, token?: string) => {
    const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  const room = await createClassViaApi(request, '二年三班');
  await api('PATCH', `/api/teacher/rooms/${room.code}`, { classPassword: 'bear2026' }, room.token);
  const classroom = (await api('POST', `/api/class/${room.code}/unlock`, { password: 'bear2026' })).token as string;
  await api('POST', '/api/class/members', { nickname: '小華', avatar: { animal: 'rabbit', color: '#ffffff', hat: null } }, classroom);

  // ① 老師成員表：小華沒有家長 →「家長連結」→ 連結卡
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await expect(t.page.getByTestId('has-parent-小華')).toHaveCount(0);
  await t.page.getByTestId('claim-小華').click();
  await expect(t.page.getByTestId('claim-card-kid')).toContainText('小華');
  await expect(t.page.getByTestId('claim-qr')).toBeVisible();
  await t.page.getByTestId('claim-card').screenshot({ path: `${SHOTS}/01-claim-card.png` });
  const url = (await t.page.getByTestId('claim-url').textContent())!.trim();
  expect(url).toMatch(/\?claim=[A-Za-z0-9_-]{43}$/);
  const path = `./${url.slice(url.indexOf('?'))}`;

  // ② 家長手機打開連結：登入表單上方說明 → 用 Google 註冊（不用選身分）→ 核對孩子 → 一顆按鈕 → 進島
  const mom = await openDevice(browser, baseURL!, { touch: true });
  await mom.page.setViewportSize({ width: 390, height: 844 });
  await mom.page.goto(path);
  await expect(mom.page.getByTestId('claim-login-note')).toBeVisible();
  expect(mom.page.url()).not.toContain('claim=');
  const name = uniqueUsername();
  await prepareGoogleAccount(mom.page, `sub-${name}`, `${name}@gmail.com`);
  await mom.page.getByTestId('account-google-login').click();
  await expect(mom.page.getByTestId('google-role-pick')).toHaveCount(0);
  await expect(mom.page.getByTestId('claim-kid')).toContainText('小華');
  await expect(mom.page.getByTestId('claim-kid')).toContainText('二年三班');
  expect(await mom.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await mom.page.screenshot({ path: `${SHOTS}/02-claim-panel-phone.png` });
  await mom.page.getByTestId('claim-accept').click();
  await expect.poll(() => screenOf(mom.page), { timeout: 30_000 }).toBe('island');
  expect(await mom.page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.game.getState().profile())))).toMatchObject({
    name: '小華',
    cloud: { rooms: [{ code: room.code, nickname: '小華' }], island: room.code },
  });

  // ③ 家長頁看得到小華
  await mom.page.evaluate(() => (window as any).__game.ui.getState().goto('teacher'));
  await expect(mom.page.getByTestId('kid-小華')).toBeVisible();

  // ④ 老師重新整理：小華有家長、不再有「家長連結」
  await t.page.getByTestId('teacher-reload').click();
  await expect(t.page.getByTestId('has-parent-小華')).toBeVisible();
  await expect(t.page.getByTestId('claim-小華')).toHaveCount(0);

  // ⑤ 同一張卡再打開（已經登入）：說明已經用過了
  // 這台手機已經有雲端角色：重新載入時背景的 3D 島嶼在軟體 WebGL 下很吃 CPU，面板要 8 秒以上才出現，等久一點
  await mom.page.goto(path);
  await expect(mom.page.getByTestId('claim-error')).toContainText('已經用過', { timeout: 30_000 });

  for (const d of [t, mom]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([t.context.close(), mom.context.close()]);
});
