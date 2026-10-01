/**
 * 試聽頁截圖檢查：確認 data-src/raw/voice-compare/index.html 能正常顯示（表格、音檔播放器、注音按鈕）。
 * 用法（PowerShell 7，專案根目錄）：node scripts/voice/shot-compare.mjs
 * 截圖存到 data-src/raw/voice-compare/shot-*.png（不進版控）。
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const page_ = path.resolve('data-src/raw/voice-compare/index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(pathToFileURL(page_).href);
const counts = await page.evaluate(() => ({
  rows: document.querySelectorAll('tbody tr').length,
  audios: document.querySelectorAll('audio').length,
  zhuyin: document.querySelectorAll('td.zy').length,
  errors: document.querySelectorAll('td.err').length,
}));
console.log(JSON.stringify(counts));
await page.screenshot({ path: 'data-src/raw/voice-compare/shot-top.png' });
await page.locator('h2', { hasText: '注音（語音模型能不能唸）' }).scrollIntoViewIfNeeded();
await page.screenshot({ path: 'data-src/raw/voice-compare/shot-zhuyin.png' });
await browser.close();
