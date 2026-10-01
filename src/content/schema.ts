/**
 * 題目 JSON 格式的驗證規則（zod）。
 * 用在兩個地方：家長匯入自訂題庫時檢查格式、內建題庫的單元測試。
 * 錯誤訊息用中文，匯入失敗時直接顯示給家長看。
 */
import { z } from 'zod';
import type { Question } from '../core/types';

export const subjectSchema = z.enum(['zh', 'math', 'en', 'life']);
const speakLang = z.enum(['zh-TW', 'en-US']);
export const shapeSchema = z.enum(['triangle', 'square', 'rectangle', 'circle', 'cube', 'cuboid', 'cylinder', 'cone', 'sphere']);
const int = z.number().int();

/** 題目附圖 */
export const visualSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('emoji'), emoji: z.string().min(1), count: int.min(0).max(100), groups: int.min(1).max(20).optional() }),
  z.object({ kind: z.literal('clock'), hour: int.min(0).max(12), minute: int.min(0).max(59) }),
  z.object({ kind: z.literal('vertical'), a: int, b: int, op: z.enum(['+', '-', '×']) }),
  z.object({ kind: z.literal('money'), items: z.array(int.positive()).min(1).max(30) }),
  z.object({ kind: z.literal('ruler'), start: z.number().min(0), end: z.number().min(0), item: z.string() }),
  z.object({ kind: z.literal('fraction'), parts: int.min(2).max(12), shaded: int.min(0), shape: z.enum(['pizza', 'bar']) }),
  z.object({ kind: z.literal('shape'), shape: shapeSchema }),
  z.object({ kind: z.literal('bigtext'), text: z.string().min(1).max(20), lang: speakLang.optional() }),
  z.object({
    kind: z.literal('chart'),
    rows: z.array(z.object({ label: z.string(), emoji: z.string(), count: int.min(0).max(50) })).min(1).max(8),
  }),
  z.object({ kind: z.literal('calendar'), year: int, month: int.min(1).max(12), highlight: int.min(1).max(31).optional() }),
  z.object({ kind: z.literal('bins'), item: z.string().min(1).max(20), name: z.string().min(1).max(30) }),
  z.object({ kind: z.literal('passage'), title: z.string().max(30).optional(), text: z.string().min(1).max(400) }),
]);

/** 單選題的選項：文字、emoji、圖形至少一個 */
const optionSchema = z
  .object({
    text: z.string().max(60).optional(),
    emoji: z.string().max(20).optional(),
    shape: shapeSchema.optional(),
    speak: z.string().max(200).optional(),
    speakLang: speakLang.optional(),
  })
  .refine((o) => !!(o.text || o.emoji || o.shape), { message: '選項至少要有文字、emoji 或圖形其中一個' });

/** 所有題型共同欄位 */
const base = {
  id: z.string().min(1, '缺少題目 id').max(200),
  subject: subjectSchema,
  skill: z.string().min(1, '缺少技能 skill'),
  indicators: z.array(z.string().max(30)).max(10),
  prompt: z.string().min(1, '缺少題目文字 prompt').max(500),
  speak: z.string().max(500).optional(),
  speakLang: speakLang.optional(),
  explain: z.string().max(500).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  source: z.string().max(300).optional(),
  visual: visualSchema.optional(),
};

/** 單題驗證規則（含跨欄位檢查：答案索引不可超出選項、排序題詞卡要一致） */
export const questionSchema = z
  .discriminatedUnion('type', [
    z.object({ ...base, type: z.literal('choice'), options: z.array(optionSchema).min(2, '至少要 2 個選項').max(6), answer: int.min(0) }),
    z.object({ ...base, type: z.literal('number'), answer: z.number(), unit: z.string().max(10).optional() }),
    z.object({ ...base, type: z.literal('order'), tokens: z.array(z.string().min(1)).min(2).max(12), answer: z.array(z.string().min(1)).min(2).max(12) }),
    z.object({ ...base, type: z.literal('clock'), hour: int.min(1).max(12), minute: int.min(0).max(59), step: int.min(1).max(60) }),
    z.object({ ...base, type: z.literal('money'), amount: int.positive().max(10000), denominations: z.array(int.positive()).min(1) }),
    z.object({ ...base, type: z.literal('write'), target: z.string().min(1).max(4), script: z.enum(['hanzi', 'zhuyin', 'latin']) }),
  ])
  .superRefine((q, ctx) => {
    if (q.type === 'choice' && q.answer >= q.options.length) {
      ctx.addIssue({ code: 'custom', message: `答案索引 ${q.answer} 超出選項數量 ${q.options.length}`, path: ['answer'] });
    }
    if (q.type === 'order') {
      const sorted = (a: string[]) => [...a].sort().join('\u0000');
      if (sorted(q.tokens) !== sorted(q.answer)) {
        ctx.addIssue({ code: 'custom', message: '排序題的 tokens 與 answer 內容不一致', path: ['answer'] });
      }
    }
  });

/** 題庫包：家長或老師可匯入的 JSON 檔 */
export const contentPackSchema = z.object({
  format: z.literal('learning-island-pack', { message: 'format 必須是 "learning-island-pack"' }),
  version: z.literal(1),
  title: z.string().min(1, '缺少題庫名稱 title').max(60),
  author: z.string().max(60).optional(),
  description: z.string().max(300).optional(),
  questions: z.array(questionSchema).min(1, '題庫至少要有 1 題').max(2000),
});

export type ContentPack = z.infer<typeof contentPackSchema>;

/** 把 zod 錯誤整理成家長看得懂的中文訊息（最多列 8 條） */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((i) => {
    const where = i.path.length ? `第 ${i.path.map(String).join(' › ')} 欄` : '整份檔案';
    return `${where}：${i.message}`;
  });
}

/** 驗證單題，成功回傳題目，失敗回傳錯誤訊息 */
export function parseQuestion(raw: unknown): { ok: true; question: Question } | { ok: false; errors: string[] } {
  const r = questionSchema.safeParse(raw);
  return r.success ? { ok: true, question: r.data as Question } : { ok: false, errors: formatIssues(r.error) };
}
