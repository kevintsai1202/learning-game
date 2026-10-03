/**
 * 線上版 P2：兩台裝置在同一個房間——互相看得到、走動同步、用短句盤說話（公頻＋頭上氣泡）、
 * 進建築就從對方的島上消失；老師看到兩人在線上、關掉聊天後短句盤收起來。
 * 截圖在 e2e/screenshots/realtime/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { enterZone, standAtDoor } from './helpers';
import { SERVER, flushDeviceLogs, loginAndEnter, openDevice, pageErrors } from './onlineDevice';

const SHOTS = 'e2e/screenshots/realtime';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 同島狀態裡某位成員（用暱稱找） */
async function memberByName(page: Page, nickname: string): Promise<any> {
  return page.evaluate((n) => {
    const s = (window as any).__game.presence.getState();
    return Object.values(s.members).find((m: any) => m.nickname === n && m.id !== s.selfId) ?? null;
  }, nickname);
}

test('兩台裝置同島：看得到彼此、走動同步、說話有公頻與氣泡、進建築就消失', async ({ browser, baseURL, request }) => {
  test.setTimeout(420_000);
  /** 直接呼叫伺服器 API（準備資料用） */
  const api = async (method: 'POST' | 'GET' | 'PATCH', path: string, data?: unknown, token?: string) => {
    const res = await request.fetch(`${SERVER}${path}`, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  const room = await api('POST', '/api/rooms', { name: '二年一班', password: 'teach123' });
  await api('POST', '/api/join', { code: room.code, nickname: '阿寶', pin: '1111', avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } });
  await api('POST', '/api/join', { code: room.code, nickname: '小美', pin: '2222', avatar: { animal: 'panda', color: '#5b5b6b', hat: null } });

  const a = await openDevice(browser, baseURL!);
  const b = await openDevice(browser, baseURL!);
  await loginAndEnter(a.page, room.code, '阿寶', '1111');
  await loginAndEnter(b.page, room.code, '小美', '2222');

  // 互相看得到：對方出現在同島狀態與島上的名牌
  await expect.poll(() => memberByName(a.page, '小美')).not.toBeNull();
  await expect.poll(() => memberByName(b.page, '阿寶')).not.toBeNull();
  await expect(b.page.getByTestId('name-tag')).toHaveCount(1);
  await expect(b.page.getByTestId('online-count')).toContainText('2 人在線上');

  // 走動同步：阿寶往前走，小美這邊看到位置改變
  await a.page.evaluate(() => {
    (window as any).__game.player.target = { x: 3, z: 9 };
  });
  await expect.poll(async () => (await memberByName(b.page, '阿寶'))?.x ?? 0, { timeout: 20_000 }).toBeGreaterThan(2);

  // 說話：阿寶用短句盤說「你好！」，兩邊都看到公頻與頭上氣泡
  await a.page.getByTestId('chat-say').click();
  await a.page.getByTestId('phrase-hi').click();
  await expect(b.page.getByTestId('chat-line').last()).toContainText('阿寶：你好！');
  await expect(b.page.getByTestId('chat-bubble')).toContainText('你好！');
  await expect(a.page.getByTestId('self-bubble')).toContainText('你好！');
  await b.page.screenshot({ path: `${SHOTS}/01-b-sees-a-talking.png` });

  // 老師看到兩人都在線上
  const teacher = await api('POST', '/api/teacher/login', { code: room.code, password: 'teach123' });
  const roster = await api('GET', '/api/teacher/room', undefined, teacher.token);
  expect(roster.members.map((m: { nickname: string; online: boolean }) => [m.nickname, m.online])).toEqual([
    ['阿寶', true],
    ['小美', true],
  ]);

  // 進建築：阿寶進數學城堡，小美的島上看不到他，公頻名單寫他在哪裡
  await enterZone(a.page, 'math');
  await expect.poll(async () => (await memberByName(b.page, '阿寶'))?.zone).toBe('math');
  await expect(b.page.getByTestId('name-tag')).toHaveCount(0);
  await expect(b.page.getByTestId('chat-inside')).toContainText('阿寶在數學城堡');

  // 老師關掉聊天：小美的短句盤收起來
  await api('PATCH', '/api/teacher/room', { chatOpen: false }, teacher.token);
  await expect(b.page.getByTestId('chat-panel')).toContainText('老師把聊天關起來了');
  await expect(b.page.getByTestId('chat-say')).toHaveCount(0);

  for (const d of [a, b]) expect(pageErrors(d.page)).toEqual([]);
  await Promise.all([a.context.close(), b.context.close()]);
});

/** 畫面上的方框 */
type Box = { x: number; y: number; width: number; height: number };

/** 兩個方框有沒有重疊 */
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** 檢查的螢幕：手機直式（兩種）、手機橫放、Chromebook（扣掉瀏覽器工具列）、平板橫放、平板直式（寬度超過 600，套不到手機的規則） */
const PICKER_VIEWPORTS: [number, number][] = [
  [390, 844],
  [375, 667],
  [844, 390],
  [1366, 650],
  [1280, 800],
  [768, 1024],
];

test('各種螢幕（觸控）：公頻與短句盤完整在畫面內、不擋按鈕；「進去玩」置中、不壓到搖桿與公頻；最後一句點得到', async ({ browser, baseURL, request }) => {
  test.setTimeout(300_000);
  const post = async (path: string, data: unknown) => {
    const res = await request.post(`${SERVER}${path}`, { data });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  const room = await post('/api/rooms', { name: '二年二班', password: 'teach123' });
  await post('/api/join', { code: room.code, nickname: '皮皮', pin: '3333', avatar: { animal: 'penguin', color: '#5b5b6b', hat: null } });
  // 觸控裝置：島上有搖桿（左下角），「進去玩」泡泡不能壓到它
  const { context, page } = await openDevice(browser, baseURL!, { touch: true });
  await loginAndEnter(page, room.code, '皮皮', '3333');
  await expect(page.locator('.joystick')).toBeVisible();

  // 公頻放滿 5 則對話（面板最高的情況）
  await page.evaluate(() => {
    const texts = ['你好！', '一起玩吧！', '好厲害！👍', '加油！💪', '我答對了！🎉'];
    const lines = texts.map((text, i) => ({ id: 900_000 + i, from: 'demo', nickname: '小美', text, at: Date.now() }));
    (window as any).__game.presence.setState((s: any) => ({ chat: [...s.chat, ...lines] }));
  });
  /** 數學城堡門口（算法同 src/world/layout.ts 的 doorOf） */
  const DOOR = { x: -11 + Math.sin(0.45) * 5.4, z: -10 + Math.cos(0.45) * 5.4 };
  /** 站到門口（畫面下方出現「進去玩」泡泡）或回到出生點（泡泡消失） */
  const goDoor = async (atDoor: boolean) => {
    await standAtDoor(page, atDoor ? DOOR : { x: 0, z: 13 });
    await expect(page.getByTestId('door-bubble')).toHaveCount(atDoor ? 1 : 0);
    // 等泡泡的出場動畫（0.3 秒）播完再量大小
    if (atDoor) await page.waitForTimeout(500);
  };
  const say = page.getByTestId('chat-say');
  /** 打開或收起短句盤 */
  const setPicker = async (open: boolean) => {
    if ((await say.getAttribute('aria-expanded')) !== String(open)) await say.click();
    await expect(page.getByTestId('phrase-picker')).toHaveCount(open ? 1 : 0);
    await page.waitForTimeout(300);
  };
  /** 公頻面板沒有超出畫面，也沒有擋住右上角的按鈕、左上角的金幣與存檔狀態 */
  const checkPanel = async (where: string, w: number, h: number) => {
    const panel = (await page.getByTestId('chat-panel').boundingBox())!;
    expect.soft(panel.x, `${where} 左邊超出`).toBeGreaterThanOrEqual(0);
    expect.soft(panel.y, `${where} 上面超出`).toBeGreaterThanOrEqual(0);
    expect.soft(panel.x + panel.width, `${where} 右邊超出`).toBeLessThanOrEqual(w);
    expect.soft(panel.y + panel.height, `${where} 下面超出`).toBeLessThanOrEqual(h);
    for (const id of ['hud-badges', 'hud-parent', 'hud-coins', 'hud-cloud']) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect.soft(overlaps(panel, box), `${where} 公頻擋到 ${id}：${JSON.stringify({ panel, box })}`).toBe(false);
    }
    // 並排的「說話」「送禮」：不換行（換行會變高）、文字不超出按鈕
    const buttons = await page.locator('.chat-actions .btn').evaluateAll((els) => els.map((el) => ({ text: el.textContent, h: el.getBoundingClientRect().height, sw: el.scrollWidth, cw: el.clientWidth })));
    expect.soft(buttons.length, `${where} 按鈕數`).toBe(2);
    for (const b of buttons) {
      expect.soft(b.h, `${where}「${b.text}」換行變高`).toBeLessThan(50);
      expect.soft(b.sw, `${where}「${b.text}」文字超出按鈕`).toBeLessThanOrEqual(b.cw);
    }
  };
  /** 「進去玩」一定點得到（另外的保險：泡泡畫在公頻上面） */
  const checkEnter = async (where: string) => {
    const covered = await page.getByTestId('enter-zone').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(hit && el.contains(hit));
    });
    expect.soft(covered, `${where} 公頻蓋住「進去玩」`).toBe(false);
  };
  /** 「進去玩」泡泡：完整在畫面內；寬螢幕置中；不壓到公頻、搖桿、右上角按鈕 */
  const checkBubble = async (where: string, w: number, h: number) => {
    const bubble = (await page.getByTestId('door-bubble').boundingBox())!;
    expect.soft(bubble.x, `${where} 泡泡左邊超出`).toBeGreaterThanOrEqual(0);
    expect.soft(bubble.y, `${where} 泡泡上面超出`).toBeGreaterThanOrEqual(0);
    expect.soft(bubble.x + bubble.width, `${where} 泡泡右邊超出`).toBeLessThanOrEqual(w);
    expect.soft(bubble.y + bubble.height, `${where} 泡泡下面超出`).toBeLessThanOrEqual(h);
    if (w > 600) expect.soft(Math.abs(bubble.x + bubble.width / 2 - w / 2), `${where} 泡泡沒有置中：${JSON.stringify(bubble)}`).toBeLessThanOrEqual(2);
    const others: [string, Box | null][] = [
      ['公頻', await page.getByTestId('chat-panel').boundingBox()],
      ['搖桿', await page.locator('.joystick').boundingBox()],
      ['hud-badges', await page.getByTestId('hud-badges').boundingBox()],
      ['hud-parent', await page.getByTestId('hud-parent').boundingBox()],
    ];
    for (const [name, box] of others) {
      if (box) expect.soft(overlaps(bubble, box), `${where} 泡泡壓到${name}：${JSON.stringify({ bubble, box })}`).toBe(false);
    }
  };

  // 每種螢幕都檢查完再一起報告（soft），一次看到所有問題
  for (const [w, h] of PICKER_VIEWPORTS) {
    const where = `${w}x${h}`;
    await page.setViewportSize({ width: w, height: h });
    // 離開門口打開短句盤（手機上站在門口時，「進去玩」泡泡會蓋在「說話」上面）：
    // 面板不超出、不擋按鈕，「收起」和最後一句（捲動後）都看得到
    await goDoor(false);
    await setPicker(true);
    await checkPanel(`${where} 短句盤`, w, h);
    await expect.soft(say, where).toBeInViewport();
    await page.getByTestId('phrase-sad').scrollIntoViewIfNeeded();
    await expect.soft(page.getByTestId('phrase-sad'), where).toBeInViewport();
    await page.screenshot({ path: `${SHOTS}/02-picker-${where}.png` });
    // 走到門口：短句盤開著或收起，「進去玩」都點得到，泡泡位置正確
    await goDoor(true);
    await checkEnter(`${where} 短句盤`);
    await checkBubble(`${where} 短句盤`, w, h);
    await setPicker(false);
    await checkPanel(`${where} 收起`, w, h);
    await checkEnter(`${where} 收起`);
    await checkBubble(`${where} 收起`, w, h);
    await page.screenshot({ path: `${SHOTS}/03-door-${where}.png` });
  }

  // 回到出生點點最後一句：公頻出現、短句盤收起來
  await goDoor(false);
  await setPicker(true);
  await page.getByTestId('phrase-sad').click();
  await expect(page.getByTestId('chat-line').last()).toContainText('皮皮：😢');
  await expect(page.getByTestId('phrase-picker')).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
  await context.close();
});
