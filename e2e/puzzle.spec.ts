/**
 * 益智遊戲館（第一批）：島上的建築與門口、選單、益智搶答（自己玩、和機器人）、每日金幣上限、
 * 時間用完的訊息與家長設定、遊玩時間的累計、雲端角色的金幣與伺服器一致。
 * 規格見 docs/plans/puzzle-house.md 第 6 節。機器人的速度用 window.__game.puzzle.botDelayFactor 控制。
 */
import { expect, test, type Page } from '@playwright/test';
import { answerCurrent, createKid, freshStart, screen, standAtDoor } from './helpers';
import { SERVER, cloudState, createClassViaApi, flushDeviceLogs, openDevice, profileOf } from './onlineDevice';

const SHOTS = 'e2e/screenshots/puzzle';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 直接進益智遊戲館（和 helpers 的 enterZone 一樣跳過走路） */
async function enterPuzzle(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.ui.getState().enterZone('puzzle'));
  await expect(page.getByTestId('puzzle-menu')).toBeVisible();
}

/** 遊戲公開給 e2e 的狀態（src/puzzle/debug.ts） */
async function puzzleState(page: Page): Promise<any> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.puzzle.state)));
}

/** 機器人反應時間的倍數：很大＝機器人幾乎不會答，很小＝馬上答 */
async function setBotDelay(page: Page, factor: number): Promise<void> {
  await page.evaluate((f) => ((window as any).__game.puzzle.botDelayFactor = f), factor);
}

/** 把目前角色今天的益智紀錄改成指定值（測上限用） */
async function setPuzzleToday(page: Page, day: { seconds: number; coins: number }): Promise<void> {
  await page.evaluate((day) => {
    const g = (window as any).__game.game.getState();
    const p = g.profile();
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    g.putProfile({ ...p, puzzle: { days: { [key]: day }, best: p.puzzle?.best ?? {} } });
  }, day);
}

/** 今天的益智紀錄 */
async function puzzleToday(page: Page): Promise<{ seconds: number; coins: number }> {
  return page.evaluate(() => {
    const p = (window as any).__game.game.getState().profile();
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return p.puzzle?.days[`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`] ?? { seconds: 0, coins: 0 };
  });
}

/** 益智搶答自己玩：前 correct 題答對，之後一直答錯到結束（答錯 3 題），停在結算畫面 */
async function playSoloQuiz(page: Page, correct: number): Promise<void> {
  await page.getByTestId('puzzle-quiz').click();
  await page.getByTestId('puzzle-solo').click();
  await expect(page.getByTestId('quiz-game')).toHaveAttribute('data-mode', 'solo');
  for (let k = 0; k < correct + 3; k++) {
    // 等畫面換到第 k 題（目前題目才會是這一題）
    await expect.poll(async () => (await puzzleState(page))?.index).toBe(k);
    if (k < correct) {
      await answerCurrent(page, true);
      // 等「最多連對」變成 k+1（不會消失的狀態）。「答對了！」只顯示 1.2 秒就換題，機器忙的時候輪詢會錯過而誤判失敗（2026-10-05）
      await expect.poll(async () => (await puzzleState(page))?.best).toBe(k + 1);
    } else {
      await answerCurrent(page, false);
      await page.getByTestId('next').click();
    }
  }
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
}

test('島上有益智遊戲館：走到門口出現泡泡，進去看到選單、今天的時間與金幣', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小明');
  // 門口位置與 src/world/layout.ts 的 doorOf 相同算法（x 7.5、z 11、朝向 −0.35、半徑 2.6）
  const door = await page.evaluate(() => {
    const rotY = -0.35;
    const d = 2.6 + 1.2;
    return { x: 7.5 + Math.sin(rotY) * d, z: 11 + Math.cos(rotY) * d };
  });
  await standAtDoor(page, door);
  await expect(page.getByTestId('door-bubble')).toContainText('益智遊戲館');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/01-door.png` });
  await page.getByTestId('enter-zone').click();
  await expect.poll(() => screen(page)).toBe('puzzle');
  await expect(page.getByTestId('puzzle-time-left')).toContainText('今天還可以玩 15 分鐘');
  await expect(page.getByTestId('puzzle-coins-today')).toContainText('今天 0／20');
  await expect(page.getByTestId('puzzle-quiz')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-menu.png` });
  await page.getByTestId('leave-zone').click();
  await expect.poll(() => screen(page)).toBe('island');
});

test('益智搶答自己玩：連對 3 題後答錯 3 題結束，1 星 2 枚金幣，答錯的題目進錯題本', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await playSoloQuiz(page, 3);
  await expect(page.getByTestId('puzzle-summary')).toHaveText('最多連對 3 題');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +2');
  await page.screenshot({ path: `${SHOTS}/03-solo-result.png` });
  const p = await profileOf(page);
  expect(p.coins).toBe(2);
  expect(Object.keys(p.wrongBook)).toHaveLength(3);
  expect(p.recent['puzzle.quiz']).toHaveLength(6);
  // 學習的歷史紀錄與島上的星星不受影響
  expect(p.history).toEqual([]);
  expect(p.bestStars).toEqual({});
  expect(p.puzzle.best).toEqual({ quiz: 1 });
  // 選單上顯示最佳星數與今天拿到的金幣
  await page.getByTestId('puzzle-back-menu').click();
  await expect(page.getByTestId('puzzle-quiz')).toContainText('★☆☆');
  await expect(page.getByTestId('puzzle-coins-today')).toContainText('今天 2／20');
});

test('益智搶答和機器人比賽：搶先答對 10 題贏了，3 星 5 枚金幣', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await setBotDelay(page, 1000);
  await page.getByTestId('puzzle-quiz').click();
  await page.getByTestId('puzzle-vs-2').click();
  await expect(page.getByTestId('quiz-game')).toHaveAttribute('data-mode', 'vs');
  await page.screenshot({ path: `${SHOTS}/04-vs.png` });
  for (let k = 0; k < 10; k++) {
    await expect.poll(async () => {
      const s = await puzzleState(page);
      return s?.index === k && s?.phase === 'open';
    }).toBe(true);
    await answerCurrent(page, true);
    await expect.poll(async () => (await puzzleState(page))?.kid).toBe(k + 1);
  }
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toHaveText('你 10：0 機器人');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
  await page.screenshot({ path: `${SHOTS}/05-vs-win.png` });
});

test('益智搶答和機器人比賽：機器人搶先答對就輸了，1 星 2 枚金幣', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await setBotDelay(page, 0.001);
  await page.getByTestId('puzzle-quiz').click();
  await page.getByTestId('puzzle-vs-3').click();
  for (let k = 0; k < 10; k++) {
    // 機器人馬上答：答對這一題就結束；答錯的話孩子也故意答錯
    await expect.poll(async () => {
      const s = await puzzleState(page);
      return s?.index === k && (s.phase !== 'open' || s.botOut);
    }).toBe(true);
    const s = await puzzleState(page);
    if (s.phase === 'open') {
      await answerCurrent(page, false);
      await expect.poll(async () => (await puzzleState(page))?.phase).toBe('none');
    }
  }
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toContainText('你 0：');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +2');
});

test('每天的益智金幣最多 20 枚：拿滿了這局就說明明天再來', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await setPuzzleToday(page, { seconds: 0, coins: 18 });
  await enterPuzzle(page);
  await expect(page.getByTestId('puzzle-coins-today')).toContainText('今天 18／20');
  await playSoloQuiz(page, 0);
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +2');
  await page.getByTestId('puzzle-again').click();
  for (let k = 0; k < 3; k++) {
    await expect.poll(async () => (await puzzleState(page))?.index).toBe(k);
    await answerCurrent(page, false);
    await page.getByTestId('next').click();
  }
  await expect(page.getByTestId('puzzle-coin-cap')).toContainText('今天的益智遊戲金幣拿滿了');
  await page.screenshot({ path: `${SHOTS}/06-coin-cap.png` });
  expect((await profileOf(page)).coins).toBe(2);
  // 遊玩秒數每 30 秒累計一次（這個測試可能跑超過 30 秒），只比金幣
  expect((await puzzleToday(page)).coins).toBe(20);
});

test('益智遊戲時間用完：選單停用並提醒；家長改成不另外限制就可以玩', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await setPuzzleToday(page, { seconds: 15 * 60, coins: 0 });
  await enterPuzzle(page);
  await expect(page.getByTestId('puzzle-time-up')).toContainText('今天的益智遊戲時間用完了，去其他建築挑戰吧！');
  await expect(page.getByTestId('puzzle-quiz')).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/07-time-up.png` });

  // 家長專區：益智遊戲館每日上限（預設 15 分鐘）改成不另外限制
  await page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
  for (const k of ['1', '2', '3', '4', '1', '2', '3', '4']) await page.getByTestId(`pin-${k}`).click();
  await expect(page.getByTestId('report-puzzle')).toContainText('今天玩了 15 分鐘');
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('setting-puzzleLimitMin')).toHaveValue('15');
  await page.getByTestId('setting-puzzleLimitMin').selectOption('0');
  await page.getByTestId('parent-back').click();
  await enterPuzzle(page);
  await expect(page.getByTestId('puzzle-time-left')).toContainText('今天不限時間');
  await expect(page.getByTestId('puzzle-quiz')).toBeEnabled();
});

test('玩到一半離開：確認後回選單，這一局不記錄', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await page.getByTestId('puzzle-quiz').click();
  await page.getByTestId('puzzle-solo').click();
  await expect.poll(async () => (await puzzleState(page))?.index).toBe(0);
  await answerCurrent(page, true);
  await page.getByRole('button', { name: '離開' }).click();
  await page.getByTestId('confirm-exit').click();
  await expect(page.getByTestId('puzzle-menu')).toBeVisible();
  const p = await profileOf(page);
  expect(p.coins).toBe(0);
  expect(p.puzzle?.best ?? {}).toEqual({});
});

test('在益智遊戲館的時間每 30 秒累計一次，同時算進整體的遊玩時間', async ({ page }) => {
  test.setTimeout(120_000);
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await expect.poll(async () => (await puzzleToday(page)).seconds, { timeout: 45_000 }).toBeGreaterThanOrEqual(30);
  const p = await profileOf(page);
  const played = Object.values(p.playLog as Record<string, number>).reduce((a, b) => a + b, 0);
  expect(played).toBeGreaterThanOrEqual((await puzzleToday(page)).seconds);
});

test('雲端角色：益智遊戲的金幣由伺服器用同樣規則算，同步後兩邊一致', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  // 老師帳號建班（大人帳號 A1 之後建班要老師權杖）
  const { code } = await createClassViaApi(request, '益智測試班');
  const kid = await openDevice(browser, baseURL!);
  const { page } = kid;
  await createKid(page, '安安');
  await page.evaluate(() => (window as any).__game.ui.getState().goto('profiles'));
  await page.getByTestId('open-class').click();
  await page.getByTestId('class-tab-join').click();
  await page.getByTestId('class-code').fill(code);
  await page.getByTestId('class-nickname').fill('益智小安');
  await page.getByTestId('class-pin').fill('1234');
  await page.getByTestId('class-submit').click();
  await expect.poll(() => screen(page)).toBe('island');
  await expect.poll(() => cloudState(page), { timeout: 20_000 }).toEqual({ status: 'synced', pending: 0 });

  await enterPuzzle(page);
  await playSoloQuiz(page, 5);
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +3');
  await expect.poll(() => cloudState(page), { timeout: 20_000 }).toEqual({ status: 'synced', pending: 0 });

  // 直接問伺服器：金幣、益智紀錄、錯題本都和裝置上一樣
  const local = await profileOf(page);
  const token = await page.evaluate((id) => JSON.parse(localStorage.getItem('learning-island-cloud')!)[id], local.cloud.accountId);
  const me = await request.get(`${SERVER}/api/me`, { headers: { authorization: `Bearer ${token}` } });
  const server = (await me.json()).profile;
  expect(server.coins).toBe(local.coins);
  expect(server.coins).toBe(3);
  // 遊玩秒數每 30 秒累計一次，可能剛好還沒上傳；只比金幣與最佳星數
  expect(Object.values(server.puzzle.days as Record<string, { coins: number }>).map((d) => d.coins)).toEqual([3]);
  expect(server.puzzle.best).toEqual({ quiz: 2 });
  expect(Object.keys(server.wrongBook).sort()).toEqual(Object.keys(local.wrongBook).sort());
  await kid.context.close();
});

/** 記憶翻牌：把某一對的兩張牌翻開（依公開的「每張屬於第幾對」），等它配對成功 */
async function flipPair(page: Page, pair: number): Promise<void> {
  const s = await puzzleState(page);
  const [a, b] = (s.pairs as number[]).map((p, i) => (p === pair ? i : -1)).filter((i) => i >= 0);
  await page.getByTestId(`memory-card-${a}`).click();
  await page.getByTestId(`memory-card-${b}`).click();
  // 配對成功；配完最後一對時遊戲結束、狀態清成 null
  await expect.poll(async () => {
    const now = await puzzleState(page);
    return !now || now.owner[a] !== null;
  }).toBe(true);
}

test('記憶翻牌自己玩：一步配一對，6 步配完 6 對拿 3 星 5 枚金幣', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await page.getByTestId('puzzle-memory').click();
  await page.getByTestId('puzzle-solo-1').click();
  await expect(page.getByTestId('memory-game')).toHaveAttribute('data-mode', 'solo');
  await expect(page.locator('[data-testid^="memory-card-"]')).toHaveCount(12);
  for (let p = 0; p < 2; p++) await flipPair(page, p);
  // 翻開第三對的一張，截圖看翻面
  const s = await puzzleState(page);
  await page.getByTestId(`memory-card-${(s.pairs as number[]).indexOf(2)}`).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/08-memory.png` });
  const other = (s.pairs as number[]).lastIndexOf(2);
  await page.getByTestId(`memory-card-${other}`).click();
  for (let p = 3; p < 6; p++) await flipPair(page, p);
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toHaveText('用 6 步配完 6 對');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
  expect((await profileOf(page)).puzzle.best).toEqual({ memory: 3 });
});

test('記憶翻牌和機器人輪流：翻錯換機器人翻，配到比較多對的贏', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await page.getByTestId('puzzle-memory').click();
  await page.getByTestId('puzzle-vs-1').click();
  await expect(page.getByTestId('memory-game')).toHaveAttribute('data-mode', 'vs');
  // 孩子先連續配 4 對（配對成功可以再翻）
  for (let p = 0; p < 4; p++) await flipPair(page, p);
  expect((await puzzleState(page)).scores).toEqual({ kid: 4, bot: 0 });
  // 故意翻兩張不同對的：蓋回去之後換機器人
  const s = await puzzleState(page);
  await page.getByTestId(`memory-card-${(s.pairs as number[]).indexOf(4)}`).click();
  await page.getByTestId(`memory-card-${(s.pairs as number[]).indexOf(5)}`).click();
  // 機器人用正常速度（每張約 1 秒），看得到換人
  await expect(page.getByTestId('memory-turn')).toContainText('機器人');
  await page.screenshot({ path: `${SHOTS}/09-memory-vs.png` });
  await setBotDelay(page, 0.05);
  // 機器人翻完（配到就繼續、翻錯換回孩子）；輪到孩子就把剩下的配完
  for (let guard = 0; guard < 20; guard++) {
    const now = await puzzleState(page);
    if (!now || now.done) break;
    if (now.turn === 'kid' && now.open.length === 0) {
      const left = (now.pairs as number[]).filter((_, i) => now.owner[i] === null);
      await flipPair(page, left[0]);
    } else {
      await page.waitForTimeout(300);
    }
  }
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toContainText('你 ');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
});

/** 找不同：在指定的那張圖上點風景座標 (x, y)（用 SVG 的座標轉換換成畫面座標） */
async function tapScene(page: Page, x: number, y: number, which: 'spot-left' | 'spot-right' = 'spot-right'): Promise<void> {
  const p = await page.evaluate(
    ({ x, y, which }) => {
      const svg = document.querySelector(`[data-testid="${which}"]`) as SVGSVGElement;
      const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
      return { x: pt.x, y: pt.y };
    },
    { x, y, which },
  );
  await page.mouse.click(p.x, p.y);
}

/** 找一個不在任何不同處範圍裡的點（點錯用） */
function missPoint(diffs: { x: number; y: number; r: number }[]): { x: number; y: number } {
  const candidates = [
    { x: 12, y: 12 },
    { x: 388, y: 12 },
    { x: 12, y: 288 },
    { x: 388, y: 288 },
    { x: 200, y: 290 },
  ];
  return candidates.find((c) => diffs.every((d) => Math.hypot(d.x - c.x, d.y - c.y) > d.r + 4))!;
}

test('找不同自己玩：點錯扣 3 秒，左圖右圖都可以點；全部找到拿 3 星', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await page.getByTestId('puzzle-spot').click();
  await page.getByTestId('puzzle-solo-1').click();
  await expect(page.getByTestId('spot-game')).toHaveAttribute('data-mode', 'solo');
  const s = await puzzleState(page);
  expect(s.diffs).toHaveLength(3);
  const miss = missPoint(s.diffs);
  await tapScene(page, miss.x, miss.y);
  await expect.poll(async () => (await puzzleState(page)).penalty).toBe(3);
  await tapScene(page, s.diffs[0].x, s.diffs[0].y, 'spot-left');
  await expect.poll(async () => (await puzzleState(page)).found[0]).toBe('kid');
  // 再點一次已經圈起來的地方（在另一張圖上對照）：不算點錯、不扣秒
  await tapScene(page, s.diffs[0].x, s.diffs[0].y);
  await page.waitForTimeout(300);
  expect((await puzzleState(page)).penalty).toBe(3);
  await page.screenshot({ path: `${SHOTS}/10-spot.png` });
  for (const i of [1, 2]) await tapScene(page, s.diffs[i].x, s.diffs[i].y);
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toContainText('3 處全部找到了');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
});

test('找不同和機器人一起找：誰先點到就是誰的，找到比較多處的贏', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await page.getByTestId('puzzle-spot').click();
  await page.getByTestId('puzzle-vs-3').click();
  await expect(page.getByTestId('spot-game')).toHaveAttribute('data-mode', 'vs');
  const s = await puzzleState(page);
  expect(s.diffs).toHaveLength(7);
  for (const i of [0, 1]) await tapScene(page, s.diffs[i].x, s.diffs[i].y);
  // 等機器人找到一處（厲害約 5～8 秒）
  await expect.poll(async () => ((await puzzleState(page)).found as (string | null)[]).includes('bot'), { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: `${SHOTS}/11-spot-vs.png` });
  await setBotDelay(page, 1000);
  const now = await puzzleState(page);
  for (let i = 0; i < 7; i++) if (!now.found[i]) await tapScene(page, s.diffs[i].x, s.diffs[i].y);
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toContainText('機器人');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
});

test('找不同和機器人：機器人找得很快就輸了，1 星 2 枚金幣', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await setBotDelay(page, 0.001);
  await page.getByTestId('puzzle-spot').click();
  await page.getByTestId('puzzle-vs-1').click();
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toHaveText('你 0：3 機器人');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +2');
});

test('積木大師自己玩：8 題數積木，答錯時標出每一疊有幾個並列出加法', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await page.getByTestId('puzzle-blocks').click();
  await page.getByTestId('puzzle-solo-2').click();
  await expect(page.getByTestId('blocks-game')).toHaveAttribute('data-mode', 'solo');
  for (let k = 0; k < 8; k++) {
    await expect.poll(async () => (await puzzleState(page))?.index).toBe(k);
    if (k === 0) {
      await answerCurrent(page, false);
      await expect(page.getByTestId('blocks-sum')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/12-blocks-reveal.png` });
      await page.getByTestId('next').click();
    } else {
      await answerCurrent(page, true);
      await expect(page.getByTestId('feedback-good')).toBeVisible();
    }
  }
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toHaveText('答對 7／8 題');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
  // 積木題不進錯題本（錯題複習畫不出積木圖）
  expect((await profileOf(page)).wrongBook).toEqual({});
});

test('積木大師和機器人搶答：搶先答對 8 題贏了', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await setBotDelay(page, 1000);
  await page.getByTestId('puzzle-blocks').click();
  await page.getByTestId('puzzle-vs-3').click();
  await expect(page.getByTestId('blocks-game')).toHaveAttribute('data-mode', 'vs');
  await page.screenshot({ path: `${SHOTS}/13-blocks-vs.png` });
  for (let k = 0; k < 8; k++) {
    await expect.poll(async () => {
      const s = await puzzleState(page);
      return s?.index === k && s?.phase === 'open';
    }).toBe(true);
    await answerCurrent(page, true);
    await expect.poll(async () => (await puzzleState(page))?.kid ?? 8).toBe(k + 1);
  }
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toHaveText('你 8：0 機器人');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
});

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

/** 七巧板：用畫面操作把一塊板子轉成題庫的姿勢（翻面、點一下轉 90 度），再從重心拖到題庫的位置 */
async function placeTangramPiece(page: Page, target: { piece: string; rot: number; flip: boolean; cx: number; cy: number }): Promise<void> {
  const pieceNow = async () => (await puzzleState(page)).pieces[target.piece];
  let s = await pieceNow();
  if (s.flip !== target.flip) {
    // 先點一下選起來（會順便轉一次），再按翻面
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
  // 吸附固定；放完最後一塊時遊戲結束、狀態清成 null
  await expect.poll(async () => (await puzzleState(page))?.pieces?.[target.piece]?.placed ?? true).toBe(true);
}

/** 七巧板：照題庫的擺法把七塊都放好（first 指定先放幾塊就停） */
async function solveTangram(page: Page, first = 7): Promise<void> {
  const targets = (await puzzleState(page)).targets as { piece: string; rot: number; flip: boolean; cx: number; cy: number }[];
  for (const t of targets.slice(0, first)) await placeTangramPiece(page, t);
}

test('七巧板自己玩（簡單）：放錯的地方不會固定；轉方向、翻面、拖進剪影拼好，沒用提示 3 星', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await page.getByTestId('puzzle-tangram').click();
  await page.getByTestId('puzzle-solo-1').click();
  await expect(page.getByTestId('tangram-game')).toHaveAttribute('data-mode', 'solo');
  await page.screenshot({ path: `${SHOTS}/14-tangram-start.png` });
  // 把正方形拖到剪影框的左上角（剪影外面）：不會固定
  const sq = (await puzzleState(page)).pieces.square;
  const from = await boardToScreen(page, sq.cx, sq.cy);
  const corner = await boardToScreen(page, 0.3, 0.3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(corner.x, corner.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await puzzleState(page)).pieces.square.placed).toBe(false);
  // 把大三角形拖到畫面最上面（盤面外）：重心留在盤面裡，還抓得回來
  const big = (await puzzleState(page)).pieces.big1;
  const bigFrom = await boardToScreen(page, big.cx, big.cy);
  await page.mouse.move(bigFrom.x, bigFrom.y);
  await page.mouse.down();
  await page.mouse.move(bigFrom.x, 2, { steps: 6 });
  await page.mouse.up();
  const moved = (await puzzleState(page)).pieces.big1;
  expect(moved.cy).toBeGreaterThanOrEqual(0);
  expect(moved.cy).toBeLessThan(big.cy);
  await solveTangram(page, 4);
  await page.screenshot({ path: `${SHOTS}/15-tangram-half.png` });
  await solveTangram(page);
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toContainText('沒有用提示');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
});

test('七巧板自己玩（普通）：用一次提示會亮出一塊的位置，拼好拿 2 星', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await page.getByTestId('puzzle-tangram').click();
  await page.getByTestId('puzzle-solo-2').click();
  await page.getByTestId('tangram-hint').click();
  await expect(page.getByTestId('tangram-hint-slot')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/16-tangram-hint.png` });
  await solveTangram(page);
  await expect(page.getByTestId('puzzle-summary')).toContainText('用了 1 次提示');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +3');
});

test('七巧板和機器人：機器人先拼好就輸了，1 星 2 枚金幣', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await setBotDelay(page, 0.001);
  await page.getByTestId('puzzle-tangram').click();
  await page.getByTestId('puzzle-vs-1').click();
  await expect(page.getByTestId('puzzle-result')).toBeVisible();
  await expect(page.getByTestId('puzzle-summary')).toContainText('機器人先拼好了');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +2');
});

test('七巧板在直式手機上：剪影在上、板子在下，和機器人比賽先拼完就贏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await freshStart(page);
  await createKid(page);
  await enterPuzzle(page);
  await setBotDelay(page, 1000);
  await page.getByTestId('puzzle-tangram').click();
  await page.getByTestId('puzzle-vs-3').click();
  await expect(page.getByTestId('tangram-game')).toHaveAttribute('data-mode', 'vs');
  // 直式盤面：比寬還高
  const box = (await page.getByTestId('tangram-board').boundingBox())!;
  expect(box.height).toBeGreaterThan(box.width);
  await page.screenshot({ path: `${SHOTS}/17-tangram-phone.png` });
  await solveTangram(page);
  await expect(page.getByTestId('puzzle-summary')).toContainText('你先拼好了');
  await expect(page.getByTestId('puzzle-coins')).toHaveText('🪙 +5');
});
