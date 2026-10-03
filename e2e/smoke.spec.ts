/**
 * 冒煙測試：建立角色 → 島嶼 → 數學城堡 → 玩完一回合加法 → 結算與存檔。
 * 同時截圖到 e2e/screenshots/，方便人工檢查畫面。
 */
import { expect, test } from '@playwright/test';
import { answerCurrent, createKid, currentQuestion, enterZone, finishQuiz, freshStart, screen, standAtDoor } from './helpers';

const SHOTS = 'e2e/screenshots';

test('建立角色後走進數學城堡，玩完一回合會拿到星星與金幣並存檔', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/01-title.png` });
  // 標題畫面的隱私權政策連結：建置產物裡有這一頁（Google 品牌驗證要求首頁連到隱私權政策）
  await expect(page.getByTestId('privacy-link')).toHaveAttribute('href', './privacy.html');
  const privacy = await page.request.get('./privacy.html');
  expect(privacy.status()).toBe(200);
  expect(await privacy.text()).toContain('知識島大冒險 隱私權政策');

  await createKid(page, '小安');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/02-island.png` });

  await enterZone(page, 'math');
  await expect(page.getByTestId('activity-math.add')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-math-menu.png` });

  await page.getByTestId('activity-math.add').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/04-quiz.png` });

  await finishQuiz(page);
  await expect(page.getByTestId('result')).toBeVisible();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${SHOTS}/05-result.png` });
  await expect(page.getByTestId('coins-earned')).toContainText('+16');

  // 存檔：歷史 1 筆、金幣 16、最佳 3 顆星
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('learning-island-save') ?? '{}'));
  expect(saved.profiles[0].history).toHaveLength(1);
  expect(saved.profiles[0].coins).toBe(16);
  expect(saved.profiles[0].bestStars['math.add']).toBe(3);
  expect(errors).toEqual([]);
});

test('答錯兩次會公布答案並放進錯題本，之後可以錯題複習', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小華');
  await enterZone(page, 'math');
  await page.getByTestId('activity-math.times').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();

  const first = await currentQuestion(page);
  await answerCurrent(page, false);
  await expect(page.getByText('再想想看！還有一次機會')).toBeVisible();
  await answerCurrent(page, false);
  await expect(page.getByTestId('feedback-reveal')).toContainText(String(first.answer));
  await page.screenshot({ path: `${SHOTS}/06-reveal.png` });
  await page.getByTestId('next').click();
  await finishQuiz(page);

  const wrong = await page.evaluate(() => Object.keys((window as any).__game.game.getState().profile().wrongBook));
  expect(wrong).toContain(first.id);

  // 回選單會出現錯題複習
  await page.getByTestId('back-to-zone').click();
  await expect(page.getByTestId('review-card')).toBeVisible();
  await page.getByTestId('review-card').click();
  await expect.poll(async () => (await currentQuestion(page))?.id).toBe(first.id);
});

test('撥時鐘與付錢題可以用畫面操作答對', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '阿傑');
  await enterZone(page, 'math');
  await page.getByTestId('activity-math.clock-set').click();
  await page.getByTestId('level-2').click();
  await expect(page.getByTestId('clock-input')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-clock.png` });
  await answerCurrent(page, true);
  await expect(page.getByTestId('feedback-good')).toBeVisible();

  // 換到付錢題
  await page.getByRole('button', { name: '離開' }).click();
  await page.getByTestId('confirm-exit').click();
  await expect.poll(() => screen(page)).toBe('zone');
  await page.getByTestId('activity-math.money-pay').click();
  await page.getByTestId('level-2').click();
  await expect(page.getByTestId('money-tray')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08-money.png` });
  await answerCurrent(page, true);
  await expect(page.getByTestId('feedback-good')).toBeVisible();
});

test('走到建築門口會出現「進去玩」泡泡，點了就進入建築選單', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小明');
  // 數學城堡門口（與 src/world/layout.ts 的 doorOf 相同算法）
  const door = await page.evaluate(() => {
    const rotY = 0.45;
    const d = 4.2 + 1.2;
    return { x: -11 + Math.sin(rotY) * d, z: -10 + Math.cos(rotY) * d };
  });
  await standAtDoor(page, door);
  await expect(page.getByTestId('door-bubble')).toContainText('數學城堡');
  // 泡泡在畫面正中間（出場動畫結束後也一樣）
  await page.waitForTimeout(500);
  const bubble = (await page.getByTestId('door-bubble').boundingBox())!;
  expect(Math.abs(bubble.x + bubble.width / 2 - page.viewportSize()!.width / 2)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${SHOTS}/10-door.png` });
  await page.getByTestId('enter-zone').click();
  await expect.poll(() => screen(page)).toBe('zone');
  await expect(page.getByTestId('activity-math.add')).toBeVisible();
});
