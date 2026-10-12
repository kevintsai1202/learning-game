/**
 * 角色之間會擋住（動森的做法，src/world/remoteBodies.ts）：兩台裝置同島。
 * - 阿寶朝站著的小美直直走過去：停在小美前面，不會穿過去。
 * - 阿寶傳送到和小美疊在一起的地方：往外走得開，不會卡住。
 */
import { expect, test, type Page } from '@playwright/test';
import { createClassViaApi, flushDeviceLogs, loginAndEnter, openDevice, SERVER } from './onlineDevice';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 自己的角色的位置 */
const posOf = (page: Page) => page.evaluate(() => ({ ...(window as any).__game.player.pos }) as { x: number; z: number });

test('朝別的小朋友走過去會被擋住；疊在一起時走得開', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  const room = await createClassViaApi(request, '二年二班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'bear'],
    ['小美', '2222', 'rabbit'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  const a = await openDevice(browser, baseURL!);
  const b = await openDevice(browser, baseURL!);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  await loginAndEnter(b.page, room.code, '小美', '2222');

  // 小美站在 (0, 9)；等阿寶這邊看到她站在那裡
  await b.page.evaluate(() => (window as any).__game.teleport({ x: 0, z: 9 }));
  await expect
    .poll(() => a.page.evaluate(() => Object.values((window as any).__game.presence.getState().members).some((m: any) => m.nickname === '小美' && Math.abs(m.x) < 0.2 && Math.abs(m.z - 9) < 0.2)), { timeout: 20_000 })
    .toBe(true);
  await a.page.waitForTimeout(1500);

  // 阿寶從 (-3, 9) 朝 (3, 9) 直直走：停在小美前面（兩人半徑加總 0.85）
  await a.page.evaluate(() => (window as any).__game.teleport({ x: -3, z: 9 }));
  await a.page.evaluate(() => ((window as any).__game.player.target = { x: 3, z: 9 }));
  await a.page.waitForTimeout(3000);
  const stop = await posOf(a.page);
  expect(stop.x).toBeLessThan(-0.75);
  expect(stop.x).toBeGreaterThan(-1.2);
  await a.page.screenshot({ path: 'e2e/screenshots/body-block.png' });

  // 傳送到和小美疊在一起，往右走：走得開
  await a.page.evaluate(() => (window as any).__game.teleport({ x: 0.2, z: 9 }));
  await a.page.evaluate(() => ((window as any).__game.player.target = { x: 3, z: 9 }));
  await expect.poll(async () => (await posOf(a.page)).x, { timeout: 10_000 }).toBeGreaterThan(2.5);
});
