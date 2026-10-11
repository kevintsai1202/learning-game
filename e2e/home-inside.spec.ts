/**
 * 自己的家第二期：進屋（docs/plans/home.md 第 8 節）。單機：走到小屋門口「進去」、點小屋走過去自動進屋、
 * 屋裡的房間（壁紙地板、室內家具）、腳踏墊「回到島上」、往前走出去也回到島上；屋裡佈置與壁紙地板。
 * 兩台裝置：朋友來玩一起進屋看得到彼此、島主換壁紙朋友馬上看到；熊熊老師也能進孩子的家。
 * 截圖在 e2e/screenshots/home-inside/（不進版控）。
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createKid, freshStart } from './helpers';
import { SERVER, cloudState, createClassViaApi, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors } from './onlineDevice';

/** 這條測試開的裝置：結束時一律關掉（失敗也是），不然還在跑 3D 的頁面會拖慢後面的測試 */
const contexts: BrowserContext[] = [];

test.afterEach(async ({}, testInfo) => {
  flushDeviceLogs(testInfo);
  await Promise.all(contexts.splice(0).map((c) => c.close()));
});

const SHOTS = 'e2e/screenshots/home-inside';

/** 進屋的狀態 */
const homeOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.home.store.getState())));
/** 角色的位置 */
const posOf = (page: Page) => page.evaluate(() => ({ ...(window as any).__game.player.pos }));

test('走到小屋門口進屋、房間畫出來；腳踏墊回到島上；點小屋走過去自動進屋；往前走出去回到島上', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page);
  // 房間：星空壁紙、黑白格子地板、幾樣室內家具（直接給，不經過百寶屋）
  await page.evaluate(() => {
    const g = (window as any).__game.game;
    const ids = ['wall.star', 'floor.check', 'decor.bed', 'decor.sofa', 'decor.rug', 'decor.tv', 'decor.bookshelf', 'decor.piano', 'decor.aquarium', 'decor.plant'];
    g.setState((st: any) => ({
      save: { ...st.save, profiles: st.save.profiles.map((p: any) => (p.id === st.save.activeProfileId ? { ...p, inventory: [...p.inventory, ...ids] } : p)) },
    }));
    g.getState().saveHome({
      items: [
        { id: 'decor.bed', gx: 0, gz: 0, rot: 0 },
        { id: 'decor.bookshelf', gx: 2, gz: 0, rot: 0 },
        { id: 'decor.piano', gx: 4, gz: 0, rot: 0 },
        { id: 'decor.aquarium', gx: 7, gz: 0, rot: 0 },
        { id: 'decor.plant', gx: 9, gz: 0, rot: 0 },
        { id: 'decor.sofa', gx: 3, gz: 4, rot: 0 },
        { id: 'decor.rug', gx: 4, gz: 5, rot: 0 },
        { id: 'decor.tv', gx: 4, gz: 2, rot: 0 },
      ],
      wall: 'wall.star',
      floor: 'floor.check',
    });
  });
  expect(await page.evaluate(() => (window as any).__game.game.getState().profile().home.items.length)).toBe(8);

  // 走到小屋門口：泡泡寫「小安的家」
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.teleport(g.home.door());
  });
  await expect(page.getByTestId('home-door-bubble')).toContainText('小安的家');
  await page.screenshot({ path: `${SHOTS}/01-door.png` });
  await page.getByTestId('enter-home').click();
  await expect.poll(async () => (await homeOf(page)).inside).toBe('mine');
  await expect(page.getByTestId('hud-hint')).toContainText('腳踏墊');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/02-room.png` });

  // 站到腳踏墊：「回到島上」，按了回到小屋門口
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.teleport({ x: g.home.mat.x, z: g.home.mat.z });
  });
  await expect(page.getByTestId('home-mat-bubble')).toBeVisible();
  await page.getByTestId('leave-home').click();
  await expect.poll(async () => (await homeOf(page)).inside).toBeNull();
  const door = await page.evaluate(() => (window as any).__game.home.door());
  const p1 = await posOf(page);
  expect(Math.hypot(p1.x - door.x, p1.z - door.z)).toBeLessThan(0.5);

  // 離小屋遠一點，點小屋：走到門口後自動進屋
  await page.evaluate(() => {
    const g = (window as any).__game;
    const d = g.home.door();
    g.teleport({ x: d.x + 3, z: d.z + 3 });
  });
  await expect(page.getByTestId('home-door-bubble')).toHaveCount(0);
  // 等鏡頭跟上，再點小屋正面的牆（屋頂上有「○○的家」牌子，點不到 3D）
  await page.waitForTimeout(2000);
  const housePt = await page.evaluate(() => {
    const g = (window as any).__game;
    const d = g.home.door();
    // 小屋中心往門口方向 1.3 公尺（正面的牆）
    const hx = -14;
    const hz = 11;
    const len = Math.hypot(d.x - hx, d.z - hz);
    return g.scene.project(hx + ((d.x - hx) / len) * 1.3, 0.8, hz + ((d.z - hz) / len) * 1.3);
  });
  await page.mouse.click(housePt.x, housePt.y);
  await expect.poll(async () => (await homeOf(page)).inside, { timeout: 15000 }).toBe('mine');

  // 往前（+z）走出去：站在前緣的門口、按住方向鍵往下
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.teleport({ x: g.home.mat.x, z: 4.5 });
  });
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await homeOf(page)).inside).toBeNull();
  await page.keyboard.up('ArrowDown');
  expect(errors).toEqual([]);
});

/** 佈置的狀態（家具包、選著的家具、面前的格子、旁邊的家具） */
const decorOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.yard.store.getState())));
/** 目前角色的房間 */
const roomOf = (page: Page) => page.evaluate(() => (window as any).__game.game.getState().profile().home ?? null);

/** 屋裡：讓角色站在房間某一格南邊 1.2 公尺、面向北方（那一格就在面前），等面前的格子更新 */
async function faceRoomCell(page: Page, cell: { gx: number; gz: number }): Promise<void> {
  await page.evaluate(({ gx, gz }) => {
    const g = (window as any).__game;
    const w = g.home.world(gx, gz);
    g.teleport({ x: w.x, z: w.z + 1.2 });
    g.player.heading = Math.PI;
  }, cell);
  await expect.poll(async () => (await decorOf(page)).front).toEqual(cell);
}

test('屋裡佈置：家具包和島上共用數量、放下床、旁邊轉方向與收起來、換壁紙地板；重新整理後還在', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page);
  // 收藏 2 張長椅（島上擺 1 張）、1 張床、天空藍壁紙
  await page.evaluate(() => {
    const g = (window as any).__game;
    const ids = ['decor.bench', 'decor.bench', 'decor.bed', 'wall.sky'];
    g.game.setState((st: any) => ({
      save: { ...st.save, profiles: st.save.profiles.map((p: any) => (p.id === st.save.activeProfileId ? { ...p, inventory: [...p.inventory, ...ids] } : p)) },
    }));
    const [c] = g.yard.cells();
    g.game.getState().saveYard([{ id: 'decor.bench', gx: c.gx, gz: c.gz, rot: 0 }]);
    g.teleport(g.home.door());
  });
  await page.getByTestId('enter-home').click();
  await expect.poll(async () => (await page.evaluate(() => (window as any).__game.home.store.getState().inside))).toBe('mine');

  // 家具包：長椅剩 1 張（島上擺了 1 張），床 1 張
  await page.getByTestId('hud-decor').click();
  await expect(page.getByTestId('decor-pick-decor.bench')).toContainText('× 1');
  await expect(page.getByTestId('decor-pick-decor.bed')).toContainText('× 1');
  await page.getByTestId('decor-pick-decor.bed').click();
  await faceRoomCell(page, { gx: 2, gz: 3 });
  await expect(page.getByTestId('decor-hint')).toContainText('放下');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/03-room-ghost.png` });
  await page.getByTestId('decor-place').click();
  await expect.poll(async () => (await roomOf(page))?.items).toEqual([{ id: 'decor.bed', gx: 2, gz: 3, rot: 0 }]);

  // 門口前面不能擺
  await page.getByTestId('decor-pick-decor.bench').click();
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.teleport({ x: g.home.spawn.x, z: g.home.mat.z });
    g.player.heading = Math.PI;
  });
  await expect(page.getByTestId('decor-hint')).toContainText('這裡不能擺');
  // 最後一張長椅擺進屋：島上加屋裡都擺完，家具包裡是 × 0
  await faceRoomCell(page, { gx: 7, gz: 3 });
  await page.getByTestId('decor-place').click();
  await expect(page.getByTestId('decor-pick-decor.bench')).toContainText('× 0');
  await expect(page.getByTestId('decor-pick-decor.bench')).toBeDisabled();

  // 走到床旁邊：轉方向、收起來
  await faceRoomCell(page, { gx: 2, gz: 3 });
  await expect(page.getByTestId('decor-near')).toContainText('床');
  await page.getByTestId('decor-near-rotate').click();
  await expect.poll(async () => (await roomOf(page))?.items.find((it: any) => it.id === 'decor.bed')?.rot).toBe(1);
  await page.getByTestId('decor-near-pickup').click();
  await expect.poll(async () => (await roomOf(page))?.items.map((it: any) => it.id)).toEqual(['decor.bench']);

  // 壁紙地板：打開面板時家具包關上；換天空藍
  await page.getByTestId('hud-surface').click();
  await expect(page.getByTestId('surface-panel')).toBeVisible();
  await expect(page.getByTestId('decor-bag')).toHaveCount(0);
  await expect(page.getByTestId('surface-wall-wall.cream')).toHaveClass(/on/);
  await page.getByTestId('surface-wall-wall.sky').click();
  await expect.poll(async () => (await roomOf(page))?.wall).toBe('wall.sky');
  await expect(page.getByTestId('surface-wall-wall.sky')).toHaveClass(/on/);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/04-room-wall.png` });
  await page.getByTestId('surface-close').click();

  // 出屋：島上看不到「🎨 壁紙地板」
  await page.evaluate(() => (window as any).__game.home.leave());
  await expect(page.getByTestId('hud-surface')).toHaveCount(0);

  // 重新整理後還在（存在裝置上）
  await page.reload();
  expect(await roomOf(page)).toEqual({ items: [{ id: 'decor.bench', gx: 7, gz: 3, rot: 0 }], wall: 'wall.sky', floor: 'floor.wood' });
  expect(errors).toEqual([]);
});

/** 某位成員（不是自己）在這台裝置上看到的樣子；沒有是 null */
const memberOn = (page: Page, nickname: string) =>
  page.evaluate((n) => {
    const s = (window as any).__game.presence.getState();
    const m = Object.values(s.members).find((v: any) => v.nickname === n && v.id !== s.selfId) as any;
    return m ? { zone: m.zone, x: m.x, z: m.z } : null;
  }, nickname);
/** 在不在屋裡 */
const insideOf = (page: Page) => page.evaluate(() => (window as any).__game.home.store.getState().inside);

/** 走到小屋門口按「進去」 */
async function goInside(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.teleport(g.home.door());
  });
  await page.getByTestId('enter-home').click();
  await expect.poll(() => insideOf(page)).not.toBeNull();
}

test('朋友來玩一起進屋：島上看不到屋裡的人、屋裡看得到彼此；島主換壁紙朋友馬上看到；出屋後回到島上', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年六班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'capybara'],
    ['小美', '2222', 'panda'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  // 老師發 50 枚金幣給全班（小美要買壁紙；雲端角色的壁紙要伺服器上真的有）
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

  // 小美買天空藍壁紙、回自己的島、開放
  expect(await b.page.evaluate(() => (window as any).__game.game.getState().purchase('wall.sky', 30))).toBe(true);
  await expect.poll(async () => (await cloudState(b.page)).pending).toBe(0);
  await b.page.getByTestId('hud-island').click();
  await expect.poll(() => b.page.evaluate(() => (window as any).__game.realtime.getState().island)).toBe('own');
  await b.page.getByTestId('island-open').click();

  // 阿寶去小美的島
  await a.page.getByTestId('hud-friends').click();
  await a.page.getByTestId('friend-visit-小美').click();
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.realtime.getState().visiting?.name ?? null)).toBe('小美');

  // 小美進屋：阿寶在島上看到小美在屋裡（不畫在島上）
  await goInside(b.page);
  await expect.poll(async () => (await memberOn(a.page, '小美'))?.zone).toBe('home');

  // 阿寶也進屋：兩邊都看到對方在屋裡，位置是房間的座標
  await goInside(a.page);
  expect(await insideOf(a.page)).not.toBe('mine');
  await expect.poll(async () => (await memberOn(b.page, '阿寶'))?.zone).toBe('home');
  await a.page.evaluate(() => (window as any).__game.teleport({ x: 2, z: 1 }));
  await expect.poll(async () => Math.round((await memberOn(b.page, '阿寶'))?.x ?? 0)).toBe(2);
  const seen = await memberOn(a.page, '小美');
  expect(Math.abs(seen!.x)).toBeLessThanOrEqual(5);
  expect(Math.abs(seen!.z)).toBeLessThanOrEqual(5);
  // 朋友的家沒有家具包與壁紙地板
  await expect(a.page.getByTestId('hud-decor')).toHaveCount(0);
  await expect(a.page.getByTestId('hud-surface')).toHaveCount(0);

  // 小美換壁紙：阿寶那邊馬上換
  await b.page.getByTestId('hud-surface').click();
  await b.page.getByTestId('surface-wall-wall.sky').click();
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.yard.host.getState().home?.wall ?? null)).toBe('wall.sky');
  await b.page.getByTestId('surface-close').click();
  await a.page.waitForTimeout(1500);
  await a.page.screenshot({ path: `${SHOTS}/05-friend-inside.png` });

  // 阿寶出屋：小美看到他回到島上（在小屋門口，不是島中央）
  await a.page.evaluate(() => {
    const g = (window as any).__game;
    g.teleport({ x: g.home.mat.x, z: g.home.mat.z });
  });
  await a.page.getByTestId('leave-home').click();
  await expect.poll(async () => (await memberOn(b.page, '阿寶'))?.zone).toBeNull();
  const door = await a.page.evaluate(() => (window as any).__game.home.door());
  const back = await memberOn(b.page, '阿寶');
  expect(Math.hypot(back!.x - door.x, back!.z - door.z)).toBeLessThan(1);
  expect(pageErrors(a.page)).toEqual([]);
  expect(pageErrors(b.page)).toEqual([]);
});

test('熊熊老師去孩子的島也能進屋：孩子在屋裡看得到熊熊老師；老師回班級島時出來', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年七班');
  const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } } });
  expect(res.ok()).toBe(true);
  const a = await openDevice(browser, baseURL!);
  contexts.push(a.context);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  await a.page.getByTestId('hud-island').click();
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.realtime.getState().island)).toBe('own');
  await goInside(a.page);

  const t = await openDevice(browser, baseURL!);
  contexts.push(t.context);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await t.page.getByTestId('gm-enter').click();
  await expect.poll(() => t.page.evaluate(() => (window as any).__game.gm.getState().status)).toBe('online');
  await t.page.getByTestId('gm-roster-toggle').click();
  await expect(t.page.getByTestId('gm-roster-阿寶')).toContainText('小屋裡');
  await t.page.getByTestId('gm-visit-阿寶').click();
  await expect.poll(() => t.page.evaluate(() => (window as any).__game.gm.getState().visiting?.name ?? null)).toBe('阿寶');

  // 老師走到小屋門口進屋：阿寶在屋裡看到熊熊老師
  await goInside(t.page);
  await expect.poll(async () => (await memberOn(a.page, '熊熊老師'))?.zone).toBe('home');
  await t.page.waitForTimeout(1500);
  await t.page.screenshot({ path: `${SHOTS}/06-teacher-inside.png` });
  // 熊熊老師在孩子的家不能佈置
  await expect(t.page.getByTestId('hud-surface')).toHaveCount(0);

  // 老師回班級島：被迫出來，阿寶那邊熊熊老師不見了
  await t.page.getByTestId('gm-back-class').click();
  await expect.poll(() => insideOf(t.page)).toBeNull();
  await expect.poll(() => memberOn(a.page, '熊熊老師')).toBeNull();
  expect(pageErrors(a.page)).toEqual([]);
  expect(pageErrors(t.page)).toEqual([]);
});
