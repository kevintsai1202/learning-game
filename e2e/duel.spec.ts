/**
 * 和朋友益智對戰（島嶼互訪 I4，docs/plans/islands.md 第 12 節 I4 實作設計）：兩台裝置在同一班的班級島上。
 * 阿寶在益智遊戲館選遊戲、邀請小美 → 小美在島上看到邀請卡、按「一起玩」→ 兩邊同一局；
 * 伺服器依收到的順序判誰先答對，兩邊的比分相反、各自拿自己的星星與金幣。
 * 另外：拒絕、中途離開（對方直接贏）、記憶翻牌輪流翻、找不同搶找、七巧板先拼好的贏。
 * 截圖在 e2e/screenshots/duel/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { answerCurrent } from './helpers';
import { SERVER, createClassViaApi, flushDeviceLogs, loginAndEnter, openDevice, pageErrors } from './onlineDevice';

const SHOTS = 'e2e/screenshots/duel';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 遊戲公開給 e2e 的狀態（src/puzzle/debug.ts） */
const puzzleState = (page: Page): Promise<any> => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.puzzle.state)));

/** 直接進益智遊戲館（跳過走路） */
async function enterPuzzle(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.ui.getState().enterZone('puzzle'));
  await expect(page.getByTestId('puzzle-menu')).toBeVisible();
}

/** 建一個班、兩個孩子各自用一台裝置登入進班級島 */
async function twoKids(browser: any, baseURL: string, request: any): Promise<{ a: Page; b: Page }> {
  const room = await createClassViaApi(request, '二年四班');
  for (const [nickname, pin, animal] of [
    ['阿寶', '1111', 'capybara'],
    ['小美', '2222', 'panda'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal, color: '#8b5a2b', hat: null } } });
    expect(res.ok()).toBe(true);
  }
  const a = await openDevice(browser, baseURL);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  const b = await openDevice(browser, baseURL);
  await loginAndEnter(b.page, room.code, '小美', '2222');
  // 兩邊都看得到對方（即時連線上線、伺服器支援對戰）
  for (const p of [a.page, b.page]) {
    await expect.poll(() => p.evaluate(() => (window as any).__game.realtime.getState().duel)).toBe(true);
    await expect.poll(() => p.evaluate(() => Object.keys((window as any).__game.presence.getState().members).length)).toBe(2);
  }
  return { a: a.page, b: b.page };
}

/**
 * 阿寶在益智遊戲館邀請小美玩某個遊戲（level：難度，益智搶答不分），小美在島上接受；兩邊都進到對戰畫面
 */
async function startDuel(a: Page, b: Page, game: string, testId: string, level?: 1 | 2 | 3): Promise<void> {
  await enterPuzzle(a);
  await a.getByTestId(`puzzle-${game}`).click();
  if (level) await a.getByTestId(`duel-level-${level}`).click();
  await a.getByTestId('duel-invite-小美').click();
  await expect(a.getByTestId('duel-waiting')).toContainText('等 小美 接受邀請');
  await expect(b.getByTestId('duel-invite')).toContainText('阿寶 邀請你一起玩');
  await b.getByTestId('duel-accept').click();
  for (const p of [a, b]) await expect(p.getByTestId(testId)).toHaveAttribute('data-mode', 'friend');
}

test('益智搶答：邀請、接受、伺服器判誰先答對，兩邊的比分相反、各拿各的星星與金幣', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const { a, b } = await twoKids(browser, baseURL!, request);

  // 選玩法看得到「和朋友玩」與島上的小美
  await enterPuzzle(a);
  await a.getByTestId('puzzle-quiz').click();
  await expect(a.getByTestId('duel-invite-小美')).toBeVisible();
  await a.screenshot({ path: `${SHOTS}/01-mode-picker.png` });
  await a.getByTestId('duel-invite-小美').click();
  await expect(a.getByTestId('duel-waiting')).toBeVisible();
  await expect(b.getByTestId('duel-invite')).toContainText('阿寶 邀請你一起玩「益智搶答」');
  await b.screenshot({ path: `${SHOTS}/02-invite-card.png` });
  await b.getByTestId('duel-accept').click();
  for (const p of [a, b]) await expect(p.getByTestId('quiz-game')).toHaveAttribute('data-mode', 'friend');
  // 兩邊的題目一樣
  const qa = await a.evaluate(() => (window as any).__game.quiz.current.id);
  expect(await b.evaluate(() => (window as any).__game.quiz.current.id)).toBe(qa);

  // 第 1 題：小美先答錯（這一題不能再答），阿寶再答對
  await answerCurrent(b, false);
  await expect.poll(async () => (await puzzleState(a))?.botOut).toBe(true);
  await expect(a.getByTestId('duel-status')).toContainText('👫 小美選了');
  await answerCurrent(a, true);
  await expect(a.getByTestId('duel-score')).toContainText('你 1：0 小美');
  await expect(b.getByTestId('duel-score')).toContainText('你 0：1 阿寶');
  await b.screenshot({ path: `${SHOTS}/03-quiz-friend-got-it.png` });

  // 第 2～10 題：雙數題小美搶到、單數題阿寶搶到，最後一題阿寶 → 阿寶 6：4
  for (let k = 1; k < 10; k++) {
    for (const p of [a, b]) await expect.poll(async () => (await puzzleState(p))?.index, { timeout: 15_000 }).toBe(k);
    const winner = k % 2 === 1 && k !== 9 ? b : a;
    await answerCurrent(winner, true);
    await expect.poll(async () => (await puzzleState(winner))?.phase).toBe('kid');
  }
  for (const p of [a, b]) await expect(p.getByTestId('puzzle-result')).toBeVisible({ timeout: 15_000 });
  await expect(a.getByTestId('puzzle-summary')).toHaveText('你 6：4 小美');
  await expect(b.getByTestId('puzzle-summary')).toHaveText('你 4：6 阿寶');
  await expect(a.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
  await expect(b.getByTestId('puzzle-coins')).toHaveText('🪙 +2');
  // 和朋友玩沒有「再玩一次」
  await expect(a.getByTestId('puzzle-again')).toHaveCount(0);
  await a.screenshot({ path: `${SHOTS}/04-quiz-result.png` });
  // 小美答錯的那一題進錯題本
  const mistakes = await b.evaluate(() => Object.keys((window as any).__game.game.getState().profile().wrongBook ?? {}).length);
  expect(mistakes).toBeGreaterThan(0);
  expect(pageErrors(a)).toEqual([]);
  expect(pageErrors(b)).toEqual([]);
});

test('拒絕與中途離開：小美按「不要」阿寶看到說明；積木大師對戰中阿寶按 ✕ 離開，小美直接贏', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  const { a, b } = await twoKids(browser, baseURL!, request);

  await enterPuzzle(a);
  await a.getByTestId('puzzle-blocks').click();
  await a.getByTestId('duel-invite-小美').click();
  await b.getByTestId('duel-decline').click();
  await expect(a.getByTestId('duel-note')).toContainText('小美現在不能玩');
  await a.screenshot({ path: `${SHOTS}/05-declined.png` });
  await a.getByTestId('duel-note-ok').click();

  // 在別的畫面（自己玩益智遊戲）時自動回「正在忙」
  await enterPuzzle(b);
  await b.getByTestId('puzzle-blocks').click();
  await b.getByTestId('puzzle-solo-1').click();
  await a.getByTestId('puzzle-blocks').click();
  await a.getByTestId('duel-invite-小美').click();
  await expect(a.getByTestId('duel-note')).toContainText('小美現在不能玩');
  await a.getByTestId('duel-note-ok').click();
  await b.getByRole('button', { name: '離開' }).click();
  await b.getByTestId('confirm-exit').click();
  await b.getByTestId('leave-zone').click();

  // 積木大師（簡單）：開始後阿寶離開 → 小美 3 星
  await startDuel(a, b, 'blocks', 'blocks-game', 1);
  const blocksQ = await a.evaluate(() => (window as any).__game.quiz.current.options.length);
  expect(blocksQ).toBeGreaterThan(1);
  await a.getByRole('button', { name: '離開' }).click();
  await expect(a.getByRole('alertdialog')).toContainText('這一局會算朋友贏');
  await a.getByTestId('confirm-exit').click();
  await expect(b.getByTestId('puzzle-result')).toBeVisible();
  await expect(b.getByTestId('puzzle-summary')).toHaveText('阿寶 離開了，你贏了！');
  await expect(b.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
  await b.screenshot({ path: `${SHOTS}/06-friend-left.png` });
  await expect(a.getByTestId('puzzle-menu')).toBeVisible();
  expect(pageErrors(a)).toEqual([]);
  expect(pageErrors(b)).toEqual([]);
});
