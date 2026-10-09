/**
 * 去朋友的島（島嶼互訪 I2，docs/plans/islands.md 第 12 節 I2 實作設計）：
 * 小美在自己的島上按「開放島嶼」→ 阿寶的好友名單出現「✈️ 去玩」→ 到小美的島（小美的小屋與門牌、所在地「小美的島」），
 * 小美看到「阿寶來玩了！」；在朋友的島上只能進益智遊戲館；按「回自己的島」回去。
 * 截圖在 e2e/screenshots/visit/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, openDevice, pageErrors } from './onlineDevice';

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
