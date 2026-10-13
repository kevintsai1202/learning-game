/**
 * AI 學習分析（docs/plans/learning-report.md 第 3 節）的純函式，伺服器與畫面共用：
 * - 送給 AI 的**匿名**統計（各面向的答對率與作答數、弱項指標、回合數、最近玩了幾天；沒有名字與帳號 id）
 * - 三種分析：孩子（同時寫給孩子與家長）、老師看單一孩子、老師看全班
 * - 給模型的 strict JSON Schema、提示、轉換與檢查；給孩子看的句子由這裡過濾（比較、貼標籤的字一律拿掉）
 * - 快取用的指紋：統計分桶後的雜湊，多答對一題通常不變
 */
import { z } from 'zod';
import { hashString } from '../core/rng';
import {
  LEARNING_AREAS,
  areaStats,
  classAreaStats,
  classWeakIndicators,
  weakIndicators,
  type AreaId,
  type IndicatorMap,
} from './learningAreas';

/** 三種分析 */
export type AnalysisKind = 'kid' | 'teacherStudent' | 'teacherClass';

/** 一個面向（送給 AI 的） */
export interface AreaLine {
  id: AreaId;
  label: string;
  /** 一次答對率；作答太少是 null */
  rate: number | null;
  /** 孩子：作答題數 */
  attempts?: number;
  /** 全班：作答夠多的孩子數 */
  students?: number;
}

/** 一個弱項指標（送給 AI 的） */
export interface WeakLine {
  key: string;
  label: string;
  rate: number;
  attempts: number;
  /** 全班：練過的孩子數 */
  students?: number;
}

/** 一個孩子的匿名統計 */
export interface StudentInput {
  areas: AreaLine[];
  weak: WeakLine[];
  /** 玩過的回合數 */
  sessions: number;
  /** 最近 14 天有玩的天數 */
  activeDays: number;
}

/** 全班的匿名統計 */
export interface ClassInput {
  students: number;
  areas: AreaLine[];
  weak: WeakLine[];
}

/** 分析的輸入：孩子、老師看單一孩子（附全班平均，不附名單）、老師看全班 */
export type AnalysisInput =
  | { kind: 'kid'; student: StudentInput }
  | { kind: 'teacherStudent'; student: StudentInput; classAreas: AreaLine[] }
  | { kind: 'teacherClass'; class: ClassInput };

/** 孩子的分析結果：給孩子的鼓勵與建議（每個建議指到一個面向）、給家長的摘要與建議 */
export interface KidReport {
  kind: 'kid';
  cheer: string;
  tips: { area: AreaId; text: string }[];
  parentSummary: string;
  parentTips: string[];
}

/** 老師的分析結果 */
export interface TeacherReport {
  kind: 'teacherStudent' | 'teacherClass';
  summary: string;
  strengths: string[];
  /** 要加強的指標（只會是送去的弱項指標，畫面拿來預先勾好 AI 出題） */
  focus: { indicator: string; reason: string }[];
  tips: string[];
}

export type AnalysisReport = KidReport | TeacherReport;

/** 最近幾天算「最近有玩」 */
const ACTIVE_WINDOW_DAYS = 14;
/** 給孩子的一句話最多幾個字 */
const KID_LINE_MAX = 40;
/** 孩子的建議最多幾個 */
const KID_TIPS_MAX = 3;

/** 一個孩子的匿名統計（只拿指標統計與遊玩紀錄的日期；label 回傳指標的條文） */
export function studentInput(p: { indicators: IndicatorMap; history: { date: string }[] }, now: Date, label: (key: string) => string): StudentInput {
  const since = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const days = new Set(p.history.map((h) => h.date.slice(0, 10)).filter((d) => d > since));
  return {
    areas: areaStats(p.indicators).map((s) => ({ id: s.area, label: areaLabel(s.area), rate: s.rate, attempts: s.attempts })),
    weak: weakIndicators(p.indicators).map((w) => ({ key: w.key, label: label(w.key), rate: w.rate, attempts: w.attempts })),
    sessions: p.history.length,
    activeDays: days.size,
  };
}

/** 全班的匿名統計（每個孩子一份指標統計，不帶名字） */
export function classInput(list: IndicatorMap[], label: (key: string) => string): ClassInput {
  return {
    students: list.length,
    areas: classAreaStats(list).map((s) => ({ id: s.area, label: areaLabel(s.area), rate: s.rate, students: s.students })),
    weak: classWeakIndicators(list).map((w) => ({ key: w.key, label: label(w.key), rate: w.rate, attempts: w.attempts, students: w.students })),
  };
}

/** 面向的名稱 */
function areaLabel(id: AreaId): string {
  return LEARNING_AREAS.find((a) => a.id === id)!.label;
}

/** 資料夠不夠呼叫 AI：孩子至少一個面向算數；老師要有弱項指標可以談 */
export function analysisReady(input: AnalysisInput): boolean {
  if (input.kind === 'teacherClass') return input.class.weak.length > 0;
  if (input.kind === 'teacherStudent') return input.student.weak.length > 0;
  return input.student.areas.some((a) => a.rate !== null);
}

/** strict 子集的字串陣列 */
const strings = { type: 'array', items: { type: 'string' } };

/** 給模型的 JSON Schema（Muse 的 strict 子集）；孩子的建議只能指到面向，老師的重點只能指到送去的弱項指標 */
export function analysisSchema(input: AnalysisInput): Record<string, unknown> {
  if (input.kind === 'kid') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        cheer: { type: 'string' },
        tips: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { area: { type: 'string', enum: LEARNING_AREAS.map((a) => a.id) }, text: { type: 'string' } },
            required: ['area', 'text'],
          },
        },
        parentSummary: { type: 'string' },
        parentTips: strings,
      },
      required: ['cheer', 'tips', 'parentSummary', 'parentTips'],
    };
  }
  const weak = input.kind === 'teacherClass' ? input.class.weak : input.student.weak;
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      strengths: strings,
      focus: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { indicator: { type: 'string', enum: weak.map((w) => w.key) }, reason: { type: 'string' } },
          required: ['indicator', 'reason'],
        },
      },
      tips: strings,
    },
    required: ['summary', 'strengths', 'focus', 'tips'],
  };
}

/** 百分比文字 */
const pct = (r: number | null) => (r === null ? '練習太少' : `${Math.round(r * 100)}%`);

/** 面向的文字（一行一個）：孩子帶作答題數，全班帶孩子數 */
function areaLines(areas: AreaLine[]): string[] {
  return areas.map((a) => `- ${a.label}（${a.id}）：一次答對率 ${pct(a.rate)}，${a.students !== undefined ? `作答夠多的孩子 ${a.students} 人` : `作答 ${a.attempts ?? 0} 題`}`);
}

/** 弱項指標的文字 */
function weakLines(weak: WeakLine[]): string[] {
  return weak.map((w) => `- ${w.key}（${w.label}）：一次答對率 ${pct(w.rate)}，作答 ${w.attempts} 題${w.students !== undefined ? `，${w.students} 個孩子練過` : ''}`);
}

/** 給孩子與家長的系統提示 */
const KID_SYSTEM = [
  '你是台灣國小二年級的學習夥伴，看孩子在學習遊戲裡的作答統計，寫鼓勵與建議，輸出 JSON。',
  '- cheer：給孩子的一句鼓勵（25 字內），說出他做得好的地方；二年級看得懂、用正體字。',
  '- tips：給孩子的 1～3 個建議，每個指到一個面向（area），一句話一個具體動作（例如「去數學城堡練習看時鐘」），25 字內。',
  '- 遊戲裡的地方只有這些，不要編別的名字：注音、識字、閱讀在「文字森林」；計算、量與時間、圖形統計在「數學城堡」；字母、英語單字在「ABC 海灘」；生活在「生活村」。',
  '- 只鼓勵，不比較同學、不說誰最差、不貼標籤（不要說笨、很弱、落後）；練習太少的面向可以邀請孩子去試試看。',
  '- parentSummary：給家長的摘要（100 字內），說孩子的強項與要加強的地方。',
  '- parentTips：給家長的 1～4 個在家陪練建議，具體、溫和、不給壓力。',
  '- 只根據提供的統計，不要編造沒有的資料。',
].join('\n');

/** 給老師的系統提示 */
const TEACHER_SYSTEM = [
  '你是台灣國小二年級老師的教學助理，看學習遊戲的作答統計，給老師教學建議，輸出 JSON。',
  '- summary：2～3 句摘要（150 字內）。',
  '- strengths：1～4 個強項。',
  '- focus：1～5 個要加強的課綱指標（indicator 只能從弱項指標裡選），reason 說明原因（引用答對率）。',
  '- tips：1～5 個具體的教學建議（課堂活動、教具、分組、回家作業），符合二年級。',
  '- 一次答對率是第一次作答就答對的比例；作答題數少的結論要保守。只根據提供的統計，不要編造。',
].join('\n');

/** 組出給模型的提示 */
export function buildAnalysisPrompt(input: AnalysisInput): { system: string; user: string } {
  if (input.kind === 'teacherClass') {
    const c = input.class;
    return {
      system: TEACHER_SYSTEM,
      user: [`全班 ${c.students} 個孩子。`, '', '各面向（全班平均的一次答對率）：', ...areaLines(c.areas), '', '弱項指標（全班合計）：', ...weakLines(c.weak)].join('\n'),
    };
  }
  const s = input.student;
  const head = [`玩過 ${s.sessions} 回合，最近 14 天有 ${s.activeDays} 天有玩。`, '', '各面向：', ...areaLines(s.areas), '', '弱項指標：', ...(s.weak.length ? weakLines(s.weak) : ['- （還沒有）'])];
  if (input.kind === 'kid') return { system: KID_SYSTEM, user: head.join('\n') };
  return {
    system: TEACHER_SYSTEM.replace('看學習遊戲的作答統計', '看班上一個孩子在學習遊戲的作答統計'),
    user: [...head, '', '全班平均（參考）：', ...input.classAreas.map((a) => `- ${a.label}：${pct(a.rate)}`)].join('\n'),
  };
}

/** 給孩子（與家長）的句子不能出現的字：比較與貼標籤 */
const UNSAFE = /同學|別人|別的小朋友|其他小朋友|落後|最差|比較差|很差|太差|笨|不聰明|不夠聰明|很弱|太弱|丟臉|失敗/;

/** 這句話能不能給孩子看 */
export function kidSafe(text: string): boolean {
  return !UNSAFE.test(text);
}

/** 截短到 max 字（超過就截斷，結尾不補字） */
const clip = (s: string, max: number) => [...s.trim()].slice(0, max).join('');

/** 模型回的孩子分析 */
const rawKidSchema = z.object({
  cheer: z.string(),
  tips: z.array(z.object({ area: z.string(), text: z.string() })),
  parentSummary: z.string(),
  parentTips: z.array(z.string()),
});
/** 模型回的老師分析 */
const rawTeacherSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  focus: z.array(z.object({ indicator: z.string(), reason: z.string() })),
  tips: z.array(z.string()),
});

/**
 * 把模型的回應轉成分析結果並檢查；不合格（格式錯、孩子的鼓勵不能用、孩子的建議一個都不剩、老師的摘要空白）回 null，
 * 呼叫的地方改用規則建議或回報失敗
 */
export function convertAnalysis(input: AnalysisInput, raw: unknown): AnalysisReport | null {
  if (input.kind === 'kid') {
    const r = rawKidSchema.safeParse(raw);
    if (!r.success) return null;
    const cheer = r.data.cheer.trim();
    if (!cheer || [...cheer].length > KID_LINE_MAX || !kidSafe(cheer)) return null;
    const ids = new Set<string>(LEARNING_AREAS.map((a) => a.id));
    const seen = new Set<string>();
    const tips: KidReport['tips'] = [];
    for (const t of r.data.tips) {
      const text = t.text.trim();
      if (!ids.has(t.area) || seen.has(t.area) || !text || [...text].length > KID_LINE_MAX || !kidSafe(text)) continue;
      seen.add(t.area);
      tips.push({ area: t.area as AreaId, text });
      if (tips.length >= KID_TIPS_MAX) break;
    }
    if (!tips.length) return null;
    const parentSummary = kidSafe(r.data.parentSummary) ? clip(r.data.parentSummary, 200) : '';
    const parentTips = r.data.parentTips.map((t) => t.trim()).filter((t) => t && kidSafe(t)).map((t) => clip(t, 80)).slice(0, 4);
    return { kind: 'kid', cheer, tips, parentSummary, parentTips };
  }
  const r = rawTeacherSchema.safeParse(raw);
  if (!r.success) return null;
  const summary = clip(r.data.summary, 300);
  if (!summary) return null;
  const weak = new Set((input.kind === 'teacherClass' ? input.class.weak : input.student.weak).map((w) => w.key));
  const seen = new Set<string>();
  const focus = r.data.focus
    .filter((f) => weak.has(f.indicator) && !seen.has(f.indicator) && seen.add(f.indicator))
    .map((f) => ({ indicator: f.indicator, reason: clip(f.reason, 120) }))
    .slice(0, 5);
  const list = (xs: string[], n: number, max: number) => xs.map((x) => x.trim()).filter(Boolean).map((x) => clip(x, max)).slice(0, n);
  return { kind: input.kind, summary, strengths: list(r.data.strengths, 4, 80), focus, tips: list(r.data.tips, 5, 100) };
}

/** 作答數的級距（指紋用）：0、1～4、5～19、20～49、50～99、100 以上 */
function band(n: number): number {
  return [0, 1, 5, 20, 50, 100].filter((b) => n >= b).length;
}
/** 答對率以 5% 為一級（指紋用） */
const bucket = (r: number | null) => (r === null ? -1 : Math.round(r * 20));

/** 快取用的指紋：送給 AI 的統計分桶後的雜湊（多答對一題通常不變，弱項面向跨過一級就變） */
export function analysisFingerprint(input: AnalysisInput): string {
  const areas = (a: AreaLine[]) => a.map((x) => [x.id, bucket(x.rate), band(x.attempts ?? x.students ?? 0)]);
  const weak = (w: WeakLine[]) => w.map((x) => [x.key, bucket(x.rate), band(x.attempts)]);
  const shape =
    input.kind === 'teacherClass'
      ? [input.kind, input.class.students, areas(input.class.areas), weak(input.class.weak)]
      : [input.kind, areas(input.student.areas), weak(input.student.weak), band(input.student.sessions), band(input.student.activeDays), input.kind === 'teacherStudent' ? areas(input.classAreas) : null];
  return hashString(JSON.stringify(shape)).toString(36);
}
