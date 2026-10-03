/**
 * 直式手機的結算畫面（使用者 2026-10-03 回報：答完題出現的選單，最下面的按鈕按不到）。
 * 內容很多時（錯題清單列出長的應用題、得到新獎章），結算卡片要完整在畫面內、可以用手指在卡片裡捲動；
 * 捲到底之後三個按鈕都在畫面內、沒有被別的東西蓋住，點「回島上」會回到島上。
 * 注意：外層是 overflow: hidden，Playwright 的 click 會用程式把它捲過去，所以不能只靠 click 判斷「按得到」，
 * 要量卡片的位置、檢查卡片能不能捲，並用 elementFromPoint 確認按鈕上面沒有別的東西。
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { answerCurrent, createKid, enterZone, finishQuiz, freshStart, screen } from './helpers';

const SHOTS = 'e2e/screenshots/result-mobile';

/** 直式手機（和 mobile-audit.spec.ts 相同的尺寸） */
const PHONES = [
  { name: 'se-375x667', width: 375, height: 667 },
  { name: 'android-360x740', width: 360, height: 740 },
  { name: 'iphone-390x844', width: 390, height: 844 },
];

/** 玩一回合數學應用題：前 5 題各答錯兩次（看答案後按下一題，進錯題本），其餘答對，停在結算畫面 */
async function playRoundWithManyMistakes(page: Page): Promise<void> {
  await enterZone(page, 'math');
  await page.getByTestId('activity-math.word-addsub').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    if ((await screen(page)) === 'result') break;
    await answerCurrent(page, false);
    await answerCurrent(page, false);
    await page.getByTestId('next').click();
  }
  await finishQuiz(page);
  await expect(page.getByTestId('result')).toBeVisible();
}

/** 按鈕完整在畫面內，而且中心點最上層就是這個按鈕（沒被蓋住） */
async function expectTappable(page: Page, button: Locator, what: string, width: number, height: number): Promise<void> {
  const box = (await button.boundingBox())!;
  expect.soft(box.y, `${what} 的上緣在畫面外`).toBeGreaterThanOrEqual(0);
  expect.soft(box.y + box.height, `${what} 的下緣在畫面外`).toBeLessThanOrEqual(height);
  expect.soft(box.x + box.width, `${what} 的右緣在畫面外`).toBeLessThanOrEqual(width);
  const onTop = await button.evaluate((el, p) => {
    const hit = document.elementFromPoint(p.x, p.y);
    return !!hit && (hit === el || el.contains(hit));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect.soft(onTop, `${what} 被別的東西蓋住`).toBe(true);
}

for (const d of PHONES) {
  test.describe(d.name, () => {
    test.use({ viewport: { width: d.width, height: d.height }, hasTouch: true, isMobile: true });

    test(`直式手機 ${d.name}：錯題很多的結算畫面，最下面的按鈕捲得到、按得到`, async ({ page }) => {
      test.setTimeout(300_000);
      page.setDefaultTimeout(15_000);
      await freshStart(page);
      await createKid(page, '小安');
      await playRoundWithManyMistakes(page);
      // 等彈出動畫播完再量
      await page.waitForTimeout(800);
      const card = page.getByTestId('result');
      await page.screenshot({ path: `${SHOTS}/${d.name}-1-top.png`, timeout: 60_000 });

      // 卡片完整在畫面內（超出的部分外層捲不動，使用者看不到也按不到）
      const box = (await card.boundingBox())!;
      expect.soft(box.y, '結算卡片的上緣在畫面外').toBeGreaterThanOrEqual(0);
      expect.soft(box.y + box.height, '結算卡片的下緣在畫面外').toBeLessThanOrEqual(d.height);

      // 內容比卡片高時，卡片本身要能捲（使用者用手指在卡片上滑）
      const scroll = await card.evaluate((el) => ({ overflowY: getComputedStyle(el).overflowY, tall: el.scrollHeight > el.clientHeight + 1 }));
      if (scroll.tall) expect.soft(['auto', 'scroll'], '卡片內容比卡片高，但卡片不能捲').toContain(scroll.overflowY);

      /** 三個按鈕都完整在畫面內、沒被蓋住 */
      const buttonsTappable = async (when: string) => {
        await expectTappable(page, page.getByTestId('play-again'), `${when}「再玩一次」`, d.width, d.height);
        await expectTappable(page, page.getByTestId('back-to-zone'), `${when}「選別的」`, d.width, d.height);
        await expectTappable(page, page.getByTestId('back-to-island'), `${when}「回島上」`, d.width, d.height);
      };
      // 孩子不一定知道要往下滑：還沒捲動時按鈕就要按得到（按鈕固定在卡片底部）
      await buttonsTappable('還沒捲動時');
      // 捲到卡片最底下也一樣按得到
      await card.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${SHOTS}/${d.name}-2-bottom.png`, timeout: 60_000 });
      await buttonsTappable('捲到底時');

      await page.getByTestId('back-to-island').click();
      await expect.poll(() => screen(page)).toBe('island');
    });
  });
}
