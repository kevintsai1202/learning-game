/**
 * 外觀道具 e2e（R2）：新帽子、眼鏡、背後、手持道具的 3D 位置檢查。
 * 每個道具戴在 bear、capybara、penguin、elephant 四隻動物上，各截正面與側面，
 * 組成一張對照圖放到 e2e/screenshots/accessories/<道具 id>.png（人工逐張檢查位置用，目錄不進版控）；
 * 另外有帽子在 12 種動物上的對照圖，以及全身戴滿的對照圖。每個測試都檢查沒有 pageerror。
 * 畫面只畫「真的擁有」的道具：金幣道具先用 purchase(id, 0) 買下，獎章專屬道具先給獎章。
 * 鏡頭用 camera.setViewOffset 放大到角色身上（做法同 animals.spec.ts）。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, enterZone, freshStart } from './helpers';
import { findItem } from '../src/store/catalog';

const SHOT_DIR = 'e2e/screenshots/accessories';

/** 12 種動物 id */
const ALL_ANIMALS = ['bear', 'rabbit', 'cat', 'dog', 'capybara', 'panda', 'penguin', 'fox', 'koala', 'pig', 'eagle', 'elephant'];
/** 道具逐一檢查用的四隻代表動物（身體結構差最多） */
const FOUR = ['bear', 'capybara', 'penguin', 'elephant'];

/** 把鏡頭裁切放大到角色身上，角色落在畫面左側（做法同 animals.spec.ts） */
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

/** 建立角色、讓角色擁有全部要測的道具（獎章專屬的靠獎章）、放大鏡頭 */
async function setup(page: Page, ids: string[]): Promise<void> {
  await freshStart(page);
  await createKid(page);
  await page.waitForTimeout(2500);
  await zoomCameraOnPlayer(page);
  await enterZone(page, 'shop');
  const priced = ids.filter((id) => findItem(id)?.price !== undefined);
  await page.evaluate((list) => {
    const game = (window as any).__game.game.getState();
    for (const id of list) game.purchase(id, 0);
    const today = '2026-10-03';
    const badges = Object.fromEntries(['tower-hero', 'all-subjects', 'wrong-50', 'correct-1000', 'correct-100', 'write-100'].map((b) => [b, today]));
    game.putProfile({ ...game.profile(), badges: { ...(game.profile().badges ?? {}), ...badges } });
  }, priced);
}

/** 設定外觀（沒指定的格子清空），等 3D 更新後依朝向截角色周圍，回傳 PNG */
async function shot(page: Page, avatar: { animal: string; hat?: string; face?: string; back?: string; hand?: string }, heading: number): Promise<Buffer> {
  await page.evaluate(
    ({ a, h }) => {
      const game = (window as any).__game.game.getState();
      const base = game.profile().avatar;
      game.updateAvatar({ ...base, animal: a.animal, hat: a.hat ?? null, face: a.face ?? null, back: a.back ?? null, hand: a.hand ?? null });
      (window as any).__game.player.heading = h;
    },
    { a: avatar, h: heading },
  );
  await page.waitForTimeout(450);
  return page.screenshot({ clip: { x: 90, y: 120, width: 500, height: 470 } });
}

/** 把一批截圖拼成一張對照圖（每格上方標註文字），存到 SHOT_DIR/<name>.png */
async function montage(page: Page, name: string, cells: { label: string; png: Buffer }[], cols: number): Promise<void> {
  const html = `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(${cols},500px);font:14px sans-serif">${cells
    .map((c) => `<div style="position:relative;height:470px"><img src="data:image/png;base64,${c.png.toString('base64')}"><span style="position:absolute;left:6px;top:4px;background:#fffd;padding:1px 5px">${c.label}</span></div>`)
    .join('')}</body>`;
  const m = await page.context().newPage();
  await m.setViewportSize({ width: 500 * cols, height: 470 * Math.ceil(cells.length / cols) });
  await m.setContent(html);
  await m.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  await m.close();
}

/** 單一道具：四隻動物各正面（0）與側面（0.9）；第一列正面、第二列側面 */
async function checkItem(page: Page, slot: 'hat' | 'face' | 'back' | 'hand', id: string): Promise<void> {
  // 環境變數 ONLY（逗號分隔的道具 id）可以只重截指定道具
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) return;
  const cells: { label: string; png: Buffer }[] = [];
  for (const view of [0, 0.9]) {
    for (const animal of FOUR) {
      cells.push({ label: `${id} ${animal} ${view === 0 ? '正面' : '側面'}`, png: await shot(page, { animal, [slot]: id }, view) });
    }
  }
  await montage(page, id, cells, FOUR.length);
}

const HAT_IDS = ['hat.bunny', 'hat.dino', 'hat.pirate', 'hat.explorer', 'hat.hero-helmet', 'hat.scholar'];
const FACE_IDS = ['face.round', 'face.sun', 'face.heart'];
const BACK_IDS = ['back.bag', 'back.cape', 'back.wings', 'back.gold-cape'];
const HAND_IDS = ['hand.flag', 'hand.balloon', 'hand.sunflower', 'hand.star-wand', 'hand.brush'];
const ALL_IDS = [...HAT_IDS, ...FACE_IDS, ...BACK_IDS, ...HAND_IDS];

test.describe('外觀道具', () => {
  // 軟體 WebGL 下每張截圖約 5 秒，一個測試要截幾十張
  test.describe.configure({ timeout: 1_500_000 });

  test('新帽子戴在四隻動物上（正面、側面）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page, ALL_IDS);
    for (const id of HAT_IDS) await checkItem(page, 'hat', id);
    expect(errors).toEqual([]);
  });

  test('眼鏡戴在四隻動物上（正面、側面）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page, ALL_IDS);
    for (const id of FACE_IDS) await checkItem(page, 'face', id);
    expect(errors).toEqual([]);
  });

  test('背後道具戴在四隻動物上（正面、側面）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page, ALL_IDS);
    for (const id of BACK_IDS) {
      if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) continue;
      // 背後道具再多截一排背面（鏡頭平常在角色背後）
      const cells: { label: string; png: Buffer }[] = [];
      for (const [view, vn] of [[0.9, '側面'], [Math.PI, '背面']] as const) {
        for (const animal of FOUR) cells.push({ label: `${id} ${animal} ${vn}`, png: await shot(page, { animal, back: id }, view) });
      }
      await montage(page, id, cells, FOUR.length);
    }
    expect(errors).toEqual([]);
  });

  test('手持道具戴在四隻動物上（正面、側面）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page, ALL_IDS);
    for (const id of HAND_IDS) await checkItem(page, 'hand', id);
    expect(errors).toEqual([]);
  });

  test('全身戴滿（帽子＋眼鏡＋背後＋手持）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setup(page, ALL_IDS);
    const sets = [
      { hat: 'hat.explorer', face: 'face.sun', back: 'back.cape', hand: 'hand.flag' },
      { hat: 'hat.hero-helmet', face: 'face.heart', back: 'back.wings', hand: 'hand.sunflower' },
    ];
    for (const [i, set] of sets.entries()) {
      const cells: { label: string; png: Buffer }[] = [];
      for (const [view, vn] of [[0, '正面'], [Math.PI, '背面']] as const) {
        for (const animal of FOUR) cells.push({ label: `套組${i + 1} ${animal} ${vn}`, png: await shot(page, { animal, ...set }, view) });
      }
      await montage(page, `full-set-${i + 1}`, cells, FOUR.length);
    }
    expect(errors).toEqual([]);
  });
});
