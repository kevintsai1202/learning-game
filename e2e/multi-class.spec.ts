/**
 * 多班級（docs/plans/multi-class.md）：一個孩子同時在學校的班級與安親班。
 * 家長掃兩個班的 QR code 讓哥哥加入（已經在別班也能加入）→ 在這台裝置玩時進剛加入的那一班的班級島 →
 * 島上的「換島」選單列出我的島與兩班 → 兩位老師看到的位置（自己班的班級島／別的班級島）→
 * 好友名單有兩班的同學 → 家長讓哥哥退出安親班，只剩學校。
 * 第二條：兩班的暱稱不同時，左上角的名字跟著所在的島；重新登入預設填現在所在的那一班，可以改選。
 * 截圖在 e2e/screenshots/multi-class/（不進版控）。
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { SERVER, TEST_PASSWORD, createClassViaApi, flushDeviceLogs, loginAndEnter, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/multi-class';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 老師看自己班的成員表：哥哥（或這一班的另一個暱稱）在哪裡（class 自己班的班級島、otherClass 別班的、own 自己的島） */
async function whereSeenBy(request: APIRequestContext, room: { code: string; token: string }, nickname = '哥哥'): Promise<string | null> {
  const res = await request.get(`${SERVER}/api/teacher/rooms/${room.code}`, { headers: { authorization: `Bearer ${room.token}` } });
  const members = ((await res.json()) as { members: { nickname: string; where: { island: string } | null }[] }).members;
  return members.find((m) => m.nickname === nickname)?.where?.island ?? null;
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
  // L3：沒有大人登入時先問「老師在旁邊／我是家長」
  await p.page.getByTestId('join-as-parent').click();
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
  await p.page.getByTestId('kid-more-哥哥').click();
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

/** 直接呼叫伺服器 API（準備資料用），回傳 JSON */
async function callApi(request: APIRequestContext, method: 'POST' | 'GET', path: string, data?: unknown, token?: string): Promise<any> {
  const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
  expect(res.ok(), `${path} ${res.status()}`).toBe(true);
  return res.json();
}

// 兩班的暱稱不同（docs/plans/multi-class.md 第 10 節原本「還沒做的」）：哥哥在學校叫「哥哥」、在安親班叫「大雄」。
// 左上角的名字跟著所在的島（班級島是那一班的暱稱、自己的島是角色名字）；要重新登入時可以選用哪一班，預設是現在所在的那一班
test('兩班的暱稱不同：左上角的名字跟著島換，重新登入可以選用哪一班', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const school = await createClassViaApi(request, '二年三班');
  const after = await createClassViaApi(request, '安親班');
  // 家長帳號與雲端角色「哥哥」，用 API 加入兩班（安親班的暱稱是「大雄」），兩位老師各自設定這一班的密碼
  const momName = uniqueUsername();
  const mom = await callApi(request, 'POST', '/api/users', { username: momName, password: TEST_PASSWORD, email: `${momName}@example.com`, parent: true, teacher: false });
  const tmp = await (await browser.newContext({ baseURL })).newPage();
  await tmp.goto('./');
  const profile = await tmp.evaluate(() => {
    (window as any).__game.game.getState().createProfile('哥哥', { animal: 'bear', color: '#ffffff', hat: null });
    return JSON.parse(JSON.stringify((window as any).__game.game.getState().profile()));
  });
  await tmp.context().close();
  const id = ((await callApi(request, 'POST', '/api/parent/kids', { profile }, mom.token)) as { account: { id: string } }).account.id;
  await callApi(request, 'POST', `/api/parent/kids/${id}/class`, { code: school.code, nickname: '哥哥' }, mom.token);
  await callApi(request, 'POST', `/api/parent/kids/${id}/class`, { code: after.code, nickname: '大雄' }, mom.token);
  await callApi(request, 'POST', `/api/teacher/rooms/${school.code}/members/${id}/pin`, { pin: '1111' }, school.token);
  await callApi(request, 'POST', `/api/teacher/rooms/${after.code}/members/${id}/pin`, { pin: '2222' }, after.token);

  const d = await openDevice(browser, baseURL!);
  await loginAndEnter(d.page, school.code, '哥哥', '1111');
  /** 左上角角色鈕上的名字 */
  const name = d.page.locator('[data-testid="hud-profile"] .hud-name');
  /** 用換島選單去某座島（我的島是 mine） */
  const goIsland = async (target: string) => {
    await d.page.getByTestId('hud-island').click();
    await d.page.getByTestId(`island-go-${target}`).click();
  };
  // 學校的班級島：哥哥
  await expect(d.page.getByTestId('hud-location')).toContainText('二年三班');
  await expect(name).toContainText('哥哥');
  // 安親班的班級島：大雄（同學看到的名字）
  await goIsland(after.code);
  await expect(d.page.getByTestId('hud-location')).toContainText('安親班');
  await expect(name).toContainText('大雄');
  await d.page.screenshot({ path: `${SHOTS}/names-01-after-class.png` });
  // 自己的島：角色名字
  await goIsland('mine');
  await expect(d.page.getByTestId('hud-location')).toHaveAttribute('data-island', 'mine');
  await expect(name).toContainText('哥哥');
  await goIsland(after.code);
  await expect(name).toContainText('大雄');

  // 這台裝置的登入失效（權杖不見了）：班級登入畫面預設填現在所在的安親班
  await d.page.evaluate((accountId) => {
    const all = JSON.parse(localStorage.getItem('learning-island-cloud') ?? '{}');
    delete all[accountId];
    localStorage.setItem('learning-island-cloud', JSON.stringify(all));
  }, id);
  await d.page.evaluate(() => (window as any).__game.ui.getState().goto('class'));
  await expect(d.page.getByTestId('class-code')).toHaveValue(after.code);
  await expect(d.page.getByTestId('class-nickname')).toHaveValue('大雄');
  // 選學校：換成學校的代碼與暱稱；再選回安親班
  await d.page.getByTestId(`class-pick-${school.code}`).click();
  await expect(d.page.getByTestId('class-code')).toHaveValue(school.code);
  await expect(d.page.getByTestId('class-nickname')).toHaveValue('哥哥');
  await d.page.screenshot({ path: `${SHOTS}/names-02-relogin-pick.png` });
  await d.page.getByTestId(`class-pick-${after.code}`).click();
  await expect(d.page.getByTestId('class-code')).toHaveValue(after.code);
  await expect(d.page.getByTestId('class-nickname')).toHaveValue('大雄');
  // 用安親班的密碼登入：登入後在安親班的班級島（不是第一個班級），安親班的老師也看到他在班級島
  await d.page.getByTestId('class-pin').fill('2222');
  await d.page.getByTestId('class-submit').click();
  await expect.poll(() => screenOf(d.page)).toBe('island');
  await expect.poll(() => d.page.evaluate(() => (window as any).__game.realtime.getState().status), { timeout: 20_000 }).toBe('online');
  await expect(d.page.getByTestId('hud-location')).toContainText('安親班');
  await expect(name).toContainText('大雄');
  await expect.poll(() => whereSeenBy(request, after, '大雄')).toBe('class');
  await expect.poll(() => whereSeenBy(request, school)).toBe('otherClass');

  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});
