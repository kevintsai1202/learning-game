/**
 * 家長的雲端角色（A2，docs/plans/accounts.md 第 6 節）：
 * 家裡的電腦：孩子先在本機玩一回合 → 家長註冊（家長身分）→ 把角色存到雲端；
 * 新的平板：家長登入 → 在這台裝置玩 → 進度相同（選角卡片顯示「☁️ 雲端」）→ 用代碼加入班級（同一個角色）；
 * 老師移出 → 平板上的角色還在、沒有班級、金幣不變。另一個測試：家長刪除帳號後，這台裝置上的雲端角色也拿掉。
 */
import { expect, test, type Page } from '@playwright/test';
import { createKid, enterZone, finishQuiz, screen } from './helpers';
import { SERVER, TEST_PASSWORD, cloudState, createClassViaApi, flushDeviceLogs, loginTeacher, openDevice, pageErrors, profileOf, uniqueUsername } from './onlineDevice';

const SHOTS = 'e2e/screenshots/parent-cloud';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 在標題畫面打開帳號頁，用畫面註冊一位家長，停在家長頁；回傳帳號名稱 */
async function registerParent(page: Page): Promise<string> {
  const username = uniqueUsername();
  await page.getByTestId('teacher-link').click();
  await page.getByTestId('account-tab-register').click();
  await page.getByTestId('account-username').fill(username);
  await page.getByTestId('account-password').fill(TEST_PASSWORD);
  await page.getByTestId('account-confirm').fill(TEST_PASSWORD);
  await page.getByTestId('account-email').fill(`${username}@example.com`);
  await page.getByTestId('role-parent').click();
  await expect(page.getByTestId('role-parent')).toBeChecked();
  await page.getByTestId('account-submit').click();
  await expect(page.getByTestId('parent-home')).toBeVisible();
  return username;
}

/** 在本機建立角色並玩完一回合數學加法，回到標題畫面 */
async function playLocalRound(page: Page, name: string): Promise<void> {
  await createKid(page, name);
  await enterZone(page, 'math');
  await page.getByTestId('activity-math.add').click();
  await page.getByTestId('level-1').click();
  await finishQuiz(page);
  await expect(page.getByTestId('result')).toBeVisible();
  await page.evaluate(() => (window as any).__game.ui.getState().goto('title'));
}

test('家長的雲端角色：存到雲端、新平板在這台裝置玩、加入班級、被老師移出後進度還在', async ({ browser, baseURL, request }) => {
  test.setTimeout(600_000);

  // ---------- 家裡的電腦：孩子先在本機玩一回合，家長註冊後把角色存到雲端 ----------
  const home = await openDevice(browser, baseURL!);
  await playLocalRound(home.page, '安安');
  const local = await profileOf(home.page);
  expect(local.coins).toBeGreaterThan(0);
  const username = await registerParent(home.page);
  // L2（存到雲端的決定 A）：家長頁上方問「這台裝置上有「安安」，是你的孩子嗎？」，按一下就存好
  await expect(home.page.getByTestId('upload-offer')).toContainText('「安安」');
  await home.page.screenshot({ path: `${SHOTS}/00-upload-offer.png` });
  await home.page.getByTestId('upload-offer-yes').click();
  await expect(home.page.getByTestId('parent-note')).toContainText('已經存到你的帳號');
  await expect(home.page.getByTestId('upload-offer')).toHaveCount(0);
  await expect(home.page.getByTestId('kid-安安')).toContainText('還沒加入班級');
  await expect(home.page.getByTestId('kid-here-安安')).toBeVisible();
  const uploaded = await profileOf(home.page);
  expect(uploaded.id).toBe(local.id);
  expect(uploaded.cloud.accountId).toBeTruthy();
  expect(uploaded.cloud.rooms).toBeUndefined();
  await home.page.screenshot({ path: `${SHOTS}/01-parent-uploaded.png` });

  // ---------- 新的平板：家長登入，在這台裝置玩 → 進度相同 ----------
  const tablet = await openDevice(browser, baseURL!);
  await loginTeacher(tablet.page, username);
  await tablet.page.getByTestId('kid-device-安安').click();
  await expect(tablet.page.getByTestId('parent-note')).toContainText('已經在這台裝置上了');
  const onTablet = await profileOf(tablet.page);
  expect(onTablet).toMatchObject({ id: local.id, name: '安安', coins: local.coins });
  await tablet.page.getByTestId('teacher-back').click();
  await tablet.page.getByTestId('start').click();
  // 還沒有班級：選角卡片不再標「☁️ 雲端」（L2：給大人看的地方不出現「雲端」，有班級才標班級名稱）
  await expect(tablet.page.locator('.cloud-badge')).toHaveCount(0);
  await tablet.page.screenshot({ path: `${SHOTS}/02-tablet-profiles.png` });

  // ---------- 用代碼加入班級：同一個角色，名字改成班上的暱稱 ----------
  const cls = await createClassViaApi(request, '二年一班');
  await tablet.page.getByTestId('open-class').click();
  await tablet.page.getByTestId('class-tab-join').click();
  await tablet.page.getByTestId('class-code').fill(cls.code);
  await tablet.page.getByTestId('class-nickname').fill('小安');
  await tablet.page.getByTestId('class-pin').fill('1234');
  await tablet.page.getByTestId('class-source').selectOption({ label: '用「安安」加入（雲端角色）' });
  await tablet.page.getByTestId('class-submit').click();
  await expect.poll(() => screen(tablet.page)).toBe('island');
  const joined = await profileOf(tablet.page);
  // 多班級起角色的名字不改成班上的暱稱，暱稱記在班級清單裡
  expect(joined).toMatchObject({ id: local.id, name: '安安', coins: local.coins });
  expect(joined.cloud.rooms[0]).toMatchObject({ code: cls.code, nickname: '小安' });
  const roster = await (await request.get(`${SERVER}/api/teacher/rooms/${cls.code}`, { headers: { authorization: `Bearer ${cls.token}` } })).json();
  expect(roster.members.map((m: { nickname: string }) => m.nickname)).toEqual(['小安']);
  await expect.poll(() => tablet.page.evaluate(() => (window as any).__game.realtime.getState().status)).toBe('online');

  // ---------- 老師移出：平板上的角色還在、沒有班級、金幣不變 ----------
  const removed = await request.delete(`${SERVER}/api/teacher/rooms/${cls.code}/members/${joined.cloud.accountId}`, { headers: { authorization: `Bearer ${cls.token}` } });
  expect(removed.ok(), `移出 ${removed.status()}`).toBe(true);
  // 多班級起（docs/plans/multi-class.md 第 9 節第 6 點）：家長裝置不踢下線，熊熊老師的泡泡說「進度都還在」，然後重新上線
  await expect(tablet.page.getByTestId('speech-bubble')).toContainText('進度都還在');
  await expect.poll(async () => (await profileOf(tablet.page)).cloud?.rooms?.[0]?.code ?? null, { timeout: 30_000 }).toBeNull();
  const after = await profileOf(tablet.page);
  expect(after).toMatchObject({ id: local.id, coins: local.coins, cloud: { accountId: joined.cloud.accountId } });
  await expect.poll(() => cloudState(tablet.page), { timeout: 20_000 }).toMatchObject({ status: 'synced' });
  // 沒有班級了：重新上線到自己的島（不再保持離線）
  await expect
    .poll(() => tablet.page.evaluate(() => [(window as any).__game.realtime.getState().status, (window as any).__game.realtime.getState().island]), { timeout: 20_000 })
    .toEqual(['online', 'own']);
  // 沒有班級了：同步狀態寫「已存到雲端」，不是「已存到班級」
  await expect(tablet.page.getByTestId('hud-cloud')).toHaveText('☁️ 已存到雲端');
  await tablet.page.screenshot({ path: `${SHOTS}/03-tablet-after-removed.png` });

  // ---------- 權杖過期（模擬：這台裝置的權杖不見了）：點同步狀態到帳號頁，家長「在這台裝置玩」找回，進度不丟 ----------
  await tablet.page.evaluate((id) => {
    const all = JSON.parse(localStorage.getItem('learning-island-cloud') ?? '{}');
    delete all[id];
    localStorage.setItem('learning-island-cloud', JSON.stringify(all));
    return (window as any).__game.cloud.getState().syncNow();
  }, joined.cloud.accountId);
  await expect.poll(() => cloudState(tablet.page)).toMatchObject({ status: 'needLogin' });
  await tablet.page.getByTestId('hud-cloud').click();
  await expect.poll(() => screen(tablet.page)).toBe('teacher');
  // 本機有這個角色、但沒有權杖：照樣顯示「在這台裝置玩」（不是「這台裝置上有」）
  await tablet.page.getByTestId('kid-device-安安').click();
  await expect(tablet.page.getByTestId('parent-note')).toContainText('已經在這台裝置上了');
  await expect.poll(() => cloudState(tablet.page), { timeout: 20_000 }).toMatchObject({ status: 'synced' });
  expect(await profileOf(tablet.page)).toMatchObject({ id: local.id, coins: local.coins });

  for (const d of [home, tablet]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([home.context.close(), tablet.context.close()]);
});

test('平板上已經有同一個角色（以前用備份匯入的）：在這台裝置玩要先確認，確定後換成雲端的進度', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  // ---------- 家裡的電腦：本機玩一回合，存到雲端 ----------
  const home = await openDevice(browser, baseURL!);
  await playLocalRound(home.page, '安安');
  // 還沒有雲端標記的這份，等同當時匯出的備份
  const local = await profileOf(home.page);
  const username = await registerParent(home.page);
  await home.page.getByTestId('upload-offer-yes').click();
  await expect(home.page.getByTestId('kid-here-安安')).toBeVisible();
  const cloudAccount = (await profileOf(home.page)).cloud.accountId;

  // ---------- 平板：以前匯入過同一份備份，之後自己又玩出別的進度（金幣不同） ----------
  const tablet = await openDevice(browser, baseURL!);
  await tablet.page.evaluate((p) => (window as any).__game.game.getState().putProfile({ ...p, coins: p.coins + 7 }), local);
  await loginTeacher(tablet.page, username);
  // 本機那份不會被問要不要存（雲端已經有同一個角色）；名單上的「在這台裝置玩」要先確認
  await expect(tablet.page.getByTestId('kid-device-安安')).toBeVisible();
  await expect(tablet.page.getByTestId('upload-offer')).toHaveCount(0);
  await tablet.page.getByTestId('kid-device-安安').click();
  await expect(tablet.page.getByTestId('kid-replace-warning-安安')).toContainText('這台裝置上的進度會不見');
  await tablet.page.screenshot({ path: `${SHOTS}/04-tablet-replace-confirm.png` });
  await tablet.page.getByTestId('kid-replace-confirm-安安').click();
  await expect(tablet.page.getByTestId('parent-note')).toContainText('已經在這台裝置上了');
  await expect(tablet.page.getByTestId('kid-here-安安')).toBeVisible();
  // 同一個角色換成雲端的進度（金幣是雲端的），沒有多出第二個角色
  const saved = await tablet.page.evaluate(() => JSON.parse(JSON.stringify((window as any).__game.game.getState().save.profiles)));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ id: local.id, coins: local.coins, cloud: { accountId: cloudAccount } });
  for (const d of [home, tablet]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([home.context.close(), tablet.context.close()]);
});

test('家長刪除帳號：名下的雲端角色一併刪除，這台裝置上的也拿掉，帳號頁回到登入', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const d = await openDevice(browser, baseURL!);
  await playLocalRound(d.page, '妹妹');
  await registerParent(d.page);
  await d.page.getByTestId('upload-offer-yes').click();
  await expect(d.page.getByTestId('kid-here-妹妹')).toBeVisible();
  await d.page.getByTestId('account-settings').click();
  await d.page.getByTestId('delete-account').click();
  await d.page.getByTestId('delete-password').fill(TEST_PASSWORD);
  await d.page.getByTestId('delete-account-confirm').click();
  await expect(d.page.getByTestId('account-submit')).toBeVisible();
  // 這台裝置上的雲端角色也拿掉了
  await expect.poll(() => d.page.evaluate(() => (window as any).__game.game.getState().save.profiles.length)).toBe(0);
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});

test('「這台裝置上有○○，是你的孩子嗎？」按「不是」：這位家長之後不再問（重新整理也一樣），換另一位家長登入會問', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const d = await openDevice(browser, baseURL!);
  await d.page.evaluate(() => (window as any).__game.game.getState().createProfile('鄰居小孩', { animal: 'dog', color: '#ffffff', hat: null }));
  await registerParent(d.page);
  await expect(d.page.getByTestId('upload-offer')).toContainText('「鄰居小孩」');
  await d.page.getByTestId('upload-offer-no').click();
  await expect(d.page.getByTestId('upload-offer')).toHaveCount(0);
  // 重新整理（同一個分頁還是登入的）：孩子清單讀完之後還是不問
  await d.page.reload();
  await d.page.getByTestId('teacher-link').click();
  await expect(d.page.getByTestId('parent-home')).toContainText('還沒有孩子的角色');
  await expect(d.page.getByTestId('upload-offer')).toHaveCount(0);
  // 角色還在這台裝置，沒有存到家長帳號
  expect(await d.page.evaluate(() => (window as any).__game.game.getState().save.profiles.map((p: any) => [p.name, !!p.cloud]))).toEqual([['鄰居小孩', false]]);
  // 換另一位家長登入：會問
  await d.page.getByTestId('account-logout').click();
  await d.page.getByTestId('teacher-back').click();
  await registerParent(d.page);
  await expect(d.page.getByTestId('upload-offer')).toContainText('「鄰居小孩」');
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});

test('家長帳號登入中，在選角畫面新建的角色自動存到家長帳號（不用再問）', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const d = await openDevice(browser, baseURL!);
  await registerParent(d.page);
  await d.page.getByTestId('teacher-back').click();
  await d.page.getByTestId('start').click();
  await d.page.getByTestId('name-input').fill('小新');
  await d.page.getByTestId('create-profile').click();
  await expect.poll(() => d.page.evaluate(() => (window as any).__game.ui.getState().screen)).toBe('island');
  // 背景存好：這台裝置上的角色變成家長名下的角色
  await expect.poll(async () => (await profileOf(d.page)).cloud?.accountId ?? null, { timeout: 20_000 }).not.toBeNull();
  await d.page.evaluate(() => (window as any).__game.ui.getState().goto('teacher'));
  await expect(d.page.getByTestId('kid-here-小新')).toBeVisible();
  await expect(d.page.getByTestId('upload-offer')).toHaveCount(0);
  expect(pageErrors(d.page)).toEqual([]);
  await d.context.close();
});
