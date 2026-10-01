/**
 * 朗讀聲音的挑選與退回（用假的 speechSynthesis，不會真的出聲）：
 * - 自動模式挑自然語音；家長指定的聲音重新整理後仍有效
 * - 連網語音回報 network 錯誤、或一直沒開始唸，都改用本機聲音，而且之後幾分鐘都用本機聲音
 * - 被下一句打斷（interrupted）不是失敗，不能因此換成機械聲
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, freshStart } from './helpers';

const HSIAOCHEN = 'Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)';
const YUNJHE = 'Microsoft YunJhe Online (Natural) - Chinese (Taiwan)';
const HANHAN = 'Microsoft Hanhan - Chinese (Traditional, Taiwan)';

/** 一筆朗讀紀錄：唸了什麼、用哪個聲音、結果 */
type Spoken = { text: string; voice: string | null; result: string };

/**
 * 換掉瀏覽器的 speechSynthesis 與 SpeechSynthesisUtterance（真的 utterance 不接受假的聲音物件）。
 * window.__speech.failRemote 設成錯誤代碼（例如 'network'）時，連網聲音會回報該錯誤；設成 'silent' 時連網聲音不會有任何事件。
 */
async function stubSpeech(page: Page): Promise<void> {
  await page.addInitScript(
    ({ voices }) => {
      const w = window as any;
      w.__speech = { spoken: [] as Spoken[], failRemote: null as string | null };
      class FakeUtterance {
        text: string;
        lang = '';
        voice: any = null;
        rate = 1;
        pitch = 1;
        volume = 1;
        onstart: ((e: any) => void) | null = null;
        onend: ((e: any) => void) | null = null;
        onerror: ((e: any) => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }
      const queue: FakeUtterance[] = [];
      let speaking: FakeUtterance | null = null;
      /** 依序唸佇列裡的下一句（模擬瀏覽器一次只唸一句） */
      const next = () => {
        if (speaking || !queue.length) return;
        const u = (speaking = queue.shift()!);
        setTimeout(() => {
          if (speaking !== u) return;
          const rec = { text: u.text, voice: u.voice?.name ?? null };
          const fail = u.voice && !u.voice.localService ? w.__speech.failRemote : null;
          if (fail === 'silent') return void w.__speech.spoken.push({ ...rec, result: 'silent' });
          if (fail) {
            w.__speech.spoken.push({ ...rec, result: `error:${fail}` });
            speaking = null;
            u.onerror?.({ error: fail });
            return next();
          }
          w.__speech.spoken.push({ ...rec, result: 'ok' });
          u.onstart?.({});
          setTimeout(() => {
            if (speaking !== u) return;
            speaking = null;
            u.onend?.({});
            next();
          }, 40);
        }, 10);
      };
      const synth = {
        getVoices: () => voices.map((v) => ({ ...v, voiceURI: v.name, default: false })),
        speak: (u: FakeUtterance) => {
          queue.push(u);
          next();
        },
        cancel: () => {
          const u = speaking;
          queue.length = 0;
          speaking = null;
          if (u) setTimeout(() => u.onerror?.({ error: 'interrupted' }), 0);
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        pause: () => {},
        resume: () => {},
        speaking: false,
        pending: false,
        paused: false,
      };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    },
    {
      voices: [
        { name: HANHAN, lang: 'zh-TW', localService: true },
        { name: HSIAOCHEN, lang: 'zh-TW', localService: false },
        { name: YUNJHE, lang: 'zh-TW', localService: false },
        { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
        { name: 'Microsoft Ava Online (Natural) - English (United States)', lang: 'en-US', localService: false },
      ],
    },
  );
}

/** 目前的朗讀紀錄 */
const spoken = (page: Page): Promise<Spoken[]> => page.evaluate(() => (window as any).__speech.spoken);
/** 清空朗讀紀錄 */
const clearSpoken = (page: Page) => page.evaluate(() => ((window as any).__speech.spoken = []));
/** 設定連網聲音的失敗方式 */
const failRemote = (page: Page, how: string | null) => page.evaluate((h) => ((window as any).__speech.failRemote = h), how);

/** 進家長專區的設定頁：第一次要設定 PIN（1234 輸入兩次），之後輸入一次 */
async function openSettings(page: Page, firstTime = true): Promise<void> {
  await page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
  const digits = firstTime ? ['1', '2', '3', '4', '1', '2', '3', '4'] : ['1', '2', '3', '4'];
  for (const k of digits) await page.getByTestId(`pin-${k}`).click();
  await page.getByTestId('tab-settings').click();
}

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
