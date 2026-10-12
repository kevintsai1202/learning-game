/**
 * 介紹影片的錄影：一個孩子在班級島上玩三樣大型設施（雲霄飛車、巨大摩天輪、環島飛船），同學們一起坐
 * （docs/plans/grand-rides.md）。一格一格錄成 JPEG（video-out/frames/<鏡頭>/），之後由 scripts/video/edit.mjs 剪接配樂。
 * - 用 Playwright 的假時鐘：每一格往前推 32 毫秒再截圖（每秒 31.25 格），算圖再慢畫面也是順的；牆上的時間用 __game.grand.warp 撥到要拍的那一刻。
 *   假時鐘的畫面更新固定每 16 毫秒一次：一格 32 毫秒剛好兩次，每一格動的一樣多（每秒 30 格的 33.3 毫秒會有時兩次、有時三次，
 *   東西每隔幾格就多動一半，看起來一頓一頓的）。
 * - 同學是放進即時連線狀態的假成員（座位代碼 co、wh、sh），照本機的時鐘坐在列車、車廂、甲板上；名牌與畫面上的介面藏起來。
 * - 鏡頭長度照配樂的小節（一小節 1.792 秒＝56 格），剪接時直接接起來就對拍。
 * - 音效：錄影抓不到聲音，每一格記下遊戲算的音效排程（window.__game.rideAudio，src/store/rideSound.ts），
 *   存成 video-out/frames/<鏡頭>/cues.json，剪接時照這份紀錄把同一套音檔混成音效軌（scripts/video/edit.mjs）。
 * 用法（PowerShell 7）：npm run build; npx playwright test --config scripts/video/playwright.video.config.ts grand-rides
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { SERVER, createClassViaApi } from '../../e2e/onlineDevice';
import { COASTER_BOARD, MAST, SHIP, SHIP_CYCLE, WHEEL, coaster } from '../../src/store/grandRides';

/** 一格幾毫秒（假時鐘畫面更新 16 毫秒的兩倍）、每秒幾格、一小節幾秒（56 格）、輸出的資料夾 */
const FRAME_MS = 32;
const FPS = 1000 / FRAME_MS;
const BAR = 1.792;
const OUT = 'video-out/frames';

/** 假同學：動物、顏色、道具（名牌藏起來，暱稱只是識別用） */
const KIDS = [
  { id: 'v-panda', animal: 'panda', color: '#5b5b6b', gear: { face: 'face.round', hand: 'hand.balloon' } },
  { id: 'v-fox', animal: 'fox', color: '#f2b36b', gear: { hat: 'hat.pirate' } },
  { id: 'v-rabbit', animal: 'rabbit', color: '#f7c6d9', gear: {} },
  { id: 'v-penguin', animal: 'penguin', color: '#5b5b6b', gear: { back: 'back.cape' } },
  { id: 'v-koala', animal: 'koala', color: '#9aa4b2', gear: { hat: 'hat.scholar' } },
  { id: 'v-cat', animal: 'cat', color: '#ffb347', gear: {} },
  { id: 'v-dog', animal: 'dog', color: '#c28b55', gear: { back: 'back.wings' } },
  { id: 'v-pig', animal: 'pig', color: '#ffb6c1', gear: {} },
  { id: 'v-elephant', animal: 'elephant', color: '#a7b4c2', gear: {} },
  { id: 'v-bear', animal: 'bear', color: '#8b5a2b', gear: { hat: 'hat.crown' } },
  { id: 'v-eagle', animal: 'eagle', color: '#7a5230', gear: {} },
] as const;

let page: Page;

/** 把假同學全部放上島（位置、動作代碼）；act 沒給的站著 */
async function setKids(list: { x: number; z: number; heading?: number; act?: string }[]): Promise<void> {
  await page.evaluate(
    ({ kids, list }) => {
      const p = (window as any).__game.presence;
      p.setState((s: any) => {
        const members = { ...s.members };
        kids.forEach((k: any, i: number) => {
          const at = list[i];
          if (!at) {
            delete members[k.id];
            return;
          }
          members[k.id] = {
            id: k.id,
            nickname: k.id,
            avatar: { animal: k.animal, color: k.color, hat: null, ...k.gear },
            x: at.x,
            z: at.z,
            heading: at.heading ?? 0,
            zone: null,
            ...(at.act ? { act: at.act } : {}),
          };
        });
        return { members };
      });
    },
    { kids: KIDS, list },
  );
}

/** 現在的牆上時間（秒） */
const wall = () => page.evaluate(() => (window as any).__game.grand.wall() as number);
/** 把牆上的時間撥到 target（秒） */
async function warpTo(target: number): Promise<void> {
  const w = await wall();
  await page.evaluate((d) => (window as any).__game.grand.warp(d), target - w);
}
/** 視角模式、轉的角度、縮放倍率（滾輪：先拉到最近，再照 zoomByWheel 的算法拉到 target） */
const setView = (v: 'follow' | 'close' | 'first') => page.evaluate((x) => (window as any).__game.orbit.setView(x), v);
const setYaw = (y: number) => page.evaluate((x) => (window as any).__game.orbit.setYaw(x), y);
async function setZoom(target: number): Promise<void> {
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, -4000);
  await page.mouse.wheel(0, Math.log(target / 0.55) / 0.001);
}
/** 傳送到某處（鏡頭直接跳過去） */
async function placePlayer(x: number, z: number, heading: number): Promise<void> {
  await page.evaluate(
    ({ x, z, heading }) => {
      const g = (window as any).__game;
      g.teleport({ x, z });
      g.player.heading = heading;
      g.player.snapCamera = true;
    },
    { x, z, heading },
  );
}
/**
 * 雲藏起來或拿出來（雲在 16～22 公尺高，正好擋住雲霄飛車的頂端、摩天輪最高處、飛船的鏡頭）：
 * 找場景裡 9 個子物件都在那個高度的群組（Nature.tsx 的 Clouds）。回傳找到幾個
 */
const clouds = (visible: boolean) =>
  page.evaluate((v) => {
    const s = (window as any).__videoScene;
    let n = 0;
    s?.traverse((o: any) => {
      if (o.isGroup && o.children.length === 9 && o.children.every((c: any) => c.position.y >= 15.5 && c.position.y <= 22.5)) {
        o.visible = v;
        n++;
      }
    });
    return n;
  }, visible);
/**
 * 頁面裡的驅動器（每一次畫面更新都跑，照假時鐘的時間算）：假同學沿著路線走、鏡頭慢慢轉。
 * 以前在腳本這邊每 3 格才改一次同學的位置：別人的角色會用每秒 4.2 公尺追到新位置然後停下，
 * 變成「走兩下、停四下」，腳一擺一停、身體一晃一停，看起來很抖（使用者 2026-10-12）。
 * 現在每一次畫面更新都往前一點點，同學每一格走一樣多，一直是走路的樣子。
 * 路線：plaza 圍著噴水池繞圈（一半順時針、一半逆時針）；deck 在飛船甲板上的定點附近繞小圈（局部座標）
 */
async function installDriver(): Promise<void> {
  await page.evaluate((kids) => {
    const w = window as any;
    const d = (w.__videoDrive = { kids: null as any, yaw: null as any });
    /** 把一串位置寫進即時連線狀態的假成員 */
    const put = (list: { x: number; z: number; heading: number; act?: string }[]) =>
      w.__game.presence.setState((s: any) => {
        const members = { ...s.members };
        kids.forEach((k: any, i: number) => {
          const at = list[i];
          if (!at) {
            delete members[k.id];
            return;
          }
          members[k.id] = { id: k.id, nickname: k.id, avatar: { animal: k.animal, color: k.color, hat: null, ...k.gear }, x: at.x, z: at.z, heading: at.heading, zone: null, ...(at.act ? { act: at.act } : {}) };
        });
        return { members };
      });
    const tick = () => {
      const now = performance.now() / 1000;
      if (d.kids) {
        const t = now - d.kids.t0;
        if (d.kids.mode === 'plaza') {
          put(
            kids.map((_: unknown, k: number) => {
              const dir = k % 2 === 0 ? 1 : -1;
              const a = (k / kids.length) * Math.PI * 2 + 0.25 * dir * t;
              return { x: Math.sin(a) * 4.6, z: -2.5 + Math.cos(a) * 4.0, heading: Math.atan2(dir * 4.6 * Math.cos(a), -dir * 4.0 * Math.sin(a)) };
            }),
          );
        } else {
          put(
            d.kids.spots.map((p: { x: number; z: number }, k: number) => ({
              x: p.x + Math.sin(0.75 * t + k) * 0.6,
              z: p.z + Math.cos(0.6 * t + 2 * k) * 0.8,
              heading: Math.atan2(0.45 * Math.cos(0.75 * t + k), -0.48 * Math.sin(0.6 * t + 2 * k)),
              act: 'sh',
            })),
          );
        }
      }
      if (d.yaw) w.__game.orbit.setYaw(d.yaw.from + d.yaw.rate * (now - d.yaw.t0));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, KIDS as unknown as object[]);
}
/** 改驅動器：kids（plaza、deck 加定點、null 停）與 yaw（從哪個角度、每秒轉多少，null 停）；給了的才改，從現在開始算 */
async function drive(cfg: { kids?: { mode: 'plaza' } | { mode: 'deck'; spots: { x: number; z: number }[] } | null; yaw?: { from: number; rate: number } | null }): Promise<void> {
  await page.evaluate((c) => {
    const d = (window as any).__videoDrive;
    const now = performance.now() / 1000;
    if ('kids' in c) d.kids = c.kids ? { ...c.kids, t0: now } : null;
    if ('yaw' in c) d.yaw = c.yaw ? { ...c.yaw, t0: now } : null;
  }, cfg);
}
/** 讓畫面跑 ms 毫秒（不截圖，鏡頭追上） */
const settle = (ms: number) => page.clock.runFor(ms);

/**
 * 錄一個鏡頭：bars 小節長，每一格先做 each（第幾格），再往前推 1/30 秒、截圖。
 * 格數照小節算（剪接時直接接起來就對拍）
 */
async function shot(name: string, bars: number, each?: (i: number) => Promise<void>): Promise<void> {
  const dir = `${OUT}/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const n = Math.round(bars * BAR * FPS);
  /** 每一格的音效排程：循環的聲音（這一格最後一次的排程）與這一格響的一次的聲音 */
  const cues: { frame: number; loops: Record<string, { gain: number; rate: number }>; shots: { name: string; gain: number }[] }[] = [];
  // 鏡頭開始前（撥時間、站好位置）記到的不要
  await page.evaluate(() => (window as any).__game.rideAudio.drain());
  for (let i = 0; i < n; i++) {
    if (each) await each(i);
    await page.clock.runFor(FRAME_MS);
    const got = await page.evaluate(() => (window as any).__game.rideAudio.drain() as { wall: number; plan: { loops: Record<string, { gain: number; rate: number }>; shots: { name: string; gain: number }[] } }[]);
    const last = got.at(-1)?.plan.loops ?? cues.at(-1)?.loops ?? {};
    cues.push({ frame: i, loops: last, shots: got.flatMap((g) => g.plan.shots) });
    await page.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  }
  writeFileSync(`${dir}/cues.json`, JSON.stringify(cues));
  console.log(`鏡頭 ${name}：${n} 格，一次的聲音 ${cues.flatMap((c) => c.shots.map((s) => s.name)).join('、') || '（沒有）'}`);
}

test('錄影：班級島三樣大型設施', async ({ browser, baseURL, request }) => {
  test.setTimeout(3_600_000);
  // 班級、孩子（卡皮巴拉）、老師發 50 金幣
  const room = await createClassViaApi(request, '二年一班');
  const join = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } } });
  expect(join.ok()).toBe(true);
  const reward = await request.post(`${SERVER}/api/teacher/rooms/${room.code}/rewards`, { data: { to: 'all', coins: 50 }, headers: { authorization: `Bearer ${room.token}` } });
  expect(reward.ok()).toBe(true);

  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 } });
  await context.addInitScript((url) => localStorage.setItem('learning-island-server-url', url), SERVER);
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  // 假時鐘：一開始照常走（登入、連線），錄影時停住一格一格推
  await page.clock.install();
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.clear();
    (window as any).__game.game.getState().updateSettings({ quality: 'high' });
  });
  await page.reload();
  await expect(page.getByTestId('start')).toBeVisible();
  await page.evaluate(({ code }) => (window as any).__game.cloud.getState().login({ code, nickname: '阿寶', pin: '1111' }), { code: room.code });
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await expect.poll(() => page.evaluate(() => (window as any).__game.realtime.getState().grand)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__game.game.getState().profile().coins)).toBeGreaterThanOrEqual(50);
  const ok = page.getByTestId('reward-ok');
  await ok.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
  if (await ok.isVisible()) await ok.click();
  await page.waitForTimeout(1500);

  // 畫面上的介面與名牌藏起來（只留 3D 畫面）：畫布的祖先標 vkeep，其他都看不見
  await page.evaluate(() => {
    let el: Element | null = document.querySelector('canvas');
    while (el) {
      el.classList.add('vkeep');
      el = el.parentElement;
    }
    const st = document.createElement('style');
    st.textContent = 'body *:not(.vkeep):not(.vkeep canvas){visibility:hidden !important} .scene-label{display:none !important}';
    document.head.appendChild(st);
  });

  // 停住時鐘：之後每一格都由這支腳本推
  const t = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(t + 200);
  // 攔下渲染器的 render 拿到場景（藏雲用；不改遊戲程式）
  await page.evaluate(() => {
    const r = (window as any).__game.gl;
    const orig = r.render.bind(r);
    r.render = (scene: unknown, cam: unknown) => {
      (window as any).__videoScene = scene;
      return orig(scene, cam);
    };
  });
  await settle(300);
  expect(await clouds(true)).toBe(1);
  await installDriver();
  // 開始記音效排程（每一格由 shot() 拿走）
  await page.evaluate(() => (window as any).__game.rideAudio.record(true));

  const { track, timeline, cycle } = coaster();
  /** 出發後幾秒列車頭到軌道的 s 公尺 */
  const timeAtS = (s: number) => timeline.time[Math.round((s / track.length) * track.pos.length)];
  let top = 0;
  for (let i = 0; i < track.up.length; i++) if (track.up[i].y < track.up[top].y) top = i;
  const tLoop = timeline.time[top];
  let crest = 0;
  for (let i = 0; i < track.pos.length; i++) if (track.pos[i].y > track.pos[crest].y) crest = i;
  const tCrest = timeline.time[crest];

  // ---------- 1. 開場：廣場，同學圍著噴水池繞圈走，鏡頭慢慢轉（4 小節） ----------
  await drive({ kids: { mode: 'plaza' } });
  await placePlayer(0, 3.2, 0);
  await setZoom(1.45);
  await setYaw(-0.5);
  await settle(800);
  await drive({ yaw: { from: -0.5, rate: 1.0 / (4 * BAR) } });
  await shot('01-intro', 4);
  await drive({ kids: null, yaw: null });

  // ---------- 2. 雲霄飛車：走上月台、上車（同學已經坐好） ----------
  const w0 = await wall();
  const run = Math.floor(w0 / cycle) + 1;
  await warpTo(run * cycle + 4);
  // 同學坐在前面幾節車廂（自己會坐 1 號：第一節前排）
  const coSeats = [0, 2, 3, 4, 5, 6, 7, 9, 10, 12, 14];
  await setKids(coSeats.map((s) => ({ x: 0, z: 20, act: `co${s}` })));
  await setYaw(0);
  await setZoom(1.0);
  await setView('follow');
  await placePlayer(-8.5, 17.6, Math.PI);
  await settle(500);
  await shot('02-coaster-board', 2, async (i) => {
    if (i === 1) await page.keyboard.down('ArrowDown');
    if (i === 16) await page.keyboard.up('ArrowDown');
    if (i === 24) {
      await page.evaluate(() => (window as any).__game.grand.start('coaster'));
      // 坐第一節前排（第一人稱看得最清楚）
      await page.evaluate(() => {
        const g = (window as any).__game;
        g.player.act = { ...g.player.act, seat: 1 };
      });
    }
  });

  // ---------- 3. 爬坡（跟拍，從西南邊看，2 小節） ----------
  const go = run * cycle + COASTER_BOARD;
  await warpTo(go + tCrest - 5.5);
  await setView('follow');
  await setZoom(0.9);
  await setYaw(-0.7);
  await page.evaluate(() => ((window as any).__game.player.snapCamera = true));
  await settle(400);
  await warpTo(go + tCrest - 5.5);
  await shot('03-coaster-lift', 2);

  // ---------- 4. 大俯衝（第一人稱，2 小節；從這裡到飛船降落，雲藏起來） ----------
  await clouds(false);
  await setYaw(0);
  await warpTo(go + tCrest - 0.9);
  await setView('first');
  await settle(100);
  await shot('04-coaster-drop', 2);

  // ---------- 5. 垂直大迴圈（第一人稱，2 小節） ----------
  await warpTo(go + tLoop - 1.8);
  await settle(100);
  await shot('05-coaster-loop-first', 2);

  // ---------- 6. 同一個迴圈從外面看（跟拍，2 小節） ----------
  await warpTo(go + tLoop - 1.8);
  await setView('follow');
  await setZoom(1.15);
  await setYaw(0.5);
  await page.evaluate(() => ((window as any).__game.player.snapCamera = true));
  await settle(400);
  await warpTo(go + tLoop - 1.8);
  await shot('06-coaster-loop-follow', 2);

  // ---------- 7. 螺旋與小山丘（跟拍，2 小節） ----------
  await warpTo(go + timeAtS(178));
  await setYaw(-0.3);
  await setZoom(1.25);
  await page.evaluate(() => ((window as any).__game.player.snapCamera = true));
  await settle(400);
  await shot('07-coaster-helix', 2);
  // 跑完下車
  await warpTo((run + 1) * cycle + 0.5);
  await settle(300);
  await setYaw(0);

  // ---------- 8. 巨大摩天輪：月台上（鏡頭拉遠看整座），上車（1 小節） ----------
  const whSeats = [4, 5, 9, 13, 16, 21, 24, 25, 30, 33, 37];
  await setKids(whSeats.map((s) => ({ x: 0, z: -20, act: `wh${s}` })));
  await clouds(true);
  await setZoom(1.0);
  await placePlayer(WHEEL.board.x, WHEEL.board.z + 1.2, Math.PI);
  await settle(1500);
  let wBoard = 0;
  await shot('08-wheel-board', 1, async (i) => {
    if (i === 12) {
      await page.evaluate(() => (window as any).__game.grand.start('wheel'));
      wBoard = await wall();
      // 坐南邊的長椅（第一人稱往南看，前面沒有人擋）；同一個車廂的假同學請下車
      const cabin = await page.evaluate(() => {
        const g = (window as any).__game;
        const c = Math.floor(g.player.act.seat / 4);
        g.player.act = { ...g.player.act, seat: c * 4 + 2 };
        return c;
      });
      await setKids(whSeats.filter((s) => Math.floor(s / 4) !== cabin).map((s) => ({ x: 0, z: -20, act: `wh${s}` })));
    }
  });
  await clouds(false);

  // ---------- 9. 往上升（跟拍，1 小節） ----------
  await warpTo(wBoard + WHEEL.period * 0.18);
  await setZoom(1.3);
  await setYaw(0.35);
  await page.evaluate(() => ((window as any).__game.player.snapCamera = true));
  await settle(400);
  await shot('09-wheel-rise', 1);

  // ---------- 10. 最高處第一人稱：整座島（2 小節） ----------
  await warpTo(wBoard + WHEEL.period * 0.5 - 1.8);
  await setView('first');
  await settle(100);
  await shot('10-wheel-top-first', 2);

  // ---------- 11. 最高處跟拍（2 小節） ----------
  await setView('follow');
  await setZoom(0.9);
  await setYaw(-0.4);
  await page.evaluate(() => ((window as any).__game.player.snapCamera = true));
  await settle(400);
  await drive({ yaw: { from: -0.4, rate: 0.12 } });
  await shot('11-wheel-top-follow', 2);
  await drive({ yaw: null });
  await warpTo(wBoard + WHEEL.period + 0.5);
  await settle(300);
  await setYaw(0);

  // ---------- 12. 環島飛船：塔下上船，甲板上走動，同學也在船上（2 小節） ----------
  const s0 = await wall();
  const sRun = Math.floor(s0 / SHIP_CYCLE) + 1;
  await warpTo(sRun * SHIP_CYCLE + 6);
  const deckSpots = [
    { x: -1.2, z: 3.0 },
    { x: 0.8, z: 2.6 },
    { x: -1.4, z: -1.5 },
    { x: 1.2, z: -3.2 },
    { x: -0.4, z: -4.0 },
    { x: -0.8, z: -2.4 },
  ];
  await drive({ kids: { mode: 'deck', spots: deckSpots } });
  await setZoom(1.1);
  await placePlayer(MAST.board.x + 0.6, MAST.board.z + 0.6, -Math.PI / 2);
  await settle(800);
  await shot('12-ship-board', 2, async (i) => {
    if (i === 9) await page.evaluate(() => (window as any).__game.grand.start('ship'));
    if (i === 20) await page.keyboard.down('ArrowLeft');
    if (i === 45) await page.keyboard.up('ArrowLeft');
    if (i === 46) await page.keyboard.down('ArrowUp');
    if (i === 70) await page.keyboard.up('ArrowUp');
  });

  // ---------- 13. 起飛（跟拍，2 小節） ----------
  await warpTo(sRun * SHIP_CYCLE + SHIP.board - 1);
  await setZoom(1.35);
  await setYaw(0.3);
  await page.evaluate(() => ((window as any).__game.player.snapCamera = true));
  await settle(300);
  await shot('13-ship-takeoff', 2);

  // ---------- 14. 繞島飛行：海上的海豚、魚群（跟拍，2 小節） ----------
  await warpTo(sRun * SHIP_CYCLE + SHIP.board + 44.5);
  await setZoom(1.5);
  await setYaw(0.8);
  await page.evaluate(() => ((window as any).__game.player.snapCamera = true));
  await settle(400);
  await shot('14-ship-fly', 2);

  // ---------- 15. 第一人稱：站在靠島的欄杆看整座島（2 小節） ----------
  await warpTo(sRun * SHIP_CYCLE + SHIP.board + 58.5);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.player.act.deck = { x: 1.55, z: 0.5, h: Math.PI / 2 };
  });
  await setView('first');
  await settle(100);
  await shot('15-ship-first', 2);

  // ---------- 16. 近拍：在欄杆邊（2 小節） ----------
  await warpTo(sRun * SHIP_CYCLE + SHIP.board + 68);
  await setView('close');
  await setYaw(1.2);
  await settle(300);
  // 這個鏡頭同學站到船頭、船尾（不擋在鏡頭和自己中間）
  const farSpots = [
    { x: -1.2, z: 4.3 },
    { x: 0.6, z: 4.4 },
    { x: -1.4, z: -4.2 },
    { x: 0.9, z: -4.3 },
    { x: -0.2, z: -3.6 },
    { x: -1.6, z: 3.6 },
  ];
  await drive({ kids: { mode: 'deck', spots: farSpots } });
  await settle(300);
  await drive({ yaw: { from: 1.2, rate: 0.18 } });
  await shot('16-ship-close', 2);
  await drive({ kids: { mode: 'deck', spots: deckSpots }, yaw: null });

  // ---------- 17. 降落（跟拍，2 小節） ----------
  await warpTo(sRun * SHIP_CYCLE + SHIP_CYCLE - 7.5);
  await setView('follow');
  await setZoom(1.3);
  await setYaw(-0.2);
  await page.evaluate(() => ((window as any).__game.player.snapCamera = true));
  await settle(300);
  await shot('17-ship-land', 2);
  await drive({ kids: null });
  await warpTo((sRun + 1) * SHIP_CYCLE + 0.5);
  await settle(300);
  await clouds(true);

  // ---------- 18. 回到廣場，大家一起（2 小節） ----------
  await drive({ kids: { mode: 'plaza' } });
  await setYaw(0);
  await setZoom(0.8);
  await placePlayer(0, 3.0, 0);
  await settle(600);
  await shot('18-plaza', 2);
  await drive({ kids: null });

  // ---------- 19. 結尾：摩天輪月台前看整座設施，列車從後面經過（4 小節） ----------
  const e0 = await wall();
  const eRun = Math.floor(e0 / cycle) + 1;
  await warpTo(eRun * cycle + COASTER_BOARD + tCrest - 2);
  await setKids(coSeats.map((s) => ({ x: 0, z: 20, act: `co${s}` })));
  await setZoom(1.0);
  await setYaw(-0.35);
  await placePlayer(WHEEL.board.x + 1.5, WHEEL.board.z + 2.5, 0);
  await settle(1500);
  await drive({ yaw: { from: -0.35, rate: 0.105 } });
  await shot('19-outro', 4);

  await context.close();
});
