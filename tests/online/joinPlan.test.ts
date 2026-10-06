/**
 * 掃 QR code 加入班級的面板怎麼做（L2，docs/plans/login-ux-review.md 的「L2 家長自動化：實作細節」）：
 * 沒有角色 → 新建表單；只有一個家長名下、可以用的角色 → 自動加入並進島；其他 → 卡片。
 * 這台裝置上還沒存到雲端的角色不自動（共用裝置上可能是別人家的孩子，和「存到雲端」的決定 A 同一個理由）。
 */
import { describe, expect, it } from 'vitest';
import { joinPlan } from '../../src/online/joinPlan';
import type { KidSummary } from '../../src/online/protocol';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';

const CODE = '111111';

/** 家長名下的一個角色；rooms 是所在班級的代碼 */
function kid(id: string, rooms: string[] = []): KidSummary {
  return {
    id,
    profileId: `p_${id}`,
    name: id,
    avatar: { animal: 'bear', color: '#ffffff', hat: null },
    room: rooms.length ? { code: rooms[0], name: rooms[0], curriculum: null } : null,
    rooms: rooms.map((code) => ({ code, name: code, curriculum: null, nickname: id })),
    coins: 0,
    stars: 0,
    lastSeen: '2026-10-06T00:00:00.000Z',
  };
}

/** 這台裝置上的一個本機角色 */
function local(name: string, id?: string): Profile {
  const p = addProfile(createEmptySave(), { name, avatar: { animal: 'cat', color: '#ffffff', hat: null } }, new Date()).profiles[0];
  return id ? { ...p, id } : p;
}

const plan = (opts: { kids?: KidSummary[]; locals?: Profile[]; joinOpen?: boolean; preferredKidId?: string }) =>
  joinPlan({ code: CODE, joinOpen: opts.joinOpen ?? true, kids: opts.kids ?? [], localProfiles: opts.locals ?? [], preferredKidId: opts.preferredKidId });

describe('加入面板怎麼做', () => {
  it('一個角色都沒有：新建表單', () => {
    expect(plan({})).toEqual({ kind: 'create' });
  });

  it('只有一個家長名下的角色、可以加入：自動', () => {
    const r = plan({ kids: [kid('哥哥')] });
    expect(r.kind).toBe('auto');
    expect(r.kind === 'auto' && r.candidate.kid.id).toBe('哥哥');
  });

  it('只有一個角色、已經在這一班：自動（直接進島），老師沒開放加入也一樣', () => {
    const r = plan({ kids: [kid('哥哥', [CODE])], joinOpen: false });
    expect(r).toMatchObject({ kind: 'auto', candidate: { member: true, blocked: null } });
  });

  it('只有一個角色、老師沒開放加入：卡片（標「沒有開放加入」），不自動', () => {
    expect(plan({ kids: [kid('哥哥')], joinOpen: false })).toMatchObject({ kind: 'pick', candidates: [{ kind: 'cloud', blocked: 'closed' }] });
  });

  it('只有一個角色、已經有 5 個班級：卡片（標「已經有 5 個班級」）', () => {
    expect(plan({ kids: [kid('哥哥', ['1', '2', '3', '4', '5'])] })).toMatchObject({ kind: 'pick', candidates: [{ blocked: 'full' }] });
  });

  it('唯一的候選是這台裝置上還沒存到雲端的角色：不自動，顯示一張卡片', () => {
    expect(plan({ locals: [local('小安')] })).toMatchObject({ kind: 'pick', candidates: [{ kind: 'local', blocked: null }] });
  });

  it('雲端已經有同一個角色（同一個角色 id）的本機角色不算候選', () => {
    const k = kid('哥哥');
    const r = plan({ kids: [k], locals: [local('哥哥', k.profileId)] });
    expect(r.kind).toBe('auto');
  });

  it('兩個角色：卡片（家長名下的在前、這台裝置上的在後）', () => {
    const r = plan({ kids: [kid('哥哥'), kid('妹妹', [CODE])], locals: [local('小安')] });
    expect(r.kind).toBe('pick');
    expect(r.kind === 'pick' && r.candidates.map((c) => (c.kind === 'cloud' ? `${c.kid.id}:${c.member}` : `本機:${c.profile.name}`))).toEqual(['哥哥:false', '妹妹:true', '本機:小安']);
  });

  it('從家長頁帶著某個孩子進來：那個孩子自動；他不能用（已經有 5 個班級）時改成卡片', () => {
    const r = plan({ kids: [kid('哥哥'), kid('妹妹')], preferredKidId: '妹妹' });
    expect(r.kind === 'auto' && r.candidate.kid.id).toBe('妹妹');
    expect(plan({ kids: [kid('哥哥'), kid('妹妹', ['1', '2', '3', '4', '5'])], preferredKidId: '妹妹' }).kind).toBe('pick');
  });
});
