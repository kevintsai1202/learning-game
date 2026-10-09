/**
 * 去朋友的島（島嶼互訪 I2，docs/plans/islands.md 第 12 節 I2 實作設計）：
 * 小美在自己的島上按「開放島嶼」→ 阿寶的好友名單出現「✈️ 去玩」→ 到小美的島（小美的小屋與門牌、所在地「小美的島」），
 * 小美看到「阿寶來玩了！」；在朋友的島上只能進益智遊戲館；按「回自己的島」回去。
 * 另外：島主的訪客名單與請回家、島主離開時送回；在朋友的島上聊天、只能送禮給同班同學。
 * 截圖在 e2e/screenshots/visit/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { SERVER, TEST_PASSWORD, createClassViaApi, flushDeviceLogs, loginAndEnter, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/visit';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 即時連線的狀態：在哪一種島、拜訪中的島主 */
const realtimeOf = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__game.realtime.getState();
    return { status: s.status as string, island: s.island as string | null, visiting: (s.visiting?.name ?? null) as string | null };
  });
/** 同島狀態裡的成員暱稱（不含自己） */
const othersOn = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__game.presence.getState();
    return Object.values(s.members)
      .filter((m: any) => m.id !== s.selfId)
      .map((m: any) => m.nickname as string);
  });
/** 目前的畫面 */
const screenOf = (page: Page) => page.evaluate(() => (window as any).__game.ui.getState().screen as string);

test('去朋友的島：開放島嶼、從好友名單去玩、看到島主的小屋門牌、只能進益智遊戲館、回自己的島', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年三班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'capybara'],
    ['小美', '2222', 'panda'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  const a = await openDevice(browser, baseURL!);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  const b = await openDevice(browser, baseURL!);
  await loginAndEnter(b.page, room.code, '小美', '2222');

  // 小美回自己的島、開放
  await b.page.getByTestId('hud-island').click();
  await expect.poll(async () => (await realtimeOf(b.page)).island).toBe('own');
  await b.page.getByTestId('island-open').click();
  await expect(b.page.getByTestId('island-open')).toContainText('關閉島嶼');

  // 阿寶的好友名單：小美「在自己的島（開放中）」，按「去玩」
  await a.page.getByTestId('hud-friends').click();
  await expect(a.page.locator('[data-friend="小美"] [data-testid="friend-status"]')).toContainText('開放中');
  await a.page.screenshot({ path: `${SHOTS}/01-friends-visit.png` });
  await a.page.getByTestId('friend-visit-小美').click();
  await expect.poll(async () => (await realtimeOf(a.page)).visiting).toBe('小美');
  await expect(a.page.getByTestId('hud-location')).toContainText('小美的島');
  await expect(a.page.getByTestId('island-plate')).toContainText('小美的島');
  await expect(a.page.getByTestId('island-home')).toContainText('小美的家');
  await expect.poll(() => othersOn(a.page)).toContain('小美');
  // 小美：阿寶來了（熊熊老師的泡泡）、島上看得到阿寶
  await expect.poll(() => othersOn(b.page)).toContain('阿寶');
  await expect(b.page.getByRole('status').filter({ hasText: '阿寶來玩了' })).toBeVisible();
  await a.page.screenshot({ path: `${SHOTS}/02-on-friend-island.png` });

  // 在朋友的島上只能進益智遊戲館
  await a.page.evaluate(() => (window as any).__game.ui.getState().enterZone('math'));
  expect(await screenOf(a.page)).toBe('island');
  await expect(a.page.getByRole('status').filter({ hasText: '只能玩益智遊戲館' })).toBeVisible();
  await a.page.evaluate(() => (window as any).__game.ui.getState().enterZone('puzzle'));
  await expect.poll(() => screenOf(a.page)).toBe('puzzle');
  await a.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));

  // 回自己的島
  await a.page.getByTestId('hud-visit-home').click();
  await expect.poll(async () => (await realtimeOf(a.page)).visiting).toBeNull();
  await expect.poll(async () => (await realtimeOf(a.page)).island).toBe('own');
  await expect(a.page.getByTestId('island-plate')).toContainText('阿寶的島');
  await expect.poll(() => othersOn(b.page)).not.toContain('阿寶');

  for (const d of [a, b]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([a.context.close(), b.context.close()]);
});

test('島主的管理：訪客名單請他回家；島主回班級島時訪客被送回；關閉島嶼後好友名單沒有「去玩」', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年三班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'capybara'],
    ['小美', '2222', 'panda'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  const a = await openDevice(browser, baseURL!);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  const b = await openDevice(browser, baseURL!);
  await loginAndEnter(b.page, room.code, '小美', '2222');
  await b.page.getByTestId('hud-island').click();
  await expect.poll(async () => (await realtimeOf(b.page)).island).toBe('own');
  await b.page.getByTestId('island-open').click();
  /** 阿寶從好友名單去小美的島 */
  const visit = async () => {
    await a.page.getByTestId('hud-friends').click();
    await a.page.getByTestId('friend-visit-小美').click();
    await expect.poll(async () => (await realtimeOf(a.page)).visiting).toBe('小美');
  };

  // ① 小美的訪客名單：請阿寶回家 → 阿寶看到說明、回到自己的島
  await visit();
  await expect(b.page.getByTestId('hud-visitors')).toContainText('1');
  await b.page.getByTestId('hud-visitors').click();
  await b.page.screenshot({ path: `${SHOTS}/03-visitors-panel.png` });
  await b.page.getByTestId('visitor-kick-阿寶').click();
  await expect(a.page.getByRole('status').filter({ hasText: '小美請你先回家' })).toBeVisible();
  await expect.poll(async () => (await realtimeOf(a.page)).visiting).toBeNull();
  await expect(b.page.getByTestId('hud-visitors')).toHaveCount(0);

  // ② 再去一次；小美回班級島 → 阿寶被送回自己的島
  await expect.poll(async () => (await realtimeOf(b.page)).island).toBe('own');
  await b.page.getByTestId('island-open').click();
  await b.page.getByTestId('island-open').click();
  await expect(b.page.getByTestId('island-open')).toContainText('關閉島嶼');
  await visit();
  await b.page.getByTestId('hud-island').click();
  await expect(a.page.getByRole('status').filter({ hasText: '小美的島關閉了' })).toBeVisible();
  await expect.poll(async () => (await realtimeOf(a.page)).visiting).toBeNull();

  // ③ 小美回自己的島、開放後又關閉：阿寶的好友名單沒有「去玩」
  await b.page.getByTestId('hud-island').click();
  await expect.poll(async () => (await realtimeOf(b.page)).island).toBe('own');
  await b.page.getByTestId('island-open').click();
  await a.page.getByTestId('hud-friends').click();
  await expect(a.page.getByTestId('friend-visit-小美')).toBeVisible();
  await b.page.getByTestId('island-open').click();
  await expect(a.page.getByTestId('friend-visit-小美')).toHaveCount(0);

  for (const d of [a, b]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([a.context.close(), b.context.close()]);
});

test('在朋友的島上：聊天；只能送禮給同班同學（兄弟姊妹、不是朋友的人名牌不能點）', async ({ browser, baseURL, request }) => {
  test.setTimeout(420_000);
  /** 直接呼叫伺服器 API（準備資料用） */
  const api = async (method: 'POST' | 'GET', path: string, data?: unknown, token?: string) => {
    const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  const room = await createClassViaApi(request, '二年一班');
  await api('POST', '/api/join', { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } });
  // 家長名下兩個孩子：哥哥和阿寶同一班，妹妹沒有班級
  const momName = uniqueUsername();
  const mom = await api('POST', '/api/users', { username: momName, password: TEST_PASSWORD, email: `${momName}@example.com`, parent: true, teacher: false });
  const upload = async (name: string, animal: string) => {
    const page = await (await browser.newContext({ baseURL })).newPage();
    await page.goto('./');
    const profile = await page.evaluate(
      ({ name, animal }) => {
        (window as any).__game.game.getState().createProfile(name, { animal, color: '#ffffff', hat: null });
        return JSON.parse(JSON.stringify((window as any).__game.game.getState().profile()));
      },
      { name, animal },
    );
    await page.context().close();
    return api('POST', '/api/parent/kids', { profile }, mom.token);
  };
  const big = await upload('哥哥', 'bear');
  const small = await upload('妹妹', 'rabbit');
  await api('POST', '/api/join', { code: room.code, nickname: '哥哥', pin: '2222' }, big.token);

  const a = await openDevice(browser, baseURL!);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  /** 家長「在這台裝置玩」 */
  const openKid = async (kidId: string) => {
    const d = await openDevice(browser, baseURL!);
    await d.page.evaluate(({ kidId, server, token }) => (window as any).__game.cloud.getState().playOnThisDevice(kidId, server, token), { kidId, server: SERVER, token: mom.token });
    await d.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
    await expect.poll(() => d.page.evaluate(() => (window as any).__game.realtime.getState().status)).toBe('online');
    return d;
  };
  const b = await openKid(big.account.id);
  const c = await openKid(small.account.id);

  // 哥哥回自己的島、開放；阿寶（同學）和妹妹（兄弟姊妹）都去
  await b.page.getByTestId('hud-island').click();
  await expect.poll(async () => (await realtimeOf(b.page)).island).toBe('own');
  await b.page.getByTestId('island-open').click();
  for (const d of [a, c]) {
    await d.page.getByTestId('hud-friends').click();
    await d.page.getByTestId('friend-visit-哥哥').click();
    await expect.poll(async () => (await realtimeOf(d.page)).visiting).toBe('哥哥');
  }
  await expect.poll(async () => (await othersOn(b.page)).sort()).toEqual(['妹妹', '阿寶'].sort());

  // 聊天：阿寶說一句，哥哥和妹妹都看到
  await a.page.getByTestId('chat-say').click();
  await a.page.getByTestId('phrase-hi').click();
  for (const d of [b, c]) await expect(d.page.getByTestId('chat-panel')).toContainText('你好！');

  /** 島上某人的名牌能不能點（送禮） */
  const giftableTag = (page: Page, nickname: string) => page.locator('[data-testid="name-tag"].giftable', { hasText: nickname });
  // 哥哥：阿寶（同學）可以，妹妹（兄弟姊妹，不同班）不行
  await expect(giftableTag(b.page, '阿寶')).toHaveCount(1);
  await expect(giftableTag(b.page, '妹妹')).toHaveCount(0);
  // 阿寶：哥哥可以，妹妹（不是朋友）不行
  await expect(giftableTag(a.page, '哥哥')).toHaveCount(1);
  await expect(giftableTag(a.page, '妹妹')).toHaveCount(0);
  // 妹妹沒有班級：沒有送禮按鈕，名牌都不能點
  await expect(c.page.getByTestId('chat-gift')).toHaveCount(0);
  await expect(c.page.locator('[data-testid="name-tag"].giftable')).toHaveCount(0);
  // 哥哥的送禮視窗只列島上的同學（阿寶）
  await b.page.getByTestId('chat-gift').click();
  await expect(b.page.getByTestId('gift-friend-阿寶')).toBeVisible();
  await expect(b.page.getByTestId('gift-friend-妹妹')).toHaveCount(0);
  await b.page.screenshot({ path: `${SHOTS}/04-gift-on-friend-island.png` });

  for (const d of [a, b, c]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([a.context.close(), b.context.close(), c.context.close()]);
});
