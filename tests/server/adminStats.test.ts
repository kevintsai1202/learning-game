/**
 * 營運者監控的統計純函式（docs/plans/admin.md）：
 * - ADMIN_EMAILS 的解析與比對（不分大小寫、email 要 Google 驗證過）
 * - 台灣日期、最近 N 天
 * - 孩子存檔的 history／playLog 彙總成每日趨勢、科目分布、每個孩子近 30 天的數字
 * - 最近活躍的人數（今天、近 7 天、近 30 天）
 * - 造訪來源的網址分類
 */
import { describe, expect, it } from 'vitest';
import { activeCounts, adminEmailsFromEnv, isAdminEmail, kidUsage, lastDays, parseAdminEmails, summarizeKids, taiwanDay, visitHost } from '../../server/adminStats';
import type { SessionRecord } from '../../src/store/save';

/** 一回合的作答紀錄 */
const round = (date: string, subject: SessionRecord['subject'], total: number, seconds = 60): SessionRecord => ({
  activityId: `${subject}.x`,
  subject,
  date,
  total,
  correct: total,
  stars: 3,
  coins: 1,
  seconds,
});

/** 台灣時間 2026-10-14 中午 */
const NOW = new Date('2026-10-14T12:00:00+08:00');

describe('ADMIN_EMAILS', () => {
  it('逗號分隔、去空白、轉小寫、去掉空的與重複的', () => {
    expect(parseAdminEmails(' Boss@Gmail.com, ,other@example.com,boss@gmail.com ')).toEqual(['boss@gmail.com', 'other@example.com']);
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails('')).toEqual([]);
  });

  it('從環境變數讀清單；有設 ADMIN_EMAILS 卻沒開 Google 登入就拒絕啟動', () => {
    expect(adminEmailsFromEnv({ ADMIN_EMAILS: 'Boss@gmail.com' }, true)).toEqual(['boss@gmail.com']);
    expect(adminEmailsFromEnv({}, false)).toEqual([]);
    expect(adminEmailsFromEnv({ ADMIN_EMAILS: ' ' }, false)).toEqual([]);
    expect(() => adminEmailsFromEnv({ ADMIN_EMAILS: 'boss@gmail.com' }, false)).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('email 在清單裡、而且 Google 驗證過才算管理者', () => {
    const list = ['boss@gmail.com'];
    expect(isAdminEmail(list, 'BOSS@gmail.com', true)).toBe(true);
    expect(isAdminEmail(list, 'boss@gmail.com', false)).toBe(false);
    expect(isAdminEmail(list, 'someone@gmail.com', true)).toBe(false);
    expect(isAdminEmail(list, null, true)).toBe(false);
    expect(isAdminEmail([], 'boss@gmail.com', true)).toBe(false);
  });
});

describe('台灣日期', () => {
  it('UTC 的晚上已經是台灣的隔天', () => {
    expect(taiwanDay(new Date('2026-10-13T17:00:00Z'))).toBe('2026-10-14');
    expect(taiwanDay(new Date('2026-10-13T15:59:00Z'))).toBe('2026-10-13');
  });

  it('最近 N 天（由舊到新，最後一天是今天）', () => {
    expect(lastDays(NOW, 3)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(lastDays(new Date('2026-03-01T01:00:00+08:00'), 2)).toEqual(['2026-02-28', '2026-03-01']);
  });
});

describe('孩子的使用量', () => {
  const kidA = {
    history: [round('2026-09-01', 'math', 10), round('2026-10-13', 'math', 10), round('2026-10-14', 'zh', 8), round('2026-10-14', 'math', 5)],
    playLog: { '2026-09-01': 600, '2026-10-13': 900, '2026-10-14': 1200 },
  };
  const kidB = {
    history: [round('2026-10-14', 'en', 6)],
    playLog: { '2026-10-14': 300 },
  };

  it('一個孩子近 30 天的回合、題數、遊玩分鐘（30 天前的不算）', () => {
    expect(kidUsage(kidA, NOW)).toEqual({ rounds: 3, questions: 23, minutes: 35 });
    expect(kidUsage({ history: [], playLog: {} }, NOW)).toEqual({ rounds: 0, questions: 0, minutes: 0 });
  });

  it('每日趨勢：每天有作答的孩子數、回合、題數、分鐘；沒有資料的日子是 0', () => {
    const s = summarizeKids([kidA, kidB], NOW, 3);
    expect(s.days).toEqual([
      { day: '2026-10-12', kids: 0, rounds: 0, questions: 0, minutes: 0 },
      { day: '2026-10-13', kids: 1, rounds: 1, questions: 10, minutes: 15 },
      { day: '2026-10-14', kids: 2, rounds: 3, questions: 19, minutes: 25 },
    ]);
  });

  it('科目分布（近 30 天，回合多的在前）', () => {
    const s = summarizeKids([kidA, kidB], NOW, 30);
    expect(s.subjects).toEqual([
      { subject: 'math', rounds: 2, questions: 15 },
      { subject: 'zh', rounds: 1, questions: 8 },
      { subject: 'en', rounds: 1, questions: 6 },
    ]);
  });

  it('壞掉或缺欄位的存檔不會讓統計失敗', () => {
    const broken = { history: undefined, playLog: null } as unknown as { history: SessionRecord[]; playLog: Record<string, number> };
    expect(kidUsage(broken, NOW)).toEqual({ rounds: 0, questions: 0, minutes: 0 });
    expect(summarizeKids([broken], NOW, 2).days.every((d) => d.kids === 0)).toBe(true);
  });
});

describe('最近活躍的人數', () => {
  it('今天（台灣日期）、近 7 天、近 30 天；從來沒上線的不算', () => {
    const dates = [
      new Date('2026-10-14T00:30:00+08:00'), // 今天
      new Date('2026-10-13T23:59:00+08:00'), // 昨天
      new Date('2026-10-08T09:00:00+08:00'), // 7 天內（含今天的第 7 天）
      new Date('2026-10-07T09:00:00+08:00'), // 第 8 天
      new Date('2026-09-15T09:00:00+08:00'), // 30 天內
      new Date('2026-09-01T09:00:00+08:00'), // 超過 30 天
      null,
    ];
    expect(activeCounts(dates, NOW)).toEqual({ today: 1, d7: 3, d30: 5 });
  });
});

describe('造訪來源', () => {
  it('依 Origin 分成 GitHub Pages、Zeabur、其他', () => {
    expect(visitHost('https://kevintsai1202.github.io')).toBe('pages');
    expect(visitHost('https://learning-island.zeabur.app')).toBe('zeabur');
    expect(visitHost('http://localhost:4183')).toBe('other');
    expect(visitHost(undefined)).toBe('other');
    expect(visitHost('not a url')).toBe('other');
  });
});
