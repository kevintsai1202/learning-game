/**
 * 朗讀聲音的挑選與退回（用假的 speechSynthesis，不會真的出聲）：
 * - 自動模式挑自然語音；家長指定的聲音重新整理後仍有效
 * - 連網語音回報 network 錯誤、或一直沒開始唸，都改用本機聲音，而且之後幾分鐘都用本機聲音
 * - 被下一句打斷（interrupted）不是失敗，不能因此換成機械聲
 */
import { expect, test } from '@playwright/test';
import { createKid, freshStart } from './helpers';
import { HANHAN, HSIAOCHEN, YUNJHE, clearSpoken, failRemote, openSettings, spoken, stubSpeech } from './speechStub';


test('自動挑自然語音；家長指定的聲音重新整理後仍有效', async ({ page }) => {
  await stubSpeech(page);
  await freshStart(page);
  await createKid(page, '小安');
  // 進島時的「出發囉」依句子切開唸；到目前為止唸過的每一句（含標題畫面的歡迎詞）都用自然語音
  await expect.poll(async () => (await spoken(page)).map((s) => s.text)).toEqual(expect.arrayContaining(['小安，出發囉！', '點地面就可以走過去。']));
  expect(new Set((await spoken(page)).map((s) => s.voice))).toEqual(new Set([HSIAOCHEN]));

  await openSettings(page);
  await expect(page.getByTestId('voice-using-zh-TW')).toContainText(HSIAOCHEN);
  await expect(page.getByTestId('voice-hint')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screenshots/20-voice-settings.png' });
  // 手機直式畫面：選單與試聽按鈕不能超出畫面
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'e2e/screenshots/21-voice-settings-mobile.png' });
  const box = (await page.getByTestId('voice-test-zh-TW').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 800 });

  // 指定 YunJhe 後試聽
  await page.getByTestId('voice-zh-TW').selectOption(YUNJHE);
  await clearSpoken(page);
  await page.getByTestId('voice-test-zh-TW').click();
  await expect.poll(async () => (await spoken(page)).map((s) => s.voice)).toEqual([YUNJHE, YUNJHE]);

  // 重新整理後仍是 YunJhe
  await page.reload();
  await openSettings(page, false);
  await expect(page.getByTestId('voice-zh-TW')).toHaveValue(YUNJHE);
  await expect(page.getByTestId('voice-using-zh-TW')).toContainText(YUNJHE);
});

test('連網聲音回報 network 錯誤時改用本機聲音，從失敗的那句重唸，之後也用本機聲音', async ({ page }) => {
  await stubSpeech(page);
  await freshStart(page);
  await createKid(page, '小安');
  await openSettings(page);
  await failRemote(page, 'network');
  await clearSpoken(page);
  await page.getByTestId('voice-test-zh-TW').click();
  await expect
    .poll(async () => (await spoken(page)).map((s) => `${s.voice}|${s.result}`))
    .toEqual([`${HSIAOCHEN}|error:network`, `${HANHAN}|ok`, `${HANHAN}|ok`]);
  // 之後的朗讀直接用本機聲音，不必每句先失敗一次
  await clearSpoken(page);
  await page.getByTestId('voice-test-zh-TW').click();
  await expect.poll(async () => (await spoken(page)).map((s) => s.voice)).toEqual([HANHAN, HANHAN]);
  await expect(page.getByTestId('voice-using-zh-TW')).toBeVisible();
});

test('連網聲音一直沒開始唸（離線時可能沒有錯誤事件），4 秒後改用本機聲音', async ({ page }) => {
  await stubSpeech(page);
  await freshStart(page);
  await createKid(page, '小安');
  await openSettings(page);
  await failRemote(page, 'silent');
  await clearSpoken(page);
  await page.getByTestId('voice-test-zh-TW').click();
  await expect
    .poll(async () => (await spoken(page)).map((s) => `${s.voice}|${s.result}`), { timeout: 10_000 })
    .toEqual([`${HSIAOCHEN}|silent`, `${HANHAN}|ok`, `${HANHAN}|ok`]);
});

test('被下一句打斷（interrupted）不算失敗，仍用自然語音', async ({ page }) => {
  await stubSpeech(page);
  await freshStart(page);
  await createKid(page, '小安');
  await openSettings(page);
  await clearSpoken(page);
  // 連按兩次：第一次會被第二次打斷
  await page.getByTestId('voice-test-zh-TW').click();
  await page.getByTestId('voice-test-zh-TW').click();
  await page.waitForTimeout(800);
  const voices = (await spoken(page)).map((s) => s.voice);
  expect(voices.length).toBeGreaterThan(0);
  expect(voices.every((v) => v === HSIAOCHEN)).toBe(true);
});
