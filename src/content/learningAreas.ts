/**
 * 學習面向（學習報告雷達圖的 9 個軸，docs/plans/learning-report.md 第 1 節）。純函式，伺服器與畫面共用。
 * 課綱指標（「科目:代碼」，和 profile.indicators、src/content/indicators.ts 的鍵相同）依領域歸到面向；
 * 面向的數值是一次答對率（面向內所有指標合計），作答太少的面向不算數。
 */
import type { SubjectId } from '../core/types';

/** 9 個面向 */
export type AreaId = 'zhuyin' | 'chars' | 'reading' | 'number' | 'measure' | 'shape' | 'letters' | 'words' | 'life';

/** 一個面向：名稱（短，雷達圖的軸）、圖示、科目、練習的建築 */
export interface LearningArea {
  id: AreaId;
  label: string;
  /** 雷達圖軸上的短名稱（兩個字，九個軸才不會擠在一起） */
  short: string;
  emoji: string;
  subject: SubjectId;
  /** 「去練習」要去的建築 */
  zone: 'zh' | 'math' | 'en' | 'life';
}

/** 雷達圖的順序（國語、數學、英語、生活） */
export const LEARNING_AREAS: LearningArea[] = [
  { id: 'zhuyin', label: '注音', short: '注音', emoji: '🔤', subject: 'zh', zone: 'zh' },
  { id: 'chars', label: '識字', short: '識字', emoji: '✍️', subject: 'zh', zone: 'zh' },
  { id: 'reading', label: '閱讀', short: '閱讀', emoji: '📖', subject: 'zh', zone: 'zh' },
  { id: 'number', label: '計算', short: '計算', emoji: '➕', subject: 'math', zone: 'math' },
  { id: 'measure', label: '量與時間', short: '測量', emoji: '⏰', subject: 'math', zone: 'math' },
  { id: 'shape', label: '圖形統計', short: '圖形', emoji: '🔷', subject: 'math', zone: 'math' },
  { id: 'letters', label: '字母', short: '字母', emoji: '🔠', subject: 'en', zone: 'en' },
  { id: 'words', label: '英語單字', short: '單字', emoji: '💬', subject: 'en', zone: 'en' },
  { id: 'life', label: '生活', short: '生活', emoji: '🌱', subject: 'life', zone: 'life' },
];

/** 面向少於幾題作答就不算數（雷達圖標「練習太少」） */
export const AREA_MIN_ATTEMPTS = 5;
/** 弱項指標至少要有幾題作答 */
export const WEAK_MIN_ATTEMPTS = 3;
/** 規則建議：一次答對率低於這個值的面向要加強 */
export const RULE_TIP_BELOW = 0.85;

/** 某一科的指標代碼歸到哪個面向（規則依序比對，第一個符合的；都不符合就用那一科最後的預設面向） */
const RULES: Record<string, { area: AreaId; test: (code: string) => boolean }[]> = {
  zh: [
    { area: 'zhuyin', test: (c) => c === '3-Ⅰ-1' || c === '3-Ⅰ-2' || c.startsWith('Aa-') },
    { area: 'chars', test: (c) => c.startsWith('4-Ⅰ-') || /^Ab-Ⅰ-[1-4]$/.test(c) },
    { area: 'reading', test: () => true },
  ],
  math: [
    { area: 'measure', test: (c) => ['N-2-5', 'N-2-10', 'N-2-11', 'N-2-12', 'N-2-13', 'N-2-14', 'S-2-3', 'S-2-5'].includes(c) },
    { area: 'shape', test: (c) => c.startsWith('S-2-') || c.startsWith('D-2-') },
    { area: 'number', test: () => true },
  ],
  en: [
    {
      area: 'letters',
      test: (c) =>
        c.startsWith('Aa-') ||
        c.startsWith('Ab-') ||
        c.startsWith('NTPC-') ||
        ['1-Ⅱ-1', '1-Ⅱ-2', '3-Ⅱ-1', '4-Ⅱ-1', 'TPE-L1-1', 'TPE-R1-1', 'TPE-W1-1'].includes(c),
    },
    { area: 'words', test: () => true },
  ],
  life: [{ area: 'life', test: () => true }],
};

/** 指標鍵（「科目:代碼」）歸到哪個面向；不認得的科目或沒有科目前綴回 null */
export function areaOf(key: string): AreaId | null {
  const i = key.indexOf(':');
  if (i < 0) return null;
  const rules = RULES[key.slice(0, i)];
  if (!rules) return null;
  const code = key.slice(i + 1);
  return rules.find((r) => r.test(code))?.area ?? null;
}

/** 存檔的指標統計（profile.indicators） */
export type IndicatorMap = Record<string, { attempts: number; firstTry: number }>;

/** 一個面向的統計；rate 是一次答對率（作答太少是 null） */
export interface AreaStat {
  area: AreaId;
  attempts: number;
  firstTry: number;
  rate: number | null;
}

/** 一個指標的統計 */
export interface IndicatorStat {
  key: string;
  attempts: number;
  firstTry: number;
  rate: number;
}

/** 一個孩子各面向的統計（9 個，依雷達圖的順序） */
export function areaStats(indicators: IndicatorMap): AreaStat[] {
  const sum = new Map<AreaId, { attempts: number; firstTry: number }>();
  for (const [key, s] of Object.entries(indicators)) {
    const area = areaOf(key);
    if (!area) continue;
    const cur = sum.get(area) ?? { attempts: 0, firstTry: 0 };
    sum.set(area, { attempts: cur.attempts + s.attempts, firstTry: cur.firstTry + s.firstTry });
  }
  return LEARNING_AREAS.map(({ id }) => {
    const s = sum.get(id) ?? { attempts: 0, firstTry: 0 };
    return { area: id, ...s, rate: s.attempts >= AREA_MIN_ATTEMPTS ? s.firstTry / s.attempts : null };
  });
}

/** 弱項指標：作答至少 WEAK_MIN_ATTEMPTS 題、一次答對率最低的在前（同分時作答多的在前），最多 n 個 */
export function weakIndicators(indicators: IndicatorMap, n = 5): IndicatorStat[] {
  return Object.entries(indicators)
    .filter(([key, s]) => s.attempts >= WEAK_MIN_ATTEMPTS && areaOf(key) !== null)
    .map(([key, s]) => ({ key, attempts: s.attempts, firstTry: s.firstTry, rate: s.firstTry / s.attempts }))
    .sort((a, b) => a.rate - b.rate || b.attempts - a.attempts || a.key.localeCompare(b.key))
    .slice(0, n);
}

/** 全班一個面向：作答夠多的孩子各自答對率的平均，與這樣的孩子有幾個 */
export interface ClassAreaStat {
  area: AreaId;
  rate: number | null;
  students: number;
}

/** 全班各面向的統計（每個孩子一份 profile.indicators） */
export function classAreaStats(list: IndicatorMap[]): ClassAreaStat[] {
  const each = list.map(areaStats);
  return LEARNING_AREAS.map(({ id }) => {
    const rates = each.map((stats) => stats.find((s) => s.area === id)!.rate).filter((r): r is number => r !== null);
    return { area: id, rate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null, students: rates.length };
  });
}

/** 全班的弱項指標：合計全班的作答，記練過（作答至少一題）的孩子數 */
export function classWeakIndicators(list: IndicatorMap[], n = 5): (IndicatorStat & { students: number })[] {
  const pooled: IndicatorMap = {};
  const students = new Map<string, number>();
  for (const indicators of list) {
    for (const [key, s] of Object.entries(indicators)) {
      if (!s.attempts) continue;
      const cur = pooled[key] ?? { attempts: 0, firstTry: 0 };
      pooled[key] = { attempts: cur.attempts + s.attempts, firstTry: cur.firstTry + s.firstTry };
      students.set(key, (students.get(key) ?? 0) + 1);
    }
  }
  return weakIndicators(pooled, n).map((w) => ({ ...w, students: students.get(w.key) ?? 0 }));
}

/**
 * 規則建議要提的面向（沒有 AI 時）：先挑一次答對率低於 RULE_TIP_BELOW 的（最低的在前），
 * 不夠 n 個再依雷達圖的順序補「還沒練夠」的面向
 */
export function ruleTipAreas(stats: AreaStat[], n = 3): AreaId[] {
  const weak = stats
    .filter((s) => s.rate !== null && s.rate < RULE_TIP_BELOW)
    .sort((a, b) => a.rate! - b.rate!)
    .map((s) => s.area);
  const untouched = stats.filter((s) => s.rate === null).map((s) => s.area);
  return [...weak, ...untouched].slice(0, n);
}

/** 面向的資料（名稱、圖示、建築） */
export function areaById(id: AreaId): LearningArea {
  return LEARNING_AREAS.find((a) => a.id === id)!;
}
