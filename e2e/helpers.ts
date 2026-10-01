/**
 * e2e 共用工具：建立角色、傳送角色、依目前題目自動作答（正確或故意答錯）。
 */
import { expect, type Page } from '@playwright/test';

/** 從瀏覽器取回目前題目（JSON） */
export async function currentQuestion(page: Page): Promise<any> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.quiz.current)));
}

/** 目前畫面 */
export async function screen(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__game.ui.getState().screen);
}

/** 清空存檔後開啟首頁 */
export async function freshStart(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('start')).toBeVisible();
}

/** 從標題畫面建立角色並進入島嶼 */
export async function createKid(page: Page, name = '小安'): Promise<void> {
  await page.getByTestId('start').click();
  await page.getByTestId('name-input').fill(name);
  await page.getByRole('button', { name: '小兔' }).click();
  await page.getByTestId('create-profile').click();
  await expect.poll(() => screen(page)).toBe('island');
}

/** 把角色傳送到某棟建築門口，等門口泡泡出現後進入 */
export async function enterZone(page: Page, zone: string): Promise<void> {
  await page.evaluate((z) => {
    const g = (window as any).__game;
    // 直接呼叫 store 進入建築（傳送到門口的偵測依賴 3D 每幀更新，headless 太慢）
    g.ui.getState().enterZone(z);
  }, zone);
  await expect.poll(() => screen(page)).toMatch(/zone|shop/);
}

/** 用方向鍵以外的方式（傳送）站到門口，測試門口泡泡 */
export async function standAtDoor(page: Page, door: { x: number; z: number }): Promise<void> {
  await page.evaluate((d) => (window as any).__game.teleport(d), door);
}

/** 依題型用畫面操作作答；correct=false 時故意答錯 */
export async function answerCurrent(page: Page, correct = true): Promise<void> {
  const q = await currentQuestion(page);
  if (!q) throw new Error('沒有目前題目');
  switch (q.type) {
    case 'choice': {
      const idx = correct ? q.answer : (q.answer + 1) % q.options.length;
      await page.getByTestId(`choice-${idx}`).click();
      return;
    }
    case 'number': {
      const value = correct ? q.answer : q.answer + 1;
      for (const d of String(value)) await page.getByTestId(`key-${d}`).click();
      await page.getByTestId('key-✓').click();
      return;
    }
    case 'clock': {
      const minute = correct ? q.minute : (q.minute + q.step) % 60;
      for (let i = 0; i < minute / q.step; i++) await page.getByTestId('minute-plus').click();
      for (let i = 0; i < q.hour % 12; i++) await page.getByTestId('hour-plus').click();
      await page.getByTestId('clock-ok').click();
      return;
    }
    case 'money': {
      let rest = correct ? q.amount : q.amount + 1;
      for (const d of [...q.denominations].sort((a: number, b: number) => b - a)) {
        while (rest >= d) {
          await page.getByTestId(`money-${d}`).click();
          rest -= d;
        }
      }
      await page.getByTestId('money-ok').click();
      return;
    }
    case 'order': {
      const tokens: string[] = correct ? q.answer : [...q.answer].reverse();
      for (const t of tokens) await page.locator('.token:not(.placed)', { hasText: t }).first().click();
      await page.getByRole('button', { name: '✓ 完成' }).click();
      return;
    }
    case 'write': {
      if (!correct) throw new Error('描寫題無法故意寫錯');
      await traceWrite(page);
      return;
    }
    default:
      throw new Error(`自動作答不支援題型 ${q.type}`);
  }
}

/** 把整回合答完（每題都答對），直到出現結算畫面 */
export async function finishQuiz(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await screen(page)) === 'result') return;
    const before = await currentQuestion(page);
    await answerCurrent(page, true);
    // 等答對回饋後自動換題（或進入結算）
    await expect
      .poll(async () => {
        if ((await screen(page)) === 'result') return 'done';
        const now = await currentQuestion(page);
        return now && now.id !== before.id ? 'next' : 'wait';
      })
      .not.toBe('wait');
  }
  throw new Error('答了 40 題還沒結束');
}

/**
 * 描寫題：照目前這個字的筆畫中心線，用滑鼠一筆一筆畫在寫字板上。
 * 座標換算與 Hanzi Writer 的 Positioner 相同（字框 x 0～1024、y −124～900，y 向上）。
 */
export async function traceWrite(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => !!(window as any).__game.quiz.strokes), { timeout: 20_000 }).toBe(true);
  const { strokes, pad } = await page.evaluate(() => {
    const d = (window as any).__game.quiz;
    return { strokes: d.strokes as number[][][], pad: d.pad as { size: number; padding: number } };
  });
  const box = (await page.getByTestId('write-pad').boundingBox())!;
  const scale = (pad.size - 2 * pad.padding) / 1024;
  const toPage = ([x, y]: number[]) => ({ x: box.x + pad.padding + x * scale, y: box.y + pad.size - pad.padding - (y + 124) * scale });
  for (const median of strokes) {
    const pts = median.map(toPage);
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
}

/** 匯入自訂題庫（透過 store，不經檔案對話框），回傳題庫 id */
export async function importPack(page: Page, pack: unknown): Promise<string> {
  return page.evaluate((p) => {
    const store = (window as any).__game.packs;
    const errs = store.getState().importPack(JSON.stringify(p));
    if (errs) throw new Error(errs.join('\n'));
    const packs = store.getState().packs;
    return packs[packs.length - 1].id as string;
  }, pack);
}
