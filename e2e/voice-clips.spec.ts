/**
 * 預錄語音（A 期）：有預錄音檔的句子播音檔，沒有的用裝置語音（假的 speechSynthesis，不會真的出聲）。
 * 透過 window.__game.speech.log 看每次朗讀用的方式（clip＝預錄、tts＝裝置語音），並攔截 audio/voice/*.mp3 的請求確認真的有下載。
 * 需要先產生預錄語音（scripts/voice/generate.mjs），並 npm run build。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, enterZone, freshStart } from './helpers';
import { clearSpoken, openSettings, spoken, stubSpeech } from './speechStub';

/** 朗讀紀錄（和 src/audio/speech.ts 的 SpeechRecord 相同） */
type Rec = { mode: 'clip' | 'tts'; text: string; lang: string; files?: string[] };
const log = (page: Page): Promise<Rec[]> => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.speech.log)));
/** 某段文字最近一次朗讀的方式 */
const lastFor = async (page: Page, text: string) => (await log(page)).filter((r) => r.text === text).pop();
/** 目前題目要唸的文字（和 src/quiz/spoken.ts 相同的規則） */
const promptText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const q = (window as any).__game.quiz.current;
    return q.speak ?? q.prompt;
  });

/** 記錄下載過的預錄音檔 */
function watchClips(page: Page): string[] {
  const got: string[] = [];
  page.on('requestfinished', (r) => {
    const m = r.url().match(/audio\/voice\/([0-9a-f]+\.mp3)$/);
    if (m) got.push(m[1]);
  });
  return got;
}

test('按「開始」時的歡迎詞用預錄語音，不經過裝置語音', async ({ page }) => {
  await stubSpeech(page);
  const clips = watchClips(page);
  await freshStart(page);
  await page.getByTestId('start').click();
  await expect.poll(async () => (await lastFor(page, '歡迎來到知識島大冒險！'))?.mode).toBe('clip');
  const rec = await lastFor(page, '歡迎來到知識島大冒險！');
  await expect.poll(() => clips.includes(rec!.files![0])).toBe(true);
  expect((await spoken(page)).map((s) => s.text)).not.toContain('歡迎來到知識島大冒險！');
});

test('生活題的題目、選項 🔊、答錯提示用預錄語音；數學題用裝置語音', async ({ page }) => {
  await stubSpeech(page);
  await freshStart(page);
  await createKid(page, '小安');
  await enterZone(page, 'life');
  await page.getByTestId('activity-life.traffic').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  const prompt = await promptText(page);
  await expect.poll(async () => (await lastFor(page, prompt))?.mode).toBe('clip');

  // 選擇題的選項 🔊（是非題沒有 🔊 時略過這一段）
  const say = page.locator('.choice .say').first();
  if (await say.count()) {
    await say.click();
    await expect.poll(async () => (await log(page)).pop()?.mode).toBe('clip');
  }

  // 故意答錯一次：「再想想看！」
  const q = await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.quiz.current)));
  if (q.type === 'choice') {
    await page.getByTestId(`choice-${(q.answer + 1) % q.options.length}`).click();
    await expect.poll(async () => (await lastFor(page, '再想想看！'))?.mode).toBe('clip');
  }

  // 數學題沒有預錄，用裝置語音
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await enterZone(page, 'math');
  await page.getByTestId('activity-math.add').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  const mathPrompt = await promptText(page);
  await expect.poll(async () => (await lastFor(page, mathPrompt))?.mode).toBe('tts');
});

test('注音描寫題先用預錄語音唸符號；含例字的題目改用裝置語音並略過符號', async ({ page }) => {
  await stubSpeech(page);
  await freshStart(page);
  await createKid(page, '小安');
  await enterZone(page, 'zh');
  await page.getByTestId('activity-zh.zhuyin-write').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  const q = await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.quiz.current)));
  expect(q.speak.startsWith(`${q.target}。`)).toBe(true);
  await expect.poll(async () => (await lastFor(page, q.speak))?.mode).toBeTruthy();
  const rec = await lastFor(page, q.speak);
  if (rec!.mode === 'clip') {
    // 符號＋固定指示句，兩個音檔
    expect(rec!.files).toHaveLength(2);
  } else {
    // 指示句含例字（沒有預錄），整段用裝置語音，而且不唸單獨的注音符號
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
    expect((await spoken(page)).map((s) => s.text)).not.toContain(`${q.target}。`);
  }
});

test('家長關掉「優先使用預錄語音」後，生活題改用裝置語音', async ({ page }) => {
  await stubSpeech(page);
  await freshStart(page);
  await createKid(page, '小安');
  await openSettings(page);
  await page.getByTestId('setting-voiceClips').uncheck();
  await page.getByTestId('parent-back').click();
  await clearSpoken(page);
  await enterZone(page, 'life');
  await page.getByTestId('activity-life.traffic').click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  const prompt = await promptText(page);
  await expect.poll(async () => (await lastFor(page, prompt))?.mode).toBe('tts');
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
});

test('對照表下載失敗時，全部改用裝置語音', async ({ page }) => {
  await stubSpeech(page);
  await page.route('**/audio/voice/manifest.json', (r) => r.fulfill({ status: 404, body: '' }));
  await freshStart(page);
  await page.getByTestId('start').click();
  await expect.poll(async () => (await lastFor(page, '歡迎來到知識島大冒險！'))?.mode).toBe('tts');
  await expect.poll(async () => (await spoken(page)).map((s) => s.text)).toContain('歡迎來到知識島大冒險！');
});
