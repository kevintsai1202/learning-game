/**
 * 隱私權政策頁（Google 品牌驗證會審這一頁）：中英文都要有 Google 使用者資料的說明與有限使用（Limited Use）聲明；
 * 手機寬度時資料表格只在自己的框裡左右捲動，整頁不能橫向捲動。
 * 首頁（Google 也會審）：不執行 JavaScript 也要看得到遊戲說明與隱私權政策連結；遊戲載入後這段靜態內容會被取代。
 */
import { expect, test } from '@playwright/test';

test.describe('首頁的靜態內容（不執行 JavaScript，像 Google 的爬蟲）', () => {
  test.use({ javaScriptEnabled: false });

  test('看得到遊戲名稱、說明與隱私權政策連結', async ({ page }) => {
    // Google 實際抓的是原始 HTML
    const raw = await (await page.request.get('./')).text();
    expect(raw).toContain('href="./privacy.html"');
    await page.goto('./');
    // 名稱要和 OAuth 同意畫面的應用程式名稱一致
    await expect(page.getByRole('heading', { level: 1, name: '知識島大冒險' })).toBeVisible();
    await expect(page.getByText('給國小二年級的 3D 遊戲化學習網站')).toBeVisible();
    await expect(page.getByRole('link', { name: '隱私權政策 Privacy Policy' })).toHaveAttribute('href', './privacy.html');
    await page.screenshot({ path: 'test-results/boot-no-js.png' });
  });
});

test('遊戲載入後，首頁的靜態說明會被遊戲畫面取代', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('start')).toBeVisible();
  await expect(page.locator('#boot')).toHaveCount(0);
});

test('隱私權政策：中英文都有 Google 使用者資料與有限使用聲明，手機寬度不會橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('./privacy.html');
  await expect(page.getByRole('heading', { level: 1, name: '知識島大冒險 隱私權政策' })).toBeVisible();

  const body = page.locator('body');
  // Google 使用者資料：要求的權限、保存的資料、有限使用聲明（中文版）
  await expect(body).toContainText('4. Google 使用者資料');
  await expect(body).toContainText('只保存 Google 帳號識別碼、電子郵件地址與綁定時間');
  await expect(body).toContainText('有限使用（Limited Use）規定');
  // A2～A4 改版的內容：家長與老師的帳號、經由 Gmail 寄信、自己刪除帳號、Google 綁大人帳號；過時的說法已經拿掉
  await expect(body).toContainText('家長與老師的帳號');
  await expect(body).toContainText('透過 Google 的 Gmail 寄送');
  await expect(body).toContainText('「刪除帳號」');
  await expect(body).toContainText('把 Google 帳號綁定到自己的帳號');
  await expect(body).not.toContainText('管理密碼');
  await expect(body).not.toContainText('孩子的班級帳號或老師的房間');
  // L2 家長自動化：「存到雲端」按鈕換成卡片；只有家長身分的帳號登入期間新建的角色自動存到家長帳號
  await expect(body).toContainText('是，存到我的帳號');
  await expect(body).toContainText('只有家長身分的帳號（沒有老師身分）登入期間');
  await expect(body).not.toContainText('「存到雲端」時');
  // 英文版（Google 審核人員看得懂的版本）
  const en = page.locator('#english');
  await expect(en).toContainText('Learning Island (知識島大冒險) Privacy Policy');
  await expect(en).toContainText('including the Limited Use requirements');
  await expect(en).toContainText('Parent and teacher accounts');
  await expect(en).toContainText("sent through Google's Gmail");
  await expect(en).toContainText('"Delete account"');
  await expect(en).toContainText('link a Google account to their own account');
  await expect(en).not.toContainText('admin password');
  await expect(en).toContainText('a parent-only account (one without the teacher role)');
  await expect(en).not.toContainText('"Save to cloud"');
  // 中英文各有一個連到 Google API 服務使用者資料政策的連結
  await expect(page.locator('a[href="https://developers.google.com/terms/api-services-user-data-policy"]')).toHaveCount(2);

  // 表格只在自己的框裡捲動，整頁不橫向捲動
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.locator('table').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/privacy-phone.png' });
});
