/**
 * 玩一段時間要休息（docs/decisions.md「遊玩時間：玩一段時間要休息」，2026-10-09）：
 * 只算有操作的時間（1 分鐘沒點、沒滑、沒按鍵就不算）；連續玩滿 30 分鐘休息 15 分鐘，照真實時間倒數（重新整理也要等滿），
 * 時間到自動解鎖；家長 PIN 可以提早解鎖。
 * 用 Playwright 的假時鐘：fastForward 一次跳過一段時間（每個到期的計時器只跑一次，3D 畫面不會被逼著畫幾千格）。
 * 截圖在 e2e/screenshots/rest/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, freshStart } from './helpers';

const SHOTS = 'e2e/screenshots/rest';
const MIN = 60_000;

/** 目前角色的休息狀態（還沒有是 null） */
const restOf = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__game.game.getState().save;
    return (s.rest?.[s.activeProfileId] ?? null) as { activeSec: number; restUntil: number | null } | null;
  });
/** 把目前角色的連續遊玩時間設成某個秒數（接近上限時不用真的玩 30 分鐘） */
const setActive = (page: Page, sec: number) =>
  page.evaluate((sec) => {
    const g = (window as any).__game.game;
    const s = g.getState().save;
    g.setState({ save: { ...s, rest: { ...s.rest, [s.activeProfileId]: { activeSec: sec, restUntil: null } } } });
  }, sec);
/** 操作一下（滑鼠在畫面上移動） */
const touch = async (page: Page) => {
  await page.mouse.move(300 + Math.random() * 50, 400);
  await page.mouse.move(360, 420);
};

test('玩一段時間要休息：沒操作不算時間；滿 30 分鐘休息 15 分鐘，重新整理也要等滿，時間到自動解鎖；家長 PIN 可以提早解鎖', async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.install();
  await freshStart(page);
  await createKid(page);
  const playedBefore = await restOf(page);

  // ① 放著不動 5 分鐘：不算
  await page.clock.fastForward(5 * MIN);
  expect((await restOf(page))?.activeSec ?? 0).toBe(playedBefore?.activeSec ?? 0);

  // ② 有操作：30 秒算一格
  await touch(page);
  await page.clock.fastForward(30_000);
  await expect.poll(async () => (await restOf(page))?.activeSec).toBe((playedBefore?.activeSec ?? 0) + 30);

  // ③ 快滿 30 分鐘時再玩一下：開始休息 15 分鐘，畫面鎖住、顯示倒數
  await setActive(page, 30 * 60 - 30);
  await touch(page);
  await page.clock.fastForward(30_000);
  await expect(page.getByTestId('rest-lock')).toBeVisible();
  await expect(page.getByTestId('rest-countdown')).toContainText(/1[45]:\d\d/);
  await expect(page.getByTestId('rest-countdown')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/01-rest-lock.png` });

  // ④ 重新整理：還在休息
  await page.reload();
  await expect(page.getByTestId('start')).toBeVisible();
  await page.getByTestId('start').click();
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await expect(page.getByTestId('rest-lock')).toBeVisible();

  // ⑤ 15 分鐘過去：自動解鎖，重新開始累計
  await page.clock.fastForward(15 * MIN);
  await expect(page.getByTestId('rest-lock')).toHaveCount(0);
  expect(await restOf(page)).toMatchObject({ activeSec: 0 });

  // ⑥ 家長設了 PIN：再滿一次，輸入 PIN 提早解鎖
  await page.evaluate(() => (window as any).__game.game.getState().setParentPin('2468'));
  await setActive(page, 30 * 60 - 30);
  await touch(page);
  await page.clock.fastForward(30_000);
  await expect(page.getByTestId('rest-lock')).toBeVisible();
  await page.getByTestId('rest-pin').fill('2468');
  await expect(page.getByTestId('rest-lock')).toHaveCount(0);
  expect(await restOf(page)).toMatchObject({ restUntil: null });
});

test('家長專區：連續遊玩上限、休息多久、每日上限（預設不限制）', async ({ page }) => {
  await freshStart(page);
  await createKid(page);
  const settings = () => page.evaluate(() => (window as any).__game.game.getState().save.settings);
  expect(await settings()).toMatchObject({ sessionLimitMin: 30, restMin: 15, dailyLimitMin: 0 });
  await page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
  // 第一次進家長專區：設定 PIN（1357 輸入兩次）
  await expect(page.getByTestId('pin-msg')).toContainText('第一次使用');
  for (const d of '13571357') await page.getByTestId(`pin-${d}`).click();
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('setting-sessionLimitMin').selectOption('45');
  await page.getByTestId('setting-restMin').selectOption('10');
  await expect(page.getByTestId('setting-dailyLimitMin')).toHaveValue('0');
  expect(await settings()).toMatchObject({ sessionLimitMin: 45, restMin: 10 });
});
