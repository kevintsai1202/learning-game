/**
 * 即時連線中樞（server/hub.ts）的單元測試：用假連線收集送出的訊息、假時鐘控制說話頻率，不碰網路。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Hub, type HubConn } from '../../server/hub';
import { CLOSE_RECONNECT } from '../../src/online/realtime';
import type { TokenVia } from '../../server/tokens';
import type { ServerMessage } from '../../src/online/realtime';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';
import { SPAWN, WALK_RADIUS } from '../../src/world/layout';

/** 假連線：記下收到的訊息與是否被關閉 */
class FakeConn implements HubConn {
  sent: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  send(msg: ServerMessage) {
    this.sent.push(msg);
  }
  close(code: number, reason: string) {
    this.closed = { code, reason };
  }
  /** 某種訊息 */
  of<T extends ServerMessage['t']>(t: T) {
    return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
}

let clock = 0;
let hub: Hub;
beforeEach(() => {
  clock = 1_000_000;
  hub = new Hub({ now: () => clock });
});

/** 一位小朋友的存檔 */
function profileOf(name: string, patch: Partial<Profile> = {}): Profile {
  return { ...addProfile(createEmptySave(), { name, avatar: { animal: 'capybara', color: '#8b5a2b', hat: null } }, new Date()).profiles[0], ...patch };
}

const FLAGS = { chatOpen: true, giftsOpen: true };

/** 讓一位孩子加入房間（via：權杖來源，預設用班級代碼登入那一班） */
function join(accountId: string, nickname: string, room = '123456', patch: Partial<Profile> = {}, via: TokenVia = 'class') {
  const conn = new FakeConn();
  hub.join(conn, {
    accountId,
    name: nickname,
    classes: [{ code: room, nickname, flags: FLAGS }],
    profile: profileOf(nickname, patch),
    via,
    tokenRoom: via === 'class' ? room : null,
  });
  return conn;
}

describe('加入與離開', () => {
  it('後來的人收到 welcome（列出已在線上的人），先到的人收到 join', () => {
    const a = join('a', '阿寶');
    expect(a.of('welcome')[0]).toMatchObject({ self: 'a', members: [], room: FLAGS });
    const b = join('b', '小美');
    expect(b.of('welcome')[0].members.map((m) => m.nickname)).toEqual(['阿寶']);
    expect(a.of('join').map((m) => m.member.nickname)).toEqual(['小美']);
    expect(hub.isOnline('a')).toBe(true);
  });

  it('新加入的人站在出生點附近', () => {
    join('a', '阿寶');
    const b = join('b', '小美');
    const me = b.of('welcome')[0];
    expect(me.members[0]).toMatchObject({ x: SPAWN.x, z: SPAWN.z, zone: null });
  });

  it('離開時其他人收到 leave；不同房間的人互相看不到', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    const other = join('c', '別班', '654321');
    hub.leave(b);
    expect(a.of('leave')).toEqual([{ t: 'leave', id: 'b' }]);
    expect(other.of('join')).toEqual([]);
    expect(hub.isOnline('b')).toBe(false);
  });

  it('同一個帳號在第二台裝置登入：舊連線被踢下線，新連線沿用舊位置；其他人收到 member 而不是 leave／join', () => {
    const a1 = join('a', '阿寶');
    const b = join('b', '小美');
    hub.move(a1, 3, 4, 1.2);
    hub.flush();
    const a2 = join('a', '阿寶');
    expect(a1.of('kicked')).toHaveLength(1);
    expect(a1.closed).not.toBeNull();
    expect(b.of('leave')).toEqual([]);
    expect(b.of('member').at(-1)?.member).toMatchObject({ id: 'a', x: 3, z: 4 });
    // 舊連線後來才斷線，不能把新連線一起移除
    hub.leave(a1);
    expect(hub.isOnline('a')).toBe(true);
    expect(b.of('leave')).toEqual([]);
    expect(a2.of('welcome')[0].members.map((m) => m.id)).toEqual(['b']);
  });
});

describe('位置', () => {
  it('每次打包只送有移動的人；沒人移動就不送', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    join('c', '皮皮');
    hub.move(a, 1, 2, 0.5);
    hub.flush();
    expect(b.of('moves')).toEqual([{ t: 'moves', list: [['a', 1, 2, 0.5]] }]);
    hub.flush();
    expect(b.of('moves')).toHaveLength(1);
  });

  it('位置限制在島的範圍內（只限制半徑，不做建築碰撞）', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    hub.move(a, 100, 0, 0);
    hub.flush();
    const [, x, z] = b.of('moves')[0].list[0];
    expect(Math.hypot(x, z)).toBeCloseTo(WALK_RADIUS);
  });

  it('進建築與回島上：其他人收到 member（所在建築）', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    hub.where(a, 'math');
    expect(b.of('member').at(-1)?.member.zone).toBe('math');
    hub.where(a, null);
    expect(b.of('member').at(-1)?.member.zone).toBeNull();
  });
});

describe('公頻', () => {
  it('說短句：房間每個人（含自己）收到 chat，文字由伺服器換成短句內容', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    hub.say(a, 'play');
    expect(b.of('chat')[0].line).toMatchObject({ from: 'a', nickname: '阿寶', text: '一起玩吧！' });
    expect(a.of('chat')).toHaveLength(1);
  });

  it('不在短句清單的 id 不收（不能自由打字）', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    hub.say(a, '我家電話是…');
    expect(b.of('chat')).toEqual([]);
    expect(a.of('error')).toHaveLength(1);
  });

  it('說話頻率：連發 3 則之後要等；每 2.5 秒恢復一則', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    for (let i = 0; i < 4; i++) hub.say(a, 'hi');
    expect(b.of('chat')).toHaveLength(3);
    clock += 2600;
    hub.say(a, 'hi');
    expect(b.of('chat')).toHaveLength(4);
  });

  it('老師關閉聊天時不收；剛上線的人在 welcome 裡看到最近的對話', () => {
    const a = join('a', '阿寶');
    hub.say(a, 'hi');
    const b = join('b', '小美');
    expect(b.of('welcome')[0].chat.map((l) => l.text)).toEqual(['你好！']);
    hub.roomSettings('123456', { chatOpen: false, giftsOpen: true });
    expect(b.of('room').at(-1)?.room.chatOpen).toBe(false);
    hub.say(a, 'bye');
    expect(b.of('chat')).toEqual([]);
  });
});

describe('存檔改變與老師管理', () => {
  it('班級內容更新（老師改了教材版本）：同班的人收到 content，別班的人不會（G0）', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    const other = join('c', '別班', '654321');
    hub.roomContent('123456');
    expect(a.of('content')).toEqual([{ t: 'content' }]);
    expect(b.of('content')).toEqual([{ t: 'content' }]);
    expect(other.of('content')).toEqual([]);
    // 沒有人在線上的班級：什麼都不做
    expect(() => hub.roomContent('999999')).not.toThrow();
  });

  it('其他人看到的外觀經過擁有檢查（沒擁有的道具不顯示），稱號也一起帶上', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美', '123456', { avatar: { animal: 'cat', color: '#ffffff', hat: 'hat.crown' } });
    expect(a.of('join')[0].member.avatar.hat).toBeNull();
    const owned = profileOf('小美', {
      inventory: ['hat.crown'],
      avatar: { animal: 'cat', color: '#ffffff', hat: 'hat.crown' },
      badges: { 'first-adventure': '2026-10-03' },
      title: 'first-adventure',
    });
    hub.profileChanged('b', 7, owned);
    expect(a.of('member').at(-1)?.member).toMatchObject({ id: 'b', title: '冒險新手', avatar: { hat: 'hat.crown' } });
    expect(b.of('profile')).toEqual([{ t: 'profile', rev: 7 }]);
  });

  it('老師移除成員或重設密碼：那位孩子被踢下線，其他人收到 leave', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    hub.kick('b', '老師把你移出房間了');
    expect(b.of('kicked')[0].reason).toBe('老師把你移出房間了');
    expect(b.closed).not.toBeNull();
    expect(a.of('leave')).toEqual([{ t: 'leave', id: 'b' }]);
    expect(hub.isOnline('b')).toBe(false);
  });

  it('只踢某種來源的連線（重設密碼只撤銷 class 權杖）：家長裝置（parent）的連線留著', () => {
    const home = join('a', '阿寶', '123456', {}, 'parent');
    const school = join('b', '小美', '123456', {}, 'class');
    hub.kick('a', '老師重設了你的密碼，請用新密碼重新登入', 'class');
    hub.kick('b', '老師重設了你的密碼，請用新密碼重新登入', 'class');
    expect(home.of('kicked')).toHaveLength(0);
    expect(home.closed).toBeNull();
    expect(hub.isOnline('a')).toBe(true);
    expect(school.of('kicked')).toHaveLength(1);
    expect(hub.isOnline('b')).toBe(false);
  });
});

describe('禮物通知（P3）', () => {
  it('notify 只送給那位孩子（在線上時）；不在線上不會出錯', () => {
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    hub.notify('b', { t: 'gift' });
    expect(b.of('gift')).toEqual([{ t: 'gift' }]);
    expect(a.of('gift')).toEqual([]);
    expect(() => hub.notify('nobody', { t: 'gift' })).not.toThrow();
  });
});

describe('島嶼互訪 I1：每個人一座島、一直連線、好友的在線狀態（docs/plans/islands.md）', () => {
  /** 讓一位孩子上線：room 是班級（null 是沒有班級）、island 是要去的島、friends 是朋友的帳號 id */
  function online(accountId: string, nickname: string, opts: { room?: string | null; island?: 'class' | 'own'; friends?: string[]; via?: TokenVia } = {}) {
    const conn = new FakeConn();
    const room = opts.room === undefined ? '123456' : opts.room;
    const via = opts.via ?? 'class';
    hub.join(conn, {
      accountId,
      name: nickname,
      classes: room ? [{ code: room, nickname, flags: FLAGS }] : [],
      profile: profileOf(nickname),
      via,
      tokenRoom: via === 'class' ? room : null,
      island: opts.island,
      friends: (opts.friends ?? []).map((id) => ({ id, nickname: `朋友${id}`, avatar: { animal: 'cat', color: '#ffffff', hat: null } })),
    });
    return conn;
  }

  it('沒給島：有班級進班級島（舊版網頁照舊）；在自己的島的人和班級島互相看不到', () => {
    const a = online('a', '阿寶');
    const b = online('b', '小美', { island: 'own' });
    expect(a.of('welcome')[0]).toMatchObject({ island: 'class', members: [] });
    expect(b.of('welcome')[0]).toMatchObject({ island: 'own', members: [] });
    expect(a.of('join')).toEqual([]);
    expect(hub.isOnline('b')).toBe(true);
  });

  it('沒有班級的孩子（家長名下）：要去班級島也進自己的島', () => {
    const c = online('c', '小華', { room: null, island: 'class' });
    expect(c.of('welcome')[0].island).toBe('own');
    expect(hub.whereOf('c')).toEqual({ island: 'own', zone: null });
  });

  it('換島（go）：離開原本的島（大家收到 leave）、在新的島收到 welcome、回到出生點', () => {
    const a = online('a', '阿寶');
    const b = online('b', '小美');
    hub.move(b, 3, 4, 0);
    hub.goTo(b, 'own');
    expect(a.of('leave')).toEqual([{ t: 'leave', id: 'b' }]);
    expect(b.of('welcome').at(-1)).toMatchObject({ island: 'own', members: [] });
    hub.goTo(b, 'class');
    expect(b.of('welcome').at(-1)?.members.map((m) => m.id)).toEqual(['a']);
    expect(a.of('join').at(-1)?.member).toMatchObject({ id: 'b', x: SPAWN.x, z: SPAWN.z, zone: null });
  });

  it('好友名單：上線時收到全部朋友（離線的也有）；朋友上線、換島、下線時收到 friend（只有在哪座島，不含建築）', () => {
    const a = online('a', '阿寶', { friends: ['b', 'c'] });
    expect(a.of('friends')[0].list).toEqual([
      { id: 'b', nickname: '朋友b', avatar: { animal: 'cat', color: '#ffffff', hat: null }, online: false, island: null },
      { id: 'c', nickname: '朋友c', avatar: { animal: 'cat', color: '#ffffff', hat: null }, online: false, island: null },
    ]);
    const b = online('b', '小美', { friends: ['a'] });
    expect(b.of('friends')[0].list).toEqual([expect.objectContaining({ id: 'a', online: true, island: 'class' })]);
    // 名字照我名單上記的（共同班級的暱稱；多班級起不換成他現在所在那一班的暱稱）
    expect(a.of('friend').at(-1)?.friend).toMatchObject({ id: 'b', nickname: '朋友b', online: true, island: 'class' });
    hub.where(b, 'math');
    expect(JSON.stringify(a.of('friend'))).not.toContain('math');
    hub.goTo(b, 'own');
    expect(a.of('friend').at(-1)?.friend).toMatchObject({ id: 'b', online: true, island: 'own' });
    hub.leave(b);
    expect(a.of('friend').at(-1)?.friend).toMatchObject({ id: 'b', online: false, island: null });
  });

  it('朋友關係是雙向的：後上線的人名單裡有我，我的名單也會多出他（例如新加入的同學）', () => {
    const a = online('a', '阿寶');
    online('d', '新同學', { friends: ['a'] });
    expect(a.of('friend').at(-1)?.friend).toMatchObject({ id: 'd', nickname: '新同學', online: true });
    hub.kick('d', '老師把你移出班級了');
    expect(a.of('friend').at(-1)?.friend).toMatchObject({ id: 'd', online: false });
  });

  it('不是朋友的人：上線、換島都不會通知', () => {
    const a = online('a', '阿寶', { friends: ['b'] });
    online('x', '別人', { room: '654321' });
    expect(a.of('friend')).toEqual([]);
  });

  it('全班的通知照帳號送：在自己島上的同學也收到 content；老師改開關時更新，回班級島時拿到最新的開關', () => {
    const a = online('a', '阿寶');
    const b = online('b', '小美', { island: 'own' });
    const other = online('x', '別班', { room: '654321', island: 'own' });
    hub.roomContent('123456');
    expect(a.of('content')).toHaveLength(1);
    expect(b.of('content')).toHaveLength(1);
    expect(other.of('content')).toHaveLength(0);
    hub.roomSettings('123456', { chatOpen: false, giftsOpen: true });
    hub.goTo(b, 'class');
    expect(b.of('welcome').at(-1)?.room).toEqual({ chatOpen: false, giftsOpen: true });
  });

  it('同一個帳號在另一台裝置上線、去了不同的島：舊連線被踢，新連線從出生點開始；朋友收到新的島', () => {
    const a = online('a', '阿寶', { friends: ['b'] });
    const b1 = online('b', '小美', { friends: ['a'] });
    hub.move(b1, 3, 4, 0);
    const b2 = online('b', '小美', { friends: ['a'], island: 'own' });
    expect(b1.of('kicked')).toHaveLength(1);
    expect(b2.of('welcome')[0]).toMatchObject({ island: 'own' });
    expect(a.of('leave')).toEqual([{ t: 'leave', id: 'b' }]);
    expect(a.of('friend').at(-1)?.friend).toMatchObject({ id: 'b', online: true, island: 'own' });
    // 舊連線關閉時不影響新連線
    hub.leave(b1);
    expect(hub.isOnline('b')).toBe(true);
  });

  it('在哪裡（老師的成員表用）：島＋建築；離線是 null', () => {
    const a = online('a', '阿寶');
    hub.where(a, 'math');
    expect(hub.whereOf('a')).toEqual({ island: 'class', zone: 'math' });
    expect(hub.whereOf('nobody')).toBeNull();
  });

  it('換外觀：朋友名單上的外觀跟著更新', () => {
    const a = online('a', '阿寶', { friends: ['b'] });
    online('b', '小美', { friends: ['a'] });
    hub.profileChanged('b', 3, profileOf('小美', { avatar: { animal: 'panda', color: '#000000', hat: null } }));
    expect(a.of('friend').at(-1)?.friend).toMatchObject({ id: 'b', avatar: { animal: 'panda' } });
  });
});

describe('加入班級後重新上線（掃 QR code 加入，docs/plans/class-join.md）', () => {
  it('reconnect：那個帳號的連線以 4005 關閉、離開所在的島；不在線上不會出錯', () => {
    const conn = new FakeConn();
    hub.join(conn, { accountId: 'k', name: '安安', classes: [], profile: profileOf('安安'), via: 'parent' });
    hub.reconnect('k');
    expect(conn.closed?.code).toBe(CLOSE_RECONNECT);
    expect(hub.isOnline('k')).toBe(false);
    expect(conn.of('kicked')).toEqual([]);
    expect(() => hub.reconnect('nobody')).not.toThrow();
  });
});

describe('多班級：一個孩子在學校的班級與安親班（docs/plans/multi-class.md）', () => {
  const SCHOOL = '111111';
  const AFTER = '222222';
  const CLOSED = { chatOpen: false, giftsOpen: false };

  /** 安安：學校叫小安、安親班叫安安（學校先加入，是第一個班級）；via 預設家長裝置 */
  function an(opts: { island?: 'class' | 'own'; room?: string; via?: TokenVia; tokenRoom?: string | null; afterFlags?: typeof FLAGS } = {}) {
    const conn = new FakeConn();
    hub.join(conn, {
      accountId: 'an',
      name: '安安',
      classes: [
        { code: SCHOOL, nickname: '小安', flags: FLAGS },
        { code: AFTER, nickname: '安安', flags: opts.afterFlags ?? FLAGS },
      ],
      profile: profileOf('安安'),
      via: opts.via ?? 'parent',
      tokenRoom: opts.tokenRoom ?? null,
      island: opts.island,
      room: opts.room,
    });
    return conn;
  }

  it('沒說哪一班：進第一個班級（最早加入的）的班級島；welcome 帶回是哪一班；說了就進那一班', () => {
    const mei = join('mei', '小美', SCHOOL);
    const bo = join('bo', '阿寶', AFTER);
    const a = an();
    expect(a.of('welcome')[0]).toMatchObject({ island: 'class', classCode: SCHOOL });
    expect(mei.of('join').map((m) => m.member.nickname)).toEqual(['小安']);
    expect(bo.of('join')).toEqual([]);
    hub.leave(a);
    const b = an({ room: AFTER });
    expect(b.of('welcome').at(-1)).toMatchObject({ island: 'class', classCode: AFTER });
    // 在安親班的班級島上，大家看到的是安親班的暱稱
    expect(bo.of('join').map((m) => m.member.nickname)).toEqual(['安安']);
  });

  it('換到另一班的班級島（不斷線）：學校的同學看到離開，安親班的同學看到用安親班暱稱進來；不是成員的班級進第一個班級', () => {
    const mei = join('mei', '小美', SCHOOL);
    const bo = join('bo', '阿寶', AFTER);
    const a = an();
    hub.goTo(a, 'class', AFTER);
    expect(mei.of('leave').map((m) => m.id)).toEqual(['an']);
    expect(bo.of('join').map((m) => m.member.nickname)).toEqual(['安安']);
    expect(a.of('welcome').at(-1)).toMatchObject({ island: 'class', classCode: AFTER, members: [expect.objectContaining({ nickname: '阿寶' })] });
    hub.goTo(a, 'class', '999999');
    expect(a.of('welcome').at(-1)).toMatchObject({ classCode: SCHOOL });
    hub.goTo(a, 'own');
    expect(a.of('welcome').at(-1)).toMatchObject({ island: 'own', classCode: null });
  });

  it('老師改安親班的開關：在學校班級島上的安安不受影響，換到安親班時拿到新的開關；班級內容更新兩班都收得到', () => {
    const a = an();
    hub.roomSettings(AFTER, CLOSED);
    expect(a.of('room')).toEqual([]);
    hub.goTo(a, 'class', AFTER);
    expect(a.of('welcome').at(-1)?.room).toEqual(CLOSED);
    hub.goTo(a, 'class', SCHOOL);
    expect(a.of('welcome').at(-1)?.room).toEqual(FLAGS);
    hub.roomContent(AFTER);
    hub.roomContent(SCHOOL);
    expect(a.of('content')).toHaveLength(2);
  });

  it('老師看到的位置：在自己這班的班級島是 class、在別班的是 otherClass、在自己的島是 own', () => {
    const a = an();
    hub.where(a, 'math');
    expect(hub.whereOf('an', SCHOOL)).toEqual({ island: 'class', zone: 'math' });
    expect(hub.whereOf('an', AFTER)).toEqual({ island: 'otherClass', zone: 'math' });
    hub.goTo(a, 'own');
    expect(hub.whereOf('an', AFTER)).toEqual({ island: 'own', zone: null });
  });

  it('重設某一班的密碼：只踢用那一班代碼登入的連線', () => {
    const a = an({ via: 'class', tokenRoom: AFTER });
    hub.kick('an', '老師重設了你的密碼', 'class', SCHOOL);
    expect(a.closed).toBeNull();
    hub.kick('an', '老師重設了你的密碼', 'class', AFTER);
    expect(a.of('kicked')).toHaveLength(1);
    expect(hub.isOnline('an')).toBe(false);
  });

  it('離開某一班：用那一班代碼登入的連線踢下線；家長裝置收到提示後以 4005 重新上線（不封鎖）', () => {
    const tablet = an({ via: 'class', tokenRoom: AFTER });
    hub.leftClass('an', AFTER, '老師把你移出班級了，進度都還在');
    expect(tablet.of('kicked')).toHaveLength(1);
    const device = an();
    hub.leftClass('an', AFTER, '老師把你移出班級了，進度都還在');
    expect(device.of('kicked')).toEqual([]);
    expect(device.of('notice').map((m) => m.message)).toEqual(['老師把你移出班級了，進度都還在']);
    expect(device.closed?.code).toBe(CLOSE_RECONNECT);
    expect(hub.isOnline('an')).toBe(false);
    expect(() => hub.leftClass('nobody', AFTER, '')).not.toThrow();
  });

  it('好友名單的名字照各自看到的：小美的名單上安安叫小安（共同班級的暱稱），不是安安現在所在那一班的暱稱', () => {
    const conn = new FakeConn();
    hub.join(conn, {
      accountId: 'mei',
      name: '小美',
      classes: [{ code: SCHOOL, nickname: '小美', flags: FLAGS }],
      profile: profileOf('小美'),
      via: 'class',
      tokenRoom: SCHOOL,
      friends: [{ id: 'an', nickname: '小安', avatar: { animal: 'cat', color: '#ffffff', hat: null } }],
    });
    const a = new FakeConn();
    hub.join(a, {
      accountId: 'an',
      name: '安安',
      classes: [
        { code: SCHOOL, nickname: '小安', flags: FLAGS },
        { code: AFTER, nickname: '安安', flags: FLAGS },
      ],
      profile: profileOf('安安'),
      via: 'parent',
      room: AFTER,
      friends: [{ id: 'mei', nickname: '小美', avatar: { animal: 'cat', color: '#ffffff', hat: null }, myName: '小安' }],
    });
    // 安安在安親班的班級島，小美收到的上線通知照樣寫小安
    expect(conn.of('friend').at(-1)?.friend).toMatchObject({ id: 'an', nickname: '小安', online: true, island: 'class' });
    hub.goTo(a, 'own');
    expect(conn.of('friend').at(-1)?.friend).toMatchObject({ id: 'an', nickname: '小安', island: 'own' });
  });

  it('還不在對方名單上的朋友上線（例如剛加入同一班）：用 myName 加進對方的名單', () => {
    const conn = new FakeConn();
    hub.join(conn, { accountId: 'mei', name: '小美', classes: [{ code: SCHOOL, nickname: '小美', flags: FLAGS }], profile: profileOf('小美'), via: 'class', tokenRoom: SCHOOL });
    const a = new FakeConn();
    hub.join(a, {
      accountId: 'an',
      name: '安安',
      classes: [{ code: SCHOOL, nickname: '小安', flags: FLAGS }],
      profile: profileOf('安安'),
      via: 'parent',
      friends: [{ id: 'mei', nickname: '小美', avatar: { animal: 'cat', color: '#ffffff', hat: null }, myName: '小安' }],
    });
    expect(conn.of('friend').at(-1)?.friend).toMatchObject({ id: 'an', nickname: '小安', online: true });
  });
});
