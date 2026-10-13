/**
 * 班級題庫編輯器（G6，docs/plans/ai-questions.md 第 2 節；docs/plans/teacher-gm.md 第 7.3 節）的純函式：
 * 課綱指標分組（勾選用）、空白題目、選指標換科目、存檔前整理題目、組成題庫包、AI 分批。
 * 編輯中的題目允許空白（還沒填完），存檔前才用題庫格式（questionSchema）檢查。
 */
import type { ChoiceQuestion, Question, SubjectId } from '../core/types';
import { createRng } from '../core/rng';
import { INDICATORS } from '../content/indicators';
import { contentPackSchema, formatIssues, questionSchema, type ContentPack } from '../content/schema';
import { AI_MAX_PER_CALL } from '../content/aiQuestions';

/** 老師手動編的題目預設的出處 */
export const MANUAL_SOURCE = '班級自編';
/** 編輯器支援的題型（和 teacher-gm 第 7.2 節的第一版一致） */
export const EDITOR_TYPES = ['choice', 'number', 'order', 'write'] as const;
export type EditorType = (typeof EDITOR_TYPES)[number];
export const EDITOR_TYPE_LABELS: Record<EditorType, string> = { choice: '單選題', number: '數字題', order: '排序題', write: '描寫題' };

/** 科目順序與名稱（指標分組用） */
const SUBJECTS: { subject: SubjectId; label: string }[] = [
  { subject: 'math', label: '數學' },
  { subject: 'zh', label: '國語' },
  { subject: 'en', label: '英語' },
  { subject: 'life', label: '生活與健康' },
];

/** 一科的課綱指標 */
export interface IndicatorGroup {
  subject: SubjectId;
  label: string;
  items: { key: string; code: string; text: string }[];
}

/** 課綱指標依科目分組（src/content/indicators.ts 的總表，鍵是「科目:代碼」） */
export function indicatorGroups(): IndicatorGroup[] {
  return SUBJECTS.map(({ subject, label }) => ({
    subject,
    label,
    items: Object.entries(INDICATORS)
      .filter(([key]) => key.startsWith(`${subject}:`))
      .map(([key, text]) => ({ key, code: key.slice(subject.length + 1), text })),
  }));
}

/** 一題空白的題目（還沒填，存檔前要補完） */
export function newQuestion(type: EditorType, opts: { id: string; subject?: SubjectId; indicators?: string[] }): Question {
  const subject = opts.subject ?? 'math';
  const base = { id: opts.id, subject, skill: `${subject}.class`, indicators: opts.indicators ?? [], prompt: '', source: MANUAL_SOURCE };
  if (type === 'choice') return { ...base, type, options: [{ text: '' }, { text: '' }, { text: '' }], answer: 0 };
  if (type === 'number') return { ...base, type, answer: 0 };
  if (type === 'order') return { ...base, type, tokens: [], answer: ['', '', ''] };
  return { ...base, type, target: '', script: 'hanzi' };
}

/** 換題目的課綱指標：科目跟著第一個指標，代碼只留同一科的；沒有指標時科目不變 */
export function withIndicators(q: Question, keys: string[]): Question {
  if (!keys.length) return { ...q, indicators: [] };
  const subject = keys[0].slice(0, keys[0].indexOf(':')) as SubjectId;
  const codes = keys.filter((k) => k.startsWith(`${subject}:`)).map((k) => k.slice(subject.length + 1));
  return { ...q, subject, skill: `${subject}.class`, indicators: codes };
}

/** 題目現在的課綱指標鍵（勾選框用） */
export function indicatorKeysOf(q: Question): string[] {
  return q.indicators.map((code) => `${q.subject}:${code}`);
}

/** 去頭尾空白；空字串拿掉這個欄位 */
function optionalText<K extends string>(key: K, v: string | undefined): Partial<Record<K, string>> {
  const t = v?.trim();
  return (t ? { [key]: t } : {}) as Partial<Record<K, string>>;
}

/**
 * 存檔前整理一題：去頭尾空白、拿掉空的選項（答案位置跟著移）、排序題用正確順序打亂成詞卡、
 * 空的朗讀與解說拿掉、出處空的補「班級自編」
 */
export function finalizeQuestion(q: Question, seed: number): Question {
  const { speak, explain, source, ...rest } = q;
  const base = {
    ...rest,
    prompt: q.prompt.trim(),
    ...optionalText('speak', speak),
    ...optionalText('explain', explain),
    source: source?.trim() || MANUAL_SOURCE,
  };
  if (q.type === 'choice') {
    const kept = q.options
      .map((o, i) => ({ o: { ...o, ...(o.text !== undefined ? { text: o.text.trim() } : {}), ...(o.emoji !== undefined ? { emoji: o.emoji.trim() } : {}) }, i }))
      .map(({ o, i }) => {
        const { text, emoji, ...more } = o;
        return { o: { ...more, ...(text ? { text } : {}), ...(emoji ? { emoji } : {}) }, i };
      })
      .filter(({ o }) => o.text || o.emoji || o.shape);
    const answer = kept.findIndex(({ i }) => i === q.answer);
    return { ...(base as ChoiceQuestion), options: kept.map(({ o }) => o), answer };
  }
  if (q.type === 'order') {
    const answer = q.answer.map((t) => t.trim()).filter(Boolean);
    let tokens = createRng(seed).shuffle(answer);
    if (tokens.length > 1 && tokens.every((t, i) => t === answer[i])) tokens = [...tokens.slice(1), tokens[0]];
    return { ...base, type: 'order', tokens, answer } as Question;
  }
  if (q.type === 'write') return { ...base, type: 'write', target: q.target.trim(), script: q.script } as Question;
  return base as Question;
}

/** 整理後還不合格的地方（中文）；合格回空清單 */
export function questionProblems(q: Question, seed = 1): string[] {
  const f = finalizeQuestion(q, seed);
  if (f.type === 'choice' && f.answer < 0) return ['正確答案的選項是空的'];
  const r = questionSchema.safeParse(f);
  return r.success ? [] : formatIssues(r.error);
}

/** 組成題庫包：名稱與每一題都合格才成功，否則列出第幾題哪裡不對 */
export function buildPack(title: string, questions: Question[], seed: number): { ok: true; pack: ContentPack } | { ok: false; errors: string[] } {
  const name = title.trim();
  const errors: string[] = [];
  if (!name) errors.push('題庫名稱不能空白');
  if (!questions.length) errors.push('題庫裡還沒有題目');
  const finalized = questions.map((q, i) => finalizeQuestion(q, seed + i));
  questions.forEach((q, i) => {
    for (const p of questionProblems(q, seed + i)) errors.push(`第 ${i + 1} 題：${p}`);
  });
  if (errors.length) return { ok: false, errors };
  const r = contentPackSchema.safeParse({ format: 'learning-island-pack', version: 1, title: name, questions: finalized });
  if (!r.success) return { ok: false, errors: formatIssues(r.error) };
  return { ok: true, pack: r.data as ContentPack };
}

/** AI 出題分批：每次最多 AI_MAX_PER_CALL 題 */
export function planBatches(total: number, per = AI_MAX_PER_CALL): number[] {
  const out: number[] = [];
  for (let left = total; left > 0; left -= per) out.push(Math.min(per, left));
  return out;
}
