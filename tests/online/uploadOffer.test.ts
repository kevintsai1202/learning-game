/**
 * 家長登入後「這台裝置上有○○，是你的孩子嗎？」（L2，存到雲端的決定 A）：
 * 要問哪些角色（還沒存到雲端、雲端也沒有同一個角色、沒被這位家長說過「不是」），
 * 以及「不是」的紀錄（依大人帳號分開記在這台裝置；讀寫不到時當作沒有紀錄）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { addDeclined, profilesToOffer, readDeclined } from '../../src/online/uploadOffer';
import type { KidSummary } from '../../src/online/protocol';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';

/** 這台裝置上的一個角色；cloud 給了就是雲端角色 */
function profile(name: string, cloud = false): Profile {
  const p = addProfile(createEmptySave(), { name, avatar: { animal: 'cat', color: '#ffffff', hat: null } }, new Date()).profiles[0];
  return cloud ? { ...p, cloud: { server: 'https://island.example', accountId: `a_${name}` } } : p;
}

/** 家長名下的一個角色（profileId 是它在裝置上的角色 id） */
const kid = (profileId: string): KidSummary => ({
  id: `a_${profileId}`,
  profileId,
  name: profileId,
  avatar: { animal: 'bear', color: '#ffffff', hat: null },
  room: null,
  rooms: [],
  coins: 0,
  stars: 0,
  lastSeen: '2026-10-06T00:00:00.000Z',
});

/** 測試用的 localStorage（vitest 的 node 環境沒有） */
function fakeStorage(broken = false) {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => {
      if (broken) throw new Error('blocked');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('blocked');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('要問家長的角色', () => {
  it('只有還沒存到雲端、雲端也沒有同一個角色、沒被說過「不是」的', () => {
    const a = profile('小安');
    const b = profile('小明');
    const c = profile('雲端的', true);
    const d = profile('已經上傳過');
    const offer = profilesToOffer([a, b, c, d], [kid(d.id)], [b.id]);
    expect(offer.map((p) => p.name)).toEqual(['小安']);
  });
});

describe('「不是」的紀錄', () => {
  it('依大人帳號分開記：同一位家長不再問，另一位家長照樣問', () => {
    fakeStorage();
    addDeclined('u_mom', ['p1', 'p2']);
    addDeclined('u_mom', ['p2', 'p3']);
    expect(readDeclined('u_mom').sort()).toEqual(['p1', 'p2', 'p3']);
    expect(readDeclined('u_dad')).toEqual([]);
  });

  it('讀寫不到（無痕模式、被封鎖）：當作沒有紀錄，不丟錯誤', () => {
    fakeStorage(true);
    expect(() => addDeclined('u_mom', ['p1'])).not.toThrow();
    expect(readDeclined('u_mom')).toEqual([]);
  });

  it('沒有 localStorage（不在瀏覽器裡）也不丟錯誤', () => {
    expect(readDeclined('u_mom')).toEqual([]);
    expect(() => addDeclined('u_mom', ['p1'])).not.toThrow();
  });
});
