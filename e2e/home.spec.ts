/**
 * 自己的家：在島上直接佈置全島（docs/plans/home.md 第 7 節，動森做法）。
 * 百寶屋買家具、家具包選一樣 → 角色面前出現預覽 → 放下（真的點「放下」按鈕）、走到旁邊轉方向與收起來、
 * 重新整理後還在、擋住角色的建築隱形、兩台裝置：朋友來玩看得到擺設與更新。
 * 角色的位置與方向直接設定（window.__game.player），面前的格子由規則決定，不必算螢幕座標。
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

/** 目前角色的擺設 */
const yardOf = (page: Page) => page.evaluate(() => (window as any).__game.game.getState().profile().yard ?? []);
/** 佈置的狀態（家具包、選著的家具、面前的格子、旁邊的家具） */
const decorOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.yard.store.getState())));

/** 直接給目前角色幾個家具（不經過百寶屋；測佈置與畫面用） */
async function giveFurniture(page: Page, ids: string[]): Promise<void> {
  await page.evaluate((ids) => {
    const g = (window as any).__game.game;
    g.setState((st: any) => ({
      save: { ...st.save, profiles: st.save.profiles.map((p: any) => (p.id === st.save.activeProfileId ? { ...p, inventory: [...p.inventory, ...ids] } : p)) },
    }));
  }, ids);
}

/** 讓角色站在某一格南邊 1.2 公尺、面向北方（那一格就在面前），等面前的格子更新 */
async function faceCell(page: Page, cell: { gx: number; gz: number }): Promise<void> {
  await page.evaluate(({ gx, gz }) => {
    const g = (window as any).__game;
    const w = g.yard.world(gx, gz);
    g.teleport({ x: w.x, z: w.z + 1.2 });
    g.player.heading = Math.PI;
  }, cell);
  await expect.poll(async () => (await decorOf(page)).front).toEqual(cell);
}

/** 可以擺的格子裡，離某個世界座標最近的幾格 */
async function cellsNear(page: Page, x: number, z: number, n: number): Promise<{ gx: number; gz: number }[]> {
  return page.evaluate(
    ({ x, z, n }) => {
      const g = (window as any).__game;
      const cells: { gx: number; gz: number }[] = g.yard.cells();
      return cells
        .map((c) => ({ c, d: Math.hypot(g.yard.world(c.gx, c.gz).x - x, g.yard.world(c.gx, c.gz).z - z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, n)
        .map((v) => v.c);
    },
    { x, z, n },
  );
}

test('全島擺 21 種家具：平常的畫面就看得到，沒有頁面錯誤', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page);
  await giveFurniture(page, FURNITURE);
  // 廣場東南邊的空地擺 21 樣，方向輪流
  const cells = await cellsNear(page, 9, 5, FURNITURE.length);
  await page.evaluate(
    ({ ids, cells }) => {
      const g = (window as any).__game;
      g.game.getState().saveYard(ids.map((id: string, i: number) => ({ id, gx: cells[i].gx, gz: cells[i].gz, rot: i % 4 })));
    },
    { ids: FURNITURE, cells },
  );
  expect(await yardOf(page)).toHaveLength(FURNITURE.length);
  await page.evaluate(() => (window as any).__game.teleport({ x: 9, z: 10 }));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/01-island-all.png` });
  expect(errors).toEqual([]);
});

test('動森做法：家具包選一樣、面前出現預覽、轉方向、放下；走到旁邊轉方向與收起來；不能擺的地方說原因；重新整理後還在', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page);
  await giveFurniture(page, ['decor.bench', 'decor.bench', 'decor.fence']);
  // 兩格離遠一點（站在第二格前面時，不會撞到第一張長椅而被推開）
  const near = await cellsNear(page, 8, 5, 30);
  const c1 = near[0];
  const c2 = near.find((c) => Math.abs(c.gx - c1.gx) + Math.abs(c.gz - c1.gz) >= 4)!;

  await page.getByTestId('hud-decor').click();
  await expect(page.getByTestId('decor-bag')).toBeVisible();
  await expect(page.getByTestId('decor-pick-decor.bench')).toContainText('× 2');
  await page.getByTestId('decor-pick-decor.bench').click();
  await faceCell(page, c1);
  await expect(page.getByTestId('decor-hint')).toContainText('放下');
  await page.getByTestId('decor-ghost-rotate').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/02-ghost.png` });
  await page.getByTestId('decor-place').click();
  await expect.poll(() => yardOf(page)).toEqual([{ id: 'decor.bench', gx: c1.gx, gz: c1.gz, rot: 1 }]);
  await expect(page.getByTestId('decor-pick-decor.bench')).toContainText('× 1');

  // 同一格不能再放：說原因、放下按鈕停用
  await expect(page.getByTestId('decor-hint')).toContainText('這裡已經有東西了');
  await expect(page.getByTestId('decor-place')).toBeDisabled();
  // 面向建築（百寶屋）：這裡不能擺
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.teleport({ x: -7.5, z: 15 });
    g.player.heading = Math.PI;
  });
  await expect(page.getByTestId('decor-hint')).toContainText('這裡不能擺');

  // 第二張長椅放在另一格，放完了就不再選著
  await faceCell(page, c2);
  await page.getByTestId('decor-place').click();
  await expect.poll(async () => (await decorOf(page)).picking).toBeNull();
  expect(await yardOf(page)).toHaveLength(2);

  // 走到第一張長椅旁邊：轉方向、收起來
  await faceCell(page, c1);
  await expect(page.getByTestId('decor-near')).toContainText('長椅');
  await page.getByTestId('decor-near-rotate').click();
  await expect.poll(async () => (await yardOf(page)).find((it: any) => it.gx === c1.gx && it.gz === c1.gz)?.rot).toBe(2);
  await page.screenshot({ path: `${SHOTS}/03-near.png` });
  await page.getByTestId('decor-near-pickup').click();
  // 連續放的時候預覽的方向照舊（第二張長椅也是轉過一次的方向，排柵欄比較方便）
  await expect.poll(() => yardOf(page)).toEqual([{ id: 'decor.bench', gx: c2.gx, gz: c2.gz, rot: 1 }]);

  // 關上家具包；重新整理後擺設還在（存在裝置上）
  await page.getByTestId('decor-close').click();
  await expect(page.getByTestId('decor-bag')).toHaveCount(0);
  await page.reload();
  expect(await yardOf(page)).toEqual([{ id: 'decor.bench', gx: c2.gx, gz: c2.gz, rot: 1 }]);
  expect(errors).toEqual([]);
});

test('擋住角色的建築隱形：走到百寶屋、小屋後面就看不見那一棟，走出來恢復', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  const hidden = () => page.evaluate(() => (window as any).__game.scene.hiddenZones as string[]);
  // 百寶屋北邊（鏡頭在南邊）
  await page.evaluate(() => (window as any).__game.teleport({ x: -7.5, z: 6.6 }));
  await expect.poll(hidden).toContain('shop');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/04-behind-shop.png` });
  // 小屋北邊
  await page.evaluate(() => (window as any).__game.teleport({ x: -14, z: 6.5 }));
  await expect.poll(hidden).toContain('house');
  await page.screenshot({ path: `${SHOTS}/05-behind-house.png` });
  // 走出來（出生點）恢復
  await page.evaluate(() => (window as any).__game.teleport({ x: 0, z: 13 }));
  await expect.poll(hidden).toEqual([]);
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
  await page.screenshot({ path: `${SHOTS}/06-shop-decor.png` });
  await page.getByTestId('leave-shop').click();
  await page.getByTestId('hud-decor').click();
  await expect(page.getByTestId('decor-pick-decor.fence')).toContainText('× 2');
});

test('朋友來玩看得到擺設：島主放下，朋友上岸就看到；島主收起來，朋友馬上更新', async ({ browser, baseURL, request }) => {
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

  // 小美買長椅、回自己的島、放在面前（一秒後同步到伺服器）
  expect(await b.page.evaluate(() => (window as any).__game.game.getState().purchase('decor.bench', 40))).toBe(true);
  await b.page.getByTestId('hud-island').click();
  await expect.poll(() => b.page.evaluate(() => (window as any).__game.realtime.getState().island)).toBe('own');
  const [cell] = await cellsNear(b.page, 8, 5, 1);
  const bench = { id: 'decor.bench', gx: cell.gx, gz: cell.gz, rot: 0 };
  await b.page.getByTestId('hud-decor').click();
  await b.page.getByTestId('decor-pick-decor.bench').click();
  await faceCell(b.page, cell);
  await b.page.getByTestId('decor-place').click();
  await expect.poll(async () => (await cloudState(b.page)).pending).toBe(0);
  await b.page.getByTestId('decor-close').click();
  await b.page.getByTestId('island-open').click();

  // 阿寶去小美的島：上岸就看到長椅；朋友的島上沒有家具包
  await a.page.getByTestId('hud-friends').click();
  await a.page.getByTestId('friend-visit-小美').click();
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.realtime.getState().visiting?.name ?? null)).toBe('小美');
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.yard.host.getState().items)).toEqual([bench]);
  await expect(a.page.getByTestId('hud-decor')).toHaveCount(0);
  await a.page.evaluate(() => (window as any).__game.teleport({ x: 8, z: 9 }));
  await a.page.waitForTimeout(1500);
  await a.page.screenshot({ path: `${SHOTS}/07-friend-sees.png` });

  // 小美走到長椅旁邊收起來：阿寶那邊馬上更新
  await faceCell(b.page, cell);
  await b.page.getByTestId('decor-near-pickup').click();
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.yard.host.getState().items)).toEqual([]);
  expect(pageErrors(a.page)).toEqual([]);
  expect(pageErrors(b.page)).toEqual([]);
});
