/**
 * 動物角色 e2e：建立角色 → 進百寶屋 → 逐一點 12 種動物。
 * 每點一種就等 3D 角色更新、截圖到 e2e/screenshots/animals/<id>.png（人工檢查辨識度用，目錄不進版控），
 * 並確認存檔的 animal 有改、頁面沒有 pageerror。
 * 截圖時用 camera.setViewOffset 把鏡頭裁切放大到角色身上（遊戲鏡頭離角色很遠，直接截圖只有約 80 像素高）。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, enterZone, freshStart } from './helpers';

/** 12 種動物：id 與選單按鈕的名稱（aria-label） */
const ANIMALS = [
  { id: 'bear', name: '小熊' },
  { id: 'rabbit', name: '小兔' },
  { id: 'cat', name: '小貓' },
  { id: 'dog', name: '小狗' },
  { id: 'capybara', name: '卡皮巴拉' },
  { id: 'panda', name: '熊貓' },
  { id: 'penguin', name: '企鵝' },
  { id: 'fox', name: '狐狸' },
  { id: 'koala', name: '無尾熊' },
  { id: 'pig', name: '小豬' },
  { id: 'eagle', name: '老鷹' },
  { id: 'elephant', name: '大象' },
];

const SHOT_DIR = 'e2e/screenshots/animals';

/** 目前使用中角色存檔裡的動物 id */
async function savedAnimal(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as any).__game.game.getState().profile()?.avatar.animal);
}

/**
 * 把鏡頭裁切放大到角色身上：先算出角色（站在 player.pos、取 1 公尺高處）的螢幕位置，
 * 再用 setViewOffset 取其周圍 1/4 大小的範圍放大顯示，並讓角色落在畫面左側（右側有百寶屋面板）。
 */
async function zoomCameraOnPlayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    const cam = g.camera;
    const el = g.gl.domElement as HTMLCanvasElement;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const p = g.player.pos;
    const v = cam.matrixWorldInverse.elements;
    const m = cam.projectionMatrix.elements;
    // 世界座標 → 視圖座標 → 裁切座標（three 的矩陣是 column-major）
    const vx = v[0] * p.x + v[4] * 1 + v[8] * p.z + v[12];
    const vy = v[1] * p.x + v[5] * 1 + v[9] * p.z + v[13];
    const vz = v[2] * p.x + v[6] * 1 + v[10] * p.z + v[14];
    const cx = m[0] * vx + m[4] * vy + m[8] * vz + m[12];
    const cy = m[1] * vx + m[5] * vy + m[9] * vz + m[13];
    const cw = m[3] * vx + m[7] * vy + m[11] * vz + m[15];
    const px = ((cx / cw) * 0.5 + 0.5) * W;
    const py = (1 - ((cy / cw) * 0.5 + 0.5)) * H;
    const w = W / 4;
    const h = H / 4;
    cam.setViewOffset(W, H, px - 0.28 * w, py - 0.5 * h, w, h);
  });
}

/** 角色轉到指定朝向（弧度，0 = 正面朝鏡頭），等幾個影格後截圖到 <name>.png */
async function shoot(page: Page, name: string, heading: number): Promise<void> {
  await page.evaluate((h) => ((window as any).__game.player.heading = h), heading);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, clip: { x: 0, y: 0, width: 640, height: 800 } });
}

/** 正面截一張（<name>.png）、四分之三側面再截一張（<name>-side.png），看耳朵、鼻子、尾巴的輪廓 */
async function shootBothAngles(page: Page, name: string): Promise<void> {
  await shoot(page, name, 0);
  await shoot(page, `${name}-side`, 0.9);
}

test.describe('動物角色', () => {
  test('百寶屋逐一換 12 種動物：存檔會改、3D 會更新、沒有頁面錯誤', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await freshStart(page);
    await createKid(page);
    // 等鏡頭跟到角色身上再放大
    await page.waitForTimeout(2500);
    await zoomCameraOnPlayer(page);
    await enterZone(page, 'shop');

    for (const a of ANIMALS) {
      await page.getByRole('button', { name: a.name, exact: true }).click();
      await expect.poll(() => savedAnimal(page)).toBe(a.id);
      // 等 React 重新渲染 3D 角色並畫出幾個影格
      await page.waitForTimeout(900);
      await shootBothAngles(page, a.id);
    }
    expect(errors).toEqual([]);
  });

  test('戴帽子時 12 種動物都能正常顯示（截圖檢查帽子位置）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await freshStart(page);
    await createKid(page);
    await page.waitForTimeout(2500);
    await zoomCameraOnPlayer(page);
    await enterZone(page, 'shop');

    for (const a of ANIMALS) {
      await page.evaluate(
        ({ id }) => {
          const game = (window as any).__game.game.getState();
          const avatar = game.profile().avatar;
          game.updateAvatar({ ...avatar, animal: id, hat: 'hat.party' });
        },
        { id: a.id },
      );
      await expect.poll(() => savedAnimal(page)).toBe(a.id);
      await page.waitForTimeout(900);
      await shootBothAngles(page, `hat-${a.id}`);
    }
    expect(errors).toEqual([]);
  });

  test('顏色變化：色彩相關的動物換成典型顏色後也要認得出來', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await freshStart(page);
    await createKid(page);
    await page.waitForTimeout(2500);
    await zoomCameraOnPlayer(page);
    await enterZone(page, 'shop');

    // 企鵝、熊貓、老鷹用深灰（ProfilesScreen 的 COLORS 之一）；狐狸用橘色；小豬用粉紅；無尾熊用灰
    const variants = [
      { id: 'penguin', color: '#5b5b6b' },
      { id: 'panda', color: '#5b5b6b' },
      { id: 'eagle', color: '#8b5a2b' },
      { id: 'fox', color: '#f2b36b' },
      { id: 'pig', color: '#ff9db0' },
      { id: 'koala', color: '#5b5b6b' },
      { id: 'elephant', color: '#5b5b6b' },
      { id: 'capybara', color: '#f2b36b' },
    ];
    for (const v of variants) {
      await page.evaluate(
        ({ id, color }) => {
          const game = (window as any).__game.game.getState();
          game.updateAvatar({ ...game.profile().avatar, animal: id, color });
        },
        v,
      );
      await expect.poll(() => savedAnimal(page)).toBe(v.id);
      await page.waitForTimeout(900);
      await shootBothAngles(page, `c-${v.id}`);
    }
    expect(errors).toEqual([]);
  });
});
