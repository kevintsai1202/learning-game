import { describe, expect, it } from 'vitest';
import { applyServerMessage, wsUrlOf, zoneOfScreen } from '../../src/online/realtimeClient';
import { emptyPresence, onIsland } from '../../src/online/presence';
import type { MemberState } from '../../src/online/realtime';

const member = (id: string, nickname: string, extra: Partial<MemberState> = {}): MemberState => ({
  id,
  nickname,
  avatar: { animal: 'capybara', color: '#8b5a2b', hat: null },
  title: null,
  x: 0,
  z: 13,
  h: Math.PI,
  zone: null,
  ...extra,
});
const self = { id: 'me', nickname: '小安', avatar: { animal: 'bear' as const, color: '#8b5a2b', hat: null } };

describe('伺服器訊息寫進同島狀態', () => {
  it('welcome：放入其他成員、最近的公頻，以及自己（自己不畫在島上，但說話要有氣泡）', () => {
    const s = applyServerMessage(emptyPresence(), { t: 'welcome', self: 'me', room: { chatOpen: true, giftsOpen: true }, members: [member('a', '阿寶')], chat: [{ id: 1, from: 'a', nickname: '阿寶', text: '你好！', at: 1 }] }, self, 100);
    expect(Object.keys(s.members).sort()).toEqual(['a', 'me']);
    expect(s.chat).toHaveLength(1);
    expect(onIsland(s, 'me').map((m) => m.id)).toEqual(['a']);
  });

  it('join、member、leave、moves（自己的位置不覆蓋）', () => {
    let s = applyServerMessage(emptyPresence(), { t: 'welcome', self: 'me', room: { chatOpen: true, giftsOpen: true }, members: [], chat: [] }, self, 1);
    s = applyServerMessage(s, { t: 'join', member: member('a', '阿寶') }, self, 2);
    s = applyServerMessage(s, { t: 'member', member: member('a', '阿寶', { zone: 'math' }) }, self, 3);
    expect(s.members.a.zone).toBe('math');
    s = applyServerMessage(s, { t: 'moves', list: [['a', 1, 2, 0.5], ['me', 9, 9, 0]] }, self, 4);
    expect(s.members.a).toMatchObject({ x: 1, z: 2, heading: 0.5 });
    expect(s.members.me.x).not.toBe(9);
    s = applyServerMessage(s, { t: 'leave', id: 'a' }, self, 5);
    expect(s.members.a).toBeUndefined();
  });

  it('chat：公頻多一則、說話的人頭上有氣泡（包含自己）', () => {
    let s = applyServerMessage(emptyPresence(), { t: 'welcome', self: 'me', room: { chatOpen: true, giftsOpen: true }, members: [], chat: [] }, self, 1);
    s = applyServerMessage(s, { t: 'chat', line: { id: 7, from: 'me', nickname: '小安', text: '一起玩吧！', at: 1000 } }, self, 1000);
    expect(s.chat.at(-1)?.text).toBe('一起玩吧！');
    expect(s.bubbles.me?.text).toBe('一起玩吧！');
  });
});

describe('連線網址與所在建築', () => {
  it('伺服器網址換成 WebSocket 網址', () => {
    expect(wsUrlOf('https://island.example')).toBe('wss://island.example/ws');
    expect(wsUrlOf('http://localhost:8787/')).toBe('ws://localhost:8787/ws');
  });

  it('在建築、答題、結算、百寶屋時算在那棟建築裡；其他畫面算在島上', () => {
    expect(zoneOfScreen('zone', 'math')).toBe('math');
    expect(zoneOfScreen('activity', 'zh')).toBe('zh');
    expect(zoneOfScreen('shop', 'shop')).toBe('shop');
    expect(zoneOfScreen('island', null)).toBeNull();
    expect(zoneOfScreen('badges', 'math')).toBeNull();
  });
});
