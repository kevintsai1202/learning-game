/**
 * 線上版 P1：老師建立房間 → 孩子帶本機進度加入 → 換一台裝置登入看到進度與錯題本 →
 * 離線玩完、恢復連線後自動上傳 → 老師重設密碼後要重新登入。
 * 伺服器由 playwright.config.ts 的 webServer 啟動（http://localhost:8787，PGlite 記憶體資料庫）。
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { answerCurrent, createKid, enterZone, finishQuiz, screen } from './helpers';

const SERVER = 'http://localhost:8787';
const SHOTS = 'e2e/screenshots/online';

/** 開一個新的瀏覽器環境（模擬另一台平板），把伺服器網址寫進 localStorage，清空存檔後打開首頁 */
async function openDevice(browser: Browser, baseURL: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
  await context.addInitScript((url) => localStorage.setItem('learning-island-server-url', url), SERVER);
  const page = await context.newPage();
  // 單一步驟最多等 30 秒，卡住時馬上失敗
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { errors?: string[] }).errors = errors;
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
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
