/**
 * 即時連線的訊息格式（src/online/realtime.ts）：裝置送來的訊息用 zod 驗證，格式不符就斷線。
 * 老師 GM 的 G2：老師的 hello 帶班級代碼（gm）。
 */
import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../../src/online/realtime';

/** 權杖（格式只要求長度） */
const TOKEN = 'x'.repeat(43);

describe('parseClientMessage', () => {
  it('hello：孩子（島、班級）與老師（gm 是班級代碼）', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'hello', token: TOKEN, island: 'class', room: '123456' }))).toMatchObject({ t: 'hello', room: '123456' });
    expect(parseClientMessage(JSON.stringify({ t: 'hello', token: TOKEN, gm: '123456' }))).toMatchObject({ t: 'hello', gm: '123456' });
    expect(parseClientMessage(JSON.stringify({ t: 'hello', token: TOKEN, gm: '12345' }))).toBeNull();
  });

  it('老師的公告（去掉前後空白後 1～60 字）與集合', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'announce', text: '  要收拾囉  ' }))).toEqual({ t: 'announce', text: '要收拾囉' });
    expect(parseClientMessage(JSON.stringify({ t: 'announce', text: '字'.repeat(60) }))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'announce', text: '字'.repeat(61) }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'announce', text: '   ' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'summon' }))).toEqual({ t: 'summon' });
  });

  it('孩子回報在做什麼（G3）：活動名稱最多 40 字，沒有在做什麼是 null', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'doing', label: '加法練習' }))).toEqual({ t: 'doing', label: '加法練習' });
    expect(parseClientMessage(JSON.stringify({ t: 'doing', label: null }))).toEqual({ t: 'doing', label: null });
    expect(parseClientMessage(JSON.stringify({ t: 'doing', label: '字'.repeat(41) }))).toBeNull();
  });

  it('島嶼互訪 I2：開放島嶼、去朋友的島（帳號 id 最長 64 字）、請訪客回家', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'island', open: true }))).toEqual({ t: 'island', open: true });
    expect(parseClientMessage(JSON.stringify({ t: 'visit', to: 'a_123' }))).toEqual({ t: 'visit', to: 'a_123' });
    expect(parseClientMessage(JSON.stringify({ t: 'visit', to: 'x'.repeat(65) }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'kickVisitor', id: 'a_123' }))).toEqual({ t: 'kickVisitor', id: 'a_123' });
  });

  it('格式不對或不認得的訊息：null', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'nope' }))).toBeNull();
  });
});

describe('和朋友益智對戰的訊息（島嶼互訪 I4）', () => {
  const invite = { t: 'duelInvite', to: 'b', game: 'quiz', level: 2, seed: 4242, check: 'abc123' };
  it('邀請：遊戲要是益智遊戲館的遊戲、難度 1～3、種子是非負整數、指紋是 1～16 個英數字', () => {
    expect(parseClientMessage(JSON.stringify(invite))).toEqual(invite);
    expect(parseClientMessage(JSON.stringify({ ...invite, game: 'chess' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...invite, level: 4 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...invite, seed: -1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...invite, seed: 1.5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...invite, check: 'ABC' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...invite, check: 'a'.repeat(17) }))).toBeNull();
  });
  it('回覆、取消、離開', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'duelReply', from: 'a', accept: false, reason: 'busy' }))).toMatchObject({ reason: 'busy' });
    expect(parseClientMessage(JSON.stringify({ t: 'duelReply', from: 'a', accept: true }))).toMatchObject({ accept: true });
    expect(parseClientMessage(JSON.stringify({ t: 'duelReply', from: 'a', accept: false, reason: 'gone' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'duelCancel' }))).toEqual({ t: 'duelCancel' });
    expect(parseClientMessage(JSON.stringify({ t: 'duelLeave' }))).toEqual({ t: 'duelLeave' });
  });
  it('動作：種類要認得，i、n 是 0～999 的整數', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'duelMove', k: 'pick', i: 3, n: 1 }))).toEqual({ t: 'duelMove', k: 'pick', i: 3, n: 1 });
    expect(parseClientMessage(JSON.stringify({ t: 'duelMove', k: 'done' }))).toEqual({ t: 'duelMove', k: 'done' });
    expect(parseClientMessage(JSON.stringify({ t: 'duelMove', k: 'jump' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'duelMove', k: 'pick', i: 1000 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'duelMove', k: 'pick', n: -1 }))).toBeNull();
  });
});
