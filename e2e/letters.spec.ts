/**
 * 英文字母描寫自動驗證：用自訂題庫放 52 題字母描寫（大寫 26＋小寫 26），
 * 逐題照中心線用滑鼠描一遍，每題都要出現「答對」回饋，存檔歷史裡 52 題要全部一次答對。
 * 自訂題庫活動每回合最多 10 題，所以 52 題分成 6 個題庫（10×5＋2）各跑一回合。
 * 如果某些字母判不過，調整 src/writing/latinStrokes.ts 的中心線（不要改判定參數）。
 */
import { expect, test } from '@playwright/test';
import { createKid, currentQuestion, freshStart, importPack, screen, traceWrite } from './helpers';

/** 52 個字母：大寫在前、小寫在後 */
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'abcdefghijklmnopqrstuvwxyz'];

/** 每個題庫放幾題（自訂題庫活動每回合上限 10 題） */
const PER_PACK = 10;

test('52 個英文字母照中心線描寫，全部一次答對', async ({ page }) => {
  // 82 筆 × 每筆約 0.5 秒（含判定等待），加上換題與渲染，預留 15 分鐘
  test.setTimeout(900_000);
  await freshStart(page);
  await createKid(page, '小字');

  let done = 0;
  const failed: string[] = [];
  for (let start = 0; start < LETTERS.length; start += PER_PACK) {
    const chunk = LETTERS.slice(start, start + PER_PACK);
    const id = await importPack(page, {
      format: 'learning-island-pack',
      version: 1,
      title: `字母描寫 ${chunk[0]}～${chunk[chunk.length - 1]}`,
      questions: chunk.map((ch) => ({
        id: `letter-${ch === ch.toUpperCase() ? 'U' : 'l'}-${ch}`,
        subject: 'en',
        skill: 'en.letter-write',
        indicators: ['Aa-Ⅱ-2'],
        type: 'write',
        prompt: `照筆順寫出 ${ch}`,
        target: ch,
        script: 'latin',
      })),
    });
    await page.evaluate((pid) => (window as any).__game.ui.getState().startActivity({ activityId: `pack.${pid}`, level: 1, seed: 7 }), id);
    await expect(page.getByTestId('write-pad')).toBeVisible();

    for (let i = 0; i < chunk.length; i++) {
      const before = await currentQuestion(page);
      await traceWrite(page);
      // 該字母每一筆都判對才會出現「答對」回饋；判不過會卡在這裡逾時
      try {
        await expect(page.getByTestId('feedback-good')).toBeVisible({ timeout: 8_000 });
      } catch {
        failed.push(before.target);
        throw new Error(`字母 ${before.target} 照中心線描寫沒有被判為答對（已通過：${done} 題）`);
      }
      done += 1;
      // 等換到下一題（或這個題庫結算）
      await expect.poll(async () => (await screen(page)) === 'result' || (await currentQuestion(page)).id !== before.id).toBe(true);
    }
    await expect.poll(() => screen(page)).toBe('result');
    // 回到島嶼，準備下一個題庫
    await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  }

  expect(failed).toEqual([]);
  expect(done).toBe(52);
  // 存檔歷史：每個回合都全部一次答對，合計 52 題
  const history = await page.evaluate(() => (window as any).__game.game.getState().profile().history as { total: number; correct: number }[]);
  expect(history).toHaveLength(6);
  for (const h of history) expect(h.correct).toBe(h.total);
  expect(history.reduce((s, h) => s + h.correct, 0)).toBe(52);
});
