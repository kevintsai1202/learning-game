/**
 * 線上版 P3：送禮物。
 * - 兩台裝置：送貼紙 → 收下（貼紙簿看得到、送禮人看到「收下了」）；點名牌送外觀 → 按「不用了」（金幣退回、送禮人只看到金幣退回來了）；
 *   送給沒上線的同學 → 他換一台裝置上線時收到；老師在管理頁關閉送禮 → 「🎁 送禮」消失。
 * - 手機：禮物卡片與送禮視窗在畫面內、不擋右上角按鈕（直式與橫放）。
 * 同時最多開兩台裝置（軟體 WebGL 很吃 CPU，見 onlineDevice.ts）。截圖在 e2e/screenshots/gifts/（不進版控）。
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { enterZone, screen } from './helpers';
import { SERVER, flushDeviceLogs, loginAndEnter, openDevice, pageErrors, profileOf } from './onlineDevice';
import { addProfile, createEmptySave, type Animal } from '../src/store/save';

const SHOTS = 'e2e/screenshots/gifts';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 直接呼叫伺服器 API（準備資料用） */
function apiOf(request: APIRequestContext) {
  return async (method: 'POST' | 'GET' | 'PATCH', path: string, data?: unknown, token?: string) => {
    const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
}

/** 帶著金幣加入班級用的本機角色 */
function withCoins(coins: number, animal: Animal = 'capybara') {
  return { ...addProfile(createEmptySave(), { name: '測試', avatar: { animal, color: '#8b5a2b', hat: null } }, new Date()).profiles[0], coins };
}

/** 本機存檔的金幣 */
const coinsOf = async (page: Page): Promise<number> => (await profileOf(page)).coins;

/** 從送禮視窗選禮物（已經選好同學）並送出，回到島上 */
async function pickAndSend(page: Page, tab: string, itemId: string, confirmText: string): Promise<void> {
  await page.getByTestId(`gift-tab-${tab}`).click();
  await page.getByTestId(`gift-item-${itemId}`).click();
  await expect(page.getByTestId('gift-confirm-text')).toContainText(confirmText);
  await page.getByTestId('gift-send').click();
  await expect(page.getByTestId('gift-done-text')).toContainText('送出去了！');
  await page.getByTestId('gift-done').click();
  await expect(page.getByTestId('gift-dialog')).toHaveCount(0);
}

test('送禮物：送貼紙收下、點名牌送外觀按不用了、沒上線的同學下次上線收到、老師關閉送禮', async ({ browser, baseURL, request }) => {
  test.setTimeout(600_000);
  const api = apiOf(request);
  const room = await api('POST', '/api/rooms', { name: '二年三班', password: 'teach123' });
  await api('POST', '/api/join', { code: room.code, nickname: '阿寶', pin: '1111', profile: withCoins(200) });
  await api('POST', '/api/join', { code: room.code, nickname: '小美', pin: '2222', avatar: { animal: 'panda', color: '#5b5b6b', hat: null } });
  await api('POST', '/api/join', { code: room.code, nickname: '皮皮', pin: '3333', avatar: { animal: 'penguin', color: '#5b5b6b', hat: null } });

  const a = await openDevice(browser, baseURL!);
  const b = await openDevice(browser, baseURL!);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  await loginAndEnter(b.page, room.code, '小美', '2222');
  expect(await coinsOf(a.page)).toBe(200);

  // ① 阿寶從公頻面板送小美一張鬱金香貼紙：名單有線上的小美（🟢）和沒上線的皮皮
  await a.page.getByTestId('chat-gift').click();
  await expect(a.page.getByTestId('gift-friend-小美')).toContainText('🟢');
  await expect(a.page.getByTestId('gift-friend-皮皮')).not.toContainText('🟢');
  await a.page.getByTestId('gift-friend-小美').click();
  await expect(a.page.getByTestId('gift-remaining')).toContainText('今天還可以送 5 份');
  await a.page.screenshot({ path: `${SHOTS}/01-a-pick-gift.png` });
  await pickAndSend(a.page, 'sticker', 'sticker.tulip', '鬱金香貼紙（5 金幣）送給小美');
  await expect.poll(() => coinsOf(a.page)).toBe(195);

  // 小美在島上看到卡片，收下
  await expect(b.page.getByTestId('gift-card-text')).toContainText('阿寶送你一張 🌷 鬱金香貼紙！');
  await b.page.screenshot({ path: `${SHOTS}/02-b-gift-card.png` });
  await b.page.getByTestId('gift-accept').click();
  await expect(b.page.getByTestId('gift-card-text')).toContainText('收下了！');
  await b.page.getByTestId('gift-ok').click();
  await expect(b.page.getByTestId('gift-card')).toHaveCount(0);
  expect((await profileOf(b.page)).stickers).toEqual({ 'sticker.tulip': 1 });

  // 阿寶看到「小美收下了」
  await expect(a.page.getByTestId('gift-card-text')).toContainText('小美收下了你送的 🌷 鬱金香貼紙！');
  await a.page.screenshot({ path: `${SHOTS}/03-a-accepted.png` });
  await a.page.getByTestId('gift-ok').click();
  await expect(a.page.getByTestId('gift-card')).toHaveCount(0);

  // 小美的貼紙簿：鬱金香 × 1、阿寶送的
  await enterZone(b.page, 'shop');
  await b.page.getByTestId('shop-tab-stickers').click();
  await expect(b.page.getByTestId('sticker-count-sticker.tulip')).toContainText('× 1');
  await expect(b.page.getByTestId('sticker-sticker.tulip')).toContainText('阿寶送的');
  await expect(b.page.getByTestId('gift-log')).toContainText('阿寶送你 🌷 鬱金香貼紙');
  await b.page.screenshot({ path: `${SHOTS}/04-b-sticker-book.png` });
  await b.page.getByTestId('leave-shop').click();
  await expect.poll(() => screen(b.page)).toBe('island');
  // 小美走到阿寶旁邊，阿寶畫面上看得到她的名牌
  await b.page.evaluate(() => (window as any).__game.teleport({ x: 2.5, z: 11 }));

  // ② 阿寶點小美頭上的名牌（會先選好小美）送派對帽，小美按「不用了」
  await expect(a.page.getByTestId('name-tag')).toHaveCount(1);
  await expect(a.page.getByTestId('name-tag')).toContainText('🎁');
  await a.page.getByTestId('name-tag').click();
  await expect(a.page.getByTestId('gift-dialog')).toBeVisible();
  await pickAndSend(a.page, 'hat', 'hat.party', '派對帽（20 金幣）送給小美');
  await expect.poll(() => coinsOf(a.page)).toBe(175);
  await expect(b.page.getByTestId('gift-card-text')).toContainText('阿寶送你 🎉 派對帽！');
  await b.page.getByTestId('gift-decline').click();
  await expect(b.page.getByTestId('gift-card')).toHaveCount(0);
  expect((await profileOf(b.page)).inventory).toEqual([]);
  // 阿寶只看到「金幣退回來了」，不說是誰
  const refund = a.page.getByTestId('gift-card-text');
  await expect(refund).toContainText('有一份禮物沒送出，20 金幣退回來了。');
  await expect(refund).not.toContainText('小美');
  await a.page.getByTestId('gift-ok').click();
  await expect.poll(() => coinsOf(a.page)).toBe(195);
  expect(pageErrors(b.page)).toEqual([]);

  // ③ 小美下線後，阿寶送沒上線的皮皮一張火箭貼紙；皮皮換一台裝置上線時收到
  await b.context.close();
  await a.page.getByTestId('chat-gift').click();
  await a.page.getByTestId('gift-friend-皮皮').click();
  await pickAndSend(a.page, 'sticker', 'sticker.rocket', '火箭貼紙（10 金幣）送給皮皮');
  const c = await openDevice(browser, baseURL!);
  await loginAndEnter(c.page, room.code, '皮皮', '3333');
  await expect(c.page.getByTestId('gift-card-text')).toContainText('阿寶送你一張 🚀 火箭貼紙！');
  await c.page.getByTestId('gift-accept').click();
  await c.page.getByTestId('gift-ok').click();
  expect((await profileOf(c.page)).stickers).toEqual({ 'sticker.rocket': 1 });
  expect(pageErrors(c.page)).toEqual([]);
  await c.context.close();

  // ④ 老師在管理頁關閉送禮：阿寶公頻面板上的「🎁 送禮」消失
  const t = await openDevice(browser, baseURL!);
  await t.page.getByTestId('teacher-link').click();
  await t.page.getByTestId('teacher-tab-login').click();
  await t.page.getByTestId('room-code').fill(room.code);
  await t.page.getByTestId('room-password').fill('teach123');
  await t.page.getByTestId('teacher-submit').click();
  // 開關是受控元件，伺服器回應後才會改變勾選狀態（uncheck() 點完馬上檢查會判定沒變），所以點一下再等
  await expect(t.page.getByTestId('toggle-gifts')).toBeChecked();
  await t.page.getByTestId('toggle-gifts').click();
  await expect(t.page.getByTestId('toggle-gifts')).not.toBeChecked();
  await expect(a.page.getByTestId('chat-gift')).toHaveCount(0);
  await t.page.screenshot({ path: `${SHOTS}/05-teacher-gifts-off.png` });

  for (const d of [a, t]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([a.context.close(), t.context.close()]);
});

/** 畫面上的方框 */
type Box = { x: number; y: number; width: number; height: number };
/** 兩個方框有沒有重疊 */
const overlaps = (p: Box, q: Box) => p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;

/** 某個元素完整在畫面內，而且不擋右上角的按鈕 */
async function checkPlacement(page: Page, testId: string, where: string, w: number, h: number): Promise<void> {
  const box = (await page.getByTestId(testId).boundingBox())!;
  expect.soft(box.x, `${where} ${testId} 左邊超出`).toBeGreaterThanOrEqual(0);
  expect.soft(box.y, `${where} ${testId} 上面超出`).toBeGreaterThanOrEqual(0);
  expect.soft(box.x + box.width, `${where} ${testId} 右邊超出`).toBeLessThanOrEqual(w);
  expect.soft(box.y + box.height, `${where} ${testId} 下面超出`).toBeLessThanOrEqual(h);
  for (const id of ['hud-badges', 'hud-parent']) {
    const other = await page.getByTestId(id).boundingBox();
    if (other) expect.soft(overlaps(box, other), `${where} ${testId} 擋到 ${id}`).toBe(false);
  }
}

test('手機：禮物卡片與送禮視窗在畫面內，不擋右上角按鈕（直式與橫放）', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const api = apiOf(request);
  const room = await api('POST', '/api/rooms', { name: '二年四班', password: 'teach123' });
  const mei = await api('POST', '/api/join', { code: room.code, nickname: '小美', pin: '2222', profile: withCoins(100, 'panda') });
  const bao = await api('POST', '/api/join', { code: room.code, nickname: '阿寶', pin: '1111', profile: withCoins(100) });
  // 小美（沒有開裝置）先送阿寶一張獨角獸貼紙
  await api('POST', '/api/gifts', { id: 'gift-phone-0001', to: bao.account.id, itemId: 'sticker.unicorn' }, mei.token);

  const { context, page } = await openDevice(browser, baseURL!);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAndEnter(page, room.code, '阿寶', '1111');
  await expect(page.getByTestId('gift-card-text')).toContainText('小美送你一張 🦄 獨角獸貼紙！');
  const sizes: [number, number][] = [
    [390, 844],
    [844, 390],
  ];
  // 禮物卡片
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await checkPlacement(page, 'gift-card', `${w}x${h}`, w, h);
    await expect.soft(page.getByTestId('gift-accept'), `${w}x${h}`).toBeInViewport();
    await page.screenshot({ path: `${SHOTS}/10-card-${w}x${h}.png` });
  }
  await page.getByTestId('gift-accept').click();
  await page.getByTestId('gift-ok').click();

  // 送禮視窗：選禮物與確認兩步
  await page.getByTestId('chat-gift').click();
  await page.getByTestId('gift-friend-小美').click();
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await expect.soft(page.getByTestId('gift-close'), `${w}x${h}`).toBeInViewport();
    await page.getByTestId('gift-item-sticker.whale').scrollIntoViewIfNeeded();
    await expect.soft(page.getByTestId('gift-item-sticker.whale'), `${w}x${h}`).toBeInViewport();
    await page.screenshot({ path: `${SHOTS}/11-dialog-${w}x${h}.png` });
  }
  await page.getByTestId('gift-item-sticker.whale').click();
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await page.getByTestId('gift-send').scrollIntoViewIfNeeded();
    await expect.soft(page.getByTestId('gift-send'), `${w}x${h}`).toBeInViewport();
    await page.screenshot({ path: `${SHOTS}/12-confirm-${w}x${h}.png` });
  }
  await page.getByTestId('gift-send').click();
  await expect(page.getByTestId('gift-done-text')).toContainText('送出去了！等小美收下。');
  expect(pageErrors(page)).toEqual([]);
  await context.close();
});
