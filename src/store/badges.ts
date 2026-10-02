/**
 * 成就獎章（純函式，前端與伺服器共用；規格見 docs/plans/rewards.md 第 3 節）。
 * 條件都由存檔算出來（三星、技能、歷史、學習統計），在 recordSession 的最後一步頒發，
 * 所以本機與伺服器（applyOp）算出的獎章一定相同。得到後永久保留。
 *
 * 這個檔案只用 type import 讀 save.ts（save.ts 會 import 這裡，避免執行期的循環引用）。
 */
import type { Profile } from './save';

/** 技能熟練度滿級（與 save.ts 的 MAX_BOX 相同，單元測試確認） */
export const SKILL_MASTER_BOX = 5;

/** 獎章的進度：目前值與目標值，value ≥ target 就達成 */
export interface BadgeProgress {
  value: number;
  target: number;
}

/** 一個獎章 */
export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  /** 條件說明（獎章簿上給孩子與家長看） */
  goal: string;
  /** 得到後可以選來顯示的稱號 */
  title?: string;
  /** 專屬道具（R2／R3 由 grantBadgeItems 依獎章補發） */
  item?: string;
  /** 進度的單位（獎章簿顯示「還差 3 題」）；空字串表示只顯示「還沒達成」 */
  unit: string;
  /** 目前進度；today（YYYY-MM-DD）用來判斷連續天數是否已經中斷 */
  progress: (p: Profile, today: string) => BadgeProgress;
}

/** 有獎章的科目 */
type Subject = 'math' | 'zh' | 'en' | 'life';

/** 日期字串 YYYY-MM-DD 換算成天數（用 Date.UTC，不受裝置時區影響） */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * 連續有完成回合的天數：從最近一次往回數。
 * 給 today 時，若最近一次早於昨天，表示連續已經中斷，回傳 0。
 */
export function streakDays(p: Profile, today?: string): number {
  const days = [...new Set(p.history.map((h) => dayNumber(h.date)))].sort((a, b) => b - a);
  if (!days.length) return 0;
  if (today !== undefined && dayNumber(today) - days[0] > 1) return 0;
  let n = 1;
  while (n < days.length && days[n - 1] - days[n] === 1) n++;
  return n;
}

const SUBJECTS: readonly Subject[] = ['math', 'zh', 'en', 'life'];

/** 活動屬於哪一類：某一科、挑戰塔（段考），或其他（錯題複習等，不算） */
type ActivityKind = { kind: 'subject'; subject: Subject } | { kind: 'tower' } | { kind: 'other' };

/**
 * 從活動 id 判斷類別（不 import 活動清單，伺服器打包才不會帶進題庫）：
 * - tower.*（挑戰塔）、exam:…（期中期末模擬考）→ 挑戰塔
 * - review.*（錯題複習）→ 不算
 * - math.／zh.／en.／life. 開頭 → 該科
 * - 其他（跟著課本的 unit:<版本>:…、自訂題庫）→ 看歷史紀錄裡這個活動的科目；查不到再看版本 id 的結尾（-zh、-math）
 */
function activityKind(id: string, p: Profile): ActivityKind {
  if (id.startsWith('tower.') || id.startsWith('exam:')) return { kind: 'tower' };
  if (id.startsWith('review.')) return { kind: 'other' };
  const prefix = SUBJECTS.find((s) => id.startsWith(`${s}.`));
  if (prefix) return { kind: 'subject', subject: prefix };
  const fromHistory = [...p.history].reverse().find((h) => h.activityId === id)?.subject;
  if (fromHistory && (SUBJECTS as readonly string[]).includes(fromHistory)) return { kind: 'subject', subject: fromHistory as Subject };
  const edition = /^unit:[^:]*-(zh|math):/.exec(id);
  if (edition) return { kind: 'subject', subject: edition[1] as Subject };
  return { kind: 'other' };
}

/** 某科有幾個活動拿到三星 */
export function threeStarCount(p: Profile, subject: Subject): number {
  return Object.entries(p.bestStars).filter(([id, s]) => {
    if (s !== 3) return false;
    const k = activityKind(id, p);
    return k.kind === 'subject' && k.subject === subject;
  }).length;
}

/** 挑戰塔（含期中期末模擬考）是否有任一個三星 */
const towerThreeStar = (p: Profile) => Object.entries(p.bestStars).some(([id, s]) => s === 3 && activityKind(id, p).kind === 'tower');

/** 一次答對的總題數（各技能加總） */
const firstTryTotal = (p: Profile) => Object.values(p.skills).reduce((sum, s) => sum + s.firstTry, 0);
/** 學習統計（舊存檔沒有時當作 0） */
const statsOf = (p: Profile) => ({ wrongCleared: p.stats?.wrongCleared ?? 0, written: p.stats?.written ?? 0 });
/** 進度的小工具 */
const of = (value: number, target: number): BadgeProgress => ({ value: Math.min(value, target), target });

/** 18 個獎章（順序就是獎章簿的順序） */
export const BADGES: BadgeDef[] = [
  { id: 'first-adventure', unit: '回合', name: '初次冒險', icon: '🌱', goal: '完成第一回合', title: '冒險新手', progress: (p) => of(p.history.length, 1) },
  { id: 'correct-100', unit: '題', name: '答對 100 題', icon: '💯', goal: '一次答對 100 題', item: 'hand.star-wand', progress: (p) => of(firstTryTotal(p), 100) },
  { id: 'correct-500', unit: '題', name: '答對 500 題', icon: '🏅', goal: '一次答對 500 題', title: '答題高手', progress: (p) => of(firstTryTotal(p), 500) },
  { id: 'correct-1000', unit: '題', name: '答對 1000 題', icon: '🏆', goal: '一次答對 1000 題', item: 'back.gold-cape', progress: (p) => of(firstTryTotal(p), 1000) },
  { id: 'math-master', unit: '個三星', name: '數學小達人', icon: '🏰', goal: '數學 10 個活動拿到三星', title: '數學小達人', progress: (p) => of(threeStarCount(p, 'math'), 10) },
  { id: 'zh-master', unit: '個三星', name: '國語小達人', icon: '🌳', goal: '國語 8 個活動拿到三星', title: '國語小達人', progress: (p) => of(threeStarCount(p, 'zh'), 8) },
  { id: 'en-master', unit: '個三星', name: '英語小達人', icon: '🏖️', goal: '英語 8 個活動拿到三星', title: '英語小達人', progress: (p) => of(threeStarCount(p, 'en'), 8) },
  { id: 'life-master', unit: '個三星', name: '生活小達人', icon: '🏡', goal: '生活 5 個活動拿到三星', title: '生活小達人', progress: (p) => of(threeStarCount(p, 'life'), 5) },
  {
    id: 'all-subjects',
    unit: '科',
    name: '全科探險家',
    icon: '🗺️',
    goal: '國語、數學、英語、生活都至少一個活動拿到三星',
    item: 'hat.explorer',
    progress: (p) => of(SUBJECTS.filter((s) => threeStarCount(p, s) > 0).length, 4),
  },
  { id: 'wrong-5', unit: '題', name: '錯題清道夫', icon: '🧹', goal: '從錯題本清掉 5 題錯題', title: '錯題清道夫', progress: (p) => of(statsOf(p).wrongCleared, 5) },
  { id: 'wrong-20', unit: '題', name: '錯題剋星', icon: '📕', goal: '從錯題本清掉 20 題錯題', title: '錯題剋星', progress: (p) => of(statsOf(p).wrongCleared, 20) },
  { id: 'wrong-50', unit: '題', name: '錯題終結者', icon: '⚔️', goal: '從錯題本清掉 50 題錯題', item: 'hat.hero-helmet', progress: (p) => of(statsOf(p).wrongCleared, 50) },
  { id: 'streak-3', unit: '天', name: '每天都學習', icon: '📅', goal: '連續 3 天都完成回合', title: '每天都學習', progress: (p, today) => of(streakDays(p, today), 3) },
  { id: 'streak-7', unit: '天', name: '一週不間斷', icon: '🔥', goal: '連續 7 天都完成回合', item: 'pet.dragon', progress: (p, today) => of(streakDays(p, today), 7) },
  { id: 'write-20', unit: '個字', name: '小小書法家', icon: '✏️', goal: '描寫完成 20 個字', title: '小小書法家', progress: (p) => of(statsOf(p).written, 20) },
  { id: 'write-100', unit: '個字', name: '書法大師', icon: '🖌️', goal: '描寫完成 100 個字', item: 'hand.brush', progress: (p) => of(statsOf(p).written, 100) },
  {
    id: 'tower-hero',
    unit: '',
    name: '段考勇士',
    icon: '🏯',
    goal: '挑戰塔任一科（或期中、期末模擬考）拿到三星',
    title: '段考勇士',
    item: 'hat.scholar',
    progress: (p) => of(towerThreeStar(p) ? 1 : 0, 1),
  },
  {
    id: 'skill-master',
    unit: '個技能',
    name: '技能大師',
    icon: '🧠',
    goal: '10 個技能的熟練度練到滿級',
    title: '技能大師',
    item: 'pet.owl',
    progress: (p) => of(Object.values(p.skills).filter((s) => s.box >= SKILL_MASTER_BOX).length, 10),
  },
];

/** 用 id 找獎章 */
export function badgeById(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id);
}

/** 某個獎章目前的進度 */
export function badgeProgress(def: BadgeDef, p: Profile, today: string): BadgeProgress {
  return def.progress(p, today);
}

/**
 * 頒發新達成的獎章（記下得到的日期）。已得到的不重複、不收回；沒有新獎章時回傳同一個存檔物件。
 * 在 recordSession 的最後一步呼叫（星數、錯題本、歷史都更新完之後）。
 */
export function awardBadges(p: Profile, today: string): Profile {
  const have = p.badges ?? {};
  const fresh = BADGES.filter((b) => {
    if (have[b.id]) return false;
    const r = b.progress(p, today);
    return r.value >= r.target;
  });
  if (!fresh.length) return p;
  const badges = { ...have };
  for (const b of fresh) badges[b.id] = today;
  return { ...p, badges };
}

/** 這次新得到的獎章 id（依獎章簿順序）；結算畫面用來慶祝 */
export function newlyEarned(before: Profile, after: Profile): string[] {
  return BADGES.filter((b) => after.badges?.[b.id] && !before.badges?.[b.id]).map((b) => b.id);
}

/** 目前顯示的稱號：選了已得到、而且有稱號的獎章才顯示（讀取時再確認一次，避免指向沒有的獎章） */
export function shownTitle(p: Profile): string | null {
  if (!p.title || !p.badges?.[p.title]) return null;
  return badgeById(p.title)?.title ?? null;
}
