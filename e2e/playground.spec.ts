/**
 * 班級島遊樂場（docs/plans/playground.md）：老師設定 4 個位置的器材、兩個孩子在班級島上一起玩。
 * - 老師用 API 改遊樂場：在島上的孩子馬上換（room 訊息）。
 * - 孩子走到器材旁邊「上去玩」：自己坐上去（座位代碼 rideN），另一個孩子看到他坐在那一座的那個座位。
 * - 兩個人坐翹翹板的同一座：兩邊都有人才上下（看兩台裝置算的座位有沒有人）。
 * - 第一人稱：鏡頭在角色的頭。
 * - 老師把正在玩的器材換掉：玩的人自己起來。
 * - 八種器材的截圖（4 種一張，兩張）。截圖在 e2e/screenshots/playground/（不進版控）。
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors } from './onlineDevice';
import { PLAYGROUND_SPOTS, SPOT_RADIUS } from '../src/store/playground';

const OUT = 'e2e/screenshots/playground';
mkdirSync(OUT, { recursive: true });

const contexts: BrowserContext[] = [];
test.afterEach(async ({}, testInfo) => {
  flushDeviceLogs(testInfo);
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

/** 老師改遊樂場 */
async function setPlayground(request: Parameters<typeof createClassViaApi>[0], room: { code: string; token: string }, pg: (string | null)[]): Promise<void> {
  const res = await request.patch(`${SERVER}/api/teacher/rooms/${room.code}`, { data: { playground: pg }, headers: { authorization: `Bearer ${room.token}` } });
  expect(res.ok()).toBe(true);
}
/** 這台裝置上的遊樂場 */
const pgOf = (page: Page) => page.evaluate(() => (window as any).__game.rides.store.getState().playground as (string | null)[]);
/** 自己正在玩的（沒有是 null） */
const rideOf = (page: Page) =>
  page.evaluate(() => {
    const a = (window as any).__game.player.act;
    return a && a.kind === 'ride' ? { ride: a.ride, slot: a.slot, seat: a.seat } : null;
  });
/** 某一座在這台裝置上每個座位有沒有人 */
const occupiedOf = (page: Page, slot: number) => page.evaluate((s) => (window as any).__game.rides.occupied(s) as boolean[], slot);
/** 站到第 slot 座器材的南邊外面 */
async function standBy(page: Page, slot: number): Promise<void> {
  const s = PLAYGROUND_SPOTS[slot];
  await page.evaluate((p) => (window as any).__game.teleport(p), { x: s.x, z: s.z + SPOT_RADIUS + 0.9 });
}

test('老師設定遊樂場、兩個孩子一起坐旋轉木馬與翹翹板、第一人稱、器材被換掉時起來', async ({ browser, baseURL, request }) => {
  test.setTimeout(400_000);
  const room = await createClassViaApi(request, '二年六班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'capybara'],
    ['小美', '2222', 'panda'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  await setPlayground(request, room, ['carousel', 'seesaw', null, null]);
  const a = await openDevice(browser, baseURL!);
  contexts.push(a.context);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  const b = await openDevice(browser, baseURL!);
  contexts.push(b.context);
  await loginAndEnter(b.page, room.code, '小美', '2222');
  for (const p of [a.page, b.page]) await expect.poll(() => pgOf(p)).toEqual(['carousel', 'seesaw', null, null]);

  // 老師在孩子在島上時換：馬上看到
  await setPlayground(request, room, ['carousel', 'seesaw', 'trampoline', 'ferris']);
  for (const p of [a.page, b.page]) await expect.poll(() => pgOf(p)).toEqual(['carousel', 'seesaw', 'trampoline', 'ferris']);

  // 阿寶坐旋轉木馬（電腦版的卡片）
  await standBy(a.page, 0);
  await expect(a.page.getByTestId('ride-card')).toContainText('旋轉木馬');
  await a.page.getByTestId('ride-start').click();
  await expect.poll(() => rideOf(a.page)).toMatchObject({ ride: 'carousel', slot: 0 });
  const seatA = (await rideOf(a.page))!.seat;
  // 小美那邊：阿寶坐在旋轉木馬的那個座位上
  await expect.poll(() => occupiedOf(b.page, 0).then((o) => o[seatA])).toBe(true);
  // 小美也坐旋轉木馬：選到別的座位；阿寶那邊看到兩個座位有人
  await standBy(b.page, 0);
  await b.page.getByTestId('ride-start').click();
  await expect.poll(() => rideOf(b.page)).toMatchObject({ ride: 'carousel', slot: 0 });
  const seatB = (await rideOf(b.page))!.seat;
  expect(seatB).not.toBe(seatA);
  await expect.poll(() => occupiedOf(a.page, 0).then((o) => o.filter(Boolean).length)).toBe(2);
  await a.page.waitForTimeout(1200);
  await a.page.screenshot({ path: `${OUT}/01-carousel-two.png` });

  // 第一人稱：鏡頭在阿寶的頭
  await a.page.getByTestId('cam-view').click();
  await a.page.getByTestId('cam-view').click();
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.orbit.get().view)).toBe('first');
  await expect
    .poll(() =>
      a.page.evaluate(() => {
        const g = (window as any).__game;
        const c = g.camera.position;
        return Math.hypot(c.x - g.player.pos.x, c.z - g.player.pos.z);
      }),
    )
    .toBeLessThan(0.7);
  await a.page.waitForTimeout(500);
  await a.page.screenshot({ path: `${OUT}/02-carousel-first.png` });
  await a.page.evaluate(() => (window as any).__game.orbit.setView('follow'));

  // 兩個人都去翹翹板：同一座的兩邊（座位 0、1）都有人才上下
  await a.page.getByTestId('use-stop').click();
  await b.page.getByTestId('use-stop').click();
  await expect.poll(() => rideOf(a.page)).toBeNull();
  await expect.poll(() => rideOf(b.page)).toBeNull();
  // 站在第一座的左右兩端旁邊，最近的空位就是那一端
  const s1 = PLAYGROUND_SPOTS[1];
  await a.page.evaluate((p) => (window as any).__game.teleport(p), { x: s1.x - 2.6, z: s1.z - 0.7 });
  await a.page.getByTestId('ride-start').click();
  await expect.poll(() => rideOf(a.page)).toMatchObject({ ride: 'seesaw', slot: 1, seat: 0 });
  await b.page.evaluate((p) => (window as any).__game.teleport(p), { x: s1.x + 2.6, z: s1.z - 0.7 });
  await b.page.getByTestId('ride-start').click();
  await expect.poll(() => rideOf(b.page)).toMatchObject({ ride: 'seesaw', slot: 1, seat: 1 });
  for (const p of [a.page, b.page]) await expect.poll(() => occupiedOf(p, 1).then((o) => [o[0], o[1]])).toEqual([true, true]);
  await a.page.waitForTimeout(1200);
  await a.page.screenshot({ path: `${OUT}/03-seesaw-two.png` });

  // 老師把翹翹板換掉：兩個人都自己起來
  await setPlayground(request, room, ['carousel', 'swingset', 'trampoline', 'ferris']);
  for (const p of [a.page, b.page]) await expect.poll(() => rideOf(p)).toBeNull();

  // 八種器材的樣子：一張 4 種
  await setPlayground(request, room, ['carousel', 'seesaw', 'swingset', 'trampoline']);
  await expect.poll(() => pgOf(a.page)).toEqual(['carousel', 'seesaw', 'swingset', 'trampoline']);
  await a.page.evaluate(() => (window as any).__game.teleport({ x: 0, z: 9 }));
  await a.page.evaluate(() => (window as any).__game.orbit.setYaw(0));
  await a.page.mouse.move(640, 400);
  for (let i = 0; i < 4; i++) await a.page.mouse.wheel(0, 120);
  await a.page.waitForTimeout(1500);
  await a.page.screenshot({ path: `${OUT}/04-four-a.png` });
  await setPlayground(request, room, ['slidecastle', 'ferris', 'teacups', 'train']);
  await expect.poll(() => pgOf(a.page)).toEqual(['slidecastle', 'ferris', 'teacups', 'train']);
  await a.page.waitForTimeout(1500);
  await a.page.screenshot({ path: `${OUT}/05-four-b.png` });
  expect(pageErrors(a.page)).toEqual([]);
  expect(pageErrors(b.page)).toEqual([]);
});

test('老師在班級管理頁選器材、熊熊老師進島用面板換器材；手機上的孩子大動作鍵「上去玩」', async ({ browser, baseURL, request }) => {
  test.setTimeout(400_000);
  const room = await createClassViaApi(request, '二年七班');
  const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '小安', pin: '3333', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } } });
  expect(res.ok()).toBe(true);
  // 孩子用手機（觸控、直式）
  const kid = await openDevice(browser, baseURL!, { touch: true });
  contexts.push(kid.context);
  await loginAndEnter(kid.page, room.code, '小安', '3333');
  await kid.page.setViewportSize({ width: 390, height: 844 });
  // 老師在班級管理頁選：第一個位置旋轉木馬
  const t = await openDevice(browser, baseURL!);
  contexts.push(t.context);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await expect(t.page.getByTestId('playground-picker')).toBeVisible();
  await expect(t.page.getByTestId('pg-0-empty')).toHaveAttribute('aria-pressed', 'true');
  await t.page.getByTestId('pg-0-carousel').click();
  await expect(t.page.getByTestId('pg-0-carousel')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => pgOf(kid.page)).toEqual(['carousel', null, null, null]);
  // 手機上：走到旋轉木馬旁邊，右下大動作鍵是「🎠 騎木馬」，按了坐上去
  await standBy(kid.page, 0);
  await expect(kid.page.getByTestId('ride-start')).toContainText('騎木馬');
  await kid.page.getByTestId('ride-start').click();
  await expect.poll(() => rideOf(kid.page)).toMatchObject({ ride: 'carousel', slot: 0 });
  await expect(kid.page.getByTestId('use-stop')).toBeVisible();
  await expect(kid.page.getByTestId('cam-view')).toBeVisible();
  await kid.page.screenshot({ path: `${OUT}/06-phone-riding.png` });
  // 熊熊老師進島，用上方的「🎡 遊樂場」把第二個位置換成摩天輪
  await t.page.getByTestId('gm-enter').click();
  await expect.poll(() => t.page.evaluate(() => (window as any).__game.gm.getState().status)).toBe('online');
  await expect.poll(() => pgOf(t.page)).toEqual(['carousel', null, null, null]);
  await t.page.getByTestId('gm-playground-toggle').click();
  await t.page.getByTestId('pg-1-ferris').click();
  await expect.poll(() => pgOf(kid.page)).toEqual(['carousel', 'ferris', null, null]);
  await expect.poll(() => pgOf(t.page)).toEqual(['carousel', 'ferris', null, null]);
  await t.page.screenshot({ path: `${OUT}/07-gm-panel.png` });
  await t.page.getByTestId('gm-playground-close').click();
  // 熊熊老師也能玩：坐摩天輪
  await standBy(t.page, 1);
  await t.page.getByTestId('ride-start').click();
  await expect.poll(() => rideOf(t.page)).toMatchObject({ ride: 'ferris', slot: 1 });
  await expect.poll(() => kid.page.evaluate(() => (window as any).__game.rides.occupied(1).filter(Boolean).length)).toBe(1);
  expect(pageErrors(kid.page)).toEqual([]);
  expect(pageErrors(t.page)).toEqual([]);
});
