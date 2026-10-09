/**
 * 好友名單（島嶼互訪 I1，docs/plans/islands.md）：依伺服器的 friends／friend 訊息更新；
 * 線上的排前面，狀態只寫在哪座島（使用者決定，不顯示建築）。
 */
import { describe, expect, it } from 'vitest';
import { applyFriendMessage, canVisit, friendStatusText, onlineFriendCount, sortedFriends, type FriendsState } from '../../src/online/friends';
import type { FriendState } from '../../src/online/realtime';

const AVATAR = { animal: 'cat' as const, color: '#ffffff', hat: null };
const f = (id: string, nickname: string, online: boolean, island: FriendState['island'] = online ? 'class' : null): FriendState => ({ id, nickname, avatar: AVATAR, online, island });

describe('好友名單的更新', () => {
  it('friends 換成整份名單；friend 更新一位（名單裡沒有就加進去）；其他訊息不變', () => {
    let s: FriendsState = { old: f('old', '舊的', false) };
    s = applyFriendMessage(s, { t: 'friends', list: [f('a', '阿寶', false), f('b', '小美', true)] });
    expect(Object.keys(s).sort()).toEqual(['a', 'b']);
    s = applyFriendMessage(s, { t: 'friend', friend: f('a', '阿寶', true, 'own') });
    expect(s.a).toMatchObject({ online: true, island: 'own' });
    s = applyFriendMessage(s, { t: 'friend', friend: f('c', '新同學', true) });
    expect(s.c.nickname).toBe('新同學');
    expect(applyFriendMessage(s, { t: 'gift' })).toBe(s);
  });
});

describe('好友名單的顯示', () => {
  it('線上的排前面，同一組依暱稱排', () => {
    const s: FriendsState = { a: f('a', '阿寶', false), b: f('b', '小美', true), c: f('c', '大雄', true), d: f('d', '王小明', false) };
    expect(sortedFriends(s).map((x) => x.nickname)).toEqual([...['大雄', '小美'].sort((x: string, y: string) => x.localeCompare(y, 'zh-Hant')), ...['王小明', '阿寶'].sort((x: string, y: string) => x.localeCompare(y, 'zh-Hant'))]);
    expect(onlineFriendCount(s)).toBe(2);
  });

  it('狀態文字只寫在哪座島', () => {
    expect(friendStatusText(f('a', '阿寶', true, 'class'))).toBe('在班級島');
    expect(friendStatusText(f('a', '阿寶', true, 'own'))).toBe('在自己的島');
    expect(friendStatusText(f('a', '阿寶', false))).toBe('離線');
  });
});

describe('去朋友的島（島嶼互訪 I2）', () => {
  const base: FriendState = { id: 'b', nickname: '小美', avatar: { animal: 'cat', color: '#ffffff', hat: null }, online: true, island: 'own' };

  it('狀態文字：開放中、在別人的島（認識島主寫名字，不認識寫「朋友」）', () => {
    expect(friendStatusText({ ...base, open: true })).toBe('在自己的島（開放中）');
    expect(friendStatusText({ ...base, host: '阿寶' })).toBe('在阿寶的島');
    expect(friendStatusText({ ...base, host: '' })).toBe('在朋友的島');
  });

  it('能去玩：線上、在自己的島、開放中；熊熊老師、離線、在別人的島上、沒開放都不行', () => {
    expect(canVisit({ ...base, open: true })).toBe(true);
    expect(canVisit(base)).toBe(false);
    expect(canVisit({ ...base, open: true, online: false })).toBe(false);
    expect(canVisit({ ...base, open: true, host: '阿寶' })).toBe(false);
    expect(canVisit({ ...base, open: true, island: 'class' })).toBe(false);
    expect(canVisit({ ...base, id: 'teacher:123456', open: true })).toBe(false);
  });
});
