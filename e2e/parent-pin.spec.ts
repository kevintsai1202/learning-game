/**
 * 家長專區的 PIN 輸入：按得很快也不能吃掉按鍵。
 * 以前第 4 個數字按下後要等 150 毫秒才判斷，這段時間按的數字會接在舊的 4 碼後面被吃掉：設定 PIN 時第二輪少一碼，
 * 就卡在「請再輸入一次確認」（2026-10-06 全套 e2e 的 voice.spec 偶發失敗，就是 openSettings 連點踩到這個空檔）。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, freshStart } from './helpers';

/** 依序快速按 PIN 鍵：每下間隔 gap 毫秒（遠短於 150 毫秒，模擬手很快的家長） */
async function tapFast(page: Page, digits: string, gap = 20): Promise<void> {
  await page.evaluate(
    async ({ digits, gap }) => {
      for (const k of digits) {
        (document.querySelector(`[data-testid="pin-${k}"]`) as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, gap));
      }
    },
    { digits, gap },
  );
}

/** 切到家長專區（先回島上，家長專區重新出現時會再要 PIN） */
async function openParent(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
}

test('PIN 按得很快也不會吃掉按鍵：設定時連按兩次、輸入錯了馬上接著輸入對的', async ({ page }) => {
  await freshStart(page);
  await createKid(page, '小安');

  // 第一次：設定 PIN（1234 輸入兩次），8 下連按
  await openParent(page);
  await expect(page.getByTestId('pin-msg')).toContainText('第一次使用');
  await tapFast(page, '12341234');
  await expect(page.getByTestId('tab-settings')).toBeVisible();

  // 已有 PIN：先按錯的 4 碼，馬上接著按對的
  await openParent(page);
  await expect(page.getByTestId('pin-msg')).toContainText('請輸入家長 PIN');
  await tapFast(page, '99991234');
  await expect(page.getByTestId('tab-settings')).toBeVisible();
});
