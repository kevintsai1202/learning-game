/**
 * 老師 AI 出題的純函式（docs/plans/ai-questions.md 第 4 節）：請求格式、給模型的 JSON Schema、提示、算式、
 * 以及把模型回應轉成題目並檢查（不合格的丟掉、可疑的標提醒）。
 */
import { describe, expect, it } from 'vitest';
import {
  AI_MAX_PER_CALL,
  AI_SOURCE,
  aiOutputSchema,
  aiRequestSchema,
  buildAiPrompt,
  convertAiOutput,
  evalExpression,
  type AiRequest,
} from '../../src/content/aiQuestions';
import { questionSchema } from '../../src/content/schema';

/** 測試用的請求：數學十十乘法＋生活上下學安全，三種題型都可以 */
const req: AiRequest = {
  indicators: ['math:N-2-7', 'life:Ba-Ⅰ-1'],
  count: 5,
  types: ['choice', 'number', 'order'],
  difficulty: 2,
};

/** 模型回的一題（欄位都要有，用不到的是 null） */
function raw(over: Record<string, unknown>) {
  return {
    indicator: 'math:N-2-7',
    type: 'number',
    prompt: '一盒有 4 枝筆，3 盒有幾枝？',
    speak: null,
    options: null,
    answerIndex: null,
    answerNumber: 12,
    unit: '枝',
    expression: '4×3',
    answerOrder: null,
    explain: '每盒 4 枝，有 3 盒，4×3＝12。',
    ...over,
  };
}

const opts = { seed: 7, idPrefix: 'ai-x' };

describe('aiRequestSchema', () => {
  it('接受合理的請求', () => {
    expect(aiRequestSchema.safeParse(req).success).toBe(true);
    expect(aiRequestSchema.safeParse({ ...req, note: '主題：中秋節', avoid: ['舊題目'] }).success).toBe(true);
  });

  it('擋下題數超過、沒有指標、指標格式錯、題型不支援', () => {
    expect(aiRequestSchema.safeParse({ ...req, count: AI_MAX_PER_CALL + 1 }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, indicators: [] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, indicators: ['N-2-7'] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, types: ['clock'] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...req, note: '字'.repeat(301) }).success).toBe(false);
  });
});

/** 走訪 JSON Schema：每個物件都要 additionalProperties: false，required 列出全部屬性（Muse 的 strict 子集） */
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

describe('aiOutputSchema', () => {
  it('指標只能選老師勾的，並符合 strict 子集', () => {
    const s = aiOutputSchema(req.indicators) as { properties: { questions: { items: { properties: { indicator: { enum: string[] } } } } } };
    expect(s.properties.questions.items.properties.indicator.enum).toEqual(req.indicators);
    assertStrict(s);
  });
});

describe('buildAiPrompt', () => {
  it('系統提示寫明讀者與出題邊界，使用者訊息帶指標條文、題數、題型、難度與補充說明', () => {
    const p = buildAiPrompt({ ...req, note: '主題：中秋節', avoid: ['小明有 3 盒餅乾'] }, (k) => (k === 'math:N-2-7' ? '十十乘法' : '安全須知'));
    expect(p.system).toContain('二年級');
    expect(p.system).toContain('正體');
    expect(p.system).toContain('每份數量');
    expect(p.user).toContain('math:N-2-7');
    expect(p.user).toContain('十十乘法');
    expect(p.user).toContain('life:Ba-Ⅰ-1');
    expect(p.user).toContain('5');
    expect(p.user).toContain('單選');
    expect(p.user).toContain('中秋節');
    expect(p.user).toContain('小明有 3 盒餅乾');
  });
});

describe('evalExpression', () => {
  it('算得出加減乘除與括號（含全形與 x）', () => {
    expect(evalExpression('4×3')).toBe(12);
    expect(evalExpression('7 x 8')).toBe(56);
    expect(evalExpression('(3+5)×2')).toBe(16);
    expect(evalExpression('12÷3')).toBe(4);
    expect(evalExpression('25 - 7')).toBe(18);
    expect(evalExpression('２＋３')).toBe(5);
    expect(evalExpression('2+3×4')).toBe(14);
  });

  it('不是算式或算不出來回 null', () => {
    expect(evalExpression('1+')).toBeNull();
    expect(evalExpression('alert(1)')).toBeNull();
    expect(evalExpression('10÷0')).toBeNull();
    expect(evalExpression('')).toBeNull();
    expect(evalExpression('3 盒')).toBeNull();
  });
});

describe('convertAiOutput', () => {
  it('數字題：伺服器填 id、科目、技能、出處，只讀數字題的欄位', () => {
    const r = convertAiOutput({ questions: [raw({ tokens: ['12'], options: [{ text: 'x', emoji: null }] })] }, req, opts);
    expect(r.dropped).toEqual([]);
    expect(r.drafts).toHaveLength(1);
    const q = r.drafts[0].question;
    expect(q).toMatchObject({ id: 'ai-x-1', type: 'number', subject: 'math', skill: 'math.class', indicators: ['N-2-7'], answer: 12, unit: '枝', source: AI_SOURCE, difficulty: 2 });
    expect('options' in q).toBe(false);
    expect(questionSchema.safeParse(q).success).toBe(true);
  });

  it('數字題：算式和答案對不上、題目本身的算式算錯、沒有答案都丟掉', () => {
    const r = convertAiOutput(
      {
        questions: [
          raw({ answerNumber: 13 }),
          raw({ prompt: '7 × 8 = ?', expression: null, answerNumber: 54 }),
          raw({ answerNumber: null }),
        ],
      },
      req,
      opts,
    );
    expect(r.drafts).toHaveLength(0);
    expect(r.dropped).toHaveLength(3);
    expect(r.dropped[0]).toContain('第 1 題');
    expect(r.dropped[0]).toContain('算式');
    expect(r.dropped[1]).toContain('算式');
  });

  it('單選題：選項打亂後答案仍指向同一個選項，沒有 emoji 的不留欄位', () => {
    const options = [
      { text: '排隊輪流玩', emoji: '🛝' },
      { text: '推擠朋友', emoji: null },
      { text: '往上跑', emoji: '🏃' },
      { text: '站在頂端跳下', emoji: '🤸' },
    ];
    const r = convertAiOutput(
      { questions: [raw({ indicator: 'life:Ba-Ⅰ-1', type: 'choice', prompt: '哪一個做法最安全？', options, answerIndex: 0, answerNumber: null, expression: null, unit: null })] },
      req,
      opts,
    );
    const q = r.drafts[0].question;
    if (q.type !== 'choice') throw new Error('應該是單選題');
    expect(q.subject).toBe('life');
    expect(q.options[q.answer].text).toBe('排隊輪流玩');
    expect(q.options.map((o) => o.text).sort()).toEqual(options.map((o) => o.text).sort());
    const pushing = q.options.find((o) => o.text === '推擠朋友')!;
    expect('emoji' in pushing).toBe(false);
  });

  it('單選題：選項重複、答案索引超出範圍都丟掉', () => {
    const base = { indicator: 'life:Ba-Ⅰ-1', type: 'choice', answerNumber: null, expression: null, unit: null };
    const r = convertAiOutput(
      {
        questions: [
          raw({ ...base, options: [{ text: '走斑馬線', emoji: null }, { text: '走斑馬線', emoji: null }], answerIndex: 0 }),
          raw({ ...base, options: [{ text: '甲', emoji: null }, { text: '乙', emoji: null }], answerIndex: 2 }),
        ],
      },
      req,
      opts,
    );
    expect(r.drafts).toHaveLength(0);
    expect(r.dropped[0]).toContain('選項重複');
    expect(r.dropped[1]).toContain('答案');
  });

  it('排序題：只拿正確順序，由伺服器打亂成詞卡', () => {
    const answerOrder = ['我', '每天', '走路', '上學'];
    const r = convertAiOutput(
      { questions: [raw({ indicator: 'life:Ba-Ⅰ-1', type: 'order', prompt: '排成句子', answerOrder, answerNumber: null, expression: null, unit: null })] },
      req,
      opts,
    );
    const q = r.drafts[0].question;
    if (q.type !== 'order') throw new Error('應該是排序題');
    expect(q.answer).toEqual(answerOrder);
    expect([...q.tokens].sort()).toEqual([...answerOrder].sort());
    expect(q.tokens).not.toEqual(answerOrder);
  });

  it('指標或題型不在老師選的範圍裡就丟掉', () => {
    const r = convertAiOutput({ questions: [raw({ indicator: 'math:N-2-2' })] }, { ...req, types: ['number'] }, opts);
    expect(r.dropped[0]).toContain('指標');
    const r2 = convertAiOutput({ questions: [raw({})] }, { ...req, types: ['choice'] }, opts);
    expect(r2.dropped[0]).toContain('題型');
  });

  it('注音字型沒有的字標提醒，題目照樣留下', () => {
    const r = convertAiOutput({ questions: [raw({ prompt: '一串鑰匙有 4 支，3 串有幾支？', expression: '4×3' })] }, req, {
      ...opts,
      hasZhuyin: (ch) => ch !== '鑰',
    });
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].warnings.join()).toContain('鑰');
  });

  it('朗讀文字和題目一樣時不留（省得兩份不同步）', () => {
    const r = convertAiOutput({ questions: [raw({ speak: '一盒有 4 枝筆，3 盒有幾枝？' })] }, req, opts);
    expect('speak' in r.drafts[0].question).toBe(false);
    const r2 = convertAiOutput({ questions: [raw({ prompt: '4 × 3 = ?', speak: '4 乘以 3 等於多少？', expression: '4×3' })] }, req, opts);
    expect(r2.drafts[0].question.speak).toBe('4 乘以 3 等於多少？');
  });

  it('數字題的解說裡有算式，卻沒有一個算得出答案：標提醒', () => {
    const wrong = convertAiOutput({ questions: [raw({ prompt: '每排 4 人，5 排有幾人？', answerNumber: 20, expression: '4×5', explain: '每排4個人，5排就是4乘以3，一共20人。' })] }, req, opts);
    expect(wrong.drafts[0].warnings.join()).toContain('解說');
    const right = convertAiOutput({ questions: [raw({ prompt: '每排 4 人，5 排有幾人？', answerNumber: 20, expression: '4×5', explain: '每排 4 人，5 排就是 4×5＝20。' })] }, req, opts);
    expect(right.drafts[0].warnings).toEqual([]);
  });

  it('回應格式不對時整批丟掉；多出來的題目只取要的題數', () => {
    expect(convertAiOutput({ questions: 'x' }, req, opts)).toEqual({ drafts: [], dropped: ['AI 回應的格式不對，請再試一次'] });
    const many = Array.from({ length: 4 }, () => raw({}));
    expect(convertAiOutput({ questions: many }, { ...req, count: 2 }, opts).drafts).toHaveLength(2);
  });
});
