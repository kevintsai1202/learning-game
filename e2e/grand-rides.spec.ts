/**
 * 班級島大型設施（docs/plans/grand-rides.md）：雲霄飛車、巨大摩天輪、環島飛船、海裡的動物。
 * - 班級島上畫出三樣設施（截圖：全島、摩天輪月台前鏡頭拉遠、車站、繫留塔）。
 * - 上雲霄飛車：停站時在月台上按，扣 5 金幣（同步到伺服器後還是扣過的）、等出發時寫倒數；
 *   另一台裝置看到他坐在列車上；迴圈頂端角色頭下腳上、第一人稱的鏡頭跟著翻過去；跑完自己下車站到月台。
 * - 摩天輪：坐進車廂，轉到上面很高（第一人稱看整座島），轉一圈下車。
 * - 飛船：上船站在甲板上、甲板上走動（另一台裝置收到甲板上的局部座標）、飛到高處繞島、降落後下船。
 * - 金幣不夠時不能上。
 * 等班次用 window.__game.grand.warp 把牆上的時間往前撥（兩台裝置撥一樣多），不真的等 1～2 分鐘。
 * 截圖在 e2e/screenshots/grand/（不進版控）。
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors } from './onlineDevice';
import { COASTER_BOARD, MAST, SHIP, SHIP_CYCLE, STATION, WHEEL, coaster } from '../src/store/grandRides';
import { rotateByQuat } from '../src/store/coasterTrack';

const OUT = 'e2e/screenshots/grand';
mkdirSync(OUT, { recursive: true });

const contexts: BrowserContext[] = [];
test.afterEach(async ({}, testInfo) => {
  flushDeviceLogs(testInfo);
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

/** 自己正在玩的大型設施（沒有是 null） */
const grandOf = (page: Page) =>
  page.evaluate(() => {
    const a = (window as any).__game.player.act;
    return a && a.kind === 'grand' ? { ride: a.ride as string, seat: a.seat as number, run: a.run as number, deck: a.deck as { x: number; z: number; h: number } | null } : null;
  });
const coinsOf = (page: Page) => page.evaluate(() => (window as any).__game.game.getState().profile().coins as number);
const teleport = (page: Page, p: { x: number; z: number }) => page.evaluate((q) => (window as any).__game.teleport(q), p);
/** 把兩台裝置的牆上時間往前撥一樣多 */
const warp = (pages: Page[], sec: number) => Promise.all(pages.map((p) => p.evaluate((s) => (window as any).__game.grand.warp(s), sec)));
/** 這台裝置的牆上時間（秒） */
const wallOf = (page: Page) => page.evaluate(() => (window as any).__game.grand.wall() as number);
/** 自己的角色離地多高與方向 */
const worldOf = (page: Page) => page.evaluate(() => (window as any).__game.scene.playerWorld() as { y: number; quat: [number, number, number, number] | null });
/** 畫面的 draw call 數 */
const drawCalls = (page: Page) => page.evaluate(() => (window as any).__game.gl.info.render.calls as number);

test('大型設施：截圖、雲霄飛車（扣金幣、翻轉、第一人稱、另一台看到）、摩天輪、飛船甲板上走動', async ({ browser, baseURL, request }) => {
  test.setTimeout(420_000);
  const room = await createClassViaApi(request, '二年七班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'capybara'],
    ['小美', '2222', 'panda'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  // 老師發 50 枚金幣給全班（玩一次 5 枚）
  const reward = await request.post(`${SERVER}/api/teacher/rooms/${room.code}/rewards`, { data: { to: 'all', coins: 50 }, headers: { authorization: `Bearer ${room.token}` } });
  expect(reward.ok()).toBe(true);
  const a = await openDevice(browser, baseURL!);
  contexts.push(a.context);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  const b = await openDevice(browser, baseURL!);
  contexts.push(b.context);
  await loginAndEnter(b.page, room.code, '小美', '2222');
  for (const p of [a.page, b.page]) {
    await expect.poll(() => coinsOf(p)).toBeGreaterThanOrEqual(50);
    const ok = p.getByTestId('reward-ok');
    await ok.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    if (await ok.isVisible()) await ok.click();
    // 伺服器支援大型設施
    await expect.poll(() => p.evaluate(() => (window as any).__game.realtime.getState().grand)).toBe(true);
  }
  const pages = [a.page, b.page];
  const start = await coinsOf(a.page);

  // ---------- 截圖：全島、摩天輪月台前（鏡頭拉遠往上看）、車站、繫留塔 ----------
  await teleport(a.page, { x: 0, z: 4 });
  await a.page.waitForTimeout(1500);
  const calls = await drawCalls(a.page);
  console.log('班級島 draw call（含大型設施）', calls);
  await a.page.screenshot({ path: `${OUT}/01-plaza.png` });
  await teleport(a.page, WHEEL.board);
  await a.page.waitForTimeout(2500);
  await a.page.screenshot({ path: `${OUT}/02-wheel-board.png` });
  await teleport(a.page, MAST.board);
  await a.page.waitForTimeout(2500);
  await a.page.screenshot({ path: `${OUT}/03-mast.png` });

  // ---------- 雲霄飛車 ----------
  const { track, timeline, cycle } = coaster();
  // 撥到下一班停站開始後 2 秒
  const w0 = await wallOf(a.page);
  await warp(pages, cycle - (w0 % cycle) + 2);
  await teleport(a.page, { x: STATION.exit.x, z: STATION.exit.z });
  await teleport(b.page, { x: STATION.exit.x + 1.5, z: STATION.exit.z });
  await expect(a.page.getByTestId('grand-card')).toContainText('雲霄飛車');
  await a.page.waitForTimeout(800);
  await a.page.screenshot({ path: `${OUT}/04-station.png` });
  await a.page.getByTestId('grand-start').click();
  await expect.poll(() => grandOf(a.page)).toMatchObject({ ride: 'coaster' });
  expect(await coinsOf(a.page)).toBe(start - 5);
  const paidAt = await a.page.evaluate(() => Date.now());
  await expect(a.page.getByTestId('grand-wait')).toContainText('秒後出發');
  await b.page.getByTestId('grand-start').click();
  await expect.poll(() => grandOf(b.page)).toMatchObject({ ride: 'coaster' });
  const seatA = (await grandOf(a.page))!.seat;
  const seatB = (await grandOf(b.page))!.seat;
  expect(seatB).not.toBe(seatA);
  // 小美那邊：阿寶坐在列車的那個座位上（座位代碼 coN）
  await expect.poll(() => b.page.evaluate((s) => Object.values((window as any).__game.grand.store.getState().riders).some((r: any) => r.ride === 'coaster' && r.seat === s), seatA)).toBe(true);
  // 扣的錢同步到伺服器後還是扣過的（lastSyncAt 只在同步成功時更新；伺服器拒絕的話，同步回來的金幣會變回原本的）
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.cloud.getState().lastSyncAt ?? 0)).toBeGreaterThan(paidAt);
  expect(await coinsOf(a.page)).toBe(start - 5);

  // 撥到迴圈頂端：角色頭下腳上，第一人稱的鏡頭跟著翻過去
  let top = 0;
  for (let i = 0; i < track.up.length; i++) if (track.up[i].y < track.up[top].y) top = i;
  const run = (await grandOf(a.page))!.run;
  const now = await wallOf(a.page);
  await warp(pages, run * cycle + COASTER_BOARD + timeline.time[top] - now);
  await a.page.evaluate(() => (window as any).__game.orbit.setView('first'));
  await expect
    .poll(async () => {
      const w = await worldOf(a.page);
      return w.quat ? rotateByQuat(w.quat, { x: 0, y: 1, z: 0 }).y : 1;
    })
    .toBeLessThan(-0.5);
  expect((await worldOf(a.page)).y).toBeGreaterThan(8);
  expect(await a.page.evaluate(() => (window as any).__game.camera.up.y)).toBeLessThan(0);
  await a.page.screenshot({ path: `${OUT}/05-coaster-loop-first.png` });
  await a.page.evaluate(() => (window as any).__game.orbit.setView('follow'));
  await a.page.waitForTimeout(600);
  await a.page.screenshot({ path: `${OUT}/06-coaster-loop-follow.png` });
  await b.page.screenshot({ path: `${OUT}/07-coaster-loop-other.png` });
  // 撥到這一班結束：自己下車、站到月台，鏡頭的上回到世界的上
  await warp(pages, timeline.duration - timeline.time[top] + 1);
  await expect.poll(() => grandOf(a.page)).toBeNull();
  await expect.poll(() => grandOf(b.page)).toBeNull();
  const off = await a.page.evaluate(() => ({ ...(window as any).__game.player.pos }));
  expect(Math.hypot(off.x - STATION.exit.x, off.z - STATION.exit.z)).toBeLessThan(0.5);
  expect(await a.page.evaluate(() => (window as any).__game.camera.up.y)).toBe(1);

  // ---------- 巨大摩天輪 ----------
  await teleport(a.page, WHEEL.board);
  await expect(a.page.getByTestId('grand-card')).toContainText('摩天輪');
  await a.page.getByTestId('grand-start').click();
  await expect.poll(() => grandOf(a.page)).toMatchObject({ ride: 'wheel' });
  expect(await coinsOf(a.page)).toBe(start - 10);
  await warp(pages, WHEEL.period / 2);
  await expect.poll(async () => (await worldOf(a.page)).y).toBeGreaterThan(15);
  await a.page.evaluate(() => (window as any).__game.orbit.setView('first'));
  await a.page.waitForTimeout(500);
  await a.page.screenshot({ path: `${OUT}/08-wheel-top-first.png` });
  await a.page.evaluate(() => (window as any).__game.orbit.setView('follow'));
  await a.page.waitForTimeout(800);
  await a.page.screenshot({ path: `${OUT}/09-wheel-top-follow.png` });
  await warp(pages, WHEEL.period / 2 + 1);
  await expect.poll(() => grandOf(a.page)).toBeNull();

  // ---------- 環島飛船 ----------
  const ws = await wallOf(a.page);
  await warp(pages, SHIP_CYCLE - (ws % SHIP_CYCLE) + 2);
  await teleport(a.page, MAST.board);
  await teleport(b.page, MAST.board);
  await a.page.getByTestId('grand-start').click();
  await b.page.getByTestId('grand-start').click();
  await expect.poll(() => grandOf(a.page)).toMatchObject({ ride: 'ship', deck: { x: SHIP.boardAt.x, z: SHIP.boardAt.z } });
  await expect.poll(() => grandOf(b.page)).toMatchObject({ ride: 'ship' });
  expect(await coinsOf(a.page)).toBe(start - 15);
  // 甲板上走動：推方向鍵，甲板上的位置變了；小美那邊收到阿寶的甲板座標（代碼 sh）
  await a.page.keyboard.down('ArrowUp');
  await a.page.waitForTimeout(1200);
  await a.page.keyboard.up('ArrowUp');
  const deck = (await grandOf(a.page))!.deck!;
  expect(Math.hypot(deck.x - SHIP.boardAt.x, deck.z - SHIP.boardAt.z)).toBeGreaterThan(0.5);
  expect(Math.abs(deck.x)).toBeLessThan(SHIP.halfW);
  expect(Math.abs(deck.z)).toBeLessThan(SHIP.halfL);
  await expect
    .poll(() =>
      b.page.evaluate(() => {
        const g = (window as any).__game;
        const me = g.presence.getState();
        const other = Object.values(me.members).find((m: any) => m.nickname === '阿寶') as any;
        return other ? { act: other.act, x: other.x, z: other.z } : null;
      }),
    )
    .toMatchObject({ act: 'sh', x: expect.closeTo(deck.x, 1), z: expect.closeTo(deck.z, 1) });
  // 撥到飛行中：在高處繞島；氣囊半透明
  await warp(pages, SHIP.board + SHIP.flight / 2 - 2);
  await expect.poll(async () => (await worldOf(a.page)).y).toBeGreaterThan(SHIP.cruiseY - 1);
  await a.page.waitForTimeout(2500);
  await a.page.screenshot({ path: `${OUT}/10-ship-flying.png` });
  await a.page.evaluate(() => (window as any).__game.orbit.setView('first'));
  await a.page.waitForTimeout(500);
  await a.page.screenshot({ path: `${OUT}/11-ship-first.png` });
  await a.page.evaluate(() => (window as any).__game.orbit.setView('follow'));
  await b.page.screenshot({ path: `${OUT}/12-ship-other.png` });
  // 降落後自己下船、站到塔下
  await warp(pages, SHIP.flight / 2 + 1);
  await expect.poll(() => grandOf(a.page)).toBeNull();
  const down = await a.page.evaluate(() => ({ ...(window as any).__game.player.pos }));
  expect(Math.hypot(down.x - MAST.exit.x, down.z - MAST.exit.z)).toBeLessThan(0.5);

  for (const p of pages) expect(pageErrors(p)).toEqual([]);
});

test('手機上金幣不夠時不能上（大動作鍵上面寫要 5 金幣）；熊熊老師免費坐摩天輪，孩子看到', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年八班');
  const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '小安', pin: '3333', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } } });
  expect(res.ok()).toBe(true);
  // 孩子用手機（觸控、直式）
  const a = await openDevice(browser, baseURL!, { touch: true });
  contexts.push(a.context);
  await loginAndEnter(a.page, room.code, '小安', '3333');
  await a.page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.realtime.getState().grand)).toBe(true);
  expect(await coinsOf(a.page)).toBeLessThan(5);
  await teleport(a.page, WHEEL.board);
  // 大動作鍵：「🎡 上車 5🪙」不能按，上面寫要 5 金幣
  await expect(a.page.getByTestId('grand-start')).toHaveText('🎡 上車 5🪙');
  await expect(a.page.getByTestId('grand-start')).toBeDisabled();
  await expect(a.page.locator('.action-caption')).toContainText('要 5 金幣');
  await a.page.waitForTimeout(800);
  await a.page.screenshot({ path: `${OUT}/13-phone-no-coins.png` });

  // 熊熊老師進島：卡片上的按鈕不寫價錢，免費坐摩天輪；孩子那邊看到老師坐在車廂裡
  const t = await openDevice(browser, baseURL!);
  contexts.push(t.context);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await t.page.getByTestId('gm-enter').click();
  await expect.poll(() => t.page.evaluate(() => (window as any).__game.gm.getState().grand)).toBe(true);
  await teleport(t.page, WHEEL.board);
  await expect(t.page.getByTestId('grand-start')).toHaveText('🎡 上去');
  await t.page.getByTestId('grand-start').click();
  await expect.poll(() => grandOf(t.page)).toMatchObject({ ride: 'wheel' });
  const seat = (await grandOf(t.page))!.seat;
  await expect.poll(() => a.page.evaluate((s) => Object.values((window as any).__game.grand.store.getState().riders).some((r: any) => r.ride === 'wheel' && r.seat === s), seat)).toBe(true);
  expect(pageErrors(a.page)).toEqual([]);
  expect(pageErrors(t.page)).toEqual([]);
});
