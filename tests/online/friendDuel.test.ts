/**
 * 裝置端的和朋友益智對戰狀態（島嶼互訪 I4）：收到伺服器的對戰訊息怎麼改狀態、什麼時候自動回「正在忙」。
 */
import { describe, expect, it } from 'vitest';
import { applyDuelMessage, duelCandidates, duelNoteText, emptyDuel, inviteBusy, type FriendDuelState } from '../../src/online/useFriendDuel';
import { DUEL_LINES } from '../../src/ui/lines';

const INVITE = { game: 'memory' as const, level: 2 as const, seed: 7, check: 'abc' };

describe('applyDuelMessage', () => {
  it('收到邀請：記下來（名字、遊戲、種子、指紋）', () => {
    const s = applyDuelMessage(emptyDuel(), { t: 'duelInvite', from: 'a', name: '阿寶', ...INVITE }, 'me');
    expect(s.incoming).toEqual({ from: 'a', name: '阿寶', ...INVITE });
  });

  it('對戰開始：記下這一局（先手換成自己的視角），清掉送出、收到、準備加入的邀請', () => {
    const before: FriendDuelState = {
      ...emptyDuel(),
      incoming: { from: 'x', name: '小明', ...INVITE },
      outgoing: { to: 'b', name: '小美', ...INVITE },
      joining: { from: 'b', name: '小美' },
    };
    const start = { t: 'duelStart' as const, id: 'duel:1', game: 'quiz' as const, level: 1 as const, seed: 9, first: 'b', opponent: { id: 'b', name: '小美' } };
    const s = applyDuelMessage(before, start, 'me');
    expect(s.live).toEqual({ id: 'duel:1', game: 'quiz', level: 1, seed: 9, first: 'bot', opponent: { id: 'b', name: '小美' }, events: [], end: null });
    expect(s.incoming).toBeNull();
    expect(s.outgoing).toBeNull();
    expect(s.joining).toBeNull();
    expect(applyDuelMessage(emptyDuel(), { ...start, first: 'me' }, 'me').live?.first).toBe('kid');
  });

  it('動作：依收到的順序記下來，自己的是 kid、對方的是 bot；沒有對戰時不記', () => {
    let s = applyDuelMessage(emptyDuel(), { t: 'duelStart', id: 'duel:1', game: 'quiz', level: 1, seed: 9, first: 'me', opponent: { id: 'b', name: '小美' } }, 'me');
    s = applyDuelMessage(s, { t: 'duelMove', by: 'b', k: 'pick', i: 0, n: 2 }, 'me');
    s = applyDuelMessage(s, { t: 'duelMove', by: 'me', k: 'ready', i: 0 }, 'me');
    expect(s.live?.events).toEqual([
      { by: 'bot', k: 'pick', i: 0, n: 2 },
      { by: 'kid', k: 'ready', i: 0 },
    ]);
    expect(applyDuelMessage(emptyDuel(), { t: 'duelMove', by: 'b', k: 'pick', i: 0 }, 'me')).toEqual(emptyDuel());
  });

  it('對方離開：記下原因（之後畫面判定你贏）', () => {
    let s = applyDuelMessage(emptyDuel(), { t: 'duelStart', id: 'duel:1', game: 'quiz', level: 1, seed: 9, first: 'me', opponent: { id: 'b', name: '小美' } }, 'me');
    s = applyDuelMessage(s, { t: 'duelEnd', reason: 'left' }, 'me');
    expect(s.live?.end).toBe('left');
    expect(applyDuelMessage(emptyDuel(), { t: 'duelEnd', reason: 'gone' }, 'me')).toEqual(emptyDuel());
  });

  it('被拒絕：送出的邀請清掉、記下結果；不是送給他的不理', () => {
    const before: FriendDuelState = { ...emptyDuel(), outgoing: { to: 'b', name: '小美', ...INVITE } };
    expect(applyDuelMessage(before, { t: 'duelDeclined', to: 'c', reason: 'no' }, 'me')).toBe(before);
    const s = applyDuelMessage(before, { t: 'duelDeclined', to: 'b', reason: 'tired' }, 'me');
    expect(s.outgoing).toBeNull();
    expect(s.note).toEqual({ kind: 'declined', name: '小美', reason: 'tired' });
  });

  it('邀請取消：收到的邀請清掉；已經按接受在等開局時，記下「取消了」', () => {
    const a: FriendDuelState = { ...emptyDuel(), incoming: { from: 'a', name: '阿寶', ...INVITE } };
    expect(applyDuelMessage(a, { t: 'duelCancelled', from: 'a' }, 'me').incoming).toBeNull();
    expect(applyDuelMessage(a, { t: 'duelCancelled', from: 'x' }, 'me')).toBe(a);
    const b: FriendDuelState = { ...emptyDuel(), joining: { from: 'a', name: '阿寶' } };
    const s = applyDuelMessage(b, { t: 'duelCancelled', from: 'a' }, 'me');
    expect(s.joining).toBeNull();
    expect(s.note).toEqual({ kind: 'cancelled', name: '阿寶' });
  });

  it('其他訊息不改狀態', () => {
    const s = emptyDuel();
    expect(applyDuelMessage(s, { t: 'gift' }, 'me')).toBe(s);
  });
});

describe('inviteBusy：收到邀請時要不要自動回「正在忙」', () => {
  it('在島上、或在益智遊戲館的選單：不忙', () => {
    expect(inviteBusy('island', false, emptyDuel())).toBe(false);
    expect(inviteBusy('puzzle', false, emptyDuel())).toBe(false);
  });

  it('在其他畫面、或正在玩益智遊戲：忙', () => {
    for (const screen of ['activity', 'zone', 'shop', 'result', 'badges', 'parent'] as const) expect(inviteBusy(screen, false, emptyDuel())).toBe(true);
    expect(inviteBusy('puzzle', true, emptyDuel())).toBe(true);
  });

  it('已經有一則邀請在等回覆、正在加入或正在對戰：忙', () => {
    expect(inviteBusy('island', false, { ...emptyDuel(), incoming: { from: 'a', name: '阿寶', ...INVITE } })).toBe(true);
    expect(inviteBusy('island', false, { ...emptyDuel(), joining: { from: 'a', name: '阿寶' } })).toBe(true);
    const live = applyDuelMessage(emptyDuel(), { t: 'duelStart', id: 'duel:1', game: 'quiz', level: 1, seed: 9, first: 'me', opponent: { id: 'b', name: '小美' } }, 'me');
    expect(inviteBusy('puzzle', false, live)).toBe(true);
  });
});

describe('duelCandidates：可以邀請的人', () => {
  const av = { animal: 'cat' as const, color: '#fff', hat: null };
  const m = (id: string, nickname: string, extra: object = {}) => ({ id, nickname, avatar: av, x: 0, z: 0, heading: 0, zone: null, ...extra });
  it('島上的孩子（不含自己與熊熊老師），在建築裡的也算', () => {
    const members = { me: m('me', '我'), b: m('b', '小美', { zone: 'puzzle' }), a: m('a', '阿寶'), t: m('gm:1', '熊熊老師', { role: 'teacher' }) };
    expect(new Set(duelCandidates(members, 'me').map((c) => c.id))).toEqual(new Set(['a', 'b']));
    expect(duelCandidates(members, 'me').some((c) => c.role === 'teacher')).toBe(false);
  });
});

describe('duelNoteText：邀請結果的文字（畫面有名字）與要唸的固定句子', () => {
  it('各種結果', () => {
    expect(duelNoteText({ kind: 'declined', name: '小美', reason: 'no' })).toEqual({ text: '小美現在不能玩，等一下再邀請吧！', speech: DUEL_LINES.declined });
    expect(duelNoteText({ kind: 'declined', name: '小美', reason: 'busy' }).speech).toBe(DUEL_LINES.declined);
    expect(duelNoteText({ kind: 'declined', name: '小美', reason: 'gone' }).speech).toBe(DUEL_LINES.declined);
    expect(duelNoteText({ kind: 'declined', name: '小美', reason: 'tired' })).toEqual({ text: '小美今天的益智遊戲時間用完了，明天再一起玩吧！', speech: DUEL_LINES.tired });
    expect(duelNoteText({ kind: 'declined', name: '小美', reason: 'version' })).toEqual({ text: DUEL_LINES.version, speech: DUEL_LINES.version });
    expect(duelNoteText({ kind: 'noAnswer', name: '小美' })).toEqual({ text: '小美沒有回應，等一下再邀請吧！', speech: DUEL_LINES.noAnswer });
    expect(duelNoteText({ kind: 'cancelled', name: '阿寶' })).toEqual({ text: '阿寶的邀請取消了。', speech: DUEL_LINES.cancelled });
  });
});
