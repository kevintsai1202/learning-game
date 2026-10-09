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

/** 記憶翻牌：翻開某一對的兩張牌（等配對成功） */
async function flipPair(page: Page, pair: number): Promise<void> {
  const s = await puzzleState(page);
  const [x, y] = (s.pairs as number[]).map((p, i) => (p === pair ? i : -1)).filter((i) => i >= 0);
  await page.getByTestId(`memory-card-${x}`).click();
  await page.getByTestId(`memory-card-${y}`).click();
  await expect.poll(async () => {
    const now = await puzzleState(page);
    return !now || now.owner[x] !== null;
  }).toBe(true);
}

/** 找不同：在右圖點風景座標 (x, y) */
async function tapScene(page: Page, x: number, y: number): Promise<void> {
  const p = await page.evaluate(
    ({ x, y }) => {
      const svg = document.querySelector('[data-testid="spot-right"]') as SVGSVGElement;
      const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
      return { x: pt.x, y: pt.y };
    },
    { x, y },
  );
  await page.mouse.click(p.x, p.y);
}

/** 七巧板：盤面座標換成畫面座標 */
async function boardToScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ x, y }) => {
      const svg = document.querySelector('[data-testid="tangram-board"]') as SVGSVGElement;
      const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
      return { x: pt.x, y: pt.y };
    },
    { x, y },
  );
}

/** 七巧板：照題庫的擺法放好一塊（轉方向、翻面、拖到位置；和 puzzle.spec.ts 相同） */
async function placeTangramPiece(page: Page, target: { piece: string; rot: number; flip: boolean; cx: number; cy: number }): Promise<void> {
  const pieceNow = async () => (await puzzleState(page)).pieces[target.piece];
  let s = await pieceNow();
  if (s.flip !== target.flip) {
    const c = await boardToScreen(page, s.cx, s.cy);
    await page.mouse.click(c.x, c.y);
    await page.getByTestId('tangram-flip').click();
    s = await pieceNow();
  }
  const taps = (((target.rot - s.rot) % 4) + 4) % 4;
  for (let i = 0; i < taps; i++) {
    const c = await boardToScreen(page, s.cx, s.cy);
    await page.mouse.click(c.x, c.y);
    await expect.poll(async () => (await pieceNow()).rot).toBe((s.rot + 1) % 4);
    s = await pieceNow();
  }
  const from = await boardToScreen(page, s.cx, s.cy);
  const to = await boardToScreen(page, target.cx, target.cy);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await puzzleState(page))?.pieces?.[target.piece]?.placed ?? true).toBe(true);
}

test('記憶翻牌輪流翻、找不同搶找、七巧板先拼好的贏：兩邊的結果一致', async ({ browser, baseURL, request }) => {
  test.setTimeout(600_000);
  const { a, b } = await twoKids(browser, baseURL!, request);

  // 記憶翻牌（簡單 6 對）：阿寶先翻，配到第 0 對再翻一次；翻錯換小美，小美配完剩下 5 對
  await startDuel(a, b, 'memory', 'memory-game', 1);
  await expect(a.getByTestId('memory-turn')).toHaveText('輪到你翻牌');
  await expect(b.getByTestId('memory-turn')).toHaveText('👫 阿寶翻牌中……');
  // 兩邊的牌一樣
  expect((await puzzleState(b)).pairs).toEqual((await puzzleState(a)).pairs);
  await flipPair(a, 0);
  await expect(b.getByTestId('memory-score')).toContainText('你 0：1 阿寶');
  const pairs = (await puzzleState(a)).pairs as number[];
  await a.getByTestId(`memory-card-${pairs.indexOf(1)}`).click();
  await a.getByTestId(`memory-card-${pairs.indexOf(2)}`).click();
  await expect(b.getByTestId('memory-turn')).toHaveText('輪到你翻牌');
  await expect(a.getByTestId('memory-turn')).toHaveText('👫 小美翻牌中……');
  await a.screenshot({ path: `${SHOTS}/07-memory-friend-turn.png` });
  for (let p = 1; p < 6; p++) await flipPair(b, p);
  for (const p of [a, b]) await expect(p.getByTestId('puzzle-result')).toBeVisible();
  await expect(a.getByTestId('puzzle-summary')).toHaveText('你 1：5 小美');
  await expect(b.getByTestId('puzzle-summary')).toHaveText('你 5：1 阿寶');
  await a.getByTestId('puzzle-back-menu').click();
  await b.getByTestId('back-to-island').click();

  // 找不同（簡單 3 處）：阿寶找第 1、3 處，小美找第 2 處
  await startDuel(a, b, 'spot', 'spot-game', 1);
  const diffs = (await puzzleState(a)).diffs as { x: number; y: number }[];
  expect((await puzzleState(b)).diffs).toEqual(diffs);
  await tapScene(a, diffs[0].x, diffs[0].y);
  await expect(b.getByTestId('spot-score')).toContainText('你 0：1 阿寶');
  await tapScene(b, diffs[1].x, diffs[1].y);
  await expect(a.getByTestId('spot-score')).toContainText('你 1：1 小美');
  // 找到的地方畫圈（自己綠色、朋友紫色）
  for (const p of [a, b]) await expect(p.locator('[data-testid="spot-right"] .spot-found')).toHaveCount(2);
  // 圈圈有彈出動畫：兩台裝置同時跑軟體 3D 時每秒只畫幾格，等久一點再截圖
  await a.waitForTimeout(2000);
  await a.screenshot({ path: `${SHOTS}/08-spot-friend.png` });
  await tapScene(a, diffs[2].x, diffs[2].y);
  for (const p of [a, b]) await expect(p.getByTestId('puzzle-result')).toBeVisible();
  await expect(a.getByTestId('puzzle-summary')).toHaveText('你 2：1 小美');
  await expect(b.getByTestId('puzzle-summary')).toHaveText('你 1：2 阿寶');
  await a.getByTestId('puzzle-back-menu').click();
  await b.getByTestId('back-to-island').click();

  // 七巧板（簡單）：小美放一塊，阿寶照擺法拼完 → 阿寶贏
  await startDuel(a, b, 'tangram', 'tangram-game', 1);
  expect((await puzzleState(b)).shape).toBe((await puzzleState(a)).shape);
  const targetsB = (await puzzleState(b)).targets;
  await placeTangramPiece(b, targetsB[0]);
  await expect(a.getByTestId('tangram-bot')).toContainText('👫 小美 1／7');
  const targets = (await puzzleState(a)).targets as { piece: string; rot: number; flip: boolean; cx: number; cy: number }[];
  for (const t of targets) await placeTangramPiece(a, t);
  for (const p of [a, b]) await expect(p.getByTestId('puzzle-result')).toBeVisible();
  await expect(a.getByTestId('puzzle-summary')).toContainText('你先拼好了');
  await expect(b.getByTestId('puzzle-summary')).toContainText('阿寶先拼好了');
  await b.screenshot({ path: `${SHOTS}/09-tangram-friend-lost.png` });
  expect(pageErrors(a)).toEqual([]);
  expect(pageErrors(b)).toEqual([]);
});
