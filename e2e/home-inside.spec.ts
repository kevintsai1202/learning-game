/**
 * 自己的家第二期：進屋（docs/plans/home.md 第 8 節）。單機：走到小屋門口「進去」、點小屋走過去自動進屋、
 * 屋裡的房間（壁紙地板、室內家具）、腳踏墊「回到島上」、往前走出去也回到島上。
 * 截圖在 e2e/screenshots/home-inside/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, freshStart } from './helpers';

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
