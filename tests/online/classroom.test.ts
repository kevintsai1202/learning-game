/**
 * 教室權杖的本機紀錄（L3，src/online/classroom.ts）：學校平板解鎖後記住 8 小時，期間從選角畫面點「🏫 班級」直接看到名單。
 * 這裡測純函式：從 localStorage 的原始字串解析、過期與格式錯誤都當作沒有。
 */
import { describe, expect, it } from 'vitest';
import { parseClassroomSession, type ClassroomSession } from '../../src/online/classroom';

const NOW = new Date('2026-10-07T08:00:00+08:00');
const session: ClassroomSession = { code: '123456', name: '二年三班', token: 'ct_abc', expiresAt: '2026-10-07T16:00:00+08:00' };

describe('parseClassroomSession', () => {
  it('還沒過期的紀錄原樣回傳', () => {
    expect(parseClassroomSession(JSON.stringify(session), NOW)).toEqual(session);
  });

  it('過期、沒有紀錄、格式錯誤都回 null', () => {
    expect(parseClassroomSession(JSON.stringify({ ...session, expiresAt: '2026-10-07T07:59:59+08:00' }), NOW)).toBeNull();
    expect(parseClassroomSession(null, NOW)).toBeNull();
    expect(parseClassroomSession('not json', NOW)).toBeNull();
    expect(parseClassroomSession(JSON.stringify({ code: '123456' }), NOW)).toBeNull();
    expect(parseClassroomSession(JSON.stringify({ ...session, expiresAt: 'someday' }), NOW)).toBeNull();
  });
});
