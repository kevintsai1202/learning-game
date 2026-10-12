/**
 * 班級島遊樂場（docs/plans/playground.md）第 ② 段：伺服器。
 * - 資料表第 14 版 rooms.playground（舊班級是 null，當成全空）。
 * - 老師改設定 PATCH /api/teacher/rooms/:code 的 playground（格式驗證：4 個位置、八種器材或空的）；
 *   改了通知即時中樞（班級島上的人收到 room）。
 * - 班級島的歡迎訊息與 room 訊息帶 playground；能力宣告 caps 有 ride；座位代碼 ride0～ride7 收得到、轉送得出去。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom, makeClient, openTestDb, resetDb } from './helpers';
import { migrate, openDb, type Db } from '../../server/db';
import { flagsOf } from '../../server/classes';
import { Hub, type HubConn } from '../../server/hub';
import { clientMessage, type ServerMessage } from '../../src/online/realtime';
import { addProfile, createEmptySave } from '../../src/store/save';
import type { Playground } from '../../src/store/rideKinds';

const PG: Playground = ['carousel', null, 'seesaw', 'ferris'];
const EMPTY: Playground = [null, null, null, null];
/** 老師還沒設定過的班級：先放好的 4 座（使用者 2026-10-12） */
const DEFAULT: Playground = ['carousel', 'seesaw', 'swingset', 'trampoline'];

describe('資料表第 14 版', () => {
  it('v13 → v14：班級多一欄遊樂場，既有班級是 null；可以存', async () => {
    const d = await openDb({});
    try {
      await migrate(d, { upTo: 13 });
      await d.query("INSERT INTO rooms (code, name, teacher_hash, created_at) VALUES ('888888', '二年八班', 'h', now())");
      await migrate(d);
      expect((await d.query("SELECT playground FROM rooms WHERE code = '888888'"))[0].playground).toBeNull();
      await d.query("UPDATE rooms SET playground = $1::jsonb WHERE code = '888888'", [JSON.stringify(PG)]);
      expect((await d.query("SELECT playground FROM rooms WHERE code = '888888'"))[0].playground).toEqual(PG);
      expect((await d.query('SELECT max(version)::int AS v FROM schema_migrations'))[0].v).toBe(14);
      await migrate(d);
    } finally {
      await d.close();
    }
  });

  it('flagsOf：老師還沒設定過（null）或格式不對是預設的 4 座；老師設定成全空就是全空', () => {
    expect(flagsOf({ chat_open: true, gifts_open: false, playground: null }).playground).toEqual(DEFAULT);
    expect(flagsOf({ chat_open: true, gifts_open: false, playground: PG }).playground).toEqual(PG);
    expect(flagsOf({ chat_open: true, gifts_open: false, playground: ['rocket'] }).playground).toEqual(DEFAULT);
    expect(flagsOf({ chat_open: true, gifts_open: false, playground: EMPTY }).playground).toEqual(EMPTY);
  });
});

describe('老師改遊樂場', () => {
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

  it('新班級是預設的 4 座；PATCH 改了存起來、通知即時中樞；可以改成全空；格式不對是 400', async () => {
    const onRoomChanged = vi.fn();
    const { call } = makeClient(db, { onRoomChanged });
    const { code, token } = await createRoom(call);
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, token)).body.room.playground).toEqual(DEFAULT);
    const set = await call('PATCH', `/api/teacher/rooms/${code}`, { playground: PG }, token);
    expect(set.status).toBe(200);
    expect(set.body.room.playground).toEqual(PG);
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, token)).body.room.playground).toEqual(PG);
    expect(onRoomChanged).toHaveBeenLastCalledWith(code, { chatOpen: true, giftsOpen: true, playground: PG });
    // 只改開關：遊樂場照舊
    await call('PATCH', `/api/teacher/rooms/${code}`, { chatOpen: false }, token);
    expect(onRoomChanged).toHaveBeenLastCalledWith(code, { chatOpen: false, giftsOpen: true, playground: PG });
    // 老師全部改成空地：就是全空（不會變回預設）
    expect((await call('PATCH', `/api/teacher/rooms/${code}`, { playground: EMPTY }, token)).body.room.playground).toEqual(EMPTY);
    expect((await call('GET', `/api/teacher/rooms/${code}`, undefined, token)).body.room.playground).toEqual(EMPTY);
    expect((await call('PATCH', `/api/teacher/rooms/${code}`, { playground: ['carousel', null, null] }, token)).status).toBe(400);
    expect((await call('PATCH', `/api/teacher/rooms/${code}`, { playground: ['rocket', null, null, null] }, token)).status).toBe(400);
  });
});

/** 假連線：記下收到的訊息 */
class FakeConn implements HubConn {
  sent: ServerMessage[] = [];
  send(msg: ServerMessage) {
    this.sent.push(msg);
  }
  close() {}
  of<T extends ServerMessage['t']>(t: T) {
    return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
}

describe('即時中樞', () => {
  let hub: Hub;
  beforeEach(() => {
    hub = new Hub({ now: () => 1_000_000 });
  });
  const join = (id: string, nickname: string, playground: Playground = PG) => {
    const conn = new FakeConn();
    const profile = addProfile(createEmptySave(), { name: nickname, avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, new Date()).profiles[0];
    hub.join(conn, { accountId: id, name: nickname, classes: [{ code: '123456', nickname, flags: { chatOpen: true, giftsOpen: true, playground } }], profile, via: 'class', tokenRoom: '123456' });
    return conn;
  };

  it('班級島的歡迎訊息帶遊樂場；能力宣告有 ride', () => {
    const a = join('a', '阿寶');
    const w = a.of('welcome')[0];
    expect(w.room.playground).toEqual(PG);
    expect(w.caps).toContain('ride');
  });

  it('老師改了遊樂場：班級島上的人收到 room（帶新的遊樂場）；之後來的人的歡迎訊息也是新的', () => {
    const a = join('a', '阿寶');
    const next: Playground = ['train', 'teacups', null, null];
    hub.roomSettings('123456', { chatOpen: true, giftsOpen: true, playground: next });
    expect(a.of('room').at(-1)!.room.playground).toEqual(next);
    const b = join('b', '小美', EMPTY);
    expect(b.of('welcome')[0].room.playground).toEqual(next);
  });

  it('座位代碼 ride0～ride7：格式驗證收得到，轉送給島上其他人', () => {
    for (let i = 0; i < 8; i++) expect(clientMessage.safeParse({ t: 'move', x: 1, z: 2, h: 0, a: `ride${i}` }).success).toBe(true);
    expect(clientMessage.safeParse({ t: 'move', x: 1, z: 2, h: 0, a: 'ride8' }).success).toBe(false);
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    hub.move(a, 3, 4, 0.5, 'ride3');
    hub.flush();
    expect(b.of('moves').at(-1)!.list).toEqual([['a', 3, 4, 0.5, 'ride3']]);
  });
});
