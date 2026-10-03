/**
 * 線上版 e2e 共用：開一台模擬的平板（獨立的瀏覽器環境）、讀存檔與同步狀態、收集裝置紀錄。
 * 伺服器由 playwright.config.ts 的 webServer 啟動（http://localhost:8787，PGlite 記憶體資料庫，Google 測試模式）。
 */
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

/** 班級伺服器網址：預設是 playwright.config.ts 啟動的本機伺服器；E2E_SERVER_URL 可以改測外部伺服器（playwright.remote.config.ts） */
export const SERVER = (process.env.E2E_SERVER_URL ?? 'http://localhost:8787').replace(/\/+$/, '');

/** 各台裝置的 console 錯誤、WebGL 警告與頁面崩潰（測試失敗時印出來，方便判斷原因） */
export const deviceLogs: string[] = [];

/** 在 test.afterEach 呼叫：測試失敗時印出裝置紀錄，然後清空 */
export function flushDeviceLogs(testInfo: TestInfo): void {
  if (testInfo.status !== testInfo.expectedStatus && deviceLogs.length) console.log(['裝置紀錄：', ...deviceLogs].join('\n'));
  deviceLogs.length = 0;
}

/**
 * 開一個新的瀏覽器環境（模擬另一台平板），把伺服器網址寫進 localStorage，清空存檔後打開首頁。
 * opts.touch：模擬觸控裝置（有搖桿）。
 * 3D 畫質設成「低」（產品既有的設定）：headless 用軟體 WebGL，三台裝置同時畫有陰影的 3D 會把 CPU 吃滿，
 * 第三台載入時會卡住（2026-10-03 實測：第三台的 reload 超過 30 秒沒觸發 load）。
 */
export async function openDevice(browser: Browser, baseURL: string, opts: { touch?: boolean } = {}): Promise<{ context: BrowserContext; page: Page }> {
  // touch：模擬觸控裝置（島上會出現搖桿）；不設 isMobile，測試中途還要把畫面改成電腦尺寸
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, hasTouch: opts.touch ?? false });
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

/** 頁面錯誤（openDevice 收集的） */
export function pageErrors(page: Page): string[] {
  return (page as Page & { errors?: string[] }).errors ?? [];
}

/** 目前角色（存檔裡的） */
export async function profileOf(page: Page): Promise<any> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.game.getState().profile())));
}

/** 同步狀態 */
export async function cloudState(page: Page): Promise<{ status: string; pending: number }> {
  return page.evaluate(() => {
    const s = (window as any).__game.cloud.getState();
    return { status: s.status, pending: s.pending };
  });
}

/** 用班級帳號登入並進島，等即時連線連上 */
export async function loginAndEnter(page: Page, code: string, nickname: string, pin: string): Promise<void> {
  await page.evaluate(({ code, nickname, pin }) => (window as any).__game.cloud.getState().login({ code, nickname, pin }), { code, nickname, pin });
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await expect.poll(() => page.evaluate(() => (window as any).__game.realtime.getState().status)).toBe('online');
}

/** e2e 建的大人帳號都用這個密碼（scripts/deploy 的清理腳本靠帳號名稱開頭的 e2e_ 找測試資料） */
export const TEST_PASSWORD = 'teach1234';

/** 每次都不一樣的帳號名稱：e2e_＋時間＋亂數（對正式伺服器重跑時不會撞名；最多 20 字、只有小寫英數與底線） */
export function uniqueUsername(): string {
  return `e2e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 20);
}

/** 用 API 註冊一位老師並建立班級（準備資料用，畫面流程另外測），回傳班級代碼、老師權杖與帳號 */
export async function createClassViaApi(request: APIRequestContext, name: string): Promise<{ code: string; token: string; username: string }> {
  const username = uniqueUsername();
  const reg = await request.post(`${SERVER}/api/users`, { data: { username, password: TEST_PASSWORD, email: `${username}@example.com`, parent: false, teacher: true } });
  expect(reg.ok(), `註冊老師 ${reg.status()}`).toBe(true);
  const { token } = (await reg.json()) as { token: string };
  const room = await request.post(`${SERVER}/api/teacher/rooms`, { data: { name }, headers: { authorization: `Bearer ${token}` } });
  expect(room.ok(), `建立班級 ${room.status()}`).toBe(true);
  return { code: ((await room.json()) as { room: { code: string } }).room.code, token, username };
}

/** 在標題畫面打開帳號頁，用畫面註冊一位老師並建立班級，回傳班級代碼與帳號名稱（停在班級管理頁） */
export async function registerTeacherAndCreateClass(page: Page, className: string): Promise<{ code: string; username: string }> {
  const username = uniqueUsername();
  await page.getByTestId('teacher-link').click();
  await page.getByTestId('account-tab-register').click();
  await page.getByTestId('account-username').fill(username);
  await page.getByTestId('account-password').fill(TEST_PASSWORD);
  await page.getByTestId('account-confirm').fill(TEST_PASSWORD);
  await page.getByTestId('account-email').fill(`${username}@example.com`);
  await page.getByTestId('role-teacher').click();
  await expect(page.getByTestId('role-teacher')).toBeChecked();
  await page.getByTestId('account-submit').click();
  await page.getByTestId('class-name').fill(className);
  await page.getByTestId('class-create').click();
  const code = (await page.getByTestId('room-code-display').textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);
  return { code, username };
}

/** 在標題畫面打開帳號頁，用帳號密碼登入（沒勾保持登入），停在「我的班級」 */
export async function loginTeacher(page: Page, username: string, password = TEST_PASSWORD): Promise<void> {
  await page.getByTestId('teacher-link').click();
  await page.getByTestId('account-username').fill(username);
  await page.getByTestId('account-password').fill(password);
  await page.getByTestId('account-submit').click();
  await expect(page.getByTestId('account-name')).toContainText(username);
}
