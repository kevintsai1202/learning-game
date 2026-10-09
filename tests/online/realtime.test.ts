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

  it('格式不對或不認得的訊息：null', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'nope' }))).toBeNull();
  });
});
