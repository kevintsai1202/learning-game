/**
 * 把 docs/brand/ 的標誌 SVG 轉成 PNG：
 * - <名稱>-120.png：Google OAuth 同意畫面用（正方形 120×120、1 MB 以下；允許 JPG、PNG、BMP）
 * - preview.png：所有款式放大並排的預覽（挑選用）
 * 用 Playwright 的 Chromium 畫，結果和瀏覽器看到的一樣；改了 SVG 之後重跑這支即可。
 *
 * 執行（PowerShell 7）：node scripts/brand/render-logo.mjs
 */
import { chromium } from '@playwright/test';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** 標誌原始檔與輸出的資料夾 */
const DIR = 'docs/brand';
/** Google 建議的標誌尺寸 */
const SIZE = 120;
/** 預覽圖裡每款的大小 */
const PREVIEW = 240;

/** SVG 檔轉成 <img> 用的 data URL（用 <img> 而不是直接內嵌，兩款的漸層 id 才不會互相干擾） */
const dataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const files = (await readdir(DIR)).filter((f) => f.endsWith('.svg')).sort();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  /** 各款的名稱與 data URL（預覽用） */
  const logos = [];
  for (const f of files) {
    const url = dataUrl(await readFile(path.join(DIR, f), 'utf8'));
    logos.push({ name: f.replace(/\.svg$/, ''), url });
    await page.setContent(`<!doctype html><body style="margin:0"><img src="${url}" width="${SIZE}" height="${SIZE}" style="display:block"></body>`);
    const out = path.join(DIR, f.replace(/\.svg$/, `-${SIZE}.png`));
    await page.locator('img').screenshot({ path: out });
    const bytes = (await stat(out)).size;
    if (bytes > 1024 * 1024) throw new Error(`${out} 超過 1 MB`);
    console.log(`${out}：${SIZE}×${SIZE}，${bytes} bytes`);
  }

  // 預覽：每款放大並排，下面寫檔名，另外附一個實際大小（120）和裁成圓形的樣子
  const cells = logos
    .map(
      (l) => `<figure style="margin:0;text-align:center">
        <img src="${l.url}" width="${PREVIEW}" height="${PREVIEW}" style="display:block;border-radius:24px">
        <div style="display:flex;gap:16px;justify-content:center;align-items:center;margin-top:12px">
          <img src="${l.url}" width="${SIZE}" height="${SIZE}">
          <img src="${l.url}" width="${SIZE / 2}" height="${SIZE / 2}" style="border-radius:50%">
        </div>
        <figcaption style="font:600 20px sans-serif;margin-top:8px">${l.name}</figcaption>
      </figure>`,
    )
    .join('');
  await page.setViewportSize({ width: 40 + logos.length * (PREVIEW + 40), height: PREVIEW + SIZE + 110 });
  await page.setContent(`<!doctype html><body style="margin:0;padding:20px;background:#fffaf0;display:flex;gap:40px">${cells}</body>`);
  await page.screenshot({ path: path.join(DIR, 'preview.png') });
  console.log(`${path.join(DIR, 'preview.png')}：預覽`);
} finally {
  await browser.close();
}
