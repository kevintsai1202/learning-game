/**
 * 出題器共用工具（各科共用）：不重複出題、條件抽樣、選項打散、國字數字、時刻文字、數字誘答。
 */
import { createRng, hashString, type Rng } from '../core/rng';
import type { ChoiceOption, GenerateOptions, Question } from '../core/types';

export type Level = 1 | 2 | 3;

/**
 * 反覆呼叫 make 直到湊滿 count 題 id 不重複的題目。
 * 亂數種子混入技能 id，不同技能用同一個種子也不會出現相同的亂數序列。
 */
export function generateUnique(skillId: string, opts: GenerateOptions, make: (rng: Rng, level: Level) => Question): Question[] {
  const rng = createRng((opts.seed ^ hashString(skillId)) >>> 0);
  const seen = new Set<string>();
  const out: Question[] = [];
  const maxAttempts = opts.count * 80 + 200;
  for (let i = 0; i < maxAttempts && out.length < opts.count; i++) {
    const q = make(rng, opts.level);
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  if (out.length < opts.count && !opts.allowFewer) {
    throw new Error(`${skillId} 難度 ${opts.level} 只產生 ${out.length} 題不重複的題目（需要 ${opts.count} 題）`);
  }
  return out;
}

/** 反覆抽樣直到符合條件（出題時用來挑「要進位」「不退位」之類的數字組合） */
export function sample<T>(rng: Rng, draw: (rng: Rng) => T, ok: (v: T) => boolean, maxTries = 5000): T {
  for (let i = 0; i < maxTries; i++) {
    const v = draw(rng);
    if (ok(v)) return v;
  }
  throw new Error('sample(): 找不到符合條件的組合，請檢查出題條件');
}

/** 選項比對用的鍵 */
const optionKey = (o: ChoiceOption): string => `${o.text ?? ''}|${o.emoji ?? ''}|${o.shape ?? ''}`;

/**
 * 把正解與誘答選項合併打散。與正解或彼此重複的誘答會被略過，最多 max 個選項。
 */
export function shuffleChoices(rng: Rng, correct: ChoiceOption, distractors: ChoiceOption[], max = 4): { options: ChoiceOption[]; answer: number } {
  const seen = new Set([optionKey(correct)]);
  const picked: ChoiceOption[] = [];
  for (const d of distractors) {
    if (picked.length >= max - 1) break;
    const k = optionKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push(d);
  }
  const options = rng.shuffle([correct, ...picked]);
  return { options, answer: options.indexOf(correct) };
}

const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const ZH_UNITS = ['', '十', '百', '千'];

/** 0～9999 轉國字數字，例如 305 → 三百零五、15 → 十五（朗讀分數與數字題用） */
export function zhNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
  if (n === 0) return '零';
  const digits = String(n).split('').map(Number);
  let out = '';
  let zeroPending = false;
  digits.forEach((d, i) => {
    const pos = digits.length - 1 - i;
    if (d === 0) {
      if (out) zeroPending = true;
      return;
    }
    if (zeroPending) {
      out += '零';
      zeroPending = false;
    }
    out += ZH_DIGITS[d] + ZH_UNITS[pos];
  });
  // 10～19 習慣讀「十五」而不是「一十五」
  if (n >= 10 && n < 20) out = out.replace(/^一十/, '十');
  return out;
}

/** 時刻文字，例如「3 點」「7 點 25 分」 */
export function timeText(hour: number, minute: number): string {
  return minute === 0 ? `${hour} 點` : `${hour} 點 ${minute} 分`;
}

/** 數字誘答：常見錯誤（差 1、差 10、差 100、十位個位對調），只保留範圍內且不等於正解者 */
export function numberDistractors(rng: Rng, answer: number, min: number, max: number): number[] {
  const cands = [answer + 1, answer - 1, answer + 10, answer - 10, answer + 100, answer - 100];
  const s = String(answer);
  if (s.length >= 2) cands.push(Number(s.slice(0, -2) + s.slice(-1) + s.slice(-2, -1)));
  return rng.shuffle([...new Set(cands)].filter((v) => v !== answer && v >= min && v <= max));
}
