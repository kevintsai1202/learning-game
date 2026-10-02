/**
 * 線上版 P1：老師建立房間 → 孩子帶本機進度加入 → 換一台裝置登入看到進度與錯題本 →
 * 離線玩完、恢復連線後自動上傳 → 老師重設密碼後要重新登入；
 * 另一段測 Google 快速登入（備選）：用 e2e/fixtures 的假金鑰簽 token，Google 按鈕換成測試按鈕。
 * 伺服器由 playwright.config.ts 的 webServer 啟動（http://localhost:8787，PGlite 記憶體資料庫）。
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { answerCurrent, createKid, enterZone, finishQuiz, screen } from './helpers';
import { prepareGoogleAccount, signTestIdToken } from './googleStub';

const SERVER = 'http://localhost:8787';
const SHOTS = 'e2e/screenshots/online';

/** 各台裝置的 console 錯誤、WebGL 警告與頁面崩潰（測試失敗時印出來，方便判斷原因） */
const deviceLogs: string[] = [];

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && deviceLogs.length) console.log(['裝置紀錄：', ...deviceLogs].join('\n'));
  deviceLogs.length = 0;
});

/**
 * 開一個新的瀏覽器環境（模擬另一台平板），把伺服器網址寫進 localStorage，清空存檔後打開首頁。
 * 3D 畫質設成「低」（產品既有的設定）：headless 用軟體 WebGL，三台裝置同時畫有陰影的 3D 會把 CPU 吃滿，
 * 第三台載入時會卡住（2026-10-03 實測：第三台的 reload 超過 30 秒沒觸發 load）。
 */
async function openDevice(browser: Browser, baseURL: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
  // 伺服器網址＋Google 測試按鈕（伺服器是 Google 測試模式，不能讓頁面去載入真正的 Google 程式）
  await context.addInitScript((url) => {
    localStorage.setItem('learning-island-server-url', url);
    localStorage.setItem('learning-island-google-stub', '1');
  }, SERVER);
  const page = await context.newPage();
  // 單一步驟最多等 30 秒，卡住時馬上失敗；頁面載入（軟體 WebGL 初始化）給 60 秒
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  const errors: string[] = [];
  const name = `裝置 ${deviceLogs.filter((l) => l.startsWith('開啟')).length + 1}`;
  deviceLogs.push(`開啟 ${name}`);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => deviceLogs.push(`${name}：頁面崩潰（renderer crash）`));
  page.on('console', (m) => {
    if (m.type() === 'error' || /webgl|context lost/i.test(m.text())) deviceLogs.push(`${name} [${m.type()}] ${m.text().slice(0, 200)}`);
  });
  (page as Page & { errors?: string[] }).errors = errors;
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.clear();
    // 寫進存檔：3D 畫質設成低（之後重新整理也維持）
    (window as any).__game.game.getState().updateSettings({ quality: 'low' });
  });
  await page.reload();
  await expect(page.getByTestId('start')).toBeVisible();
  return { context, page };
}

/** 目前角色（存檔裡的） */
async function profileOf(page: Page): Promise<any> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.game.getState().profile())));
}

/** 同步狀態 */
async function cloudState(page: Page): Promise<{ status: string; pending: number }> {
  return page.evaluate(() => {
    const s = (window as any).__game.cloud.getState();
    return { status: s.status, pending: s.pending };
  });
}

/** 玩一回合數學加法（第一題故意答錯兩次，會進錯題本；數字題可以重複輸入錯的答案），回到島上 */
async function playRoundWithMistake(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await enterZone(page, 'math');
  await page.getByTestId('activity-math.add').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await answerCurrent(page, false);
  await answerCurrent(page, false);
  await page.getByTestId('next').click();
  await finishQuiz(page);
  await expect(page.getByTestId('result')).toBeVisible();
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
}

/** 等同步完成（已同步、沒有待上傳） */
async function waitSynced(page: Page): Promise<void> {
  await expect.poll(() => cloudState(page), { timeout: 20_000 }).toEqual({ status: 'synced', pending: 0 });
}

test('班級：建立房間、帶進度加入、換裝置登入、離線同步、老師重設密碼', async ({ browser, baseURL }) => {
  test.setTimeout(600_000);

  // ---------- 老師建立房間 ----------
  const teacher = await openDevice(browser, baseURL!);
  await teacher.page.getByTestId('teacher-link').click();
  await teacher.page.getByTestId('room-name').fill('二年一班');
  await teacher.page.getByTestId('room-password').fill('teach123');
  await teacher.page.getByTestId('room-confirm').fill('teach123');
  await teacher.page.getByTestId('teacher-submit').click();
  const codeText = (await teacher.page.getByTestId('room-code-display').textContent())!.trim();
  expect(codeText).toMatch(/^\d{6}$/);
  await teacher.page.screenshot({ path: `${SHOTS}/01-teacher-room.png` });

  // ---------- 孩子 A：先在本機玩一回合，再帶著進度加入班級 ----------
  const a = await openDevice(browser, baseURL!);
  await createKid(a.page, '安安');
  await playRoundWithMistake(a.page);
  const localBefore = await profileOf(a.page);
  expect(Object.keys(localBefore.wrongBook).length).toBeGreaterThan(0);

  await a.page.evaluate(() => (window as any).__game.ui.getState().goto('profiles'));
  await a.page.getByTestId('open-class').click();
  await a.page.getByTestId('class-tab-join').click();
  await a.page.getByTestId('class-code').fill(codeText);
  await a.page.getByTestId('class-nickname').fill('小安');
  await a.page.getByTestId('class-pin').fill('1234');
  await a.page.getByTestId('class-source').selectOption(localBefore.id);
  await a.page.screenshot({ path: `${SHOTS}/02-kid-join.png` });
  await a.page.getByTestId('class-submit').click();
  await expect.poll(() => screen(a.page)).toBe('island');

  // 同一個角色變成雲端角色，名字改成暱稱，進度都在
  const linked = await profileOf(a.page);
  expect(linked.id).toBe(localBefore.id);
  expect(linked.name).toBe('小安');
  expect(linked.cloud.room).toBe(codeText);
  expect(linked.history).toHaveLength(1);
  expect(await a.page.evaluate(() => (window as any).__game.game.getState().save.profiles.length)).toBe(1);
  await waitSynced(a.page);
  await expect(a.page.getByTestId('hud-cloud')).toHaveAttribute('data-status', 'synced');
  await a.page.screenshot({ path: `${SHOTS}/03-kid-island-synced.png` });

  // 再玩一回合：自動上傳
  await playRoundWithMistake(a.page);
  await waitSynced(a.page);

  // ---------- 老師看到成員與成績 ----------
  await teacher.page.getByTestId('teacher-reload').click();
  const row = teacher.page.getByTestId('member-小安');
  await expect(row).toBeVisible();
  await expect(row.locator('td').nth(5)).toHaveText('2');
  await teacher.page.screenshot({ path: `${SHOTS}/04-teacher-members.png` });

  // ---------- 孩子 B：另一台裝置用班級登入（沒有本機角色時從建立角色畫面進去） ----------
  const b = await openDevice(browser, baseURL!);
  await b.page.getByTestId('start').click();
  await b.page.getByTestId('create-open-class').click();
  await b.page.getByTestId('class-code').fill(codeText);
  await b.page.getByTestId('class-nickname').fill('小安');
  await b.page.getByTestId('class-pin').fill('1234');
  await b.page.getByTestId('class-submit').click();
  await expect.poll(() => screen(b.page)).toBe('island');
  const onB = await profileOf(b.page);
  const onA = await profileOf(a.page);
  expect(onB.id).toBe(onA.id);
  expect(onB.history).toHaveLength(2);
  expect(onB.coins).toBe(onA.coins);
  expect(Object.keys(onB.wrongBook).sort()).toEqual(Object.keys(onA.wrongBook).sort());

  // ---------- A 離線玩一回合：進度留在佇列，恢復連線後自動上傳 ----------
  await a.context.setOffline(true);
  await playRoundWithMistake(a.page);
  await expect.poll(() => cloudState(a.page), { timeout: 20_000 }).toMatchObject({ status: 'offline' });
  expect((await cloudState(a.page)).pending).toBeGreaterThan(0);
  await expect(a.page.getByTestId('hud-cloud')).toContainText('離線');
  await a.page.screenshot({ path: `${SHOTS}/05-kid-offline.png` });
  await a.context.setOffline(false);
  await waitSynced(a.page);
  // B 同步後也看到第三回合
  await b.page.evaluate(() => (window as any).__game.cloud.getState().syncNow());
  await expect.poll(async () => (await profileOf(b.page)).history.length).toBe(3);

  // ---------- 老師重設密碼：B 要重新登入，用新密碼登入後繼續同步 ----------
  await teacher.page.getByTestId('reset-pin-小安').click();
  await teacher.page.getByTestId('new-pin-小安').fill('5678');
  await teacher.page.getByTestId('save-pin-小安').click();
  await expect(teacher.page.getByText('已把「小安」的密碼改成新密碼')).toBeVisible();
  await b.page.evaluate(() => (window as any).__game.cloud.getState().syncNow());
  await expect.poll(() => cloudState(b.page)).toMatchObject({ status: 'needLogin' });
  await b.page.getByTestId('hud-cloud').click();
  await expect.poll(() => screen(b.page)).toBe('class');
  // 代碼與暱稱已經填好
  await expect(b.page.getByTestId('class-code')).toHaveValue(codeText);
  await expect(b.page.getByTestId('class-nickname')).toHaveValue('小安');
  await b.page.getByTestId('class-pin').fill('5678');
  await b.page.getByTestId('class-submit').click();
  await expect.poll(() => screen(b.page)).toBe('island');
  await waitSynced(b.page);

  // 沒有頁面錯誤
  for (const d of [teacher, a, b]) expect((d.page as Page & { errors?: string[] }).errors).toEqual([]);
  await Promise.all([teacher.context.close(), a.context.close(), b.context.close()]);
});

test('Google 快速登入（備選）：老師綁定後用 Google 登入並選房間；家長綁定後換裝置一次登入兩個孩子', async ({ browser, baseURL, request }) => {
  test.setTimeout(600_000);
  /** 直接呼叫伺服器 API（準備資料用，畫面流程另外測） */
  const post = async (path: string, data: unknown, token?: string) => {
    const res = await request.post(`${SERVER}${path}`, { data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };

  // ---------- 老師：建立房間、在管理頁綁定 Google ----------
  const teacher = await openDevice(browser, baseURL!);
  await teacher.page.evaluate(() => localStorage.setItem('learning-island-google-stub', '1'));
  await teacher.page.getByTestId('teacher-link').click();
  await teacher.page.getByTestId('room-name').fill('二年一班');
  await teacher.page.getByTestId('room-password').fill('teach123');
  await teacher.page.getByTestId('room-confirm').fill('teach123');
  await teacher.page.getByTestId('teacher-submit').click();
  const codeA = (await teacher.page.getByTestId('room-code-display').textContent())!.trim();
  await prepareGoogleAccount(teacher.page, 'teacher-sub', 'teacher.lin@school.edu.tw');
  await teacher.page.getByTestId('teacher-google-link').click();
  await expect(teacher.page.getByTestId('teacher-google-linked')).toContainText('te***@school.edu.tw');

  // 同一個 Google 也綁到第二個房間（用 API 準備）
  const roomB = await post('/api/rooms', { name: '安親班', password: 'teach456' });
  await post('/api/teacher/google/link', { idToken: await signTestIdToken('teacher-sub', 'teacher.lin@school.edu.tw') }, roomB.token);

  // 登出後改用 Google 登入：兩個房間要先選
  await teacher.page.getByTestId('teacher-logout').click();
  await teacher.page.getByTestId('teacher-tab-login').click();
  await prepareGoogleAccount(teacher.page, 'teacher-sub', 'teacher.lin@school.edu.tw');
  await teacher.page.getByTestId('teacher-google-login').click();
  await teacher.page.getByTestId(`pick-room-${codeA}`).click();
  await expect(teacher.page.getByTestId('room-code-display')).toHaveText(codeA);
  await teacher.page.screenshot({ path: `${SHOTS}/11-teacher-google.png` });

  // ---------- 家長：哥哥用代碼加入，在家長專區綁定 Google ----------
  const home = await openDevice(browser, baseURL!);
  await home.page.evaluate(() => localStorage.setItem('learning-island-google-stub', '1'));
  await home.page.reload();
  await home.page.getByTestId('start').click();
  await home.page.getByTestId('create-open-class').click();
  await home.page.getByTestId('class-tab-join').click();
  await home.page.getByTestId('class-code').fill(codeA);
  await home.page.getByTestId('class-nickname').fill('哥哥');
  await home.page.getByTestId('class-pin').fill('1111');
  await home.page.getByTestId('class-submit').click();
  await expect.poll(() => screen(home.page)).toBe('island');
  await waitSynced(home.page);

  await home.page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
  for (const k of ['1', '2', '3', '4']) await home.page.getByTestId(`pin-${k}`).click();
  await expect(home.page.getByText('請再輸入一次確認')).toBeVisible();
  for (const k of ['1', '2', '3', '4']) await home.page.getByTestId(`pin-${k}`).click();
  await home.page.getByTestId('tab-class').click();
  await prepareGoogleAccount(home.page, 'mom-sub', 'mom.chen@gmail.com');
  await home.page.getByTestId('google-link').click();
  await expect(home.page.getByTestId('google-linked')).toContainText('mo***@gmail.com');
  await home.page.screenshot({ path: `${SHOTS}/12-parent-google-linked.png` });

  // 妹妹也綁同一個 Google（用 API 準備）
  const sister = await post('/api/join', { code: codeA, nickname: '妹妹', pin: '2222', avatar: { animal: 'cat', color: '#ffffff', hat: null } });
  await post('/api/google/link', { idToken: await signTestIdToken('mom-sub', 'mom.chen@gmail.com') }, sister.token);

  // ---------- 新裝置：用 Google 一次登入兩個孩子 ----------
  const tablet = await openDevice(browser, baseURL!);
  await tablet.page.evaluate(() => localStorage.setItem('learning-island-google-stub', '1'));
  await tablet.page.reload();
  await tablet.page.getByTestId('start').click();
  await tablet.page.getByTestId('create-open-class').click();
  await prepareGoogleAccount(tablet.page, 'mom-sub', 'mom.chen@gmail.com');
  await tablet.page.getByTestId('class-google-login').click();
  // 兩個孩子：回選角畫面挑
  await expect.poll(() => screen(tablet.page)).toBe('profiles');
  await expect(tablet.page.getByTestId('profile-card')).toHaveCount(2);
  await tablet.page.screenshot({ path: `${SHOTS}/13-tablet-google-two-kids.png` });
  await tablet.page.getByTestId('profile-card').filter({ hasText: '哥哥' }).click();
  await expect.poll(() => screen(tablet.page)).toBe('island');
  await waitSynced(tablet.page);
  expect((await profileOf(tablet.page)).name).toBe('哥哥');

  for (const d of [teacher, home, tablet]) expect((d.page as Page & { errors?: string[] }).errors).toEqual([]);
  await Promise.all([teacher.context.close(), home.context.close(), tablet.context.close()]);
});
