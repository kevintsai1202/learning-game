/**
 * 幫靜態頁面截圖（檢查 public/ 下的獨立頁面排版，例如隱私權政策頁），電腦與手機寬度各一張。
 * 頁面用 file:// 直接開，不必啟動伺服器。
 *
 * 執行（PowerShell 7）：node scripts/brand/screenshot-page.mjs public/privacy.html
 * 輸出：logs/<檔名>-desktop.png、logs/<檔名>-phone.png（logs/ 不進版控）
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 要截圖的頁面 */
const file = process.argv[2];
if (!file) throw new Error('用法：node scripts/brand/screenshot-page.mjs <html 檔>');
/** 兩種寬度：電腦、手機直式 */
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

await mkdir('logs', { recursive: true });
const browser = await chromium.launch();
try {
  for (const v of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: v.width, height: v.height } });
    await page.goto(pathToFileURL(path.resolve(file)).href);
    // 檢查有沒有橫向捲軸（手機上內容超出畫面寬度）
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const out = path.join('logs', `${path.basename(file, '.html')}-${v.name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`${out}${overflow > 0 ? `（橫向超出 ${overflow}px）` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
}
