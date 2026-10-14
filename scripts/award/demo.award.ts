/**
 * 比賽展示影片的錄影＋系統畫面截圖（docs/award/apcea-2026/README.md）：用真的 Muse（playwright.award.config.ts 的伺服器）。
 * 兩台裝置：孩子（阿寶，3D 島）與老師（班級頁）。每一段操作都包在 segment() 裡，只在那段時間錄（畫面串流，rec.ts），
 * 起訖時間記在 award-out/rec/marks.json，剪接腳本（edit.mjs）照分鏡表（storyboard.mjs）挑片段。
 * 流程（AI 學習閉環）：
 *   孩子在島上走、到數學城堡答題 → 老師 AI 出題（十十乘法＋常見的食物，主題中秋節）→ 審核、儲存發佈
 *   → 孩子在挑戰塔作答班級題庫 → 老師的學習分析（全班雷達圖、選一位孩子、AI 分析全班、一鍵針對弱項出題）
 *   → 孩子的學習報告（AI 寫的鼓勵與建議）→ 家長專區的學習分析。
 * 截圖存在 award-out/shots/（說明書與寄信的附件用）。AI 寫的內容印在 log 裡，給人檢查。
 * 聲音：遊戲的音效與預錄語音直接錄下來，裝置語音記下唸了什麼（rec.ts 的 installAudioTap），剪接時混進影片；
 * 遊戲的背景音樂關掉（影片另外配樂）。要讓觀眾聽到朗讀的地方（題目、AI 寫的鼓勵）會多停一下再操作。
 * 用法（PowerShell 7）：
 *   npm run build
 *   npx playwright test --config scripts/award/playwright.award.config.ts 2>&1 | Tee-Object -FilePath logs\award-record.log
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { currentQuestion, finishQuiz, screen } from '../../e2e/helpers';
import { SERVER, loginAndEnter } from '../../e2e/onlineDevice';
import { seedClass } from './demoData.mjs';
import { Recorder, clickOn, installAudioTap, installCursor, mark, moveTo, pause, saveMarks, scrollTo, typeIn } from './rec';

/** 截圖資料夾 */
const SHOTS = 'award-out/shots';
/** 錄影用的老師帳號（本機記憶體資料庫，每次啟動都是空的） */
const TEACHER = { username: 'bear_teacher', password: 'demo-teach-2026', email: 'bear_teacher@example.com', className: '二年一班' };

/** 開一台錄影用的裝置：1280×720、3D 畫質高、遊戲配樂關掉、伺服器網址寫進 localStorage、注入假游標與錄音 */
async function openRecDevice(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 720 } });
  await context.addInitScript((url) => localStorage.setItem('learning-island-server-url', url), SERVER);
  await installCursor(context);
  await installAudioTap(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (e) => console.log(`[頁面錯誤] ${e.message}`));
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.clear();
    (window as any).__game.game.getState().updateSettings({ quality: 'high', music: false });
  });
  await page.reload();
  await expect(page.getByTestId('start')).toBeVisible();
  // 點一下空白處：遊戲在第一次點擊時才建立 AudioContext，之後的音效與預錄語音才錄得到
  await page.mouse.click(20, 20);
  await pause(page, 300);
  return page;
}

/** 截圖（系統畫面）：先把假游標藏起來，截完再放回來 */
async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.getElementById('__demo_cursor')?.style.setProperty('visibility', 'hidden'));
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  await page.evaluate(() => document.getElementById('__demo_cursor')?.style.setProperty('visibility', 'visible'));
}

/** 錄一段：開始錄、記起點、做事、記終點、停錄 */
async function segment(rec: Recorder, name: string, body: () => Promise<void>): Promise<void> {
  await rec.start(name);
  mark(rec.name, `${name}:start`);
  await body();
  mark(rec.name, `${name}:end`);
  await rec.stop();
}

/** 像孩子一樣作答目前這一題（游標移過去再按）；其他題型交給 e2e 的自動作答 */
async function answerVisibly(page: Page): Promise<void> {
  const q = await currentQuestion(page);
  if (q.type === 'choice') {
    await clickOn(page, page.getByTestId(`choice-${q.answer}`), 200);
  } else if (q.type === 'number') {
    for (const d of String(q.answer)) await clickOn(page, page.getByTestId(`key-${d}`), 150);
    await clickOn(page, page.getByTestId('key-✓'), 200);
  } else if (q.type === 'order') {
    for (const t of q.answer as string[]) await clickOn(page, page.locator('.token:not(.placed)', { hasText: t }).first(), 150);
    await clickOn(page, page.getByRole('button', { name: '✓ 完成' }), 200);
  } else {
    const { answerCurrent } = await import('../../e2e/helpers');
    await answerCurrent(page, true);
  }
}

/** 看得到地答 n 題（每題答對後等換題）；think：題目出現後等多久才作答（毫秒，讓題目的朗讀唸得完） */
async function answerSome(page: Page, n: number, think = 900): Promise<void> {
  for (let i = 0; i < n; i++) {
    if ((await screen(page)) === 'result') return;
    const before = await currentQuestion(page);
    await pause(page, think);
    await answerVisibly(page);
    await expect
      .poll(async () => {
        if ((await screen(page)) === 'result') return 'done';
        const now = await currentQuestion(page);
        return now && now.id !== before.id ? 'next' : 'wait';
      }, { timeout: 15_000 })
      .not.toBe('wait');
  }
}

/** 按住方向鍵走一段 */
async function walk(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await pause(page, ms);
  await page.keyboard.up(key);
}

/** 孩子裝置上這一班的班級題庫快取 */
const cachedPacks = (page: Page, code: string) =>
  page.evaluate((c) => ((window as any).__game.classContent.getState().cache[c]?.packs ?? []).map((p: any) => ({ id: p.id, title: p.title })), code);

test('展示影片：AI 學習閉環（真的 Muse）', async ({ browser, baseURL }) => {
  mkdirSync(SHOTS, { recursive: true });
  const config = await (await fetch(`${SERVER}/api/config`)).json();
  expect(config.aiQuestions, '錄影用的伺服器沒有開 AI（.env 要有 LLM_API_KEY 等變數）').toBe(true);

  // 準備：老師、班級、6 個示範孩子與作答紀錄
  const room = await seedClass({ server: SERVER, ...TEACHER });
  console.log(`班級 ${room.code}，老師 ${TEACHER.username}`);

  const kid = await openRecDevice(browser, baseURL!);
  const teacher = await openRecDevice(browser, baseURL!);
  const kRec = new Recorder(kid, 'kid');
  const tRec = new Recorder(teacher, 'teacher');
  await loginAndEnter(kid, room.code, '阿寶', '1111');
  await pause(kid, 3000);

  // ① 孩子在 3D 島上走動，走進數學城堡答題
  await segment(kRec, 'island', async () => {
    await pause(kid, 1200);
    await walk(kid, 'ArrowUp', 1800);
    await walk(kid, 'ArrowLeft', 900);
    await walk(kid, 'ArrowUp', 1400);
    await pause(kid, 600);
    await shot(kid, '01-island');
    await walk(kid, 'ArrowRight', 1200);
    await pause(kid, 800);
  });
  await segment(kRec, 'quiz', async () => {
    await kid.evaluate(() => (window as any).__game.ui.getState().enterZone('math'));
    await expect.poll(() => screen(kid)).toBe('zone');
    await pause(kid, 1200);
    await clickOn(kid, kid.getByTestId('activity-math.times'), 700);
    await clickOn(kid, kid.getByTestId('level-1'), 1500);
    await shot(kid, '02-quiz');
    // 第一題等題目唸完、答對的稱讚也唸完，旁白才開始（storyboard.mjs 的 quiz 對齊 quiz:spoken）
    await answerSome(kid, 1, 3200);
    await pause(kid, 1600);
    mark('kid', 'quiz:spoken');
    await answerSome(kid, 2, 1800);
    await pause(kid, 800);
  });
  await kid.evaluate(() => (window as any).__game.ui.getState().goto('island'));

  // ② 老師登入，AI 依課綱出題
  await segment(tRec, 'login', async () => {
    await pause(teacher, 800);
    await clickOn(teacher, teacher.getByTestId('teacher-link'), 800);
    await typeIn(teacher, teacher.getByTestId('account-username'), TEACHER.username);
    await typeIn(teacher, teacher.getByTestId('account-password'), TEACHER.password);
    await clickOn(teacher, teacher.getByTestId('account-submit'), 1200);
    await expect(teacher.getByTestId('account-name')).toContainText(TEACHER.username);
    await clickOn(teacher, teacher.getByTestId(`class-${room.code}`), 1500);
    await expect(teacher.getByTestId('class-packs')).toBeVisible();
  });
  await segment(tRec, 'aiSetup', async () => {
    await scrollTo(teacher, teacher.getByTestId('class-packs'));
    await clickOn(teacher, teacher.getByTestId('pack-ai'), 900);
    await expect(teacher.getByTestId('ai-panel')).toBeVisible();
    await scrollTo(teacher, teacher.getByTestId('ai-panel'));
    // 跨科勾兩個指標：十十乘法（數學）、生活中常見的食物（生活）
    await typeIn(teacher, teacher.getByTestId('ai-indicators-search'), '十十乘法');
    await moveTo(teacher, teacher.getByTestId('ai-indicators-math:N-2-7'));
    await teacher.getByTestId('ai-indicators-math:N-2-7').check();
    await pause(teacher, 600);
    await typeIn(teacher, teacher.getByTestId('ai-indicators-search'), '食物');
    await moveTo(teacher, teacher.getByTestId('ai-indicators-life:Ea-Ⅰ-1'));
    await teacher.getByTestId('ai-indicators-life:Ea-Ⅰ-1').check();
    await pause(teacher, 600);
    await teacher.getByTestId('ai-indicators-search').fill('');
    await moveTo(teacher, teacher.getByTestId('ai-total'));
    await teacher.getByTestId('ai-total').selectOption('5');
    mark('teacher', 'aiSetup:note');
    await typeIn(teacher, teacher.getByTestId('ai-note'), '主題：中秋節（月餅、柚子、烤肉）');
    await pause(teacher, 600);
    await shot(teacher, '03-ai-setup');
  });
  await segment(tRec, 'aiRun', async () => {
    await clickOn(teacher, teacher.getByTestId('ai-generate'), 300);
    mark('teacher', 'aiRun:wait');
    const started = Date.now();
    await expect(teacher.getByTestId('ai-finished').or(teacher.getByTestId('ai-error'))).toBeVisible({ timeout: 240_000 });
    mark('teacher', 'aiRun:done');
    await expect(teacher.getByTestId('ai-error'), 'AI 出題失敗').toHaveCount(0);
    console.log(`AI 出題花 ${Math.round((Date.now() - started) / 1000)} 秒`);
    await pause(teacher, 1500);
  });
  const cards = teacher.locator('[data-testid^="q-card-"]');
  const n = await cards.count();
  for (let i = 0; i < n; i++) console.log(`AI 第 ${i + 1} 題：${(await cards.nth(i).innerText()).replace(/\s+/g, ' ').slice(0, 300)}`);
  if (await teacher.getByTestId('ai-dropped').count()) console.log(`丟掉的題目：${(await teacher.getByTestId('ai-dropped').innerText()).replace(/\s+/g, ' ')}`);
  expect(n, '至少要有 3 題通過檢查').toBeGreaterThanOrEqual(3);

  await segment(tRec, 'review', async () => {
    await scrollTo(teacher, teacher.getByTestId('q-card-0'));
    await pause(teacher, 1500);
    await shot(teacher, '04-ai-drafts');
    // 逐題看過：捲過每一張卡片
    for (let i = 1; i < n; i++) {
      await scrollTo(teacher, teacher.getByTestId(`q-card-${i}`));
      await pause(teacher, 900);
    }
    // 打開第一題的編輯表單看一下（老師可以改題目、選項與解說），再收起來
    await scrollTo(teacher, teacher.getByTestId('q-card-0'));
    mark('teacher', 'review:edit');
    await clickOn(teacher, teacher.getByTestId('q-edit-0'), 1800);
    await clickOn(teacher, teacher.getByTestId('q-form-0-done'), 800);
    // 儲存發佈
    mark('teacher', 'review:save');
    await typeIn(teacher, teacher.getByTestId('pack-title'), '中秋節乘法練習');
    await clickOn(teacher, teacher.getByTestId('pack-save'), 600);
    await expect(teacher.getByTestId('packs-note')).toContainText('已儲存「中秋節乘法練習」');
    await scrollTo(teacher, teacher.getByTestId('packs-note'), 200);
    await pause(teacher, 1500);
  });

  // ③ 孩子在挑戰塔作答班級題庫
  await expect.poll(() => cachedPacks(kid, room.code), { timeout: 30_000 }).toEqual([expect.objectContaining({ title: '中秋節乘法練習' })]);
  const [pack] = await cachedPacks(kid, room.code);
  await segment(kRec, 'pack', async () => {
    await kid.evaluate(() => (window as any).__game.ui.getState().enterZone('tower'));
    await expect.poll(() => screen(kid)).toBe('zone');
    await pause(kid, 1200);
    await moveTo(kid, kid.getByTestId(`activity-class.${pack.id}`));
    // 等旁白（孩子走進挑戰塔…）講完才打開題庫，題目的朗讀才不會和旁白疊在一起
    await pause(kid, 3800);
    await clickOn(kid, kid.getByTestId(`activity-class.${pack.id}`), 1500);
    await shot(kid, '05-kid-classpack');
    // AI 出的題目比較長，等唸完再作答
    await answerSome(kid, 2, 4200);
    await pause(kid, 1500);
  });
  // 剩下的題目不錄，直接答完（作答紀錄同步到伺服器）
  await finishQuiz(kid);
  await kid.evaluate(() => (window as any).__game.ui.getState().goto('island'));

  // ④ 老師的學習分析：全班雷達圖、選一位孩子、AI 分析全班
  await segment(tRec, 'analysis', async () => {
    await scrollTo(teacher, teacher.getByTestId('teacher-analysis'), 60);
    await pause(teacher, 1500);
    await scrollTo(teacher, teacher.getByTestId('analysis-weak'), 120);
    await pause(teacher, 1500);
    await scrollTo(teacher, teacher.getByTestId('teacher-analysis'), 60);
    const bao = await teacher.getByTestId('analysis-member').locator('option', { hasText: '阿寶' }).getAttribute('value');
    mark('teacher', 'analysis:member');
    await moveTo(teacher, teacher.getByTestId('analysis-member'));
    await teacher.getByTestId('analysis-member').selectOption(bao!);
    await expect(teacher.getByTestId('analysis-radar-compare')).toHaveCount(1);
    await pause(teacher, 2200);
    await shot(teacher, '06-teacher-member');
    await teacher.getByTestId('analysis-member').selectOption('');
    await pause(teacher, 1000);
  });
  await segment(tRec, 'analysisAi', async () => {
    await clickOn(teacher, teacher.getByTestId('analysis-ai'), 300);
    mark('teacher', 'analysisAi:wait');
    await expect(teacher.getByTestId('analysis-report').or(teacher.getByTestId('analysis-error'))).toBeVisible({ timeout: 240_000 });
    mark('teacher', 'analysisAi:done');
    await expect(teacher.getByTestId('analysis-error'), 'AI 分析失敗').toHaveCount(0);
    console.log(`老師的全班分析：${(await teacher.getByTestId('analysis-report').innerText()).replace(/\s+/g, ' ')}`);
    await scrollTo(teacher, teacher.getByTestId('analysis-report'), 80);
    await pause(teacher, 3500);
    await shot(teacher, '07-teacher-ai');
    // 閉環：針對分析出的弱項指標 AI 出題，指標已經勾好
    mark('teacher', 'analysisAi:loop');
    await clickOn(teacher, teacher.getByTestId('analysis-make-questions'), 1200);
    await pause(teacher, 1500);
    await expect(teacher.locator('[data-testid^="ai-indicators-chip-"]').first()).toBeVisible();
    await scrollTo(teacher, teacher.getByTestId('ai-panel'), 60);
    await pause(teacher, 2500);
    await shot(teacher, '10-ai-loop');
  });

  // ⑤ 孩子的學習報告（AI 寫的鼓勵與建議）與家長專區
  await segment(kRec, 'report', async () => {
    await pause(kid, 1000);
    await clickOn(kid, kid.getByTestId('hud-report'), 300);
    mark('kid', 'report:wait');
    await expect(kid.getByTestId('report-loading')).toHaveCount(0, { timeout: 240_000 });
    mark('kid', 'report:done');
    await expect(kid.locator('[data-testid^="report-tip-"]').first()).toBeVisible();
    const aiWrote = (await kid.getByTestId('report-source').count()) > 0;
    console.log(`孩子的報告（${aiWrote ? 'AI' : '規則'}）：${(await kid.locator('.report-advice').innerText()).replace(/\s+/g, ' ')}`);
    // 等第一句旁白講完，按鼓勵旁邊的 🔊，讓觀眾聽到 AI 寫的句子唸出來
    await pause(kid, 5200);
    await clickOn(kid, kid.getByTestId('report-cheer').getByRole('button', { name: '唸出來' }), 3800);
    mark('kid', 'report:said');
    await clickOn(kid, kid.getByTestId('report-radar-label-measure'), 1800);
    await shot(kid, '08-kid-report');
    await moveTo(kid, kid.locator('[data-testid^="report-tip-"]').first());
    await pause(kid, 4000);
  });
  await segment(kRec, 'parent', async () => {
    await kid.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
    for (const k of ['1', '2', '3', '4', '1', '2', '3', '4']) await clickOn(kid, kid.getByTestId(`pin-${k}`), 120);
    // 設定家長 PIN 這一段剪接時快轉（storyboard.mjs 的 parent）
    mark('kid', 'parent:pin');
    await clickOn(kid, kid.getByTestId('tab-analysis'), 600);
    await expect(kid.getByTestId('parent-radar')).toBeVisible();
    await expect(kid.getByTestId('parent-ai').or(kid.getByTestId('parent-rules'))).toBeVisible({ timeout: 240_000 });
    if (await kid.getByTestId('parent-ai').count()) console.log(`家長分頁（AI）：${(await kid.getByTestId('parent-ai').innerText()).replace(/\s+/g, ' ')}`);
    await pause(kid, 1500);
    await scrollTo(kid, kid.getByTestId('parent-ai').or(kid.getByTestId('parent-rules')), 120);
    await pause(kid, 3000);
    await shot(kid, '09-parent-analysis');
  });

  saveMarks();
  await kid.context().close();
  await teacher.context().close();
});
