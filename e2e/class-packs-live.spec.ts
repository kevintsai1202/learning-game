/**
 * 正式環境的老師 AI 出題驗收（docs/plans/ai-questions.md）：只對外部伺服器跑，用真的 Muse 出題。
 * 流程：老師勾跨科的兩個指標 → AI 出 5 題（真的模型，題數可能因檢查沒過而變少）→ 逐題印出給人看 → 儲存發佈 →
 * 線上的孩子在挑戰塔作答 → 老師停用後孩子看不到。本機的 e2e/class-packs.spec.ts 用假出題器，題數與額度是固定的；
 * 這支不比對固定題數，改成印出題目內容、提醒與丟掉的原因。
 *
 * 執行（PowerShell 7；前端與伺服器都用 Zeabur 的網址，同網址不用改 ALLOWED_ORIGINS）：
 *   $env:E2E_SERVER_URL = 'https://learning-island.zeabur.app'; $env:BASE_URL = 'https://learning-island.zeabur.app/'
 *   npx playwright test --config playwright.remote.config.ts e2e/class-packs-live.spec.ts 2>&1 | Tee-Object -FilePath logs\e2e-ai-live.log
 *   Remove-Item Env:E2E_SERVER_URL, Env:BASE_URL
 * 跑完用 .\scripts\deploy\purge-test-rooms.ps1 清掉 e2e_ 開頭的測試帳號與班級（docs/deploy-zeabur.md 第 8 節）。
 * 截圖在 e2e/screenshots/class-packs-live/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { enterZone, finishQuiz, screen } from './helpers';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, loginTeacher, openDevice, pageErrors, profileOf } from './onlineDevice';

const SHOTS = 'e2e/screenshots/class-packs-live';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 孩子裝置上這一班的班級題庫快取 */
const cachedPacks = (page: Page, code: string) =>
  page.evaluate((c) => ((window as any).__game.classContent.getState().cache[c]?.packs ?? []).map((p: any) => ({ id: p.id, title: p.title, count: p.pack.questions.length })), code);

/** 在指標勾選裡搜尋並勾一個指標 */
async function pickIndicator(page: Page, query: string, key: string): Promise<void> {
  await page.getByTestId('ai-indicators-search').fill(query);
  await page.getByTestId(`ai-indicators-${key}`).check();
  await page.getByTestId('ai-indicators-search').fill('');
}

test('正式環境：真的 AI 出題、審核、發佈，孩子作答，停用後看不到', async ({ browser, baseURL, request }) => {
  test.skip(!process.env.E2E_SERVER_URL, '只對外部伺服器跑（本機用 e2e/class-packs.spec.ts）');
  test.setTimeout(600_000);
  const config = await (await request.get(`${SERVER}/api/config`)).json();
  expect(config.aiQuestions, '伺服器沒有開 AI 出題（Zeabur 的 LLM_ 變數）').toBe(true);

  const room = await createClassViaApi(request, 'AI驗收班');
  const join = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'cat', color: '#ffffff', hat: null } } });
  expect(join.ok()).toBe(true);
  const kid = await openDevice(browser, baseURL!);
  await loginAndEnter(kid.page, room.code, '阿寶', '1111');

  const t = await openDevice(browser, baseURL!);
  await loginTeacher(t.page, room.username);
  await t.page.getByTestId(`class-${room.code}`).click();
  await expect(t.page.getByTestId('pack-ai')).toBeVisible({ timeout: 30_000 });
  await t.page.getByTestId('pack-ai').click();

  // ① 跨科勾兩個指標，出 5 題（一批），等真的模型（最多 3 分鐘）
  await pickIndicator(t.page, 'N-2-7', 'math:N-2-7');
  await pickIndicator(t.page, '上下學', 'life:Ba-Ⅰ-1');
  const started = Date.now();
  await t.page.getByTestId('ai-generate').click();
  await expect(t.page.getByTestId('ai-progress')).toBeVisible();
  await expect(t.page.getByTestId('ai-finished').or(t.page.getByTestId('ai-error'))).toBeVisible({ timeout: 180_000 });
  const seconds = Math.round((Date.now() - started) / 1000);
  await expect(t.page.getByTestId('ai-error'), 'AI 出題失敗').toHaveCount(0);
  const cards = t.page.locator('[data-testid^="q-card-"]');
  const n = await cards.count();
  console.log(`AI 出題：${n} 題，花 ${seconds} 秒；${(await t.page.getByTestId('ai-remaining').textContent()) ?? ''}`);
  for (let i = 0; i < n; i++) console.log(`第 ${i + 1} 題：${((await cards.nth(i).innerText()) ?? '').replace(/\s+/g, ' ').slice(0, 240)}`);
  if (await t.page.getByTestId('ai-dropped').count()) console.log(`丟掉的題目：${(await t.page.getByTestId('ai-dropped').innerText()).replace(/\s+/g, ' ')}`);
  expect(n, '至少要有 3 題通過檢查').toBeGreaterThanOrEqual(3);
  await t.page.screenshot({ path: `${SHOTS}/01-ai-drafts.png`, fullPage: true });

  // ② 儲存發佈
  await t.page.getByTestId('pack-title').fill('AI 驗收題庫');
  await t.page.getByTestId('pack-save').click();
  await expect(t.page.getByTestId('packs-note')).toContainText(`已儲存「AI 驗收題庫」（${n} 題）`);

  // ③ 線上的孩子收到，挑戰塔作答
  await expect.poll(() => cachedPacks(kid.page, room.code), { timeout: 30_000 }).toEqual([expect.objectContaining({ title: 'AI 驗收題庫', count: n })]);
  const [pack] = await cachedPacks(kid.page, room.code);
  await enterZone(kid.page, 'tower');
  await kid.page.getByTestId(`activity-class.${pack.id}`).click();
  await finishQuiz(kid.page);
  expect(await screen(kid.page)).toBe('result');
  await kid.page.screenshot({ path: `${SHOTS}/02-kid-result.png` });
  const history = (await profileOf(kid.page)).history;
  expect(history[history.length - 1].activityId).toBe(`class.${pack.id}`);

  // ④ 老師停用，孩子看不到
  await kid.page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await t.page.getByTestId('pack-enabled-0').uncheck();
  await expect.poll(() => cachedPacks(kid.page, room.code), { timeout: 30_000 }).toEqual([]);

  expect(pageErrors(kid.page)).toEqual([]);
  expect(pageErrors(t.page)).toEqual([]);
  await kid.context.close();
  await t.context.close();
});
