/**
 * 營運者監控的統計純函式（docs/plans/admin.md）：不碰資料庫，路由（server/admin.ts）查出資料後交給這裡算。
 * 日期一律用台灣時間；孩子存檔裡的 history（每一回合的日期、科目、題數）與 playLog（每天的遊玩秒數）
 * 是裝置記的當地日期，孩子都在台灣，直接當台灣日期用。
 * 注意：存檔的 history 只留最近 300 回合（save.ts 的 HISTORY_LIMIT），玩得很多的孩子回合數會少算，畫面要註明是下限；
 * 遊玩分鐘來自 playLog（留 60 天），不受這個限制。
 */
import type { SessionRecord } from '../src/store/save';

/** 統計用到的存檔欄位（從資料庫讀出來的存檔可能缺欄位，一律容錯） */
export interface UsageSource {
  history: SessionRecord[];
  playLog: Record<string, number>;
}

/** 一個孩子在一段期間內的使用量：回合數、題數、遊玩分鐘 */
export interface Usage {
  rounds: number;
  questions: number;
  minutes: number;
}

/** 每日趨勢的一天：有作答的孩子數、回合數、題數、遊玩分鐘 */
export interface UsageDay extends Usage {
  day: string;
  kids: number;
}

/** 一個科目的回合數與題數 */
export interface SubjectUsage {
  subject: string;
  rounds: number;
  questions: number;
}

/** 解析 ADMIN_EMAILS：逗號分隔、去空白、轉小寫，去掉空的與重複的 */
export function parseAdminEmails(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

/**
 * 從環境變數讀管理者清單（main.ts 用）：有設 ADMIN_EMAILS 卻沒開 Google 登入時丟錯拒絕啟動
 * （否則監控頁永遠登不進去，設定錯了卻沒人發現）
 */
export function adminEmailsFromEnv(env: Record<string, string | undefined>, googleEnabled: boolean): string[] {
  const list = parseAdminEmails(env.ADMIN_EMAILS);
  if (list.length && !googleEnabled) throw new Error('有設 ADMIN_EMAILS 但沒有設 GOOGLE_CLIENT_ID：營運者監控要用 Google 登入');
  return list;
}

/** 這個 Google 帳號是不是管理者：email 要在清單裡，而且是 Google 驗證過的 */
export function isAdminEmail(list: readonly string[], email: string | null, verified: boolean): boolean {
  return verified && !!email && list.includes(email.toLowerCase());
}

/** 台灣日期（YYYY-MM-DD） */
export function taiwanDay(d: Date): string {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 最近 n 天的台灣日期，由舊到新，最後一天是今天 */
export function lastDays(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => taiwanDay(new Date(now.getTime() - (n - 1 - i) * 24 * 3600 * 1000)));
}

/** 存檔裡的回合紀錄（缺欄位或格式不對時是空的） */
const roundsOf = (p: UsageSource): SessionRecord[] => (Array.isArray(p?.history) ? p.history.filter((r) => r && typeof r.date === 'string') : []);
/** 存檔裡每天的遊玩秒數（缺欄位時是空的） */
const playOf = (p: UsageSource): Record<string, number> => (p?.playLog && typeof p.playLog === 'object' ? p.playLog : {});
/** 題數（不是數字時算 0） */
const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/** 一個孩子近 30 天（含今天）的回合數、題數、遊玩分鐘 */
export function kidUsage(p: UsageSource, now: Date): Usage {
  const days = new Set(lastDays(now, 30));
  const rounds = roundsOf(p).filter((r) => days.has(r.date));
  const seconds = Object.entries(playOf(p)).reduce((sum, [day, s]) => sum + (days.has(day) ? count(s) : 0), 0);
  return { rounds: rounds.length, questions: rounds.reduce((sum, r) => sum + count(r.total), 0), minutes: Math.round(seconds / 60) };
}

/** 全部孩子最近 n 天的每日趨勢與科目分布（科目照回合數、再照題數由多到少） */
export function summarizeKids(profiles: readonly UsageSource[], now: Date, n: number): { days: UsageDay[]; subjects: SubjectUsage[] } {
  const keys = lastDays(now, n);
  const byDay = new Map(keys.map((day) => [day, { day, kids: 0, rounds: 0, questions: 0, seconds: 0 }]));
  const bySubject = new Map<string, SubjectUsage>();
  for (const p of profiles) {
    const playedOn = new Set<string>();
    for (const r of roundsOf(p)) {
      const d = byDay.get(r.date);
      if (!d) continue;
      d.rounds++;
      d.questions += count(r.total);
      playedOn.add(r.date);
      const s = bySubject.get(r.subject) ?? { subject: r.subject, rounds: 0, questions: 0 };
      s.rounds++;
      s.questions += count(r.total);
      bySubject.set(r.subject, s);
    }
    for (const day of playedOn) byDay.get(day)!.kids++;
    for (const [day, s] of Object.entries(playOf(p))) {
      const d = byDay.get(day);
      if (d) d.seconds += count(s);
    }
  }
  return {
    days: keys.map((day) => {
      const d = byDay.get(day)!;
      return { day, kids: d.kids, rounds: d.rounds, questions: d.questions, minutes: Math.round(d.seconds / 60) };
    }),
    subjects: [...bySubject.values()].sort((a, b) => b.rounds - a.rounds || b.questions - a.questions),
  };
}

/** 最近活躍的人數：今天、近 7 天、近 30 天（都含今天，照台灣日期）；null 是從來沒上線 */
export function activeCounts(dates: readonly (Date | null)[], now: Date): { today: number; d7: number; d30: number } {
  const today = taiwanDay(now);
  const d7 = new Set(lastDays(now, 7));
  const d30 = new Set(lastDays(now, 30));
  const days = dates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime())).map(taiwanDay);
  return { today: days.filter((d) => d === today).length, d7: days.filter((d) => d7.has(d)).length, d30: days.filter((d) => d30.has(d)).length };
}

/** 造訪來源：GitHub Pages、Zeabur、其他（看 Origin 標頭的主機名稱） */
export function visitHost(origin: string | undefined): 'pages' | 'zeabur' | 'other' {
  try {
    const host = new URL(origin ?? '').hostname;
    if (host.endsWith('.github.io')) return 'pages';
    if (host.endsWith('.zeabur.app')) return 'zeabur';
  } catch {
    // 沒有 Origin 或格式不對
  }
  return 'other';
}
