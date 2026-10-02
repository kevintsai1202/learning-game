/**
 * 線上版 P2：兩台裝置在同一個房間——互相看得到、走動同步、用短句盤說話（公頻＋頭上氣泡）、
 * 進建築就從對方的島上消失；老師看到兩人在線上、關掉聊天後短句盤收起來。
 * 截圖在 e2e/screenshots/realtime/（不進版控）。
 */
import { expect, test, type Page } from '@playwright/test';
import { enterZone } from './helpers';
import { SERVER, flushDeviceLogs, openDevice, pageErrors } from './onlineDevice';

const SHOTS = 'e2e/screenshots/realtime';

test.afterEach(async ({}, testInfo) => flushDeviceLogs(testInfo));

/** 用班級帳號登入並進島，等即時連線連上 */
async function loginAndEnter(page: Page, code: string, nickname: string, pin: string): Promise<void> {
  await page.evaluate(({ code, nickname, pin }) => (window as any).__game.cloud.getState().login({ code, nickname, pin }), { code, nickname, pin });
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await expect.poll(() => page.evaluate(() => (window as any).__game.realtime.getState().status)).toBe('online');
}

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

test('手機直式：短句盤打開後完整在畫面內，點了就送出', async ({ browser, baseURL, request }) => {
  test.setTimeout(240_000);
  const post = async (path: string, data: unknown) => {
    const res = await request.post(`${SERVER}${path}`, { data });
    expect(res.ok(), `${path} ${res.status()}`).toBe(true);
    return res.json();
  };
  const room = await post('/api/rooms', { name: '二年二班', password: 'teach123' });
  await post('/api/join', { code: room.code, nickname: '皮皮', pin: '3333', avatar: { animal: 'penguin', color: '#5b5b6b', hat: null } });
  const phone = await openDevice(browser, baseURL!);
  await phone.page.setViewportSize({ width: 390, height: 844 });
  await loginAndEnter(phone.page, room.code, '皮皮', '3333');
  await phone.page.getByTestId('chat-say').click();
  const picker = phone.page.getByTestId('phrase-picker');
  await expect(picker).toBeVisible();
  const box = (await phone.page.getByTestId('chat-panel').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await phone.page.screenshot({ path: `${SHOTS}/02-phone-picker.png` });
  await phone.page.getByTestId('phrase-great').click();
  await expect(phone.page.getByTestId('chat-line').last()).toContainText('皮皮：好厲害！');
  expect(pageErrors(phone.page)).toEqual([]);
  await phone.context.close();
});
