/**
 * 選項的 emoji 改成提示（docs/decisions.md「選項的 emoji 改成提示」，2026-10-13 使用者決定）：
 * - 練習（生活村）：有文字的選項預設不顯示 emoji，按「💡 提示」才出現；換題又藏起來
 * - 只有 emoji 的選項（英語圖卡）：emoji 就是答案，一律顯示、沒有提示按鈕
 * - 是非題的 ⭕對／❌錯：只是裝飾，一律顯示、沒有提示按鈕
 * - 挑戰塔（考試）：沒有提示，有文字的選項不顯示 emoji；錯題再挑戰是練習，有提示
 * - 射擊模式：下方答案小籤一樣按提示才出現 emoji
 * 截圖在 e2e/screenshots/hints/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { answerCurrent, createKid, currentQuestion, enterZone, finishQuiz, freshStart, screen } from './helpers';

const SHOTS = 'e2e/screenshots/hints';

/** 是非題的 ⭕對／❌錯（一律顯示的裝飾） */
const isMark = (o: any) => (o.emoji === '⭕' && o.text === '對') || (o.emoji === '❌' && o.text === '錯');

/** 目前題目的選項：emoji 要按提示才顯示的有幾個（hintable）、一律顯示的有幾個（只有 emoji 或是非題記號，always） */
async function optionKinds(page: Page): Promise<{ hintable: number; always: number; emojiOnly: number; marks: number; total: number }> {
  const q = await currentQuestion(page);
  if (q?.type !== 'choice') return { hintable: 0, always: 0, emojiOnly: 0, marks: 0, total: 0 };
  const emojiOnly = q.options.filter((o: any) => o.emoji && !o.text).length;
  const marks = q.options.filter(isMark).length;
  return { hintable: q.options.filter((o: any) => o.emoji && o.text && !isMark(o)).length, always: emojiOnly + marks, emojiOnly, marks, total: q.options.length };
}

/** 一直答對，直到目前題目符合條件（最多 9 題）；找到回傳 true */
async function skipUntil(page: Page, ok: (k: Awaited<ReturnType<typeof optionKinds>>) => boolean): Promise<boolean> {
  for (let i = 0; i < 9; i++) {
    if (ok(await optionKinds(page))) return true;
    await answerAndNext(page);
  }
  return ok(await optionKinds(page));
}

/** 答對目前這一題，等換到下一題 */
async function answerAndNext(page: Page): Promise<void> {
  const before = (await currentQuestion(page))?.id;
  await answerCurrent(page, true);
  await expect.poll(async () => (await screen(page)) === 'result' || (await currentQuestion(page))?.id !== before).toBe(true);
}

test('練習時按提示才出現 emoji，換題又藏起來；只有 emoji 的選項照常顯示', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小美');

  // 生活村的交通安全：一般題的選項是「文字＋emoji」，是非題是 ⭕對／❌錯
  // 固定種子：同一組題目裡一定有是非題與一般題
  await enterZone(page, 'life');
  await page.evaluate(() => (window as any).__game.ui.getState().startActivity({ activityId: 'life.traffic', level: 1, seed: 1, mode: 'quiz' }));
  await expect(page.getByTestId('quiz')).toBeVisible();
  let seenMark = false;
  let seenHint = false;
  for (let i = 0; i < 10 && !(seenMark && seenHint); i++) {
    const k = await optionKinds(page);
    if (k.marks > 0 && k.hintable === 0 && !seenMark) {
      // 是非題：⭕／❌ 照常顯示，沒有提示按鈕
      seenMark = true;
      await expect(page.locator('.choice .emoji')).toHaveCount(k.marks);
      await expect(page.getByTestId('hint')).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/00-true-false.png` });
    } else if (k.hintable > 0 && !seenHint) {
      seenHint = true;
      await expect(page.locator('.choice .emoji')).toHaveCount(k.always);
      await expect(page.getByTestId('hint')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/01-before-hint.png` });
      await page.getByTestId('hint').click();
      await expect(page.locator('.choice .emoji')).toHaveCount(k.hintable + k.always);
      await expect(page.getByTestId('hint')).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/02-after-hint.png` });
      // 換題：又藏起來、提示按鈕回來
      await answerAndNext(page);
      const next = await optionKinds(page);
      await expect(page.locator('.choice .emoji')).toHaveCount(next.always);
      await expect(page.getByTestId('hint')).toHaveCount(next.hintable > 0 ? 1 : 0);
      continue;
    }
    await answerAndNext(page);
  }
  expect(seenMark, '沒有遇到是非題').toBe(true);
  expect(seenHint, '沒有遇到有提示的題目').toBe(true);
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));

  // 英語字首音：找一題選項只有 emoji 的（圖卡），emoji 照常顯示、沒有提示
  // 用固定的種子開始（選單用亂數種子，有時一回合裡剛好沒有圖卡題）
  await enterZone(page, 'en');
  await page.evaluate(() => (window as any).__game.ui.getState().startActivity({ activityId: 'en.phonics', level: 1, seed: 1, mode: 'quiz' }));
  await expect(page.getByTestId('quiz')).toBeVisible();
  let found = false;
  for (let i = 0; i < 10 && !found; i++) {
    const k = await optionKinds(page);
    if (k.total > 0 && k.emojiOnly === k.total) {
      found = true;
      await expect(page.locator('.choice .emoji')).toHaveCount(k.total);
      await expect(page.getByTestId('hint')).toHaveCount(0);
    } else {
      await answerAndNext(page);
    }
  }
  expect(found, '十題裡沒有只有 emoji 的選項').toBe(true);
});

test('挑戰塔是考試沒有提示；錯題再挑戰有提示；射擊模式的答案小籤也要按提示', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '阿寶');

  // 生活村答錯兩次，讓第一題進錯題本
  await enterZone(page, 'life');
  await page.getByTestId('activity-life.traffic').click();
  // 是非題只有兩個選項，答錯一次就只剩正確答案：先答對，跳到至少三個選項的題目
  let first = await currentQuestion(page);
  for (let i = 0; i < 9 && (first.type !== 'choice' || first.options.length < 3); i++) {
    await answerAndNext(page);
    first = await currentQuestion(page);
  }
  const wrongs = first.options.map((_: unknown, i: number) => i).filter((i: number) => i !== first.answer);
  await page.getByTestId(`choice-${wrongs[0]}`).click();
  await expect(page.getByTestId(`choice-${wrongs[1]}`)).toBeEnabled();
  await page.getByTestId(`choice-${wrongs[1]}`).click();
  await page.getByTestId('next').click();
  // 錯題本在結算時才寫入：把這一回合答完
  await finishQuiz(page);
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));

  // 挑戰塔的生活與健康總複習：沒有提示，有文字的選項不顯示 emoji
  await enterZone(page, 'tower');
  await page.getByTestId('activity-tower.life').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  expect(await skipUntil(page, (k) => k.hintable > 0), '沒有遇到文字＋emoji 的題目').toBe(true);
  const kinds = await optionKinds(page);
  await expect(page.getByTestId('hint')).toHaveCount(0);
  await expect(page.locator('.choice .emoji')).toHaveCount(kinds.always);
  await page.screenshot({ path: `${SHOTS}/03-tower-no-hint.png` });
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));

  // 錯題再挑戰（登記在挑戰塔，但是練習）：有提示
  await enterZone(page, 'life');
  await page.getByTestId('review-card').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await expect(page.getByTestId('hint')).toBeVisible();
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));

  // 射擊模式（英語生活用語，選項都是文字＋emoji）：答案小籤按提示才出現 emoji
  await enterZone(page, 'en');
  await page.getByTestId('activity-en.phrases').click();
  await page.getByTestId('shoot-1').click();
  await expect(page.getByTestId('quiz')).toHaveAttribute('data-mode', 'shooter');
  const sk = await optionKinds(page);
  await expect(page.locator('.choice .emoji')).toHaveCount(sk.always);
  await page.getByTestId('hint').click();
  await expect(page.locator('.choice .emoji')).toHaveCount(sk.hintable + sk.always);
  await page.screenshot({ path: `${SHOTS}/04-shooter-hint.png` });
});
