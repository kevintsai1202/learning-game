/**
 * HTTP 路由通知即時中樞的時機：存檔改變（帶上新的存檔）、老師改房間設定、移除成員、重設密碼；
 * 老師成員列表的「在線上」來自中樞。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom, joinRoom, makeClient, openTestDb, resetDb } from './helpers';
import type { Db } from '../../server/db';

let db: Db;
beforeAll(async () => {
  db = await openTestDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
});

/** 建立帶監看函式的 app */
function hooked() {
  const hooks = {
    onProfileChanged: vi.fn(),
    onRoomChanged: vi.fn(),
    onKick: vi.fn(),
    isOnline: vi.fn((id: string) => id === online.id),
  };
  const online = { id: '' };
  return { ...makeClient(db, hooks), hooks, online };
}

describe('通知即時中樞', () => {
  it('同步改變存檔：帶上帳號、版本號與新的存檔；沒有改變（空批次）不通知', async () => {
    const { call, hooks } = hooked();
    const { code } = await createRoom(call);
    const kid = await joinRoom(call, code);
    await call('POST', '/api/ops', { ops: [] }, kid.token);
    expect(hooks.onProfileChanged).not.toHaveBeenCalled();
    await call('POST', '/api/ops', { ops: [{ id: 'p1', at: new Date().toISOString(), kind: 'playTime', seconds: 30 }] }, kid.token);
    expect(hooks.onProfileChanged).toHaveBeenCalledWith(kid.account.id, 2, expect.objectContaining({ name: '小安' }));
  });

  it('老師改房間設定：帶上聊天與送禮的開關', async () => {
    const { call, hooks } = hooked();
    const { code, token } = await createRoom(call);
    await call('PATCH', '/api/teacher/room', { chatOpen: false }, token);
    expect(hooks.onRoomChanged).toHaveBeenCalledWith(code, { chatOpen: false, giftsOpen: true });
  });

  it('老師移除成員、重設密碼：那位孩子被踢下線（附原因）', async () => {
    const { call, hooks } = hooked();
    const { code, token } = await createRoom(call);
    const a = await joinRoom(call, code, '小安');
    const b = await joinRoom(call, code, '小美', '5678');
    await call('POST', `/api/teacher/members/${a.account.id}/pin`, { pin: '0000' }, token);
    expect(hooks.onKick).toHaveBeenCalledWith(a.account.id, expect.stringContaining('密碼'));
    await call('DELETE', `/api/teacher/members/${b.account.id}`, undefined, token);
    expect(hooks.onKick).toHaveBeenCalledWith(b.account.id, expect.stringContaining('移出'));
  });

  it('老師的成員列表：在線上的狀態來自中樞', async () => {
    const { call, online } = hooked();
    const { code, token } = await createRoom(call);
    const a = await joinRoom(call, code, '小安');
    await joinRoom(call, code, '小美', '5678');
    online.id = a.account.id;
    const r = await call('GET', '/api/teacher/room', undefined, token);
    expect(r.body.members.map((m: { nickname: string; online: boolean }) => [m.nickname, m.online])).toEqual([
      ['小安', true],
      ['小美', false],
    ]);
  });
});
