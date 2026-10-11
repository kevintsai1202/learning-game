/**
 * 佈置介面的手機版面檢查（使用者 2026-10-11 回饋：佈置時的指示太大，手機會遮擋）：
 * 用手機直式、橫式與電腦尺寸打開家具包、選一樣家具、走到旁邊家具的卡片，截圖並量出家具包、卡片、搖桿佔了畫面多少，
 * 以及角色在畫面上的位置有沒有被蓋住。截圖與數字在 e2e/screenshots/decor-mobile/（不進版控）。
 * 只量不判斷（AUDIT 用）；改版面後再跑一次比較。
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createKid, freshStart } from './helpers';

const OUT = 'e2e/screenshots/decor-mobile';
mkdirSync(OUT, { recursive: true });

/** 檢查的尺寸（touch：觸控裝置，會出現搖桿） */
const DEVICES = [
  { name: 'iphone-390x844', width: 390, height: 844, touch: true },
  { name: 'android-360x740', width: 360, height: 740, touch: true },
  { name: 'landscape-844x390', width: 844, height: 390, touch: true },
  { name: 'desktop-1280x800', width: 1280, height: 800, touch: false },
];

/** 某個元素的方框（沒有是 null） */
async function boxOf(page: Page, testid: string) {
  const el = page.getByTestId(testid).first();
  if (!(await el.count())) return null;
  return el.boundingBox();
}

/** 角色在畫面上的位置（頭頂與腳底） */
async function avatarOnScreen(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).__game;
    const p = g.player.pos;
    const feet = g.scene.project(p.x, 0, p.z);
    const head = g.scene.project(p.x, 2, p.z);
    return { feet, head };
  });
}

for (const dev of DEVICES) {
  test(`佈置介面版面：${dev.name}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: dev.width, height: dev.height }, hasTouch: dev.touch, isMobile: dev.touch });
    const page = await context.newPage();
    try {
      await freshStart(page);
      await createKid(page);
      // 給幾樣家具，在廣場東南邊放一張長椅
      await page.evaluate(() => {
        const g = (window as any).__game;
        const ids = ['decor.bench', 'decor.bench', 'decor.fence', 'decor.tree', 'decor.swing', 'decor.slide', 'decor.lamp', 'decor.picnic'];
        g.game.setState((st: any) => ({
          save: { ...st.save, profiles: st.save.profiles.map((p: any) => (p.id === st.save.activeProfileId ? { ...p, inventory: [...p.inventory, ...ids] } : p)) },
        }));
      });
      const cell = await page.evaluate(() => {
        const g = (window as any).__game;
        const all: { gx: number; gz: number }[] = g.yard.cells();
        return all.map((c) => ({ c, d: Math.hypot(g.yard.world(c.gx, c.gz).x - 8, g.yard.world(c.gx, c.gz).z - 5) })).sort((a, b) => a.d - b.d)[0].c;
      });
      const report: Record<string, unknown> = { device: dev };
      // ① 家具包打開、選著長椅、面前一格
      await page.getByTestId('hud-decor').click();
      await page.getByTestId('decor-pick-decor.bench').click();
      await page.evaluate((c) => {
        const g = (window as any).__game;
        const w = g.yard.world(c.gx, c.gz);
        g.teleport({ x: w.x, z: w.z + 1.2 });
        g.player.heading = Math.PI;
      }, cell);
      await page.waitForTimeout(1500);
      report.bag = await boxOf(page, 'decor-bag');
      report.joystick = await page.locator('.joystick').first().boundingBox().catch(() => null);
      report.avatarPicking = await avatarOnScreen(page);
      await page.screenshot({ path: `${OUT}/${dev.name}-1-picking.png` });
      // ② 放下後走到旁邊：旁邊家具的卡片（家具包還開著）
      await page.getByTestId('decor-place').click();
      await page.getByTestId('decor-pick-decor.bench').click();
      await page.waitForTimeout(800);
      report.nearOverBag = await boxOf(page, 'decor-near');
      await page.screenshot({ path: `${OUT}/${dev.name}-2-near-over-bag.png` });
      // ③ 關上家具包，只有旁邊家具的卡片
      await page.getByTestId('decor-close').click();
      await page.waitForTimeout(800);
      report.near = await boxOf(page, 'decor-near');
      report.avatarNear = await avatarOnScreen(page);
      await page.screenshot({ path: `${OUT}/${dev.name}-3-near.png` });
      // 佔畫面的比例
      const area = (b: any) => (b ? Math.round(((b.width * b.height) / (dev.width * dev.height)) * 100) : 0);
      report.bagPercent = area(report.bag);
      report.nearPercent = area(report.near);
      writeFileSync(`${OUT}/${dev.name}.json`, JSON.stringify(report, null, 2));
      expect(report.bag).not.toBeNull();
    } finally {
      await context.close().catch(() => undefined);
    }
  });
}
