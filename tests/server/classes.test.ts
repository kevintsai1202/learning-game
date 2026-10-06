/**
 * 多班級（docs/plans/multi-class.md）的純函式：好友名單上的名字怎麼決定。
 * 規則：同學用「最早建立的共同班級」裡的暱稱（兩邊看到的是同一個班的暱稱）；只有兄弟姊妹關係（沒有共同班級）時用角色名字（呼叫端處理）。
 */
import { describe, expect, it } from 'vitest';
import { sharedClassNames, type SharedMembership } from '../../server/classes';

/** 一筆「我和某位朋友同在一班」的資料 */
const row = (friendId: string, roomCode: string, createdAt: string, friendNick: string, myNick: string): SharedMembership => ({
  friendId,
  roomCode,
  roomCreatedAt: new Date(createdAt),
  friendNickname: friendNick,
  myNickname: myNick,
});

describe('好友名單上的名字（共同班級的暱稱）', () => {
  it('只有一個共同班級：用那一班的暱稱（朋友的、和朋友看到的我）', () => {
    const names = sharedClassNames([row('f1', '111111', '2026-09-01T00:00:00Z', '小美', '阿寶')]);
    expect(names.get('f1')).toEqual({ nickname: '小美', myName: '阿寶', roomCode: '111111' });
  });

  it('好幾個共同班級：用最早建立的那一班（不管資料的順序），兩邊看到的是同一班的暱稱', () => {
    const names = sharedClassNames([
      row('f1', '222222', '2026-09-10T00:00:00Z', '美美', '寶寶'),
      row('f1', '111111', '2026-09-01T00:00:00Z', '小美', '阿寶'),
      row('f2', '222222', '2026-09-10T00:00:00Z', '小明', '寶寶'),
    ]);
    expect(names.get('f1')).toEqual({ nickname: '小美', myName: '阿寶', roomCode: '111111' });
    expect(names.get('f2')).toEqual({ nickname: '小明', myName: '寶寶', roomCode: '222222' });
  });

  it('兩班同時建立：比班級代碼，小的在前', () => {
    const names = sharedClassNames([row('f1', '333333', '2026-09-01T00:00:00Z', '甲', '乙'), row('f1', '111111', '2026-09-01T00:00:00Z', '丙', '丁')]);
    expect(names.get('f1')?.roomCode).toBe('111111');
  });

  it('沒有共同班級的朋友（只是兄弟姊妹）不在結果裡，由呼叫端用角色名字', () => {
    expect(sharedClassNames([]).size).toBe(0);
  });
});
