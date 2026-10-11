/**
 * 手機的島上介面（自己的家第 10.2 節，docs/plans/home.md）：上方一行、所在地小標籤、右側直排圖示、右下大動作鍵。
 * 一台觸控裝置（班級帳號），換三種手機尺寸檢查：
 * - 上方一行不超過 64px 高；所有介面元素都在畫面內；右側圖示靠右（x ≥ 畫面寬 × 0.8，橫式另算）。
 * - 角色在畫面中間一帶，腳的位置沒有被任何介面蓋住。
 * - 站到建築門口：「進去」在右下、不壓到搖桿；「☰」打開才有獎章簿、家長專區。
 * - 自己的島佈置中：「放下」只有一個（在大動作鍵），家具包條不壓到大動作鍵。
 * 截圖在 e2e/screenshots/hud-mobile/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, openDevice, pageErrors } from './onlineDevice';

const OUT = 'e2e/screenshots/hud-mobile';
mkdirSync(OUT, { recursive: true });

/** 檢查的手機尺寸 */
const SIZES: [number, number][] = [
  [390, 844],
  [360, 740],
  [844, 390],
];

type Box = { x: number; y: number; width: number; height: number };
/** 兩個方框有沒有重疊 */
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 看得到的介面元素裡，超出畫面左右的（回傳描述） */
async function offscreen(page: Page, w: number): Promise<string[]> {
  return page.evaluate((w) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('.hud-chip, .btn, .action-caption, .decor-bag, .chat-panel')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < -1 || r.right > w + 1) out.push(`${el.className} ${(el.textContent ?? '').slice(0, 12)} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
    }
    return out;
  }, w);
}

/** 角色的腳在畫面上的位置，以及那個點上面最上層的是不是 3D 畫布（沒有被介面蓋住） */
async function avatarFeet(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).__game;
    const p = g.player.pos;
    const feet = g.scene.project(p.x, 0.3, p.z);
    const top = document.elementFromPoint(feet.x, feet.y);
    return { feet, onCanvas: top?.tagName === 'CANVAS' };
  });
}

test('手機的島上介面：上方一行、右側直排圖示、右下大動作鍵、☰ 選單；佈置中只有一個「放下」', async ({ browser, baseURL, request }) => {
  test.setTimeout(400_000);
  const room = await createClassViaApi(request, '二年九班');
  const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '皮皮', pin: '3333', avatar: { animal: 'penguin', color: '#5b5b6b', hat: null } } });
  expect(res.ok()).toBe(true);
  const { context, page } = await openDevice(browser, baseURL!, { touch: true });
  try {
    await loginAndEnter(page, room.code, '皮皮', '3333');
    for (const [w, h] of SIZES) {
      const where = `${w}x${h}`;
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => (window as any).__game.teleport({ x: 0, z: 13 }));
      await page.waitForTimeout(1200);
      // 上方一行與右側圖示
      const top = (await page.locator('.phone-top').boundingBox())!;
      expect.soft(top.height, `${where} 上方一行的高度`).toBeLessThanOrEqual(64);
      const rail = (await page.getByTestId('hud-rail').boundingBox())!;
      expect.soft(rail.x, `${where} 右側圖示靠右`).toBeGreaterThanOrEqual(w * (w > h ? 0.85 : 0.75));
      // 右側圖示上下置中；每個圖示的字都在圖示裡面（使用者 2026-10-11：沒正中、字跑出去）
      expect.soft(Math.abs(rail.y + rail.height / 2 - h / 2), `${where} 右側圖示沒有上下置中`).toBeLessThanOrEqual(h * 0.06);
      const spill = await page.evaluate(() =>
        [...document.querySelectorAll('.hud-rail .hud-chip')].flatMap((chip) => {
          const c = chip.getBoundingClientRect();
          const t = chip.querySelector('.chip-text');
          if (!t) return [];
          const r = t.getBoundingClientRect();
          // 橫式手機的直排圖示不寫字（沒有大小）
          if (r.width === 0) return [];
          return r.left < c.left - 1 || r.right > c.right + 1 || t.scrollWidth > t.clientWidth + 1 ? [`${chip.textContent} [${Math.round(r.left)}..${Math.round(r.right)}] in [${Math.round(c.left)}..${Math.round(c.right)}] sw=${t.scrollWidth} cw=${t.clientWidth}`] : [];
        }),
      );
      expect.soft(spill, `${where} 圖示的字跑出圖示`).toEqual([]);
      expect.soft(await offscreen(page, w), `${where} 超出畫面的元素`).toEqual([]);
      // 角色在中間一帶、腳沒有被介面蓋住
      const feet = await avatarFeet(page);
      expect.soft(feet.feet.x, `${where} 角色在中間`).toBeGreaterThan(w * 0.25);
      expect.soft(feet.feet.x, `${where} 角色在中間`).toBeLessThan(w * 0.75);
      expect.soft(feet.onCanvas, `${where} 角色的腳被介面蓋住`).toBe(true);
      await page.screenshot({ path: `${OUT}/${where}-1-island.png` });
      // ☰ 選單：打開才有獎章簿、家長專區
      await expect.soft(page.getByTestId('hud-badges')).toHaveCount(0);
      await page.getByTestId('hud-menu').click();
      await expect.soft(page.getByTestId('hud-badges')).toBeVisible();
      await expect.soft(page.getByTestId('hud-parent')).toBeVisible();
      await page.getByTestId('hud-menu').click();
      // 公頻：收成一顆圖示，點了打開（在畫面內）
      await page.getByTestId('chat-toggle').click();
      const chat = (await page.getByTestId('chat-panel').boundingBox())!;
      expect.soft(chat.x, `${where} 公頻左邊超出`).toBeGreaterThanOrEqual(0);
      expect.soft(chat.y + chat.height, `${where} 公頻下面超出`).toBeLessThanOrEqual(h);
      await page.screenshot({ path: `${OUT}/${where}-2-chat.png` });
      await page.getByTestId('chat-toggle').click();
      // 數學城堡門口：右下大動作鍵「進去」，不壓到搖桿
      await page.evaluate(() => {
        const g = (window as any).__game;
        const DOOR = { x: -11 + Math.sin(0.45) * 5.4, z: -10 + Math.cos(0.45) * 5.4 };
        g.teleport(DOOR);
      });
      await expect(page.getByTestId('door-bubble')).toBeVisible();
      const key = (await page.getByTestId('enter-zone').boundingBox())!;
      const joy = (await page.locator('.joystick').boundingBox())!;
      expect.soft(overlaps(key, joy), `${where} 動作鍵壓到搖桿`).toBe(false);
      expect.soft(key.x + key.width, `${where} 動作鍵在右邊`).toBeGreaterThan(w * 0.75);
      expect.soft(key.y + key.height, `${where} 動作鍵在下面`).toBeGreaterThan(h * 0.6);
      await page.screenshot({ path: `${OUT}/${where}-3-door.png` });
    }

    // 自己的島佈置中（直式）：「放下」只有一個，家具包條不壓到大動作鍵
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('hud-island').click();
    await expect.poll(() => page.evaluate(() => (window as any).__game.realtime.getState().island)).toBe('own');
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.game.setState((st: any) => ({
        save: { ...st.save, profiles: st.save.profiles.map((p: any) => (p.id === st.save.activeProfileId ? { ...p, inventory: [...p.inventory, 'decor.bench', 'decor.fence'] } : p)) },
      }));
    });
    await page.getByTestId('hud-decor').click();
    // 家具包打開時直排圖示收起來
    await expect(page.getByTestId('hud-rail')).toBeHidden();
    await page.getByTestId('decor-pick-decor.bench').click();
    const cell = await page.evaluate(() => {
      const g = (window as any).__game;
      const all: { gx: number; gz: number }[] = g.yard.cells();
      const c = all.map((c) => ({ c, d: Math.hypot(g.yard.world(c.gx, c.gz).x - 8, g.yard.world(c.gx, c.gz).z - 5) })).sort((a, b) => a.d - b.d)[0].c;
      const w = g.yard.world(c.gx, c.gz);
      g.teleport({ x: w.x, z: w.z + 1.2 });
      g.player.heading = Math.PI;
      return c;
    });
    await expect(page.getByTestId('decor-place')).toHaveCount(1);
    await expect(page.getByTestId('decor-ghost-rotate')).toHaveCount(1);
    await page.waitForTimeout(1200);
    const bag = (await page.getByTestId('decor-bag').boundingBox())!;
    const place = (await page.locator('.action-row').boundingBox())!;
    expect.soft(overlaps(bag, place), '家具包條壓到大動作鍵').toBe(false);
    expect.soft((await avatarFeet(page)).onCanvas, '佈置中角色的腳被介面蓋住').toBe(true);
    await page.screenshot({ path: `${OUT}/390x844-4-picking.png` });
    // 橫式手機佈置中：家具包條在最下面，右邊讓出大動作鍵
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(800);
    const bagL = (await page.getByTestId('decor-bag').boundingBox())!;
    // 大動作鍵整組（大鍵與旁邊的小圓鈕）
    const keyL = (await page.locator('.action-row').boundingBox())!;
    expect.soft(overlaps(bagL, keyL), `橫式：家具包條壓到大動作鍵：${JSON.stringify({ bagL, keyL })}`).toBe(false);
    await page.screenshot({ path: `${OUT}/844x390-4-picking.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.getByTestId('decor-place').click();
    await expect.poll(() => page.evaluate(() => (window as any).__game.game.getState().profile().yard?.length ?? 0)).toBe(1);
    // 走到長椅旁邊：大動作鍵「坐下」，旁邊轉方向、收起來
    await page.getByTestId('decor-close').click();
    await page.evaluate((c) => {
      const g = (window as any).__game;
      const w = g.yard.world(c.gx, c.gz);
      g.teleport({ x: w.x, z: w.z + 1.2 });
    }, cell);
    await expect(page.getByTestId('use-furniture')).toContainText('坐下');
    await expect(page.getByTestId('decor-near-rotate')).toBeVisible();
    await expect(page.getByTestId('decor-near-pickup')).toBeVisible();
    await page.screenshot({ path: `${OUT}/390x844-5-near.png` });
    expect(pageErrors(page)).toEqual([]);
  } finally {
    await context.close().catch(() => undefined);
  }
});
