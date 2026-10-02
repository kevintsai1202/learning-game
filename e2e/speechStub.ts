/**
 * e2e 共用：假的 speechSynthesis（不會真的出聲），記錄每一句用哪個聲音唸，並可模擬連網聲音失敗。
 * voice.spec.ts（挑選聲音）與 voice-clips.spec.ts（預錄語音）共用。
 */
import type { Page } from '@playwright/test';

export const HSIAOCHEN = 'Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)';
export const YUNJHE = 'Microsoft YunJhe Online (Natural) - Chinese (Taiwan)';
export const HANHAN = 'Microsoft Hanhan - Chinese (Traditional, Taiwan)';

/** 一筆朗讀紀錄：唸了什麼、用哪個聲音、結果 */
export type Spoken = { text: string; voice: string | null; result: string };

/**
 * 換掉瀏覽器的 speechSynthesis 與 SpeechSynthesisUtterance（真的 utterance 不接受假的聲音物件）。
 * window.__speech.failRemote 設成錯誤代碼（例如 'network'）時，連網聲音會回報該錯誤；設成 'silent' 時連網聲音不會有任何事件。
 */
export async function stubSpeech(page: Page): Promise<void> {
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
export const spoken = (page: Page): Promise<Spoken[]> => page.evaluate(() => (window as any).__speech.spoken);
/** 清空朗讀紀錄 */
export const clearSpoken = (page: Page) => page.evaluate(() => ((window as any).__speech.spoken = []));
/** 設定連網聲音的失敗方式 */
export const failRemote = (page: Page, how: string | null) => page.evaluate((h) => ((window as any).__speech.failRemote = h), how);

/** 進家長專區的設定頁：第一次要設定 PIN（1234 輸入兩次），之後輸入一次 */
export async function openSettings(page: Page, firstTime = true): Promise<void> {
  await page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
  const digits = firstTime ? ['1', '2', '3', '4', '1', '2', '3', '4'] : ['1', '2', '3', '4'];
  for (const k of digits) await page.getByTestId(`pin-${k}`).click();
  await page.getByTestId('tab-settings').click();
}
