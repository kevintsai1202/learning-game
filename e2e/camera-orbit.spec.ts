/**
 * 自己的家第 10.5 節（第 ③ 批，docs/plans/home.md）：轉視角、移動跟著鏡頭、放開才算點擊、屋裡的牆變淡、用家具時換視角。
 * - 電腦：滑鼠拖曳轉、Q／E 轉、方向鍵跟著鏡頭、拖曳不會走過去、點一下會走、🧭 回正；進出屋回正。
 * - 屋裡：轉到後面或側面時那一面牆變半透明。
 * - 用家具：🎥 跟拍 → 近拍 → 第一人稱（鏡頭在角色的頭）；選的模式記住，溜滑梯第一人稱沿著滑道往下看。
 * - 手機（觸控、直式）：左半邊（搖桿區）拖曳不轉、右半邊拖曳會轉、🧭 在右側直排圖示、點一下照樣走。
 * 截圖在 e2e/screenshots/camera-orbit/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createKid, freshStart } from './helpers';

const SHOTS = 'e2e/screenshots/camera-orbit';
mkdirSync(SHOTS, { recursive: true });

/** 轉的角度與視角模式 */
const orbitOf = (page: Page) => page.evaluate(() => (window as any).__game.orbit.get() as { yaw: number; view: string; rotated: boolean });
/** 角色的位置 */
const posOf = (page: Page) => page.evaluate(() => ({ ...(window as any).__game.player.pos }) as { x: number; z: number });
/** 鏡頭的位置 */
const camOf = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__game.camera.position;
    return { x: c.x, y: c.y, z: c.z };
  });

/** 在畫面上拖曳（滑鼠按著從 from 移到 to） */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/** 給家具並擺在島上離某些世界座標最近的格子（rot 0）；回傳擺的格子 */
async function placeYard(page: Page, wants: { id: string; x: number; z: number }[]): Promise<{ gx: number; gz: number }[]> {
  return page.evaluate((wants) => {
    const g = (window as any).__game;
    const all: { gx: number; gz: number }[] = g.yard.cells();
    const near = (x: number, z: number) => all.map((c) => ({ c, d: Math.hypot(g.yard.world(c.gx, c.gz).x - x, g.yard.world(c.gx, c.gz).z - z) })).sort((a, b) => a.d - b.d)[0].c;
    const cells = wants.map((w) => near(w.x, w.z));
    g.game.setState((st: any) => ({
      save: { ...st.save, profiles: st.save.profiles.map((p: any) => (p.id === st.save.activeProfileId ? { ...p, inventory: [...p.inventory, ...wants.map((w) => w.id)] } : p)) },
    }));
    g.game.getState().saveYard(wants.map((w, i) => ({ id: w.id, ...cells[i], rot: 0 })));
    return cells;
  }, wants);
}

test('電腦：拖曳與 Q／E 轉視角、方向鍵跟著鏡頭、拖曳不會走過去、點一下會走、🧭 回正；進出屋回正', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page);
  await page.evaluate(() => (window as any).__game.teleport({ x: 4, z: 6 }));
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('cam-reset')).toHaveCount(0);
  expect((await orbitOf(page)).yaw).toBe(0);

  // 滑鼠往右拖：視角往右轉（yaw 變小），鏡頭移到角色西邊；拖曳不會走過去
  const box = (await page.locator('canvas').first().boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await drag(page, mid, { x: mid.x + 150, y: mid.y });
  const turned = (await orbitOf(page)).yaw;
  expect(turned).toBeLessThan(-0.8);
  expect(await page.evaluate(() => (window as any).__game.player.target)).toBeNull();
  await expect(page.getByTestId('cam-reset')).toBeVisible();
  const p0 = await posOf(page);
  await expect.poll(async () => (await camOf(page)).x).toBeLessThan(p0.x - 5);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/01-turned.png` });

  // 方向鍵「上」往鏡頭看的方向走（往右轉了，主要往東 +x）；軟體 WebGL 每秒畫的格數少，按久一點
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1000);
  await page.keyboard.up('ArrowUp');
  const p1 = await posOf(page);
  expect(p1.x - p0.x).toBeGreaterThan(0.3);
  expect(Math.abs(p1.x - p0.x)).toBeGreaterThan(Math.abs(p1.z - p0.z));

  // Q 左轉（yaw 變大）、E 右轉（yaw 變小）；軟體 WebGL 每秒畫的格數少，按久一點
  const beforeQ = (await orbitOf(page)).yaw;
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyQ');
  const afterQ = (await orbitOf(page)).yaw;
  expect(afterQ).toBeGreaterThan(beforeQ + 0.1);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyE');
  expect((await orbitOf(page)).yaw).toBeLessThan(afterQ - 0.1);

  // 點一下地面（沒拖動）：走過去
  await page.waitForTimeout(800);
  const want = { x: p1.x + 2, z: p1.z + 2 };
  const pt = await page.evaluate((w) => (window as any).__game.scene.project(w.x, 0, w.z), want);
  await page.mouse.click(pt.x, pt.y);
  await expect
    .poll(async () => {
      const t = await page.evaluate(() => (window as any).__game.player.target);
      return t ? Math.hypot(t.x - want.x, t.z - want.z) : 99;
    })
    .toBeLessThan(0.6);

  // 🧭 回正
  await page.getByTestId('cam-reset').click();
  expect((await orbitOf(page)).yaw).toBe(0);
  await expect(page.getByTestId('cam-reset')).toHaveCount(0);

  // 進屋、出屋自動回正
  await page.evaluate(() => (window as any).__game.orbit.setYaw(1.2));
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.teleport(g.home.door());
  });
  await page.getByTestId('enter-home').click();
  await expect.poll(() => page.evaluate(() => (window as any).__game.home.store.getState().inside)).toBe('mine');
  expect((await orbitOf(page)).yaw).toBe(0);
  await page.evaluate(() => (window as any).__game.orbit.setYaw(-1));
  await page.evaluate(() => (window as any).__game.home.leave());
  await expect.poll(() => page.evaluate(() => (window as any).__game.home.store.getState().inside)).toBeNull();
  expect((await orbitOf(page)).yaw).toBe(0);
  expect(errors).toEqual([]);
});

test('屋裡轉到後面或側面：擋住角色的那一面牆變半透明，轉回來恢復', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.teleport(g.home.door());
  });
  await page.getByTestId('enter-home').click();
  await expect.poll(() => page.evaluate(() => (window as any).__game.home.store.getState().inside)).toBe('mine');
  const faded = () => page.evaluate(() => (window as any).__game.scene.fadedWalls as string[]);
  // 走到房間後面（站在前面時轉到後面，鏡頭還在房間裡，沒有牆擋）
  await page.evaluate(() => (window as any).__game.teleport({ x: 0, z: -3 }));
  await page.waitForTimeout(800);
  expect(await faded()).toEqual([]);
  await page.evaluate(() => (window as any).__game.orbit.setYaw(Math.PI));
  await expect.poll(faded).toContain('back');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/02-room-back.png` });
  await page.evaluate(() => (window as any).__game.orbit.setYaw(Math.PI / 2));
  await expect.poll(faded).toEqual(['right']);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/03-room-side.png` });
  await page.evaluate(() => (window as any).__game.orbit.reset());
  await expect.poll(faded).toEqual([]);
  expect(errors).toEqual([]);
});

test('用家具：🎥 跟拍 → 近拍 → 第一人稱（鏡頭在角色的頭）；模式記住，溜滑梯第一人稱沿著滑道往下看', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page);
  const [bench, slide] = await placeYard(page, [
    { id: 'decor.bench', x: 6, z: 4 },
    { id: 'decor.slide', x: -3, z: 6 },
  ]);
  // 長椅：坐下
  await page.evaluate((c) => {
    const g = (window as any).__game;
    const w = g.yard.world(c.gx, c.gz);
    g.teleport({ x: w.x, z: w.z + 1.1 });
    g.player.heading = Math.PI;
  }, bench);
  await page.getByTestId('use-furniture').click();
  await expect.poll(() => page.evaluate(() => (window as any).__game.player.act?.kind ?? null)).toBe('sit');
  expect((await orbitOf(page)).view).toBe('follow');
  // 近拍：鏡頭離角色不到 6 公尺
  await page.getByTestId('cam-view').click();
  expect((await orbitOf(page)).view).toBe('close');
  const seat = await posOf(page);
  const distTo = async () => {
    const c = await camOf(page);
    return Math.hypot(c.x - seat.x, c.z - seat.z);
  };
  await expect.poll(distTo).toBeLessThan(6);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/04-close.png` });
  // 第一人稱：鏡頭就在角色的頭（水平距離不到 0.6 公尺，高度 1.6～2.6）
  await page.getByTestId('cam-view').click();
  expect((await orbitOf(page)).view).toBe('first');
  await expect.poll(distTo).toBeLessThan(0.6);
  const head = await camOf(page);
  expect(head.y).toBeGreaterThan(1.6);
  expect(head.y).toBeLessThan(2.6);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/05-first-bench.png` });
  // 起來：回到平常的鏡頭；模式記住
  await page.getByTestId('use-stop').click();
  await expect.poll(distTo).toBeGreaterThan(8);
  expect((await orbitOf(page)).view).toBe('first');

  // 溜滑梯（3×1，沿 +x 溜）：第一人稱，溜的時候鏡頭越來越低、往 +x 走
  await page.evaluate((c) => {
    const g = (window as any).__game;
    const w = g.yard.world(c.gx, c.gz);
    g.teleport({ x: w.x, z: w.z + 1.1 });
    g.player.heading = Math.PI;
  }, slide);
  await page.getByTestId('use-furniture').click();
  // 在頁面裡每一格記下溜的那一段（開始後 1.35～2.15 秒）的鏡頭位置，也看溜滑梯途中有沒有換視角的按鈕
  // （軟體 WebGL 慢，截圖或從外面抓時間都會錯過）
  const samples = await page.evaluate(
    () =>
      new Promise<{ t: number; x: number; y: number; button: boolean }[]>((resolve) => {
        const g = (window as any).__game;
        const out: { t: number; x: number; y: number; button: boolean }[] = [];
        const tick = () => {
          const act = g.player.act;
          if (!act) return resolve(out);
          const t = performance.now() / 1000 - act.t0;
          if (t >= 1.35 && t <= 2.15) out.push({ t, x: g.camera.position.x, y: g.camera.position.y, button: !!document.querySelector('[data-testid="cam-view"]') });
          if (t > 2.15) return resolve(out);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  expect(samples.length).toBeGreaterThanOrEqual(2);
  // 溜滑梯途中也能換視角（電腦版在卡片上）
  expect(samples.every((s) => s.button)).toBe(true);
  const [a, b] = [samples[0], samples[samples.length - 1]];
  expect(b.y).toBeLessThan(a.y);
  expect(b.x).toBeGreaterThan(a.x);
  await expect.poll(() => page.evaluate(() => (window as any).__game.player.act), { timeout: 5000 }).toBeNull();
  expect(errors).toEqual([]);
});

test('手機（觸控、直式）：左半邊拖曳不轉、右半邊拖曳會轉；🧭 在右側直排圖示；點一下照樣走', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  try {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await freshStart(page);
    await page.evaluate(() => (window as any).__game.game.getState().updateSettings({ quality: 'low' }));
    await createKid(page);
    await page.evaluate(() => (window as any).__game.teleport({ x: 4, z: 6 }));
    await page.waitForTimeout(1200);
    // 左半邊（搖桿區）往右拖：不轉
    await drag(page, { x: 60, y: 200 }, { x: 180, y: 200 });
    expect((await orbitOf(page)).yaw).toBe(0);
    expect(await page.evaluate(() => (window as any).__game.player.target)).toBeNull();
    // 右半邊往左拖：視角往左轉（yaw 變大）
    await drag(page, { x: 340, y: 200 }, { x: 220, y: 200 });
    expect((await orbitOf(page)).yaw).toBeGreaterThan(0.6);
    await expect(page.getByTestId('hud-rail').getByTestId('cam-reset')).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/07-phone-turned.png` });
    // 點一下地面：走過去
    const p = await posOf(page);
    const want = { x: p.x + 1.5, z: p.z + 1.5 };
    const pt = await page.evaluate((w) => (window as any).__game.scene.project(w.x, 0, w.z), want);
    await page.mouse.click(pt.x, pt.y);
    await expect
      .poll(async () => {
        const t = await page.evaluate(() => (window as any).__game.player.target);
        return t ? Math.hypot(t.x - want.x, t.z - want.z) : 99;
      })
      .toBeLessThan(0.6);
    await page.getByTestId('cam-reset').click();
    expect((await orbitOf(page)).yaw).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close().catch(() => undefined);
  }
});
