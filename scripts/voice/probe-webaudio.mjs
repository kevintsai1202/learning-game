/**
 * 實測：e2e 用的無頭 Chromium（SwiftShader 參數）能不能用 Web Audio 播放預錄語音：
 * AudioContext 是否進入 running、decodeAudioData 能否解碼 mp3、BufferSource 播完會不會觸發 onended。
 * 用法（PowerShell 7，專案根目錄）：node scripts/voice/probe-webaudio.mjs
 * 需要 data-src/raw/voice-compare/clips/ 裡至少有一個 mp3（先跑過 compare.mjs）。
 */
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';

const dir = 'data-src/raw/voice-compare/clips';
const file = readdirSync(dir).find((f) => f.startsWith('fish-shihan'));
const mp3 = readFileSync(`${dir}/${file}`);

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
// 用假網址提供 mp3，模擬網站上的音檔
await page.route('https://probe.local/**', (route) =>
  route.fulfill(route.request().url().endsWith('.mp3') ? { body: mp3, contentType: 'audio/mpeg' } : { body: '<html><body>probe</body></html>', contentType: 'text/html' }),
);
await page.goto('https://probe.local/');
const result = await page.evaluate(async () => {
  const ctx = new AudioContext();
  await ctx.resume();
  const t0 = performance.now();
  const buf = await ctx.decodeAudioData(await (await fetch('https://probe.local/clip.mp3')).arrayBuffer());
  const decodeMs = Math.round(performance.now() - t0);
  const ended = await new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => resolve(true);
    src.start();
    setTimeout(() => resolve(false), (buf.duration + 3) * 1000);
  });
  return { state: ctx.state, duration: buf.duration, decodeMs, ended };
});
console.log(JSON.stringify(result));
await browser.close();
