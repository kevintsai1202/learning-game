/**
 * 國字描寫：用自訂題庫放 10 個國字描寫題（筆畫 3～12、結構各異），
 * 照台灣教育部筆順的筆畫中心線一筆一筆畫在寫字板上，每題都要判定答對，且全部一次答對。
 * 這支測試同時驗證 scripts/build-hanzi-data.py 的產物（public/data/strokes/hanzi/<碼位>.json）能被 Hanzi Writer 載入、
 * 筆順資料與描寫判定一致。
 *
 * 執行方式（獨立資料夾與埠號，不動 dist/ 與 4183）：
 *   npx vite build --outDir dist-zh
 *   npx vite preview --outDir dist-zh --port 4177 --strictPort
 *   $env:BASE_URL = 'http://localhost:4177/'; npx playwright test e2e/hanzi.spec.ts
 */
import { expect, test } from '@playwright/test';
import { createKid, currentQuestion, freshStart, importPack, screen, traceWrite } from './helpers';

/** 10 個字：獨體、左右、上下、包圍、品字等結構，筆畫 4～12（單元測試 tests/engine/zh-chars.test.ts 確認都有筆順檔） */
const CHARS: { ch: string; note: string }[] = [
  { ch: '木', note: '獨體字，4 畫' },
  { ch: '中', note: '貫穿，4 畫' },
  { ch: '生', note: '獨體字，5 畫' },
  { ch: '河', note: '左右結構，8 畫' },
  { ch: '明', note: '左右結構，8 畫' },
  { ch: '國', note: '全包圍，11 畫' },
  { ch: '鳥', note: '獨體字，11 畫' },
  { ch: '雲', note: '上下結構，12 畫' },
  { ch: '森', note: '品字形，12 畫' },
  { ch: '間', note: '半包圍，12 畫' },
];

test('照台灣教育部筆順描寫 10 個國字，全部一次答對', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小國');
  const id = await importPack(page, {
    format: 'learning-island-pack',
    version: 1,
    title: '國字描寫測試',
    questions: CHARS.map(({ ch, note }) => ({
      id: `hz-${ch}`,
      subject: 'zh',
      skill: 'zh.chars-write',
      indicators: ['4-Ⅰ-5'],
      type: 'write',
      prompt: `照著筆順，描寫「${ch}」（${note}）`,
      target: ch,
      script: 'hanzi',
    })),
  });
  await page.evaluate((pid) => (window as any).__game.ui.getState().startActivity({ activityId: `pack.${pid}`, level: 1, seed: 1 }), id);
  await expect(page.getByTestId('write-pad')).toBeVisible();
  await page.waitForTimeout(500);

  const seen: string[] = [];
  for (let i = 0; i < CHARS.length; i++) {
    const q = await currentQuestion(page);
    seen.push(q.target);
    await traceWrite(page);
    // 一次寫對：出現「答對」回饋，而且沒有出現「再想想看」
    await expect(page.getByTestId('feedback-good')).toBeVisible();
    await expect(page.locator('.feedback.retry')).toHaveCount(0);
    if (i === 0) await page.screenshot({ path: 'e2e/screenshots/hanzi-01.png' });
    // 等換到下一題（或結算）
    await expect.poll(async () => (await screen(page)) === 'result' || (await currentQuestion(page)).id !== q.id).toBe(true);
  }
  // 10 題都出過（題庫可能被打散順序，所以比對集合）
  expect(new Set(seen)).toEqual(new Set(CHARS.map((c) => c.ch)));
  await expect.poll(() => screen(page)).toBe('result');
  const rec = await page.evaluate(() => (window as any).__game.game.getState().profile().history[0]);
  expect(rec.total).toBe(10);
  // 「一次答對」題數：10 題全部
  expect(rec.correct).toBe(10);
});
