/**
 * 寵物與走路特效（R3）：百寶屋買寵物、帶著走；獎章寵物鎖住、點了到獎章簿；
 * 每種寵物跟在角色旁邊截圖；走路特效只在走路時出現。截圖在 e2e/screenshots/pets/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, enterZone, freshStart, screen } from './helpers';

const OUT = 'e2e/screenshots/pets';

/** 讓目前角色擁有道具（金幣道具用 0 金幣買；獎章道具給對應獎章）並戴上 */
async function equip(page: Page, slot: 'pet' | 'trail', id: string | null): Promise<void> {
  await page.evaluate(
    ({ slot, id }) => {
      const game = (window as any).__game.game.getState();
      if (id) {
        game.purchase(id, 0);
        const p = game.profile();
        game.putProfile({ ...p, badges: { ...(p.badges ?? {}), 'streak-7': '2026-10-03', 'skill-master': '2026-10-03' } });
      }
      game.updateAvatar({ ...game.profile().avatar, [slot]: id });
    },
    { slot, id },
  );
}

/** 鏡頭放大到角色周圍（寵物在 1.3 公尺內，取畫面 1/3 的範圍） */
async function zoomOnPlayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    const cam = g.camera;
    const el = g.gl.domElement as HTMLCanvasElement;
    const W = el.clientWidth;
    const H = el.clientHeight;
    cam.clearViewOffset();
    cam.updateMatrixWorld();
    const v = new (cam.position.constructor)(g.player.pos.x, 1, g.player.pos.z).project(cam);
    const px = (v.x * 0.5 + 0.5) * W;
    const py = (1 - (v.y * 0.5 + 0.5)) * H;
    const w = W / 3;
    const h = H / 3;
    cam.setViewOffset(W, H, px - w / 2, py - h / 2, w, h);
  });
}

test('百寶屋買寵物、帶著走；獎章寵物鎖住，點了到獎章簿', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page, '小安');
  // 給一些金幣
  await page.evaluate(() => {
    const game = (window as any).__game.game.getState();
    game.putProfile({ ...game.profile(), coins: 500 });
  });
  await enterZone(page, 'shop');
  await page.getByTestId('shop-tab-pet').click();
  await page.getByTestId('buy-pet.chick').click();
  await expect(page.getByTestId('wear-pet.chick')).toHaveText('休息');
  await expect.poll(() => page.evaluate(() => (window as any).__game.game.getState().profile().avatar.pet)).toBe('pet.chick');
  await expect.poll(() => page.evaluate(() => (window as any).__game.game.getState().profile().coins)).toBe(440);
  await page.screenshot({ path: `${OUT}/01-shop-pets.png` });
  // 獎章寵物：鎖住，點了到獎章簿
  await page.getByTestId('locked-pet.owl').click();
  await expect.poll(() => screen(page)).toBe('badges');
  expect(errors).toEqual([]);
});

test('每種寵物跟在角色旁邊；走路特效只在走路時出現', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await createKid(page, '小安');
  await page.waitForTimeout(2000);

  for (const pet of ['pet.chick', 'pet.butterfly', 'pet.fishbowl', 'pet.dino', 'pet.dragon', 'pet.owl']) {
    await equip(page, 'pet', pet);
    await page.waitForTimeout(1200);
    await zoomOnPlayer(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/pet-${pet.slice(4)}.png` });
  }

  // 走路特效：開小花腳印、往前走一段，邊走邊截圖
  await equip(page, 'pet', 'pet.chick');
  for (const trail of ['trail.flowers', 'trail.stars']) {
    await equip(page, 'trail', trail);
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.teleport({ x: 0, z: 12 });
      g.player.target = { x: 0, z: 4 };
    });
    await page.waitForTimeout(1100);
    await zoomOnPlayer(page);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/trail-${trail.slice(6)}.png` });
  }
  await page.evaluate(() => (window as any).__game.camera.clearViewOffset());
  expect(errors).toEqual([]);
});
