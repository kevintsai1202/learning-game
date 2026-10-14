/**
 * 營運者監控入口的 HTTP 格式（docs/plans/admin.md）：伺服器（server/admin.ts）與監控頁（src/admin/）共用。
 * 純型別與 zod 格式，伺服器也會 import，不能 import 畫面、音訊、3D 的程式。
 * 登入的請求沿用 protocol.ts 的 googleTokenRequest（{ idToken }）。
 */
import { z } from 'zod';

/** 匿名造訪：裝置第一次開啟時產生的隨機 id（16～64 個英數、底線或連字號；和角色、帳號無關） */
export const visitRequest = z.object({ device: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });

/** 登入監控頁的回應：admin 權杖與到期時間 */
export interface AdminLoginResponse {
  token: string;
  expiresAt: string;
}

/** 今天、近 7 天、近 30 天的人數（台灣日期，都含今天） */
export interface ActiveCounts {
  today: number;
  d7: number;
  d30: number;
}

/** 每日趨勢的一天：有作答的孩子數、回合數（下限）、題數、遊玩分鐘、匿名造訪的裝置數 */
export interface AdminDay {
  day: string;
  kids: number;
  rounds: number;
  questions: number;
  minutes: number;
  visits: number;
}

/** 監控頁的總覽 */
export interface AdminOverview {
  /** 產生的時間 */
  generatedAt: string;
  /** 人數：大人帳號（老師、家長；兩種身分都有的兩邊都算）、孩子的雲端角色（在班級裡、只有家長）、班級 */
  counts: { adults: number; teachers: number; parents: number; kids: number; kidsInClass: number; kidsParentOnly: number; classes: number };
  /** 最近有上線的孩子（last_seen）與大人（last_login） */
  active: { kids: ActiveCounts; adults: ActiveCounts };
  /** 現在連著即時中樞的人數；伺服器沒提供時是 null */
  online: { kids: number; teachers: number } | null;
  /** 近 30 天的每日趨勢（由舊到新） */
  days: AdminDay[];
  /** 近 30 天各科的回合數與題數（回合多的在前） */
  subjects: { subject: string; rounds: number; questions: number }[];
  /** AI 用量：近 7 天每天的出題數；近 30 天每天的學習分析次數（老師、孩子分開） */
  ai: { questions: { day: string; count: number }[]; analyses: { day: string; teacher: number; kid: number }[] };
  /** 匿名造訪的不重複裝置數；hosts 是近 30 天依網址分類的裝置數 */
  visits: ActiveCounts & { hosts: Record<string, number> };
}

/** 明細：一個班級 */
export interface AdminClassRow {
  code: string;
  name: string;
  /** 老師的帳號名稱（改版前沒有擁有者的班級是 null） */
  teacher: string | null;
  members: number;
  packs: number;
  createdAt: string;
  /** 班上最近有人上線的時間；沒有成員是 null */
  lastSeen: string | null;
}

/** 明細：一個孩子的雲端角色（近 30 天的使用量） */
export interface AdminKidRow {
  /** 存檔裡的名字 */
  name: string;
  /** 所在班級的名稱（最早加入的在前） */
  classes: string[];
  hasParent: boolean;
  createdAt: string;
  lastSeen: string;
  rounds: number;
  questions: number;
  minutes: number;
  coins: number;
}

/** 明細：一個大人帳號 */
export interface AdminAdultRow {
  username: string;
  /** 遮罩過的 email（沒有 email 是 null） */
  email: string | null;
  emailVerified: boolean;
  teacher: boolean;
  parent: boolean;
  createdAt: string;
  lastLogin: string | null;
  /** 名下的班級數與孩子數 */
  classes: number;
  kids: number;
}

/** 監控頁的明細；任一張表超過上限（1000 列）時 truncated 是 true */
export interface AdminAccounts {
  classes: AdminClassRow[];
  kids: AdminKidRow[];
  adults: AdminAdultRow[];
  truncated: boolean;
}
