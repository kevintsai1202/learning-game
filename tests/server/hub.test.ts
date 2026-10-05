/**
 * 即時連線中樞（server/hub.ts）的單元測試：用假連線收集送出的訊息、假時鐘控制說話頻率，不碰網路。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Hub, type HubConn } from '../../server/hub';
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

/** 讓一位孩子加入房間（via：權杖來源，預設用班級代碼登入） */
function join(accountId: string, nickname: string, room = '123456', patch: Partial<Profile> = {}, via: TokenVia = 'class') {
  const conn = new FakeConn();
  hub.join(conn, { accountId, roomCode: room, nickname, profile: profileOf(nickname, patch), flags: FLAGS, via });
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
