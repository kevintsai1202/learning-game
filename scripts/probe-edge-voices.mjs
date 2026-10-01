/**
 * 實測 Microsoft Edge 的朗讀行為（音量設 0，不會出聲）：
 * 1. Edge 的 getVoices() 有沒有「Online (Natural)」自然語音、哪些是本機聲音
 * 2. 用自然語音朗讀時，onstart 要多久才觸發、事件順序為何
 * 3. 朗讀中呼叫 cancel()，onerror 的錯誤代碼是什麼（應為 interrupted 或 canceled，不能拿來判定失敗）
 * 4. 頁面模擬離線（context.setOffline）時，自然語音會觸發 onerror 還是沒有任何反應
 *
 * 實測結果（2026-10-01，Windows 11）：Playwright 啟動的 Edge 在無頭、有視窗、--raw、開 https 網頁四種情況下，
 * 都只列出本機的舊版聲音（Hanhan、Yating、Zhiwei），看不到「Online (Natural)」，所以第 2、4 項只能在一般開啟的 Edge 手動確認。
 * 第 3 項確認：朗讀中 cancel() 的錯誤代碼是 interrupted。
 *
 * 用法（PowerShell 7，專案根目錄）：
 *   node scripts/probe-edge-voices.mjs            # 無頭模式
 *   node scripts/probe-edge-voices.mjs --headed   # 有視窗（無頭模式拿不到自然語音時改用這個）
 *   node scripts/probe-edge-voices.mjs --headed --raw   # 不帶 Playwright 預設參數（預設參數會關掉背景連網與元件更新）
 */
import { chromium } from '@playwright/test';

const headed = process.argv.includes('--headed');
const raw = process.argv.includes('--raw');
const browser = await chromium.launch({
  channel: 'msedge',
  headless: !headed,
  ...(raw ? { ignoreDefaultArgs: ['--disable-background-networking', '--disable-component-update', '--disable-features', '--disable-default-apps', '--disable-extensions'] } : {}),
});
const context = await browser.newContext();
const page = await context.newPage();
// 自然語音可能只提供給一般 https 網頁，about:blank 拿不到，所以開線上網址
await page.goto(process.env.PROBE_URL ?? 'https://kevintsai1202.github.io/learning-game/');

/** 在頁面裡朗讀一句並記錄事件；cancelAfterMs 有值時朗讀中途呼叫 cancel() */
async function probe(voiceName, cancelAfterMs) {
  return page.evaluate(
    ({ voiceName, cancelAfterMs }) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const log = [];
        const v = speechSynthesis.getVoices().find((x) => x.name === voiceName);
        const u = new SpeechSynthesisUtterance('小朋友好，我們一起來學習吧！今天要學加法和減法。');
        u.voice = v;
        u.lang = v.lang;
        u.volume = 0;
        const done = (why) => resolve({ why, log, onLine: navigator.onLine });
        u.onstart = () => log.push(`start ${Math.round(performance.now() - t0)}ms`);
        u.onend = () => (log.push(`end ${Math.round(performance.now() - t0)}ms`), done('end'));
        u.onerror = (e) => (log.push(`error:${e.error} ${Math.round(performance.now() - t0)}ms`), done('error'));
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        if (cancelAfterMs) setTimeout(() => speechSynthesis.cancel(), cancelAfterMs);
        setTimeout(() => done('timeout 10s'), 10_000);
      }),
    { voiceName, cancelAfterMs },
  );
}

// 等聲音清單載入（Chromium 系列是非同步載入）
const voices = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const list = () => speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang, local: v.localService, uri: v.voiceURI }));
      if (list().length) return resolve(list());
      speechSynthesis.addEventListener('voiceschanged', () => resolve(list()), { once: true });
      setTimeout(() => resolve(list()), 5000);
    }),
);
const zh = voices.filter((v) => /^zh|^cmn/i.test(v.lang));
console.log(`模式：${headed ? '有視窗' : '無頭'}；聲音總數 ${voices.length}；中文 ${zh.length}`);
for (const v of zh) console.log(`  ${v.local ? '本機' : '連網'}  ${v.lang}  ${v.name}`);
for (const v of voices.filter((x) => /^en-US/i.test(x.lang)).slice(0, 6)) console.log(`  ${v.local ? '本機' : '連網'}  ${v.lang}  ${v.name}`);

const natural = zh.find((v) => /natural/i.test(v.name) && /tw/i.test(v.lang));
const local = zh.find((v) => v.local && /tw/i.test(v.lang));
if (natural) {
  console.log('\n[自然語音完整朗讀]', JSON.stringify(await probe(natural.name)));
  console.log('[自然語音朗讀中 cancel]', JSON.stringify(await probe(natural.name, 600)));
  await context.setOffline(true);
  console.log('[模擬離線＋自然語音]', JSON.stringify(await probe(natural.name)));
  await context.setOffline(false);
}
if (local) {
  console.log('[本機語音完整朗讀]', JSON.stringify(await probe(local.name)));
  console.log('[本機語音朗讀中 cancel]', JSON.stringify(await probe(local.name, 600)));
}
await browser.close();
