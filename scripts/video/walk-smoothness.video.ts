/**
 * 錄影的檢查：假同學走路順不順（使用者 2026-10-12：圍著噴水池走的片段看起來很抖）。
 * 量畫面上一位同學（熊貓）的角色每一格走了多遠：
 * - 舊做法：腳本每 3 格才改一次位置 → 別人的角色用每秒 4.2 公尺追過去就停，一格走很多、下一格不動。
 * - 新做法：頁面裡每一次畫面更新都改位置（grand-rides.video.ts 的驅動器），一格 32 毫秒（剛好兩次畫面更新）→ 每一格走一樣多。
 * 角色的位置從場景裡找（有 1.6×1.6 圓形影子的群組，就是角色），比對他在即時連線狀態裡的位置。
 * 用法（PowerShell 7）：npx playwright test --config scripts/video/playwright.video.config.ts walk-smoothness
 */
import { expect, test, type Page } from '@playwright/test';
import { SERVER, createClassViaApi } from '../../e2e/onlineDevice';

let page: Page;

/** 熊貓同學的角色在場景裡的位置（離他在連線狀態裡的位置最近的角色群組） */
const pandaOnScreen = () =>
  page.evaluate(() => {
    const w = window as any;
    const m = w.__game.presence.getState().members['v-panda'];
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    w.__checkScene?.traverse((o: any) => {
      if (!o.isGroup) return;
      const shadow = o.children.find((c: any) => c.isMesh && c.geometry?.parameters?.width === 1.6);
      if (!shadow) return;
      const d = Math.hypot(o.position.x - m.x, o.position.z - m.z);
      if (d < bestD) {
        bestD = d;
        best = { x: o.position.x, z: o.position.z };
      }
    });
    return best as { x: number; z: number } | null;
  });

/**
 * 熊貓同學的角色裡，身體那一層（Avatar 的 body 群組）這一格的上下與左右搖擺
 * （走路時身體一蹦一蹦、左右搖擺；站著時接近 0）
 */
const pandaBody = () =>
  page.evaluate(() => {
    const w = window as any;
    const m = w.__game.presence.getState().members['v-panda'];
    let best: any = null;
    let bestD = Infinity;
    w.__checkScene?.traverse((o: any) => {
      if (!o.isGroup) return;
      if (!o.children.find((c: any) => c.isMesh && c.geometry?.parameters?.width === 1.6)) return;
      const d = Math.hypot(o.position.x - m.x, o.position.z - m.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    });
    // 角色群組 → PoseWrap 的樞軸 → 內層 → Avatar 的 root → body（RemotePlayers.tsx、PoseWrap.tsx、Avatar.tsx 的結構）
    const body = best?.children[0]?.children[0]?.children[0]?.children[0];
    return { sway: Math.abs(body?.rotation.z ?? 0), bob: body?.position.y ?? 0 };
  });

/** 照圓圈的路線算第 t 秒的位置（和錄影腳本的 plaza 一樣） */
const pathAt = (t: number) => {
  const a = 0.25 * t;
  return { x: Math.sin(a) * 4.6, z: -2.5 + Math.cos(a) * 4.0, heading: Math.atan2(4.6 * Math.cos(a), -4.0 * Math.sin(a)) };
};
const putPanda = (p: { x: number; z: number; heading: number }) =>
  page.evaluate((p) => {
    (window as any).__game.presence.setState((s: any) => ({
      members: { ...s.members, 'v-panda': { id: 'v-panda', nickname: 'v-panda', avatar: { animal: 'panda', color: '#5b5b6b', hat: null }, x: p.x, z: p.z, heading: p.heading, zone: null } },
    }));
  }, p);

/** 一串每格走的距離的平均與「最大／最小」比例（越接近 1 越平均） */
function stats(steps: number[]): { mean: number; min: number; max: number; still: number } {
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  return { mean, min: Math.min(...steps), max: Math.max(...steps), still: steps.filter((s) => s < 0.005).length };
}

test('假同學走路：每一格走的距離', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年一班');
  expect((await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } } })).ok()).toBe(true);
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 } });
  await context.addInitScript((url) => localStorage.setItem('learning-island-server-url', url), SERVER);
  page = await context.newPage();
  await page.clock.install();
  await page.goto('./');
  await page.evaluate(({ code }) => (window as any).__game.cloud.getState().login({ code, nickname: '阿寶', pin: '1111' }), { code: room.code });
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await expect.poll(() => page.evaluate(() => (window as any).__game.realtime.getState().status)).toBe('online');
  await page.waitForTimeout(1500);
  const t0 = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(t0 + 200);
  await page.evaluate(() => {
    const r = (window as any).__game.gl;
    const orig = r.render.bind(r);
    r.render = (scene: unknown, cam: unknown) => {
      (window as any).__checkScene = scene;
      return orig(scene, cam);
    };
  });
  await putPanda(pathAt(0));
  await page.clock.runFor(500);

  // 舊做法：每 3 格改一次位置
  const old: number[] = [];
  let prev = await pandaOnScreen();
  for (let i = 0; i < 60; i++) {
    if (i % 3 === 0) await putPanda(pathAt(1 + i / 30));
    await page.clock.runFor(i % 3 === 2 ? 34 : 33);
    const p = await pandaOnScreen();
    old.push(Math.hypot(p!.x - prev!.x, p!.z - prev!.z));
    prev = p;
  }

  // 新做法：頁面裡每一次畫面更新都改位置
  await page.evaluate(() => {
    const w = window as any;
    const start = performance.now() / 1000;
    w.__walkOn = true;
    const tick = () => {
      // 停下來的時候不再更新（走路動作的「站著」檢查用）
      if (!w.__walkOn) return;
      const t = 3 + performance.now() / 1000 - start;
      const a = 0.25 * t;
      w.__game.presence.setState((s: any) => ({
        members: {
          ...s.members,
          'v-panda': { ...s.members['v-panda'], x: Math.sin(a) * 4.6, z: -2.5 + Math.cos(a) * 4.0, heading: Math.atan2(4.6 * Math.cos(a), -4.0 * Math.sin(a)) },
        },
      }));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.clock.runFor(500);
  const neu: number[] = [];
  prev = await pandaOnScreen();
  for (let i = 0; i < 60; i++) {
    // 一格 32 毫秒：假時鐘的畫面更新（16 毫秒）剛好兩次（錄影腳本的做法）
    await page.clock.runFor(32);
    const p = await pandaOnScreen();
    neu.push(Math.hypot(p!.x - prev!.x, p!.z - prev!.z));
    prev = p;
  }
  // 走路動作（docs/plans/grand-rides.md 第 11.3 節）：走路時身體一蹦一蹦、左右搖擺；停下來之後都回到 0
  const walkBody: { sway: number; bob: number }[] = [];
  for (let i = 0; i < 20; i++) {
    await page.clock.runFor(32);
    walkBody.push(await pandaBody());
  }
  // 停下來：頁面裡的位置更新停掉（同學停在最後的位置）
  await page.evaluate(() => ((window as any).__walkOn = false));
  await page.clock.runFor(600);
  const standBody: { sway: number; bob: number }[] = [];
  for (let i = 0; i < 20; i++) {
    await page.clock.runFor(32);
    standBody.push(await pandaBody());
  }
  console.log('走路時身體：最大搖擺', Math.max(...walkBody.map((x) => x.sway)).toFixed(3), '最高', Math.max(...walkBody.map((x) => x.bob)).toFixed(3));
  console.log('站著時身體：最大搖擺', Math.max(...standBody.map((x) => x.sway)).toFixed(3), '最高', Math.max(...standBody.map((x) => x.bob)).toFixed(3));
  expect(Math.max(...walkBody.map((x) => x.sway))).toBeGreaterThan(0.05);
  expect(Math.max(...walkBody.map((x) => x.bob))).toBeGreaterThan(0.1);
  expect(Math.max(...standBody.map((x) => x.sway))).toBeLessThan(0.01);
  expect(Math.max(...standBody.map((x) => x.bob))).toBeLessThan(0.03);

  const a = stats(old);
  const b = stats(neu);
  console.log('舊做法（每 3 格）：每格平均', a.mean.toFixed(4), '最小', a.min.toFixed(4), '最大', a.max.toFixed(4), '不動的格數', a.still, '/ 60');
  console.log('新做法（每次更新）：每格平均', b.mean.toFixed(4), '最小', b.min.toFixed(4), '最大', b.max.toFixed(4), '不動的格數', b.still, '/ 60');
  console.log('舊做法前 12 格', old.slice(0, 12).map((s) => s.toFixed(3)).join(' '));
  console.log('新做法前 12 格', neu.slice(0, 12).map((s) => s.toFixed(3)).join(' '));
  // 新做法：每一格都在走（沒有停下來的格），每格走的距離差不多
  expect(b.still).toBe(0);
  expect(b.max / b.min).toBeLessThan(1.1);
  await context.close();
});
