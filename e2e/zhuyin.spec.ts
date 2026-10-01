/**
 * 注音符號與聲調符號的自動描寫：41 個字形（37 個注音＋ˊ ˇ ˋ ˙）全部照中心線描寫一次，
 * 每題都必須一次答對。這驗證手繪中心線的方向、筆順與寫字板的判定參數相容。
 * 判不過時請修 src/writing/zhuyinStrokes.ts 的中心線，不要放寬判定參數。
 */
import { expect, test } from '@playwright/test';
import { createKid, currentQuestion, freshStart, importPack, screen, traceWrite } from './helpers';

/** 37 個注音符號 */
const ZHUYIN = 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦㄧㄨㄩ';
/** 聲調符號（陰平不標） */
const TONES = 'ˊˇˋ˙';
/** 全部 41 個目標字元 */
const TARGETS = [...ZHUYIN, ...TONES];
/** 挑戰塔一回合最多 10 題，所以每 10 個字切成一個題庫分批描寫 */
const BATCH = 10;

test('41 個注音與聲調符號照中心線描寫，全部一次答對', async ({ page }) => {
  expect(TARGETS).toHaveLength(41);
  test.setTimeout(900_000);
  await freshStart(page);
  await createKid(page, '小注');

  let total = 0;
  for (let b = 0; b * BATCH < TARGETS.length; b++) {
    const chars = TARGETS.slice(b * BATCH, (b + 1) * BATCH);
    const id = await importPack(page, {
      format: 'learning-island-pack',
      version: 1,
      title: `注音描寫測試 ${b + 1}`,
      questions: chars.map((ch) => ({
        id: `w-${ch.codePointAt(0)!.toString(16)}`,
        subject: 'zh',
        skill: 'zh.write.zhuyin',
        indicators: ['Aa-Ⅰ-1'],
        type: 'write',
        prompt: `照筆順寫出 ${ch}`,
        target: ch,
        script: 'zhuyin',
      })),
    });
    await page.evaluate(([pid, seed]) => (window as any).__game.ui.getState().startActivity({ activityId: `pack.${pid}`, level: 1, seed }), [id, b + 1] as const);
    await expect(page.getByTestId('write-pad')).toBeVisible();

    const seen: string[] = [];
    for (let i = 0; i < chars.length; i++) {
      const q = await currentQuestion(page);
      seen.push(q.target);
      await traceWrite(page);
      await expect(page.getByTestId('feedback-good'), `「${q.target}」描寫應一次答對`).toBeVisible();
      total++;
      // 等換到下一題（或結算）
      await expect.poll(async () => (await screen(page)) === 'result' || (await currentQuestion(page)).id !== q.id).toBe(true);
    }
    // 這批每個字都出現過一次
    expect([...seen].sort()).toEqual([...chars].sort());
    await expect.poll(() => screen(page)).toBe('result');
  }

  expect(total).toBe(41);
  // 存檔歷史：每回合 correct 等於題數，合計 41（全部一次答對）
  const history = await page.evaluate(() => (window as any).__game.game.getState().profile().history as { total: number; correct: number }[]);
  expect(history.reduce((s, r) => s + r.total, 0)).toBe(41);
  expect(history.reduce((s, r) => s + r.correct, 0)).toBe(41);
  for (const r of history) expect(r.correct).toBe(r.total);
});
