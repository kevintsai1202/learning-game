/**
 * 學習報告（docs/plans/learning-report.md）：
 * - 孩子（單機）：島上按 📊 打開，雷達圖與面向清單照存檔的指標統計；規則建議（最弱的面向），按「去練習」到那一棟建築；
 *   作答太少的面向寫「練習太少」；手機寬度不超出畫面；家長專區的「學習分析」分頁（規則）
 * - 老師：全班雷達圖、選孩子疊上全班平均、弱項指標、AI 分析全班（假出題器）、「針對這些指標 AI 出題」預先勾好指標
 * - 雲端的孩子：學習報告由 AI 寫鼓勵與建議（假出題器）；家長分頁看到寫給家長的摘要
 * 截圖在 e2e/screenshots/report/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, freshStart, screen } from './helpers';
import { SERVER, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors } from './onlineDevice';
import { classWithData } from './reportData';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

const SHOTS = 'e2e/screenshots/report';

/** 把目前角色的指標統計換掉（作答 a 題、一次答對 f 題） */
async function setIndicators(page: Page, indicators: Record<string, [number, number]>): Promise<void> {
  await page.evaluate((ind) => {
    const g = (window as any).__game.game.getState();
    const p = g.profile();
    const map = Object.fromEntries(Object.entries(ind).map(([k, [a, f]]) => [k, { attempts: a, firstTry: f }]));
    g.putProfile({ ...p, indicators: map });
  }, indicators);
}

test('孩子的學習報告（單機）：雷達圖、規則建議、去練習；手機寬度不超出畫面', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小美');
  // 時鐘弱（30%）、注音普通（60%）、乘法很好（90%）；生活沒練過
  await setIndicators(page, { 'math:N-2-7': [20, 18], 'math:N-2-13': [10, 3], 'zh:Aa-Ⅰ-2': [10, 6] });

  await page.getByTestId('hud-report').click();
  await expect(page.getByTestId('report-radar')).toBeVisible();
  await expect(page.getByTestId('report-areas-measure')).toContainText('30%');
  await expect(page.getByTestId('report-areas-number')).toContainText('90%');
  await expect(page.getByTestId('report-areas-life')).toContainText('練習太少');
  await expect(page.getByTestId('report-radar-label-life')).toHaveClass(/empty/);
  // 單機：規則建議，最弱的在前（量與時間 → 注音），不夠再補還沒練夠的面向
  await expect(page.getByTestId('report-tip-measure')).toBeVisible();
  await expect(page.getByTestId('report-tip-zhuyin')).toBeVisible();
  await expect(page.getByTestId('report-source')).toHaveCount(0);
  // 點軸的名稱看數值
  await page.getByTestId('report-radar-label-measure').click();
  await expect(page.getByTestId('report-radar-tip')).toContainText('量與時間：30%');
  await page.screenshot({ path: `${SHOTS}/01-kid-report.png` });

  // 手機寬度：報告不超出畫面
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.report-panel .panel-body') as HTMLElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/02-kid-report-phone.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  // 去練習：到數學城堡
  await page.getByTestId('report-go-measure').click();
  await expect.poll(() => screen(page)).toBe('zone');
  expect(await page.evaluate(() => (window as any).__game.ui.getState().zone)).toBe('math');

  // 家長專區的學習分析（單機：規則）
  await page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
  for (const k of ['1', '2', '3', '4', '1', '2', '3', '4']) await page.getByTestId(`pin-${k}`).click();
  await page.getByTestId('tab-analysis').click();
  await expect(page.getByTestId('parent-radar')).toBeVisible();
  await expect(page.getByTestId('parent-rules')).toContainText('可以多練：量與時間（30%）');
  await expect(page.getByTestId('parent-rules')).toContainText('表現好：計算（90%）');
  await page.screenshot({ path: `${SHOTS}/03-parent-rules.png` });
});

test('老師的學習分析：全班雷達圖、選孩子疊上全班平均、AI 分析、針對指標 AI 出題', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  const config = await (await request.get(`${SERVER}/api/config`)).json();
  test.skip(!config.aiQuestions, '伺服器沒開 AI');
  const room = await classWithData(request);
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await expect(t.page.getByTestId('teacher-analysis')).toBeVisible();
  await expect(t.page.getByTestId('analysis-weak')).toContainText('N-2-13');
  await expect(t.page.getByTestId('analysis-radar-compare')).toHaveCount(0);

  // 選阿寶：疊上全班平均
  const bao = await t.page.getByTestId('analysis-member').locator('option', { hasText: '阿寶' }).getAttribute('value');
  await t.page.getByTestId('analysis-member').selectOption(bao!);
  await expect(t.page.getByTestId('analysis-radar-compare')).toHaveCount(1);
  await expect(t.page.getByTestId('analysis-weak')).toContainText('N-2-13');
  await t.page.getByTestId('teacher-analysis').scrollIntoViewIfNeeded();
  await t.page.screenshot({ path: `${SHOTS}/04-teacher-member.png` });

  // 回到全班，AI 分析
  await t.page.getByTestId('analysis-member').selectOption('');
  await t.page.getByTestId('analysis-ai').click();
  await expect(t.page.getByTestId('analysis-report')).toBeVisible({ timeout: 30_000 });
  await expect(t.page.getByTestId('analysis-focus')).toContainText('N-2-');
  await t.page.getByTestId('analysis-report').scrollIntoViewIfNeeded();
  await t.page.screenshot({ path: `${SHOTS}/05-teacher-ai.png` });

  // 針對這些指標 AI 出題：打開編輯器、展開 AI 出題、預先勾好
  await t.page.getByTestId('analysis-make-questions').click();
  await expect(t.page.getByTestId('ai-panel')).toBeVisible();
  await expect(t.page.locator('[data-testid^="ai-indicators-chip-math:N-2-"]').first()).toBeVisible();
  await expect(t.page.getByTestId('ai-generate')).toBeEnabled();
  expect(pageErrors(t.page)).toEqual([]);
  await t.context.close();
});

test('雲端的孩子：學習報告由 AI 寫鼓勵與建議；家長分頁看到給家長的摘要', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  const config = await (await request.get(`${SERVER}/api/config`)).json();
  test.skip(!config.aiQuestions, '伺服器沒開 AI');
  const room = await classWithData(request);
  const kid = await openDevice(browser, baseURL!);
  await loginAndEnter(kid.page, room.code, '阿寶', '1111');
  await kid.page.getByTestId('hud-report').click();
  await expect(kid.page.getByTestId('report-source')).toBeVisible({ timeout: 30_000 });
  await expect(kid.page.getByTestId('report-cheer')).toContainText('你每天都很認真');
  await expect(kid.page.locator('[data-testid^="report-tip-"]').first()).toBeVisible();
  await kid.page.screenshot({ path: `${SHOTS}/06-kid-ai.png` });

  await kid.page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
  for (const k of ['1', '2', '3', '4', '1', '2', '3', '4']) await kid.page.getByTestId(`pin-${k}`).click();
  await kid.page.getByTestId('tab-analysis').click();
  await expect(kid.page.getByTestId('parent-ai')).toContainText('測試摘要');
  expect(pageErrors(kid.page)).toEqual([]);
  await kid.context.close();
});
