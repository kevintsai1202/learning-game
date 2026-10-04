/**
 * 檢查兩個正式網址的「用 Google 登入」按鈕能不能載入，也就是網址有沒有加進 Google OAuth 用戶端的「已授權的 JavaScript 來源」。
 * Google 對沒授權的網址：按鈕 iframe（accounts.google.com/gsi/button）回 403，主控台出現
 * "The given origin is not allowed for the given client ID"。
 * 只打開「老師／家長」帳號頁的「用 Google 登入」按鈕（A4 起 Google 綁大人帳號）；找不到時退回舊版前端的位置
 * （標題畫面 →「開始」→ 班級登入畫面；A5 上線前的正式環境還是舊版），不登入、不寫入任何資料。
 *
 * 執行（PowerShell 7，專案根目錄）：
 *   node scripts/deploy/check-google-origins.mjs
 *   node scripts/deploy/check-google-origins.mjs https://learning-island.zeabur.app/   # 只檢查指定網址
 */
import { chromium } from '@playwright/test';

/** 要檢查的前端網址（GitHub Pages 與班級伺服器同時提供的前端） */
const SITES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://kevintsai1202.github.io/learning-game/', 'https://learning-island.zeabur.app/'];

/** 等 Google 按鈕回應的上限（zeabur 網址的素材經過閘道器，載入較慢） */
const WAIT_MS = 60_000;

/**
 * 打開有 Google 按鈕的畫面，回傳是哪一個：A4 起在「老師／家長」帳號頁的登入分頁；
 * 舊版前端（A5 上線前的正式環境）在標題畫面「開始」→ 建立角色畫面的「班級」→ 班級登入畫面
 */
async function openGoogleButton(page) {
  await page.getByTestId('teacher-link').click({ timeout: WAIT_MS });
  try {
    await page.getByTestId('account-google-login').waitFor({ state: 'attached', timeout: 15_000 });
    return '帳號頁';
  } catch {
    await page.getByTestId('teacher-back').click({ timeout: WAIT_MS });
    await page.getByTestId('start').click({ timeout: WAIT_MS });
    await page.getByTestId('create-open-class').click({ timeout: WAIT_MS });
    await page.getByTestId('class-google-login').waitFor({ state: 'attached', timeout: WAIT_MS });
    return '班級畫面（舊版前端）';
  }
}

/**
 * 檢查一個網址：回傳 { site, verdict: 'ok' | 'denied' | 'unknown', detail }
 * @param {import('@playwright/test').Browser} browser
 * @param {string} site
 */
async function checkSite(browser, site) {
  const context = await browser.newContext({ locale: 'zh-TW' });
  const page = await context.newPage();
  /** gsi/button 的 HTTP 狀態碼（含 iframe 裡的請求） */
  const buttonStatuses = [];
  /** Google 程式在主控台說「來源不允許」的訊息 */
  const originErrors = [];
  page.on('response', (res) => {
    if (res.url().includes('accounts.google.com/gsi/button')) buttonStatuses.push(res.status());
  });
  page.on('console', (msg) => {
    if (/origin is not allowed/i.test(msg.text())) originErrors.push(msg.text());
  });
  try {
    await page.goto(site, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
    // 伺服器有設 GOOGLE_CLIENT_ID 時才有 Google 按鈕
    console.log(`  Google 按鈕在：${await openGoogleButton(page)}`);
    // 等到按鈕有回應（200 或 403）或主控台出現來源錯誤
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline && buttonStatuses.length === 0 && originErrors.length === 0) await page.waitForTimeout(500);
    // 有 403 時再多等一下，讓主控台訊息也進來
    if (buttonStatuses.some((s) => s !== 200)) await page.waitForTimeout(2000);
  } catch (err) {
    return { site, verdict: 'unknown', detail: `頁面操作失敗：${err instanceof Error ? err.message.split('\n')[0] : err}` };
  } finally {
    await context.close();
  }
  const detail = `gsi/button 狀態碼 [${buttonStatuses.join(', ') || '沒有請求'}]${originErrors.length ? `；主控台：${originErrors[0]}` : ''}`;
  if (originErrors.length || buttonStatuses.some((s) => s === 403)) return { site, verdict: 'denied', detail };
  if (buttonStatuses.includes(200)) return { site, verdict: 'ok', detail };
  return { site, verdict: 'unknown', detail };
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
let failed = false;
try {
  for (const site of SITES) {
    const r = await checkSite(browser, site);
    const label = { ok: '✅ 已授權', denied: '❌ 沒有授權（請加進「已授權的 JavaScript 來源」）', unknown: '⚠️ 無法判斷' }[r.verdict];
    console.log(`${label}  ${r.site}\n    ${r.detail}`);
    if (r.verdict !== 'ok') failed = true;
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
