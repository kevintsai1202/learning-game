/**
 * 正式環境的學習報告驗收（docs/plans/learning-report.md）：只對外部伺服器跑，用真的 Muse。
 * 老師的學習分析（全班 AI 分析 → 針對指標 AI 出題預先勾好）、雲端孩子的學習報告（AI 的鼓勵與建議、家長分頁）。
 * 本機的 e2e/report.spec.ts 用假出題器、比對固定句子；這支只檢查有沒有出來，並印出 AI 寫的內容給人看。
 *
 * 執行（PowerShell 7；前端與伺服器都用 Zeabur 的網址）：
 *   $env:E2E_SERVER_URL = 'https://learning-island.zeabur.app'; $env:BASE_URL = 'https://learning-island.zeabur.app/'
 *   npx playwright test --config playwright.remote.config.ts e2e/report-live.spec.ts 2>&1 | Tee-Object -FilePath logs\e2e-report-live.log
 *   Remove-Item Env:E2E_SERVER_URL, Env:BASE_URL
 * 跑完用 .\scripts\deploy\purge-test-rooms.ps1 清掉 e2e_ 開頭的測試帳號、班級與分析結果。
 */
import { expect, test } from '@playwright/test';
import { SERVER, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors } from './onlineDevice';
import { classWithData } from './reportData';

const SHOTS = 'e2e/screenshots/report-live';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

test('正式環境：老師的 AI 學習分析、雲端孩子的學習報告與家長分頁', async ({ browser, baseURL, request }) => {
  test.skip(!process.env.E2E_SERVER_URL, '只對外部伺服器跑（本機用 e2e/report.spec.ts）');
  test.setTimeout(600_000);
  const config = await (await request.get(`${SERVER}/api/config`)).json();
  expect(config.aiQuestions, '伺服器沒有開 AI').toBe(true);
  const room = await classWithData(request);

  // 老師：全班 AI 分析（真的模型最多等 3 分鐘）
  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await expect(t.page.getByTestId('analysis-weak')).toContainText('N-2-13', { timeout: 30_000 });
  await t.page.getByTestId('analysis-ai').click();
  await expect(t.page.getByTestId('analysis-report').or(t.page.getByTestId('analysis-error'))).toBeVisible({ timeout: 180_000 });
  await expect(t.page.getByTestId('analysis-error')).toHaveCount(0);
  console.log(`老師的全班分析：${(await t.page.getByTestId('analysis-report').innerText()).replace(/\s+/g, ' ')}`);
  await t.page.getByTestId('analysis-report').scrollIntoViewIfNeeded();
  await t.page.screenshot({ path: `${SHOTS}/01-teacher-ai.png` });
  await t.page.getByTestId('analysis-make-questions').click();
  await expect(t.page.locator('[data-testid^="ai-indicators-chip-"]').first()).toBeVisible();
  expect(pageErrors(t.page)).toEqual([]);
  await t.context.close();

  // 雲端孩子：學習報告由 AI 寫（或 AI 的句子沒過檢查時改用規則；兩種都要有建議）
  const kid = await openDevice(browser, baseURL!);
  await loginAndEnter(kid.page, room.code, '阿寶', '1111');
  await kid.page.getByTestId('hud-report').click();
  await expect(kid.page.getByTestId('report-loading')).toHaveCount(0, { timeout: 180_000 });
  await expect(kid.page.locator('[data-testid^="report-tip-"]').first()).toBeVisible();
  const aiWrote = (await kid.page.getByTestId('report-source').count()) > 0;
  console.log(`孩子的報告（${aiWrote ? 'AI' : '規則'}）：${(await kid.page.locator('.report-advice').innerText()).replace(/\s+/g, ' ')}`);
  await kid.page.screenshot({ path: `${SHOTS}/02-kid-report.png` });

  await kid.page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
  for (const k of ['1', '2', '3', '4', '1', '2', '3', '4']) await kid.page.getByTestId(`pin-${k}`).click();
  await kid.page.getByTestId('tab-analysis').click();
  await expect(kid.page.getByTestId(aiWrote ? 'parent-ai' : 'parent-rules')).toBeVisible({ timeout: 30_000 });
  console.log(`家長分頁：${(await kid.page.getByTestId('parent-analysis').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`);
  expect(pageErrors(kid.page)).toEqual([]);
  await kid.context.close();
});
