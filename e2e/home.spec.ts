/**
 * 自己的家第一期：院子（docs/plans/home.md 第 3 節）。
 * 百寶屋買家具、佈置模式（選家具、點格子放下、轉方向、移動、收起來、完成與取消）、重新整理後還在、
 * 兩台裝置：朋友來玩看得到院子。佈置模式的動作透過 window.__game.yard 操作（點 3D 格子只留一個真的點）。
 * 截圖在 e2e/screenshots/home/（不進版控）。
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createKid, freshStart } from './helpers';
import { SERVER, cloudState, createClassViaApi, flushDeviceLogs, loginAndEnter, openDevice, pageErrors } from './onlineDevice';

const SHOTS = 'e2e/screenshots/home';

/** 這條測試開的裝置：結束時一律關掉（失敗也是），不然還在跑 3D 的頁面會拖慢後面的測試 */
const contexts: BrowserContext[] = [];

test.afterEach(async ({}, testInfo) => {
  flushDeviceLogs(testInfo);
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

/** 21 種家具（和 src/store/catalog.ts 的 FURNITURE 相同順序） */
const FURNITURE = [
  'decor.bed-red',
  'decor.bed-yellow',
  'decor.tulip',
  'decor.grass',
  'decor.mushroom',
  'decor.stone',
  'decor.tree',
  'decor.bush',
  'decor.fence',
  'decor.bench',
  'decor.picnic',
  'decor.parasol',
  'decor.lamp',
  'decor.mailbox',
  'decor.scarecrow',
  'decor.crate',
  'decor.swing',
  'decor.slide',
  'decor.sandbox',
  'decor.windmill',
  'decor.pond',
];

/** 目前角色的院子 */
const yardOf = (page: Page) => page.evaluate(() => (window as any).__game.game.getState().profile().yard ?? []);

/** 直接給目前角色幾個家具（不經過百寶屋；測佈置與畫面用） */
async function giveFurniture(page: Page, ids: string[]): Promise<void> {
  await page.evaluate((ids) => {
    const g = (window as any).__game.game;
    g.setState((st: any) => ({
      save: { ...st.save, profiles: st.save.profiles.map((p: any) => (p.id === st.save.activeProfileId ? { ...p, inventory: [...p.inventory, ...ids] } : p)) },
    }));
  }, ids);
}

test('院子畫出 21 種家具：擋路的家具走不過去，沒有頁面錯誤', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page);
  await giveFurniture(page, FURNITURE);
  // 院子前 21 格各擺一樣，方向輪流
  await page.evaluate((ids) => {
    const g = (window as any).__game;
    const cells = g.yard.cells();
    g.game.getState().saveYard(ids.map((id: string, i: number) => ({ id, gx: cells[i].gx, gz: cells[i].gz, rot: i % 4 })));
  }, FURNITURE);
  expect(await yardOf(page)).toHaveLength(FURNITURE.length);
  // 從院子東南邊看過去
  await page.evaluate(() => (window as any).__game.teleport({ x: -11, z: 17 }));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/01-yard-all.png` });
  await page.evaluate(() => (window as any).__game.teleport({ x: -7.5, z: 6.5 }));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/02-yard-north.png` });
  // 佈置模式的鏡頭從上面看（看清楚每一樣家具），取消不改院子
  await page.getByTestId('hud-decor').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/02b-yard-top.png` });
  await page.getByTestId('decor-cancel').click();
  expect(await yardOf(page)).toHaveLength(FURNITURE.length);
  expect(errors).toEqual([]);
});

/** 佈置模式的狀態 */
const editOf = (page: Page) => page.evaluate(() => (window as any).__game.yard.store.getState().edit);
/** 佈置模式的一個動作 */
const act = (page: Page, a: object) => page.evaluate((a) => (window as any).__game.yard.act(a), a);

test('佈置模式：選家具點格子放下、轉方向、移動、收起來；完成存起來，重新整理後還在；取消不存', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page);
  await giveFurniture(page, ['decor.bench', 'decor.bench', 'decor.fence']);
  await page.getByTestId('hud-decor').click();
  await expect(page.getByTestId('decor-panel')).toBeVisible();
  await expect(page.getByTestId('decor-pick-decor.bench')).toContainText('× 2');
  await page.getByTestId('decor-pick-decor.bench').click();
  await expect(page.getByTestId('decor-hint')).toContainText('長椅');
  // 鏡頭轉到院子上方之後，真的點一格（3D 格子）：選院子南邊的一格
  await page.waitForTimeout(2000);
  // 真的點的那一格：畫面上最靠近正中間的格子（上下有面板，邊緣的格子可能被擋住）
  const { cells, c1, at } = await page.evaluate(() => {
    const g = (window as any).__game;
    const cells: { gx: number; gz: number }[] = g.yard.cells();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const withPos = cells.map((c) => {
      const w = g.yard.world(c.gx, c.gz);
      return { c, p: g.scene.project(w.x, 0.04, w.z) as { x: number; y: number } };
    });
    withPos.sort((a, b) => Math.hypot(a.p.x - cx, a.p.y - cy) - Math.hypot(b.p.x - cx, b.p.y - cy));
    return { cells, c1: withPos[0].c, at: withPos[0].p };
  });
  const [c2, c3] = cells.filter((c) => c.gx !== c1.gx || c.gz !== c1.gz);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(500);
  await expect.poll(async () => (await editOf(page)).items).toEqual([{ id: 'decor.bench', gx: c1.gx, gz: c1.gz, rot: 0 }]);
  await page.screenshot({ path: `${SHOTS}/03-decor-mode.png` });
  // 第二張長椅放在另一格；放完了就不再選著
  await act(page, { t: 'tap', ...c2 });
  expect((await editOf(page)).picking).toBeNull();
  await expect(page.getByTestId('decor-pick-decor.bench')).toContainText('× 0');
  // 點第一張長椅：轉方向、移動到第三格
  await act(page, { t: 'tap', ...c1 });
  await expect(page.getByTestId('decor-rotate')).toBeVisible();
  await page.getByTestId('decor-rotate').click();
  await page.getByTestId('decor-move').click();
  await expect(page.getByTestId('decor-hint')).toContainText('搬過去');
  await act(page, { t: 'tap', ...c3 });
  // 第二張長椅收起來
  await act(page, { t: 'tap', ...c2 });
  await page.getByTestId('decor-putaway').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/04-decor-edited.png` });
  await page.getByTestId('decor-done').click();
  await expect(page.getByTestId('decor-panel')).toHaveCount(0);
  expect(await yardOf(page)).toEqual([{ id: 'decor.bench', gx: c3.gx, gz: c3.gz, rot: 1 }]);

  // 取消：放了柵欄再取消，院子不變
  await page.getByTestId('hud-decor').click();
  await page.getByTestId('decor-pick-decor.fence').click();
  await act(page, { t: 'tap', ...c2 });
  expect((await editOf(page)).items).toHaveLength(2);
  await page.getByTestId('decor-cancel').click();
  expect(await yardOf(page)).toEqual([{ id: 'decor.bench', gx: c3.gx, gz: c3.gz, rot: 1 }]);

  // 佈置到一半離開島上（進建築）：這次的佈置取消
  await page.getByTestId('hud-decor').click();
  await page.getByTestId('decor-pick-decor.fence').click();
  await act(page, { t: 'tap', ...c2 });
  await page.evaluate(() => (window as any).__game.ui.getState().enterZone('shop'));
  await expect.poll(() => editOf(page)).toBeNull();
  expect(await yardOf(page)).toEqual([{ id: 'decor.bench', gx: c3.gx, gz: c3.gz, rot: 1 }]);
  await page.getByTestId('leave-shop').click();

  // 重新整理後還在（存在裝置上）
  await page.reload();
  expect(await yardOf(page)).toEqual([{ id: 'decor.bench', gx: c3.gx, gz: c3.gz, rot: 1 }]);
  expect(errors).toEqual([]);
});

test('百寶屋的家具分頁：一個一個買，同一種可以買很多個；家具包看得到', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await page.evaluate(() => {
    const g = (window as any).__game.game;
    g.setState((st: any) => ({ save: { ...st.save, profiles: st.save.profiles.map((p: any) => ({ ...p, coins: 100 })) } }));
  });
  await page.evaluate(() => (window as any).__game.ui.getState().enterZone('shop'));
  await page.getByTestId('shop-tab-decor').click();
  await expect(page.getByTestId('decor-count-decor.fence')).toHaveText('還沒有');
  await page.getByTestId('buy-decor.fence').click();
  await page.getByTestId('buy-decor.fence').click();
  await expect(page.getByTestId('decor-count-decor.fence')).toHaveText('已有 2 個');
  await expect(page.getByRole('dialog', { name: '百寶屋' }).locator('.panel-head h2')).toContainText('88');
  await page.screenshot({ path: `${SHOTS}/05-shop-decor.png` });
  await page.getByTestId('leave-shop').click();
  await page.getByTestId('hud-decor').click();
  await expect(page.getByTestId('decor-pick-decor.fence')).toContainText('× 2');
});

test('朋友來玩看得到院子：島主擺好按完成，朋友上岸就看到；島主再改，朋友馬上更新', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年五班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'capybara'],
    ['小美', '2222', 'panda'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  // 老師發 50 枚金幣給全班（小美要買長椅；雲端角色的家具要伺服器上真的有）
  const reward = await request.post(`${SERVER}/api/teacher/rooms/${room.code}/rewards`, { data: { to: 'all', coins: 50 }, headers: { authorization: `Bearer ${room.token}` } });
  expect(reward.ok()).toBe(true);
  const a = await openDevice(browser, baseURL!);
  contexts.push(a.context);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  const b = await openDevice(browser, baseURL!);
  contexts.push(b.context);
  await loginAndEnter(b.page, room.code, '小美', '2222');
  for (const p of [a.page, b.page]) {
    await expect.poll(() => p.evaluate(() => (window as any).__game.game.getState().profile().coins)).toBeGreaterThanOrEqual(50);
    const ok = p.getByTestId('reward-ok');
    if (await ok.isVisible()) await ok.click();
  }

  // 小美買長椅、回自己的島、擺在院子裡、按完成（一秒後同步到伺服器）
  expect(await b.page.evaluate(() => (window as any).__game.game.getState().purchase('decor.bench', 40))).toBe(true);
  await b.page.getByTestId('hud-island').click();
  await expect.poll(() => b.page.evaluate(() => (window as any).__game.realtime.getState().island)).toBe('own');
  const cell = await b.page.evaluate(() => (window as any).__game.yard.cells()[0]);
  const bench = { id: 'decor.bench', gx: cell.gx, gz: cell.gz, rot: 0 };
  await b.page.getByTestId('hud-decor').click();
  await act(b.page, { t: 'pick', id: 'decor.bench' });
  await act(b.page, { t: 'tap', gx: cell.gx, gz: cell.gz });
  await b.page.getByTestId('decor-done').click();
  await expect.poll(async () => (await cloudState(b.page)).pending).toBe(0);
  await b.page.getByTestId('island-open').click();

  // 阿寶去小美的島：上岸就看到長椅
  await a.page.getByTestId('hud-friends').click();
  await a.page.getByTestId('friend-visit-小美').click();
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.realtime.getState().visiting?.name ?? null)).toBe('小美');
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.yard.host.getState().items)).toEqual([bench]);
  await a.page.evaluate(() => (window as any).__game.teleport({ x: -11, z: 16 }));
  await a.page.waitForTimeout(1500);
  await a.page.screenshot({ path: `${SHOTS}/06-friend-sees-yard.png` });

  // 小美把長椅收起來：阿寶那邊馬上更新
  await b.page.getByTestId('hud-decor').click();
  await act(b.page, { t: 'tap', gx: cell.gx, gz: cell.gz });
  await b.page.getByTestId('decor-putaway').click();
  await b.page.getByTestId('decor-done').click();
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.yard.host.getState().items)).toEqual([]);
  expect(pageErrors(a.page)).toEqual([]);
  expect(pageErrors(b.page)).toEqual([]);
});
