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
import { CLOSE_RECONNECT, type ServerMessage } from '../../src/online/realtime';

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
    whereOf: (id, room) => hub.whereOf(id, room),
    onProfileChanged: (id, rev, profile) => hub.profileChanged(id, rev, profile),
    onRoomChanged: (code, flags) => hub.roomSettings(code, flags),
    onKick: (id, reason, via, room) => hub.kick(id, reason, via, room),
    onLeftClass: (id, room, reason) => hub.leftClass(id, room, reason),
    onClassChanged: (id) => hub.reconnect(id),
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

  it('還沒加入班級：連到自己的島（島嶼互訪 I1；改版前是關閉 4004「沒有班級」）', async () => {
    const { up } = await uploadKid();
    const c = await connect(up.token);
    expect((await c.waitFor('welcome')).island).toBe('own');
    expect(c.msgs.map((m) => m.t)).not.toContain('kicked');
  });

  it('加入班級後可以連線；被老師移出時：家長裝置收到提示（進度都還在）並以 4005 重新上線，不封鎖（多班級）', async () => {
    const { up } = await uploadKid();
    const room = await createRoom(call);
    expect((await call('POST', '/api/join', { code: room.code, nickname: '安安', pin: '1234' }, up.token)).status).toBe(200);
    const c = await connect(up.token);
    await call('DELETE', `/api/teacher/rooms/${room.code}/members/${up.account.id}`, undefined, room.token);
    const notice = await c.waitFor('notice');
    expect(notice.message).toContain('進度都還在');
    expect(await c.closed).toBe(CLOSE_RECONNECT);
    expect(c.msgs.map((m) => m.t)).not.toContain('kicked');
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
  it('用平板進島的孩子（tablet 權杖，L3 教室密碼）：老師換教室密碼被踢；被老師移出班級也被踢（和 class 權杖相同）', async () => {
    const room = await createRoom(call);
    expect((await call('PATCH', `/api/teacher/rooms/${room.code}`, { classPassword: 'bear2026' }, room.token)).status).toBe(200);
    const kid = (await call('POST', '/api/join', { code: room.code, nickname: '小美', pin: '1234', avatar: { animal: 'cat', color: '#ffffff', hat: null } })).body;
    const classroom = (await call('POST', `/api/class/${room.code}/unlock`, { password: 'bear2026' })).body.token;
    const first = (await call('POST', `/api/class/members/${kid.account.id}/device`, {}, classroom)).body;
    const tablet = await connect(first.token);
    expect((await call('PATCH', `/api/teacher/rooms/${room.code}`, { classPassword: 'rabbit2027' }, room.token)).status).toBe(200);
    expect((await tablet.waitFor('kicked')).reason).toContain('教室密碼');
    // 新密碼再進島 → 老師移出班級：平板的連線被踢（純班級角色被刪除）
    const again = (await call('POST', `/api/class/${room.code}/unlock`, { password: 'rabbit2027' })).body.token;
    const second = (await call('POST', `/api/class/members/${kid.account.id}/device`, {}, again)).body;
    const tablet2 = await connect(second.token);
    expect((await call('DELETE', `/api/teacher/rooms/${room.code}/members/${kid.account.id}`, undefined, room.token)).status).toBe(200);
    expect((await tablet2.waitFor('kicked')).reason).toContain('移出');
  });
});

describe('島嶼互訪 I1：選島、換島、好友名單（docs/plans/islands.md）', () => {
  /** 連線並登入，指定要去的島 */
  async function connectTo(token: string, island?: 'class' | 'own') {
    const c = new Client();
    await c.opened;
    c.send({ t: 'hello', token, ...(island ? { island } : {}) });
    await c.waitFor('welcome');
    return c;
  }

  it('hello 帶 island：去自己的島，同學看不到；換島（go）回班級島就看得到', async () => {
    const { a, b } = await setup();
    const ca = await connectTo(a.token);
    const cb = await connectTo(b.token, 'own');
    expect((await cb.waitFor('welcome')).island).toBe('own');
    expect(ca.msgs.some((m) => m.t === 'join')).toBe(false);
    cb.send({ t: 'go', island: 'class' });
    await cb.waitFor('welcome', (m) => m.island === 'class');
    await ca.waitFor('join', (m) => m.member.nickname === '小美');
  });

  it('好友名單：同班同學與兄弟姊妹（同一位家長，不同班也算），離線的也列出；別班的人不在名單上', async () => {
    const mom = await createUser(call, { parent: true, teacher: false });
    const kidOf = (name: string) => addProfile(createEmptySave(), { name, avatar: { animal: 'rabbit', color: '#ffffff', hat: null } }, new Date()).profiles[0];
    const big = (await call('POST', '/api/parent/kids', { profile: kidOf('哥哥') }, mom.token)).body;
    const small = (await call('POST', '/api/parent/kids', { profile: kidOf('妹妹') }, mom.token)).body;
    const room1 = await createRoom(call);
    const room2 = await createRoom(call, '二年二班');
    expect((await call('POST', '/api/join', { code: room1.code, nickname: '哥哥', pin: '1234' }, big.token)).status).toBe(200);
    expect((await call('POST', '/api/join', { code: room2.code, nickname: '妹妹', pin: '1234' }, small.token)).status).toBe(200);
    const mate = await joinRoom(call, room1.code, '同學', '1111');
    await joinRoom(call, room2.code, '妹妹的同學', '2222');

    const cBig = await connectTo(big.token);
    const list = (await cBig.waitFor('friends')).list;
    // 最後是班上的熊熊老師（老師 GM 的 G2；老師沒進島是離線）
    expect(list.map((f) => [f.nickname, f.online]).sort()).toEqual([
      ['同學', false],
      ['妹妹', false],
      ['熊熊老師', false],
    ]);
    // 有共同班級的同學 classmate，只是兄弟姊妹（不同班）的沒有（島嶼互訪 I2：在朋友的島上只能送禮給同班同學）
    expect(list.find((f) => f.nickname === '同學')?.classmate).toBe(true);
    expect(list.find((f) => f.nickname === '妹妹')?.classmate).toBeUndefined();
    // 妹妹上線（在她自己的班級島）：哥哥收到「在班級島」
    const cSmall = await connectTo(small.token);
    await cBig.waitFor('friend', (m) => m.friend.nickname === '妹妹' && m.friend.online && m.friend.island === 'class');
    expect((await cSmall.waitFor('friends')).list.map((f) => f.nickname).sort()).toEqual(['哥哥', '妹妹的同學', '熊熊老師']);
    // 同學上線後去自己的島
    await connectTo(mate.token, 'own');
    await cBig.waitFor('friend', (m) => m.friend.id === mate.account.id && m.friend.island === 'own');
  });
});

describe('家長掃 QR code 讓孩子加入班級時，孩子線上的裝置重新上線', () => {
  it('在自己的島上連線中的家長名下孩子：加入後連線以 4005 關閉（多班級起存檔不變，不送 profile）；重新上線就在班級島、同學在好友名單上', async () => {
    const mom = await createUser(call, { parent: true, teacher: false });
    const local = addProfile(createEmptySave(), { name: '安安', avatar: { animal: 'rabbit', color: '#ffffff', hat: null } }, new Date()).profiles[0];
    const up = (await call('POST', '/api/parent/kids', { profile: local }, mom.token)).body;
    const room = await createRoom(call);
    await joinRoom(call, room.code, '同學', '1111');
    const c = await connect(up.token);
    expect((await c.waitFor('welcome')).island).toBe('own');
    expect((await call('POST', `/api/parent/kids/${up.account.id}/class`, { code: room.code, nickname: '安安' }, mom.token)).status).toBe(200);
    expect(await c.closed).toBe(CLOSE_RECONNECT);
    expect(c.msgs.map((m) => m.t)).not.toContain('kicked');
    const again = new Client();
    await again.opened;
    again.send({ t: 'hello', token: up.token, island: 'class' });
    expect((await again.waitFor('welcome')).island).toBe('class');
    expect((await again.waitFor('friends')).list.map((f) => f.nickname)).toEqual(['同學', '熊熊老師']);
  });
});

describe('熊熊老師進島（老師 GM 的 G2）', () => {
  /** 用某個權杖以老師身分連線（gm 是班級代碼），回傳用戶端 */
  async function hello(token: string, gm: string) {
    const c = new Client();
    await c.opened;
    c.send({ t: 'hello', token, gm });
    return c;
  }

  it('老師用自己的大人權杖＋自己班級的代碼：進那一班的班級島，島上的孩子看到熊熊老師', async () => {
    const { room, a } = await setup();
    const ca = await connect(a.token);
    const t = await hello(room.token, room.code);
    expect(await t.waitFor('welcome')).toMatchObject({ island: 'class', classCode: room.code, caps: ['gm'] });
    expect((await ca.waitFor('join', (m) => m.member.role === 'teacher')).member.nickname).toBe('熊熊老師');
    await ca.waitFor('friend', (m) => m.friend.id === `teacher:${room.code}` && m.friend.online);
    t.ws.close();
    await ca.waitFor('friend', (m) => m.friend.id === `teacher:${room.code}` && !m.friend.online);
  });

  it('別班的老師、家長帳號、孩子的權杖帶 gm、不存在的班級：4003', async () => {
    const { room, a } = await setup();
    const other = await createRoom(call, '二年二班');
    const parent = await createUser(call, { parent: true, teacher: false });
    for (const [token, code] of [
      [other.token, room.code],
      [parent.token, room.code],
      [a.token, room.code],
      [room.token, '999999'],
    ]) {
      const c = await hello(token, code);
      expect(await c.closed).toBe(4003);
    }
  });

  it('大人權杖沒有帶 gm：和以前一樣 4003', async () => {
    const { room } = await setup();
    const c = new Client();
    await c.opened;
    c.send({ t: 'hello', token: room.token });
    expect(await c.closed).toBe(4003);
  });
it('在做什麼（G3）：孩子回報後，老師的成員表看得到活動名稱（同學收不到）', async () => {
    const { room, a, b } = await setup();
    const ca = await connect(a.token);
    const cb = await connect(b.token);
    ca.send({ t: 'where', zone: 'math' });
    ca.send({ t: 'doing', label: '加法練習' });
    const deadline = Date.now() + 3000;
    let where: any = null;
    while (Date.now() < deadline) {
      const list = await call('GET', `/api/teacher/rooms/${room.code}`, undefined, room.token);
      where = list.body.members.find((m: { nickname: string }) => m.nickname === '阿寶')?.where;
      if (where?.doing) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(where).toEqual({ island: 'class', zone: 'math', doing: '加法練習' });
    expect(JSON.stringify(cb.msgs)).not.toContain('加法練習');
  });
});
