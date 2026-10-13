/**
 * AI 學習分析（docs/plans/learning-report.md 第 3 節）：送給 AI 的匿名統計、strict Schema、提示、
 * 轉換與檢查（給孩子的內容過濾）、快取用的指紋。
 */
import { describe, expect, it } from 'vitest';
import {
  analysisFingerprint,
  analysisReady,
  analysisSchema,
  buildAnalysisPrompt,
  classInput,
  convertAnalysis,
  kidSafe,
  studentInput,
  type AnalysisInput,
} from '../../src/content/aiAnalysis';
import { indicatorLabel } from '../../src/content/indicators';
import type { IndicatorMap } from '../../src/content/learningAreas';

const st = (a: number, f: number) => ({ attempts: a, firstTry: f });
const NOW = new Date('2026-10-13T10:00:00+08:00');
/** 一個孩子：十十乘法很好、時鐘很弱、注音普通 */
const INDICATORS: IndicatorMap = { 'math:N-2-7': st(20, 18), 'math:N-2-13': st(10, 3), 'zh:Aa-Ⅰ-2': st(10, 6) };
const PROFILE = {
  name: '小美',
  indicators: INDICATORS,
  history: [
    { date: '2026-10-13' },
    { date: '2026-10-12' },
    { date: '2026-10-12' },
    { date: '2026-09-01' },
  ],
};
const label = (k: string) => indicatorLabel(k);
const kidInput = (): AnalysisInput => ({ kind: 'kid', student: studentInput(PROFILE, NOW, label) });

/** strict 子集：每個物件 additionalProperties: false、required 列出全部屬性 */
function assertStrict(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.type === 'object') {
    expect(n.additionalProperties).toBe(false);
    expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
  }
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach(assertStrict);
    else assertStrict(v);
  }
}

describe('送給 AI 的統計', () => {
  it('孩子：各面向的答對率與作答數、弱項指標（含條文）、作答回合數、最近 14 天玩了幾天；沒有名字', () => {
    const s = studentInput(PROFILE, NOW, label);
    expect(s.sessions).toBe(4);
    expect(s.activeDays).toBe(2);
    expect(s.areas.find((a) => a.id === 'number')).toMatchObject({ label: '計算', rate: 0.9, attempts: 20 });
    expect(s.weak[0]).toMatchObject({ key: 'math:N-2-13', label: '鐘面的時刻', attempts: 10 });
    expect(JSON.stringify(s)).not.toContain('小美');
  });

  it('全班：人數、各面向的平均與孩子數、合計的弱項指標', () => {
    const c = classInput([INDICATORS, { 'math:N-2-13': st(6, 1) }], label);
    expect(c.students).toBe(2);
    expect(c.areas.find((a) => a.id === 'measure')).toMatchObject({ students: 2 });
    expect(c.weak[0]).toMatchObject({ key: 'math:N-2-13', students: 2 });
  });

  it('資料不夠（沒有任何面向算數、全班沒有弱項指標）時不呼叫 AI', () => {
    expect(analysisReady(kidInput())).toBe(true);
    expect(analysisReady({ kind: 'kid', student: studentInput({ indicators: { 'math:N-2-7': st(2, 2) }, history: [] }, NOW, label) })).toBe(false);
    expect(analysisReady({ kind: 'teacherClass', class: classInput([{ 'math:N-2-7': st(2, 2) }], label) })).toBe(false);
  });
});

describe('analysisSchema 與提示', () => {
  it('三種都符合 strict 子集；孩子的建議只能指到面向，老師的重點只能指到送去的弱項指標', () => {
    const kid = analysisSchema(kidInput()) as any;
    assertStrict(kid);
    expect(kid.properties.tips.items.properties.area.enum).toContain('measure');
    const teacher = analysisSchema({ kind: 'teacherClass', class: classInput([INDICATORS], label) }) as any;
    assertStrict(teacher);
    expect(teacher.properties.focus.items.properties.indicator.enum).toEqual(['math:N-2-13', 'zh:Aa-Ⅰ-2', 'math:N-2-7']);
  });

  it('孩子的提示：二年級、只鼓勵、不比較；帶面向的百分比；老師看單一孩子時附全班平均', () => {
    const p = buildAnalysisPrompt(kidInput());
    expect(p.system).toContain('二年級');
    expect(p.system).toContain('不比較');
    // 遊戲裡建築的名稱（實測 AI 會編出「故事森林」）
    expect(p.system).toContain('文字森林');
    expect(p.system).toContain('ABC 海灘');
    expect(p.user).toContain('量與時間');
    expect(p.user).toContain('30%');
    expect(p.user).not.toContain('小美');
    const t = buildAnalysisPrompt({ kind: 'teacherStudent', student: studentInput(PROFILE, NOW, label), classAreas: classInput([INDICATORS], label).areas });
    expect(t.system).toContain('老師');
    // 正式環境實測老師的分析出現簡體字（巩固），提示要寫明正體字
    expect(t.system).toContain('正體');
    expect(t.user).toContain('全班平均');
  });
});

describe('kidSafe', () => {
  it('擋下比較與貼標籤的字', () => {
    expect(kidSafe('多練習時鐘，你一定會越來越厲害！')).toBe(true);
    expect(kidSafe('你比同學慢一點')).toBe(false);
    expect(kidSafe('時鐘是你最差的')).toBe(false);
    expect(kidSafe('不要覺得自己笨')).toBe(false);
  });
});

describe('convertAnalysis', () => {
  const raw = {
    cheer: '你的十十乘法好棒！',
    tips: [
      { area: 'measure', text: '去數學城堡練習看時鐘吧！' },
      { area: 'measure', text: '重複的面向不要' },
      { area: 'zhuyin', text: '你比同學還要慢' },
      { area: 'life', text: '這一句太長了'.repeat(10) },
    ],
    parentSummary: '孩子的乘法很穩，時鐘還需要多練。',
    parentTips: ['在家看時鐘時問孩子現在幾點'],
  };

  it('孩子：留下合格的建議（面向不重複、沒有比較的字、不超過 40 字）', () => {
    const r = convertAnalysis(kidInput(), raw);
    expect(r).toMatchObject({ kind: 'kid', cheer: '你的十十乘法好棒！', tips: [{ area: 'measure', text: '去數學城堡練習看時鐘吧！' }] });
    if (r?.kind === 'kid') expect(r.parentTips).toEqual(['在家看時鐘時問孩子現在幾點']);
  });

  it('孩子：鼓勵不合格或一個建議都不剩就回 null（改用規則建議）', () => {
    expect(convertAnalysis(kidInput(), { ...raw, cheer: '你是最差的' })).toBeNull();
    expect(convertAnalysis(kidInput(), { ...raw, tips: [raw.tips[2]] })).toBeNull();
    expect(convertAnalysis(kidInput(), { nope: 1 })).toBeNull();
  });

  it('老師：重點只留送去的弱項指標、不重複', () => {
    const input: AnalysisInput = { kind: 'teacherClass', class: classInput([INDICATORS], label) };
    const r = convertAnalysis(input, {
      summary: '全班乘法穩定，時鐘偏弱。',
      strengths: ['十十乘法'],
      focus: [
        { indicator: 'math:N-2-13', reason: '一次答對率 30%' },
        { indicator: 'math:N-2-13', reason: '重複' },
        { indicator: 'math:N-2-2', reason: '沒送去的' },
      ],
      tips: ['用教具鐘帶全班撥時鐘'],
    });
    expect(r).toMatchObject({ kind: 'teacherClass', focus: [{ indicator: 'math:N-2-13', reason: '一次答對率 30%' }] });
  });
});

describe('analysisFingerprint', () => {
  it('多答對一題通常不變；弱項面向跨過 50% 就變', () => {
    const base = analysisFingerprint(kidInput());
    const oneMore = analysisFingerprint({ kind: 'kid', student: studentInput({ ...PROFILE, indicators: { ...INDICATORS, 'math:N-2-7': st(21, 19) } }, NOW, label) });
    expect(oneMore).toBe(base);
    const crossed = analysisFingerprint({ kind: 'kid', student: studentInput({ ...PROFILE, indicators: { ...INDICATORS, 'math:N-2-13': st(10, 6) } }, NOW, label) });
    expect(crossed).not.toBe(base);
  });
});
