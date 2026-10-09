/**
 * 熊熊老師進島（老師 GM 的 G2，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：
 * 老師在班級頁按「以熊熊老師進島」→ 進那一班的班級島、自己是熊熊老師；島上的孩子看到熊熊老師（金色名牌），
 * 廣場上的 NPC 熊熊老師藏起來，好友名單上的老師變成線上；老師按「離開」回到同一班的班級頁，孩子那邊恢復原狀。
 * 第二條：全班公告（在自己島上的孩子也收到、太快要等 10 秒）與集合（島上直接過去、自己島上按「回班級島」、建築裡按「過去」）。
 * 截圖在 e2e/screenshots/gm/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors } from './onlineDevice';
import { enterZone } from './helpers';

const SHOTS = 'e2e/screenshots/gm';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 同島狀態裡的熊熊老師（沒有是 null） */
const teacherOn = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__game.presence.getState();
    return (Object.values(s.members).find((m: any) => m.role === 'teacher' && m.id !== s.selfId) as any) ?? null;
  });
/** 廣場上的 NPC 熊熊老師有沒有畫出來 */
const npcShown = (page: Page) => page.evaluate(() => (window as any).__game.scene.npcTeacher as boolean);
/** 好友名單上這一班的老師是否線上 */
const teacherFriendOnline = (page: Page, code: string) =>
  page.evaluate((code) => (window as any).__game.friends.getState().friends[`teacher:${code}`]?.online ?? null, code);
/** 目前的畫面 */
const screenOf = (page: Page) => page.evaluate(() => (window as any).__game.ui.getState().screen as string);

test('熊熊老師進島：孩子看到熊熊老師、NPC 藏起來、好友名單上的老師上線；老師離開回到同一班的班級頁', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年三班');
  const join = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } } });
  expect(join.ok()).toBe(true);

  // 孩子在班級島：老師還沒進島，NPC 熊熊老師在廣場上，好友名單上的老師是離線
  const kid = await openDevice(browser, baseURL!);
  await loginAndEnter(kid.page, room.code, '阿寶', '1111');
  await expect.poll(() => npcShown(kid.page)).toBe(true);
  await expect.poll(() => teacherFriendOnline(kid.page, room.code)).toBe(false);

  // 老師在班級頁按「以熊熊老師進島」
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await t.page.getByTestId('gm-enter').click();
  await expect.poll(() => screenOf(t.page)).toBe('gm');
  await expect(t.page.getByTestId('gm-hud')).toContainText('二年三班');
  await expect.poll(() => t.page.evaluate(() => (window as any).__game.gm.getState().status)).toBe('online');
  // 老師的島上：看得到阿寶，廣場上沒有另一隻 NPC 熊熊老師
  await expect
    .poll(() => t.page.evaluate(() => Object.values((window as any).__game.presence.getState().members).map((m: any) => m.nickname)))
    .toContain('阿寶');
  expect(await npcShown(t.page)).toBe(false);

  // 孩子：島上出現熊熊老師（金色名牌）、NPC 藏起來、好友名單上的老師上線
  await expect.poll(() => teacherOn(kid.page)).toMatchObject({ nickname: '熊熊老師', role: 'teacher' });
  await expect(kid.page.getByTestId('teacher-tag')).toHaveCount(1);
  await expect.poll(() => npcShown(kid.page)).toBe(false);
  await expect.poll(() => teacherFriendOnline(kid.page, room.code)).toBe(true);
  await kid.page.screenshot({ path: `${SHOTS}/01-kid-sees-teacher.png` });
  await t.page.screenshot({ path: `${SHOTS}/02-teacher-on-island.png` });

  // 老師走動：孩子那邊的熊熊老師跟著動
  await t.page.evaluate(() => (window as any).__game.teleport({ x: 4, z: 6 }));
  await expect.poll(async () => (await teacherOn(kid.page))?.x).toBeCloseTo(4, 0);

  // 老師離開：回到同一班的班級頁；孩子那邊熊熊老師不見、NPC 回來、好友名單上的老師離線
  await t.page.getByTestId('gm-leave').click();
  await expect.poll(() => screenOf(t.page)).toBe('teacher');
  await expect(t.page.getByTestId('room-code-display')).toHaveText(room.code);
  await expect.poll(() => teacherOn(kid.page)).toBeNull();
  await expect.poll(() => npcShown(kid.page)).toBe(true);
  await expect.poll(() => teacherFriendOnline(kid.page, room.code)).toBe(false);

  for (const d of [kid, t]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([kid.context.close(), t.context.close()]);
});

/** 這台裝置自己的位置 */
const posOf = (page: Page) => page.evaluate(() => (window as any).__game.player.pos as { x: number; z: number });
/** 即時連線說現在在哪一種島 */
const islandNow = (page: Page) => page.evaluate(() => (window as any).__game.realtime.getState().island as string | null);
/** 兩個位置的距離 */
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test('公告與集合：班級島與自己島上的孩子都收到公告；集合時島上的孩子直接過去、自己島上的按「回班級島」、建築裡的按「過去」', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const room = await createClassViaApi(request, '二年三班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'capybara'],
    ['小美', '2222', 'panda'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  // 阿寶在班級島；小美切到自己的島
  const a = await openDevice(browser, baseURL!);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  const b = await openDevice(browser, baseURL!);
  await loginAndEnter(b.page, room.code, '小美', '2222');
  await b.page.getByTestId('hud-island').click();
  await expect.poll(() => islandNow(b.page)).toBe('own');

  // 老師進島
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await t.page.getByTestId('gm-enter').click();
  await expect.poll(() => t.page.evaluate(() => (window as any).__game.gm.getState().status)).toBe('online');

  // ① 公告：兩個孩子都看到上方的大字幕（在自己島上的也是）；老師馬上再發一則：要等 10 秒
  await t.page.getByTestId('gm-announce-input').fill('大家好，我是熊熊老師');
  await t.page.getByTestId('gm-announce').click();
  for (const d of [a, b]) await expect(d.page.getByTestId('announce-banner')).toContainText('大家好，我是熊熊老師');
  await a.page.screenshot({ path: `${SHOTS}/03-kid-announce.png` });
  await t.page.getByTestId('gm-announce-input').fill('第二則');
  await t.page.getByTestId('gm-announce').click();
  await expect(t.page.getByTestId('gm-notice')).toContainText('10 秒');

  // ② 集合：阿寶在班級島上，直接站到老師身邊；小美在自己的島，跳卡片「回班級島」，按了就到班級島的老師身邊
  const teacherAt = await posOf(t.page);
  await t.page.getByTestId('gm-summon').click();
  await expect.poll(async () => dist(await posOf(a.page), teacherAt)).toBeLessThan(4);
  await expect(b.page.getByTestId('summon-back')).toBeVisible();
  await b.page.screenshot({ path: `${SHOTS}/04-kid-summon-card.png` });
  await b.page.getByTestId('summon-back').click();
  await expect.poll(() => islandNow(b.page)).toBe('class');
  await expect.poll(async () => dist(await posOf(b.page), teacherAt)).toBeLessThan(4);
  await expect(b.page.getByTestId('summon-card')).toHaveCount(0);

  // ③ 阿寶進了建築：再集合時跳卡片「過去」，按了回到島上的老師身邊
  await enterZone(a.page, 'math');
  await t.page.getByTestId('gm-summon').click();
  await a.page.getByTestId('summon-go').click();
  await expect.poll(() => a.page.evaluate(() => (window as any).__game.ui.getState().screen)).toBe('island');
  await expect.poll(async () => dist(await posOf(a.page), teacherAt)).toBeLessThan(4);

  for (const d of [a, b, t]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([a.context.close(), b.context.close(), t.context.close()]);
});
