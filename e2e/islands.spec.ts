/**
 * 島嶼互訪 I1（docs/plans/islands.md）：雲端角色在哪座島都保持連線；好友名單列出同班同學與兄弟姊妹，
 * 線上的寫在哪座島（不顯示建築）；在自己的島上同學看不到他；老師的成員表顯示每個孩子在哪裡；老師可以改班級名稱。
 * 三台孩子裝置：阿寶（班級代碼登入）、哥哥（家長名下、加入同一班）、妹妹（家長名下、沒有班級）。
 * 截圖在 e2e/screenshots/islands/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { SERVER, TEST_PASSWORD, createClassViaApi, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/islands';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 好友名單（暱稱 → 狀態文字） */
async function friendsOf(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const s = (window as any).__game.friends.getState().friends as Record<string, { nickname: string; online: boolean; island: string | null }>;
    return Object.fromEntries(Object.values(s).map((f) => [f.nickname, f.online ? (f.island === 'own' ? '在自己的島' : '在班級島') : '離線']));
  });
}

/** 同島狀態裡某位成員（用暱稱找） */
async function memberByName(page: Page, nickname: string): Promise<any> {
  return page.evaluate((n) => {
    const s = (window as any).__game.presence.getState();
    return Object.values(s.members).find((m: any) => m.nickname === n && m.id !== s.selfId) ?? null;
  }, nickname);
}

/** 即時連線說現在在哪一種島 */
const islandNow = (page: Page) => page.evaluate(() => (window as any).__game.realtime.getState().island as string | null);

/** 畫面上的方框 */
type Box = { x: number; y: number; width: number; height: number };
/** 兩個方框有沒有重疊 */
const overlaps = (p: Box, q: Box) => p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;

test('好友名單、在自己的島、老師看到每個孩子在哪裡、改班級名稱', async ({ browser, baseURL, request }) => {
  test.setTimeout(480_000);
  /** 直接呼叫伺服器 API（準備資料用） */
  const api = async (method: 'POST' | 'GET', path: string, data?: unknown, token?: string) => {
    const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  const room = await createClassViaApi(request, '二年一班');
  await api('POST', '/api/join', { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } });
  // 家長帳號名下兩個孩子：哥哥加入同一班，妹妹沒有班級
  const momName = uniqueUsername();
  const mom = await api('POST', '/api/users', { username: momName, password: TEST_PASSWORD, email: `${momName}@example.com`, parent: true, teacher: false });
  /** 用裝置的存檔格式產生本機角色再上傳（伺服器用 parseProfile 檢查） */
  const upload = async (name: string, animal: string) => {
    const page = await (await browser.newContext({ baseURL })).newPage();
    await page.goto('./');
    const profile = await page.evaluate(({ name, animal }) => {
      const g = (window as any).__game.game.getState();
      g.createProfile(name, { animal, color: '#ffffff', hat: null });
      return JSON.parse(JSON.stringify((window as any).__game.game.getState().profile()));
    }, { name, animal });
    await page.context().close();
    return api('POST', '/api/parent/kids', { profile }, mom.token);
  };
  const big = await upload('哥哥', 'bear');
  const small = await upload('妹妹', 'rabbit');
  await api('POST', '/api/join', { code: room.code, nickname: '哥哥', pin: '2222' }, big.token);

  // 三台裝置：阿寶用班級代碼登入；哥哥、妹妹用家長帳號「在這台裝置玩」
  const a = await openDevice(browser, baseURL!);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  const openKid = async (kidId: string) => {
    const d = await openDevice(browser, baseURL!);
    await d.page.evaluate(({ kidId, server, token }) => (window as any).__game.cloud.getState().playOnThisDevice(kidId, server, token), { kidId, server: SERVER, token: mom.token });
    await d.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
    await expect.poll(() => d.page.evaluate(() => (window as any).__game.realtime.getState().status)).toBe('online');
    return d;
  };
  const b = await openKid(big.account.id);
  const c = await openKid(small.account.id);

  // 妹妹沒有班級：連到自己的島；朋友只有哥哥（阿寶不是她的朋友）；沒有切換島的按鈕、不顯示公頻
  expect(await islandNow(c.page)).toBe('own');
  await expect.poll(() => friendsOf(c.page)).toEqual({ 哥哥: '在班級島' });
  await expect(c.page.getByTestId('hud-island')).toHaveCount(0);
  await expect(c.page.getByTestId('chat-panel')).toHaveCount(0);

  // 哥哥：同學阿寶在班級島、妹妹在自己的島；名單面板線上的排前面
  await expect.poll(() => friendsOf(b.page)).toEqual({ 阿寶: '在班級島', 妹妹: '在自己的島' });
  await expect.poll(() => friendsOf(a.page)).toEqual({ 哥哥: '在班級島' });
  await b.page.getByTestId('hud-friends').click();
  await expect(b.page.getByTestId('friend-row')).toHaveCount(2);
  await expect(b.page.locator('[data-friend="妹妹"] [data-testid="friend-status"]')).toContainText('在自己的島');
  await b.page.screenshot({ path: `${SHOTS}/01-friends-panel.png` });
  await b.page.getByTestId('friends-close').click();

  // 阿寶切到自己的島：保持連線；哥哥的島上看不到阿寶，名單寫「在自己的島」；名單不顯示建築
  await a.page.getByTestId('hud-island').click();
  await expect.poll(() => islandNow(a.page)).toBe('own');
  expect(await a.page.evaluate(() => (window as any).__game.realtime.getState().status)).toBe('online');
  await expect(a.page.getByTestId('chat-panel')).toHaveCount(0);
  await expect.poll(() => memberByName(b.page, '阿寶')).toBeNull();
  await expect.poll(() => friendsOf(b.page)).toEqual({ 阿寶: '在自己的島', 妹妹: '在自己的島' });

  // 老師的成員表：阿寶在自己的島、哥哥在班級島的數學城堡（老師看得到建築）
  await b.page.evaluate(() => (window as any).__game.ui.getState().enterZone('math'));
  await expect
    .poll(async () => {
      const r = await api('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token);
      return Object.fromEntries(r.members.map((m: { nickname: string; where: unknown }) => [m.nickname, m.where]));
    })
    .toEqual({ 阿寶: { island: 'own', zone: null }, 哥哥: { island: 'class', zone: 'math' } });
  expect(await friendsOf(a.page)).toEqual({ 哥哥: '在班級島' });
  await b.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));

  // 手機直式：朋友按鈕完整在畫面內、不壓到右上角的按鈕
  await a.page.setViewportSize({ width: 390, height: 844 });
  const fb = (await a.page.getByTestId('hud-friends').boundingBox())!;
  for (const id of ['hud-badges', 'hud-parent']) expect(overlaps(fb, (await a.page.getByTestId(id).boundingBox())!), `朋友按鈕壓到 ${id}`).toBe(false);
  expect(fb.x >= 0 && fb.x + fb.width <= 390).toBe(true);
  await a.page.screenshot({ path: `${SHOTS}/02-phone-own-island.png` });
  await a.page.setViewportSize({ width: 1280, height: 800 });

  // 阿寶回班級島：又和哥哥同島
  await a.page.getByTestId('hud-island').click();
  await expect.poll(() => islandNow(a.page)).toBe('class');
  await expect.poll(() => memberByName(b.page, '阿寶')).not.toBeNull();
  await expect.poll(() => friendsOf(b.page)).toEqual({ 阿寶: '在班級島', 妹妹: '在自己的島' });

  // 妹妹下線：哥哥的名單寫離線
  await c.context.close();
  await expect.poll(() => friendsOf(b.page)).toEqual({ 阿寶: '在班級島', 妹妹: '離線' });

  for (const d of [a, b]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([a.context.close(), b.context.close()]);

  // 老師改班級名稱（升級換年級）
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await t.page.getByTestId('room-rename').click();
  await t.page.getByTestId('room-rename-input').fill('三年一班');
  await t.page.getByTestId('room-rename-save').click();
  await expect(t.page.getByTestId('room-name-display')).toHaveText('三年一班');
  await t.page.screenshot({ path: `${SHOTS}/03-teacher-renamed.png` });
  expect((await api('POST', '/api/login', { code: room.code, nickname: '阿寶', pin: '1111' })).room.name).toBe('三年一班');
  expect(pageErrors(t.page)).toEqual([]);
  await t.context.close();
});
