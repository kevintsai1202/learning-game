import { describe, expect, it } from 'vitest';
import {
  BUBBLE_MS,
  CHAT_KEEP,
  activeBubble,
  addChat,
  emptyPresence,
  expireBubbles,
  moveMember,
  onIsland,
  receiveChat,
  removeMember,
  setZone,
  upsertMember,
  type PresenceState,
  type RemoteMember,
} from '../../src/online/presence';

const member = (id: string, nickname: string, extra: Partial<RemoteMember> = {}): RemoteMember => ({
  id,
  nickname,
  avatar: { animal: 'capybara', color: '#8b5a2b', hat: null },
  x: 0,
  z: 0,
  heading: 0,
  zone: null,
  ...extra,
});

describe('同島成員', () => {
  it('加入、更新、離開', () => {
    let s = upsertMember(emptyPresence(), member('a', '阿寶'));
    s = upsertMember(s, member('b', '小美'));
    expect(Object.keys(s.members)).toEqual(['a', 'b']);
    s = upsertMember(s, member('a', '阿寶', { avatar: { animal: 'panda', color: '#5b5b6b', hat: null } }));
    expect(s.members.a.avatar.animal).toBe('panda');
    s = removeMember(s, 'a');
    expect(Object.keys(s.members)).toEqual(['b']);
  });

  it('移動只改位置與朝向，外觀物件沿用同一個（畫面不必重畫角色）', () => {
    const s = upsertMember(emptyPresence(), member('a', '阿寶'));
    const moved = moveMember(s, 'a', 3, -2, 1.5);
    expect(moved.members.a).toMatchObject({ x: 3, z: -2, heading: 1.5 });
    expect(moved.members.a.avatar).toBe(s.members.a.avatar);
    // 不認識的成員不做事
    expect(moveMember(s, 'zzz', 1, 1, 0)).toBe(s);
  });

  it('進建築的成員不畫在島上；出來後又出現', () => {
    let s = upsertMember(emptyPresence(), member('a', '阿寶'));
    s = upsertMember(s, member('b', '小美'));
    s = setZone(s, 'b', 'math');
    expect(onIsland(s).map((m) => m.id)).toEqual(['a']);
    s = setZone(s, 'b', null);
    expect(onIsland(s).map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('公頻與對話氣泡', () => {
  const base = upsertMember(upsertMember(emptyPresence(), member('a', '阿寶')), member('b', '小美'));

  it('說話：公頻多一則（帶暱稱），說話的人頭上出現氣泡', () => {
    const s = addChat(base, 'a', '一起玩吧！', 1000);
    expect(s.chat).toEqual([{ id: 1, from: 'a', nickname: '阿寶', text: '一起玩吧！', at: 1000 }]);
    expect(activeBubble(s, 'a', 1000)).toBe('一起玩吧！');
    expect(activeBubble(s, 'b', 1000)).toBeNull();
  });

  it(`氣泡 ${BUBBLE_MS / 1000} 秒後消失；再說一句就換成新的`, () => {
    let s = addChat(base, 'a', '你好！', 1000);
    expect(activeBubble(s, 'a', 1000 + BUBBLE_MS - 1)).toBe('你好！');
    expect(activeBubble(s, 'a', 1000 + BUBBLE_MS)).toBeNull();
    s = addChat(s, 'a', '掰掰！', 2000);
    expect(activeBubble(s, 'a', 2000)).toBe('掰掰！');
    // 清掉過期的氣泡（畫面定時呼叫）
    const cleared = expireBubbles(s, 2000 + BUBBLE_MS);
    expect(cleared.bubbles).toEqual({});
    expect(expireBubbles(s, 2001)).toBe(s);
  });

  it(`公頻只保留最近 ${CHAT_KEEP} 則`, () => {
    let s = base;
    for (let i = 0; i < CHAT_KEEP + 5; i++) s = addChat(s, 'a', `第${i}句`, i);
    expect(s.chat).toHaveLength(CHAT_KEEP);
    expect(s.chat[0].text).toBe('第5句');
    expect(s.chat[CHAT_KEEP - 1].text).toBe(`第${CHAT_KEEP + 4}句`);
  });

  it('不認識的成員說話不收；成員離開時氣泡一起清掉', () => {
    expect(addChat(base, 'zzz', '你好！', 1)).toBe(base);
    const s = removeMember(addChat(base, 'a', '你好！', 1), 'a');
    expect(s.bubbles).toEqual({});
    // 公頻紀錄保留（離開前說的話還看得到）
    expect(s.chat).toHaveLength(1);
  });
});

describe('真的連線：自己與伺服器的公頻', () => {
  it('自己在成員裡但不列入島上的人；伺服器的公頻沿用它的 id 並讓說話的人有氣泡', () => {
    let s: PresenceState = { ...emptyPresence(), selfId: 'me' };
    s = upsertMember(s, member('me', '小安'));
    s = upsertMember(s, member('a', '阿寶'));
    expect(onIsland(s).map((m) => m.id)).toEqual(['a']);
    s = receiveChat(s, { id: 42, from: 'me', nickname: '小安', text: '你好！', at: 5 }, 1000);
    expect(s.chat).toEqual([{ id: 42, from: 'me', nickname: '小安', text: '你好！', at: 5 }]);
    expect(activeBubble(s, 'me', 1000)).toBe('你好！');
    // 已經離開的人說的話照樣進公頻，只是沒有氣泡
    s = receiveChat(s, { id: 43, from: 'gone', nickname: '走了', text: '掰掰！', at: 6 }, 1001);
    expect(s.chat).toHaveLength(2);
    expect(s.bubbles.gone).toBeUndefined();
  });
});
