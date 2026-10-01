/**
 * 判題與計分：純函式，不碰畫面與存檔。
 */
import type { Question, Response } from '../core/types';

/** 時鐘的時：12 點與 0 點視為相同 */
const normHour = (h: number): number => ((h % 12) + 12) % 12;

/** 判斷作答是否正確 */
export function checkAnswer(q: Question, r: Response): boolean {
  if (q.type !== r.type) return false;
  switch (q.type) {
    case 'choice':
      return r.type === 'choice' && r.index === q.answer;
    case 'number':
      return r.type === 'number' && r.value === q.answer;
    case 'order':
      return r.type === 'order' && r.tokens.length === q.answer.length && r.tokens.every((t, i) => t === q.answer[i]);
    case 'clock':
      return r.type === 'clock' && normHour(r.hour) === normHour(q.hour) && r.minute === q.minute;
    case 'money': {
      if (r.type !== 'money') return false;
      const allowed = new Set(q.denominations);
      return r.items.every((v) => allowed.has(v)) && r.items.reduce((s, v) => s + v, 0) === q.amount;
    }
    case 'write':
      return r.type === 'write' && r.completed;
  }
}

/** 用最少張數湊出金額（台幣面額用貪婪法即為最少張數） */
export function makeChange(amount: number, denominations: number[]): number[] {
  const out: number[] = [];
  let rest = amount;
  for (const d of [...denominations].sort((a, b) => b - a)) {
    while (rest >= d) {
      out.push(d);
      rest -= d;
    }
  }
  if (rest !== 0) throw new Error(`無法用 ${denominations.join('/')} 湊出 ${amount}`);
  return out;
}

/** 產生標準答案（答錯後顯示正解、測試驗證題目自洽都用它） */
export function correctResponse(q: Question): Response {
  switch (q.type) {
    case 'choice':
      return { type: 'choice', index: q.answer };
    case 'number':
      return { type: 'number', value: q.answer };
    case 'order':
      return { type: 'order', tokens: [...q.answer] };
    case 'clock':
      return { type: 'clock', hour: q.hour, minute: q.minute };
    case 'money':
      return { type: 'money', items: makeChange(q.amount, q.denominations) };
    case 'write':
      return { type: 'write', completed: true, mistakes: 0 };
  }
}

/** 描寫題寫錯幾筆以內仍算「一次就會」（孩子手寫難免抖動，給一點寬容） */
export const WRITE_FIRST_TRY_MAX_MISTAKES = 1;

/** 判斷這次作答算不算「第一次就答對」 */
export function isFirstTry(q: Question, r: Response): boolean {
  if (!checkAnswer(q, r)) return false;
  if (r.type === 'write') return r.mistakes <= WRITE_FIRST_TRY_MAX_MISTAKES;
  return true;
}

/**
 * 依「第一次就答對」的題數算星星與金幣。
 * 有完成就至少 1 顆星，避免孩子因為一次挫折就不想玩。
 */
export function scoreSession(total: number, firstTryCorrect: number): { stars: number; coins: number } {
  if (total <= 0) return { stars: 0, coins: 0 };
  const ratio = firstTryCorrect / total;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
  return { stars, coins: firstTryCorrect + stars * 2 };
}
