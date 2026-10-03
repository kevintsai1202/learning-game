/**
 * WebSocket 整合測試：真的 HTTP 伺服器（Hono＋@hono/node-server，隨機埠）掛上 attachRealtime，
 * 用 ws 用戶端連線，測登入、廣播、說話、各種斷線情況，以及 HTTP 路由與即時中樞的串接。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import WebSocket from 'ws';
import { createApp } from '../../server/app';
import { attachRealtime } from '../../server/ws';
import { Hub } from '../../server/hub';
import type { Db } from '../../server/db';
import { createRoom, createUser, joinRoom, openTestDb, resetDb } from './helpers';
import { addProfile, createEmptySave } from '../../src/store/save';
import { CLOSE_NO_CLASS } from '../../src/online/realtime';
import type { ServerMessage } from '../../src/online/realtime';

let db: Db;
let hub: Hub;
let port: number;
let stop: () => Promise<void>;
let call: (method: string, path: string, body?: unknown, token?: string) => Promise<{ status: number; body: any; headers: Headers }>;

beforeAll(async () => {
  db = await openTestDb();
});
afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await resetDb(db);
  hub = new Hub();
  const app = createApp({
    db,
    isOnline: (id) => hub.isOnline(id),
    onProfileChanged: (id, rev, profile) => hub.profileChanged(id, rev, profile),
    onRoomChanged: (code, flags) => hub.roomSettings(code, flags),
    onKick: (id, reason, via) => hub.kick(id, reason, via),
  });
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s));
  });
  port = (server.address() as AddressInfo).port;
  const rt = attachRealtime(server, { db, hub, allowedOrigins: ['http://allowed.test'], helloTimeoutMs: 400, flushMs: 20 });
  stop = async () => {
    rt.close();
    await new Promise((r) => server.close(r));
  };
  call = async (method, path, body, token) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };
});
afterEach(async () => {
  await stop();
});

/** 測試用的 ws 用戶端：收集訊息、等某種訊息出現、等關閉 */
class Client {
  readonly ws: WebSocket;
  readonly msgs: ServerMessage[] = [];
  readonly closed: Promise<number>;
  readonly opened: Promise<void>;
  constructor(origin = 'http://allowed.test') {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(String(d))));
    this.closed = new Promise((r) => this.ws.on('close', (code) => r(code)));
    this.opened = new Promise((resolve, reject) => {
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
    });
  }
  send(msg: unknown) {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  /** 等到收到某種訊息（最多 3 秒） */
  async waitFor<T extends ServerMessage['t']>(t: T, pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true) {
    const deadline = Date.now() + 3000;
    for (;;) {
      const hit = this.msgs.find((m): m is Extract<ServerMessage, { t: T }> => m.t === t && pred(m as Extract<ServerMessage, { t: T }>));
      if (hit) return hit;
      if (Date.now() > deadline) throw new Error(`等不到 ${t}，收到：${JSON.stringify(this.msgs.map((m) => m.t))}`);
      await new Promise((r) => setTimeout(r, 15));
    }
  }
}

/** 建房間、兩位孩子加入（拿權杖） */
async function setup() {
  const room = await createRoom(call);
  const a = await joinRoom(call, room.code, '阿寶', '1111');
  const b = await joinRoom(call, room.code, '小美', '2222');
  return { room, a, b };
}

/** 連線並登入 */
async function connect(token: string) {
  const c = new Client();
  await c.opened;
  c.send({ t: 'hello', token });
  await c.waitFor('welcome');
  return c;
}

describe('連線與廣播', () => {
  it('登入後收到 welcome；同房間的人互相看得到、走動與說話會廣播', async () => {
    const { a, b } = await setup();
    const ca = await connect(a.token);
    const cb = await connect(b.token);
    expect((await cb.waitFor('welcome')).members.map((m) => m.nickname)).toEqual(['阿寶']);
    await ca.waitFor('join', (m) => m.member.nickname === '小美');
    ca.send({ t: 'move', x: 2, z: 3, h: 0.5 });
    await cb.waitFor('moves', (m) => m.list.some(([id, x, z]) => id === a.account.id && x === 2 && z === 3));
    ca.send({ t: 'say', phrase: 'hi' });
    expect((await cb.waitFor('chat')).line).toMatchObject({ nickname: '阿寶', text: '你好！' });
    ca.ws.close();
    await cb.waitFor('leave', (m) => m.id === a.account.id);
  });

  it('同步改變存檔：自己的裝置收到 profile（版本號），別人收到 member', async () => {
    const { a, b } = await setup();
    const ca = await connect(a.token);
    const cb = await connect(b.token);
    await call('POST', '/api/ops', { ops: [{ id: 'p1', at: new Date().toISOString(), kind: 'playTime', seconds: 30 }] }, a.token);
    expect(await ca.waitFor('profile')).toEqual({ t: 'profile', rev: 2 });
    await cb.waitFor('member', (m) => m.member.id === a.account.id);
  });

  it('老師在線上名單看得到誰在線上；移除成員時那位孩子被踢下線', async () => {
    const { room, a, b } = await setup();
    const ca = await connect(a.token);
    const cb = await connect(b.token);
    const list = await call('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token);
    expect(list.body.members.every((m: { online: boolean }) => m.online)).toBe(true);
    await call('DELETE', `/api/teacher/rooms/${room.code}/members/${b.account.id}`, undefined, room.token);
    expect((await cb.waitFor('kicked')).reason).toContain('移出');
    expect(await cb.closed).toBe(4001);
    await ca.waitFor('leave', (m) => m.id === b.account.id);
  });
});

describe('斷線的情況', () => {
  it('權杖不對：關閉（4003）', async () => {
    await setup();
    const c = new Client();
    await c.opened;
    c.send({ t: 'hello', token: 'not-a-real-token-123' });
    expect(await c.closed).toBe(4003);
  });

  it('連上後一直沒有送 hello：逾時關閉（4002）', async () => {
    const c = new Client();
    await c.opened;
    expect(await c.closed).toBe(4002);
  });

  it('格式錯誤的訊息：關閉（1008）', async () => {
    const { a } = await setup();
    const c = await connect(a.token);
    c.send('{oops');
    expect(await c.closed).toBe(1008);
  });

  it('同一個帳號在第二台裝置登入：舊連線關閉（4001）', async () => {
    const { a } = await setup();
    const first = await connect(a.token);
    await connect(a.token);
    expect(await first.closed).toBe(4001);
  });

  it('不允許的網站來源：拒絕連線', async () => {
    const c = new Client('http://evil.test');
    await expect(c.opened).rejects.toThrow();
  });
});

describe('家長名下的雲端角色', () => {
  /** 家長把一個本機角色上傳成雲端角色，回傳角色的權杖與帳號 */
  async function uploadKid() {
    const mom = await createUser(call, { parent: true, teacher: false });
    const local = addProfile(createEmptySave(), { name: '安安', avatar: { animal: 'rabbit', color: '#ffffff', hat: null } }, new Date()).profiles[0];
    const up = (await call('POST', '/api/parent/kids', { profile: local }, mom.token)).body;
    return { mom, up };
  }

  it('還沒加入班級：關閉（4004「沒有班級」，和權杖無效分開，裝置不再重連）', async () => {
    const { up } = await uploadKid();
    const c = new Client();
    await c.opened;
    c.send({ t: 'hello', token: up.token });
    expect(await c.closed).toBe(CLOSE_NO_CLASS);
  });

  it('加入班級後可以連線；被老師移出時收到 kicked（進度都還在）', async () => {
    const { up } = await uploadKid();
    const room = await createRoom(call);
    expect((await call('POST', '/api/join', { code: room.code, nickname: '安安', pin: '1234' }, up.token)).status).toBe(200);
    const c = await connect(up.token);
    await call('DELETE', `/api/teacher/rooms/${room.code}/members/${up.account.id}`, undefined, room.token);
    const kicked = await c.waitFor('kicked');
    expect(kicked.reason).toContain('進度都還在');
  });

  it('老師重設孩子密碼：用班級代碼登入的裝置被踢；家長裝置（parent 權杖）照常連線', async () => {
    const { up } = await uploadKid();
    const room = await createRoom(call);
    expect((await call('POST', '/api/join', { code: room.code, nickname: '安安', pin: '1234' }, up.token)).status).toBe(200);
    // 學校平板用班級代碼登入（class 權杖）→ 重設密碼時被踢
    const school = (await call('POST', '/api/login', { code: room.code, nickname: '安安', pin: '1234' })).body;
    const tablet = await connect(school.token);
    expect((await call('POST', `/api/teacher/rooms/${room.code}/members/${up.account.id}/pin`, { pin: '5678' }, room.token)).status).toBe(200);
    expect((await tablet.waitFor('kicked')).reason).toContain('重設');
    // 家裡的裝置（parent 權杖，重設密碼後照樣有效）→ 再重設一次也不會被踢：之後老師改設定的廣播照常收到，前面沒有 kicked
    const home = await connect(up.token);
    expect((await call('POST', `/api/teacher/rooms/${room.code}/members/${up.account.id}/pin`, { pin: '5678' }, room.token)).status).toBe(200);
    expect((await call('PATCH', `/api/teacher/rooms/${room.code}`, { chatOpen: false }, room.token)).status).toBe(200);
    await home.waitFor('room');
    expect(home.msgs.map((m) => m.t)).not.toContain('kicked');
  });
});
