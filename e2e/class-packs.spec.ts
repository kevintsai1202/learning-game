/**
 * 班級題庫（G4）、題目編輯器（G6）與老師 AI 出題（docs/plans/ai-questions.md）：
 * - 老師在班級頁用 AI 依課綱出題（伺服器用假出題器，不連網）、逐題審核修改、刪除、單題重出、儲存發佈；
 *   線上的孩子馬上在班級島的挑戰塔看到「班級題庫」並作答；老師停用後孩子就看不到。
 * - 老師手動出題：空白時擋下儲存、填好後預覽、存檔；手機寬度的編輯器不超出畫面。
 * 截圖在 e2e/screenshots/class-packs/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { enterZone, finishQuiz, screen } from './helpers';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors, profileOf } from './onlineDevice';

const SHOTS = 'e2e/screenshots/class-packs';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 孩子裝置上這一班的班級題庫快取 */
const cachedPacks = (page: Page, code: string) =>
  page.evaluate((c) => ((window as any).__game.classContent.getState().cache[c]?.packs ?? []).map((p: any) => ({ id: p.id, title: p.title, count: p.pack.questions.length })), code);

/** 老師登入並打開班級頁 */
async function openClass(page: Page, username: string, code: string): Promise<void> {
  await loginTeacher(page, username);
  await page.getByTestId(`class-${code}`).click();
  await expect(page.getByTestId('class-packs')).toBeVisible();
}

/** 在指標勾選裡搜尋並勾一個指標 */
async function pickIndicator(page: Page, testId: string, query: string, key: string): Promise<void> {
  await page.getByTestId(`${testId}-search`).fill(query);
  await page.getByTestId(`${testId}-${key}`).check();
  await page.getByTestId(`${testId}-search`).fill('');
}

test('老師 AI 出題、審核修改、發佈，線上的孩子在挑戰塔作答；停用後看不到', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const config = await (await request.get(`${SERVER}/api/config`)).json();
  test.skip(!config.aiQuestions, '伺服器沒開 AI 出題（線上 e2e 不連真的 AI）');
  const room = await createClassViaApi(request, '二年一班');
  const join = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } } });
  expect(join.ok()).toBe(true);
  const kid = await openDevice(browser, baseURL!);
  await loginAndEnter(kid.page, room.code, '阿寶', '1111');

  const t = await openDevice(browser, baseURL!);
  await openClass(t.page, room.username, room.code);
  await expect(t.page.getByTestId('pack-ai')).toBeVisible();
  await t.page.getByTestId('pack-ai').click();
  await expect(t.page.getByTestId('ai-panel')).toBeVisible();

  // ① 勾兩個指標（跨科）、出 10 題（分兩批）
  await expect(t.page.getByTestId('ai-generate')).toBeDisabled();
  await pickIndicator(t.page, 'ai-indicators', 'N-2-7', 'math:N-2-7');
  await pickIndicator(t.page, 'ai-indicators', '上下學', 'life:Ba-Ⅰ-1');
  await expect(t.page.getByTestId('ai-indicators-chip-math:N-2-7')).toBeVisible();
  await t.page.getByTestId('ai-total').selectOption('10');
  await t.page.getByTestId('ai-note').fill('主題：上學途中');
  await t.page.getByTestId('ai-generate').click();
  await expect(t.page.getByTestId('ai-finished')).toBeVisible({ timeout: 60_000 });
  await expect(t.page.locator('[data-testid^="q-card-"]')).toHaveCount(10);
  await expect(t.page.getByTestId('q-ai-0')).toBeVisible();
  await expect(t.page.getByTestId('ai-remaining')).toHaveText('今天還能出 190 題');
  await t.page.screenshot({ path: `${SHOTS}/01-ai-drafts.png`, fullPage: true });

  // ② 審核：改第一題的題目文字（改過就不再是 AI 草稿）、刪掉最後一題、第二題重出
  await t.page.getByTestId('q-edit-0').click();
  await t.page.getByTestId('q-form-0-prompt').fill('老師改過的題目：一盒有 2 顆，3 盒有幾顆？');
  await expect(t.page.getByTestId('q-form-0').locator('.q-form-preview')).toContainText('老師改過的題目');
  await t.page.getByTestId('q-form-0-done').click();
  await expect(t.page.getByTestId('q-ai-0')).toHaveCount(0);
  await expect(t.page.getByTestId('q-preview-0')).toContainText('老師改過的題目');
  await t.page.getByTestId('q-delete-9').click();
  await expect(t.page.locator('[data-testid^="q-card-"]')).toHaveCount(9);
  const before = await t.page.getByTestId('q-preview-1').textContent();
  await t.page.getByTestId('q-redo-1').click();
  await expect.poll(() => t.page.getByTestId('q-preview-1').textContent(), { timeout: 30_000 }).not.toBe(before);
  await expect(t.page.getByTestId('q-ai-1')).toBeVisible();

  // ③ 沒有名稱不能存；填好名稱儲存
  await t.page.getByTestId('pack-save').click();
  await expect(t.page.getByTestId('pack-errors')).toContainText('題庫名稱不能空白');
  await t.page.getByTestId('pack-title').fill('上學與乘法');
  await t.page.getByTestId('pack-save').click();
  await expect(t.page.getByTestId('packs-note')).toContainText('已儲存「上學與乘法」（9 題）');
  await expect(t.page.getByTestId('pack-row-0')).toContainText('9');
  await t.page.screenshot({ path: `${SHOTS}/02-pack-saved.png`, fullPage: true });

  // ④ 線上的孩子馬上收到（content 通知 → 同步 → 版本號變了 → 抓班級內容），挑戰塔有「班級題庫」
  await expect.poll(() => cachedPacks(kid.page, room.code), { timeout: 20_000 }).toEqual([expect.objectContaining({ title: '上學與乘法', count: 9 })]);
  const [pack] = await cachedPacks(kid.page, room.code);
  await enterZone(kid.page, 'tower');
  await expect(kid.page.getByTestId(`activity-class.${pack.id}`)).toBeVisible();
  await expect(kid.page.getByText('班級題庫')).toBeVisible();
  await kid.page.screenshot({ path: `${SHOTS}/03-kid-tower.png` });
  await kid.page.getByTestId(`activity-class.${pack.id}`).click();
  await finishQuiz(kid.page);
  expect(await screen(kid.page)).toBe('result');
  const history = (await profileOf(kid.page)).history;
  expect(history[history.length - 1].activityId).toBe(`class.${pack.id}`);

  // ⑤ 老師停用：孩子的快取清掉這一包，挑戰塔看不到
  await kid.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await t.page.getByTestId('pack-enabled-0').uncheck();
  await expect(t.page.getByTestId('packs-note')).toContainText('已停用');
  await expect.poll(() => cachedPacks(kid.page, room.code), { timeout: 20_000 }).toEqual([]);
  await enterZone(kid.page, 'tower');
  await expect(kid.page.getByTestId(`activity-class.${pack.id}`)).toHaveCount(0);

  expect(pageErrors(kid.page)).toEqual([]);
  expect(pageErrors(t.page)).toEqual([]);
  await kid.context.close();
  await t.context.close();
});

test('老師手動出題：空白擋下、填好預覽、儲存；手機寬度不超出畫面', async ({ browser, baseURL, request }) => {
  test.setTimeout(180_000);
  const room = await createClassViaApi(request, '二年二班');
  const t = await openDevice(browser, baseURL!);
  await t.page.setViewportSize({ width: 390, height: 844 });
  await openClass(t.page, room.username, room.code);
  await t.page.getByTestId('pack-new').click();
  await expect(t.page.getByTestId('pack-editor')).toBeVisible();

  // 新增一題單選題：還沒填完時列出問題、存不了
  await t.page.getByTestId('q-add-type').selectOption('choice');
  await t.page.getByTestId('q-add').click();
  await expect(t.page.getByTestId('q-form-0-problems')).toBeVisible();
  await t.page.getByTestId('pack-title').fill('部首練習');
  await t.page.getByTestId('pack-save').click();
  await expect(t.page.getByTestId('pack-errors')).toContainText('第 1 題');

  // 填好題目、選項、正確答案與課綱指標
  await t.page.getByTestId('q-form-0-prompt').fill('「山」的部首是什麼？');
  await t.page.getByTestId('q-form-0-option-0').fill('口');
  await t.page.getByTestId('q-form-0-option-1').fill('山');
  await t.page.getByTestId('q-form-0-option-2').fill('水');
  await t.page.getByTestId('q-form-0-correct-1').check();
  await pickIndicator(t.page, 'q-form-0-indicators', 'Ab-Ⅰ-1', 'zh:Ab-Ⅰ-1');
  await expect(t.page.getByTestId('q-form-0-problems')).toHaveCount(0);
  await expect(t.page.getByTestId('q-form-0').locator('.q-form-preview .choice.correct')).toContainText('山');

  // 手機寬度：編輯器沒有水平超出
  const overflow = await t.page.evaluate(() => {
    const el = document.querySelector('.pack-editor') as HTMLElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await t.page.screenshot({ path: `${SHOTS}/04-manual-phone.png`, fullPage: true });

  await t.page.getByTestId('q-form-0-done').click();
  await t.page.getByTestId('pack-save').click();
  await expect(t.page.getByTestId('packs-note')).toContainText('已儲存「部首練習」（1 題）');

  // 再打開修改：內容還在
  await t.page.getByTestId('pack-edit-0').click();
  await expect(t.page.getByTestId('pack-title')).toHaveValue('部首練習');
  await expect(t.page.getByTestId('q-preview-0')).toContainText('「山」的部首是什麼？');
  await t.page.getByTestId('pack-cancel').click();

  expect(pageErrors(t.page)).toEqual([]);
  await t.context.close();
});
