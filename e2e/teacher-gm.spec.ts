/**
 * 老師 GM 的 G0＋G1（docs/plans/teacher-gm.md 第 3、4 節）：
 * - G0 班級教材版本：老師在班級頁統一版本，線上的孩子馬上收到（content → 同步），班級島的課本單元跟著老師；取消統一就照孩子自己的設定。
 * - G1 我的島：孩子切到我的島，用自己的版本、看不到同學（即時連線斷開）；切回班級島又和同學同島。
 * 截圖在 e2e/screenshots/teacher-gm/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { enterZone } from './helpers';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors, profileOf } from './onlineDevice';

const SHOTS = 'e2e/screenshots/teacher-gm';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 同島狀態裡某位成員（用暱稱找） */
async function memberByName(page: Page, nickname: string): Promise<any> {
  return page.evaluate((n) => {
    const s = (window as any).__game.presence.getState();
    return Object.values(s.members).find((m: any) => m.nickname === n && m.id !== s.selfId) ?? null;
  }, nickname);
}

/** 畫面上的方框 */
type Box = { x: number; y: number; width: number; height: number };
/** 兩個方框有沒有重疊 */
const overlaps = (p: Box, q: Box) => p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;

/** 即時連線狀態 */
const realtimeOf = (page: Page) => page.evaluate(() => (window as any).__game.realtime.getState().status as string);

/** 進數學城堡看「跟著課本」用哪個版本，再回到島上 */
async function mathBook(page: Page): Promise<string> {
  await enterZone(page, 'math');
  const label = ((await page.getByTestId('book-label').textContent()) ?? '').trim();
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  return label;
}

test('老師統一班級版本、孩子切換班級島與我的島', async ({ browser, baseURL, request }) => {
  test.setTimeout(420_000);
  const room = await createClassViaApi(request, '二年一班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'capybara'],
    ['小美', '2222', 'panda'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok(), `加入 ${nickname} ${res.status()}`).toBe(true);
  }
  const a = await openDevice(browser, baseURL!);
  const b = await openDevice(browser, baseURL!);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  await loginAndEnter(b.page, room.code, '小美', '2222');
  await expect.poll(() => memberByName(b.page, '阿寶')).not.toBeNull();

  // 老師還沒統一：班級島照孩子自己的設定（預設數學南一、學期自動，所以只比對出版社）
  expect(await mathBook(a.page)).toContain('南一 二');
  await expect(a.page.getByTestId('hud-island')).toHaveText('🏝️ 去我的島');

  // ① 老師在班級頁統一版本：數學翰林、二年級上學期
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await expect(t.page.getByTestId('class-curriculum-toggle')).not.toBeChecked();
  await t.page.getByTestId('class-curriculum-toggle').click();
  await expect(t.page.getByTestId('class-curriculum-toggle')).toBeChecked();
  await t.page.getByTestId('class-edition-math').selectOption('hanlin-math');
  await t.page.getByTestId('class-edition-term').selectOption('上');
  await expect(t.page.getByText('班級島的教材版本：國語 康軒・數學 翰林・二年級上學期')).toBeVisible();
  await t.page.screenshot({ path: `${SHOTS}/01-teacher-class-curriculum.png` });

  // 線上的孩子馬上收到（不用重新整理）：本機記住班級版本，數學城堡跟著老師
  await expect.poll(async () => (await profileOf(a.page)).cloud?.roomCurriculum, { timeout: 20_000 }).toEqual({ zh: 'kanghsuan-zh', math: 'hanlin-math', term: '上' });
  expect(await mathBook(a.page)).toContain('翰林 二上');
  // 孩子自己的設定沒有被改
  expect((await profileOf(a.page)).curriculum.math).toBe('nani-math');

  // ② 阿寶切到我的島：用自己的版本、看不到同學；小美的島上也看不到阿寶
  await a.page.getByTestId('hud-island').click();
  await expect(a.page.getByTestId('hud-island')).toHaveText('🏫 回班級島');
  await expect(a.page.getByRole('status').filter({ hasText: '來到你自己的島囉' })).toBeVisible();
  await expect.poll(() => realtimeOf(a.page)).toBe('off');
  await expect(a.page.getByTestId('chat-panel')).toHaveCount(0);
  await expect(a.page.getByTestId('name-tag')).toHaveCount(0);
  await expect.poll(() => memberByName(b.page, '阿寶')).toBeNull();
  await a.page.screenshot({ path: `${SHOTS}/02-kid-my-island.png` });
  expect(await mathBook(a.page)).toContain('南一 二');
  // 重新整理之後還在我的島
  await a.page.reload();
  await a.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await expect(a.page.getByTestId('hud-island')).toHaveText('🏫 回班級島');
  expect(await realtimeOf(a.page)).toBe('off');

  // ③ 切回班級島：又和小美同島，課本跟著老師
  await a.page.getByTestId('hud-island').click();
  await expect(a.page.getByTestId('hud-island')).toHaveText('🏝️ 去我的島');
  await expect.poll(() => realtimeOf(a.page)).toBe('online');
  await expect.poll(() => memberByName(a.page, '小美')).not.toBeNull();
  await expect.poll(() => memberByName(b.page, '阿寶')).not.toBeNull();
  expect(await mathBook(a.page)).toContain('翰林 二上');

  // 手機直式：切換按鈕完整在畫面內、不壓到右上角的按鈕；切換的提示泡泡也完整在畫面內
  await a.page.setViewportSize({ width: 390, height: 844 });
  await a.page.getByTestId('hud-island').click();
  const bubble = a.page.locator('.speech');
  await expect(bubble).toContainText('來到你自己的島囉');
  // 等泡泡的出場動畫結束再量
  await a.page.waitForTimeout(500);
  const sw = (await a.page.getByTestId('hud-island').boundingBox())!;
  const sp = (await bubble.boundingBox())!;
  for (const id of ['hud-badges', 'hud-parent']) {
    const other = (await a.page.getByTestId(id).boundingBox())!;
    expect(overlaps(sw, other), `切換按鈕壓到 ${id}`).toBe(false);
  }
  expect(sw.x >= 0 && sw.x + sw.width <= 390).toBe(true);
  expect(sp.x >= 0 && sp.x + sp.width <= 390, `泡泡超出畫面：${JSON.stringify(sp)}`).toBe(true);
  await a.page.screenshot({ path: `${SHOTS}/03-phone-my-island.png` });
  await a.page.getByTestId('hud-island').click();
  await expect.poll(() => realtimeOf(a.page)).toBe('online');
  await a.page.setViewportSize({ width: 1280, height: 800 });

  // ④ 老師取消統一：班級島回到孩子自己的設定
  await t.page.getByTestId('class-curriculum-toggle').click();
  await expect(t.page.getByTestId('class-curriculum-toggle')).not.toBeChecked();
  await expect.poll(async () => (await profileOf(a.page)).cloud?.roomCurriculum ?? null, { timeout: 20_000 }).toBeNull();
  expect(await mathBook(a.page)).toContain('南一 二');

  for (const d of [a, b, t]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([a.context.close(), b.context.close(), t.context.close()]);
});
