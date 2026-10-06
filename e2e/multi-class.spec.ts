/**
 * 多班級（docs/plans/multi-class.md）：一個孩子同時在學校的班級與安親班。
 * 家長掃兩個班的 QR code 讓哥哥加入（已經在別班也能加入）→ 在這台裝置玩時進剛加入的那一班的班級島 →
 * 島上的「換島」選單列出我的島與兩班 → 兩位老師看到的位置（自己班的班級島／別的班級島）→
 * 好友名單有兩班的同學 → 家長讓哥哥退出安親班，只剩學校。
 * 截圖在 e2e/screenshots/multi-class/（不進版控）。
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { SERVER, TEST_PASSWORD, createClassViaApi, flushDeviceLogs, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/multi-class';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 老師看自己班的成員表：哥哥在哪裡（class 自己班的班級島、otherClass 別班的、own 自己的島） */
async function whereSeenBy(request: APIRequestContext, room: { code: string; token: string }): Promise<string | null> {
  const res = await request.get(`${SERVER}/api/teacher/rooms/${room.code}`, { headers: { authorization: `Bearer ${room.token}` } });
  const members = ((await res.json()) as { members: { nickname: string; where: { island: string } | null }[] }).members;
  return members.find((m) => m.nickname === '哥哥')?.where?.island ?? null;
}

/** 目前的畫面 */
const screenOf = (page: Page) => page.evaluate(() => (window as any).__game.ui.getState().screen as string);

test('哥哥在學校與安親班：家長掃兩個 QR code 加入、換島選單、老師看到的位置、兩班的同學都是朋友、退出其中一班', async ({ browser, baseURL, request }) => {
  test.setTimeout(420_000);
  /** 直接呼叫伺服器 API（準備資料用） */
  const api = async (method: 'POST' | 'GET', path: string, data?: unknown, token?: string) => {
    const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  const school = await createClassViaApi(request, '二年三班');
  const after = await createClassViaApi(request, '安親班');
  // 兩班各有一位同學（孩子用班級代碼自己加入的）
  await api('POST', '/api/join', { code: school.code, nickname: '小美', pin: '1111', avatar: { animal: 'cat', color: '#ffffff', hat: null } });
  await api('POST', '/api/join', { code: after.code, nickname: '阿寶', pin: '2222', avatar: { animal: 'dog', color: '#ffffff', hat: null } });
  // 家長帳號與一個雲端角色「哥哥」（用裝置的存檔格式產生再上傳）
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

  // ① 掃學校的 QR code：登入家長帳號 → 只有哥哥一個孩子，自動加入並在這台裝置進學校的班級島（L2，不用按按鈕）
  const p = await openDevice(browser, baseURL!);
  await p.page.goto(`./?join=${school.code}`);
  await p.page.getByTestId('account-username').fill(momName);
  await p.page.getByTestId('account-password').fill(TEST_PASSWORD);
  await p.page.getByTestId('account-submit').click();
  await expect.poll(() => screenOf(p.page), { timeout: 30_000 }).toBe('island');
  await expect.poll(() => whereSeenBy(request, school)).toBe('class');
  // 只有一個班級：和以前一樣一顆按鈕
  await expect(p.page.getByTestId('hud-island')).toHaveText('🏝️ 去我的島');

  // ② 再掃安親班的 QR code（已經登入）：在別班的哥哥也能加入，一樣自動 → 安親班的班級島
  await p.page.goto(`./?join=${after.code}`);
  await expect.poll(() => screenOf(p.page), { timeout: 30_000 }).toBe('island');
  await expect.poll(() => whereSeenBy(request, after)).toBe('class');
  await expect.poll(() => whereSeenBy(request, school)).toBe('otherClass');
  // 本機記得兩個班級（學校是第一個）、現在在安親班
  expect(await p.page.evaluate(() => (window as any).__game.game.getState().profile().cloud)).toMatchObject({
    rooms: [{ code: school.code, name: '二年三班' }, { code: after.code, name: '安親班' }],
    island: after.code,
  });

  // ③ 好友名單：兩班的同學都在
  await expect
    .poll(async () =>
      p.page.evaluate(() => Object.values((window as any).__game.friends.getState().friends as Record<string, { nickname: string }>).map((f) => f.nickname).sort()),
    )
    .toEqual(['小美', '阿寶']);

  // ④ 換島選單：我的島、二年三班、安親班（勾在安親班）→ 換到學校 → 換到我的島
  await expect(p.page.getByTestId('hud-island')).toHaveText('🏝️ 換島');
  await p.page.getByTestId('hud-island').click();
  await expect(p.page.getByTestId('island-menu')).toBeVisible();
  await expect(p.page.getByTestId(`island-go-${after.code}`)).toContainText('✓');
  await p.page.screenshot({ path: `${SHOTS}/02-island-menu.png` });
  await p.page.getByTestId(`island-go-${school.code}`).click();
  await expect(p.page.getByTestId('island-menu')).toHaveCount(0);
  await expect.poll(() => whereSeenBy(request, school)).toBe('class');
  await expect.poll(() => whereSeenBy(request, after)).toBe('otherClass');
  await p.page.getByTestId('hud-island').click();
  await p.page.getByTestId('island-go-mine').click();
  await expect.poll(() => whereSeenBy(request, school)).toBe('own');
  // 手機寬度：選單在畫面裡、沒有橫向捲動
  await p.page.setViewportSize({ width: 390, height: 844 });
  await p.page.getByTestId('hud-island').click();
  const menu = (await p.page.getByTestId('island-menu').boundingBox())!;
  expect(menu.x >= 0 && menu.x + menu.width <= 390, `換島選單超出畫面：${JSON.stringify(menu)}`).toBe(true);
  expect(await p.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await p.page.screenshot({ path: `${SHOTS}/03-island-menu-phone.png` });
  await p.page.getByTestId(`island-go-${school.code}`).click();
  await p.page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(() => whereSeenBy(request, school)).toBe('class');

  // ⑤ 家長讓哥哥退出安親班：只剩學校；回到島上只有一個班級的按鈕
  await p.page.evaluate(() => (window as any).__game.ui.getState().goto('teacher'));
  await p.page.getByTestId(`kid-leave-哥哥-${after.code}`).click();
  await expect(p.page.getByTestId('parent-note')).toContainText('已經退出「安親班」');
  await expect(p.page.getByTestId('kid-哥哥')).not.toContainText('安親班');
  await p.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await expect
    .poll(() => p.page.evaluate(() => ((window as any).__game.game.getState().profile().cloud.rooms as { code: string }[]).map((r) => r.code)))
    .toEqual([school.code]);
  await expect(p.page.getByTestId('hud-island')).toHaveText('🏝️ 去我的島');
  await expect.poll(() => whereSeenBy(request, after)).toBeNull();

  expect(pageErrors(p.page)).toEqual([]);
  await p.context.close();
});
