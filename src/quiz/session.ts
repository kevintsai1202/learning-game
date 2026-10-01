/**
 * 一回合答題的狀態機（純函式）：
 * answering →（答對）correct →（下一題）answering … → done
 * answering →（第一次答錯）retry →（再答對）correct ／（又答錯）reveal 公布答案
 */
import type { AnswerRecord, Question, Response, SessionResult, SubjectId } from '../core/types';
import { checkAnswer, isFirstTry, scoreSession } from '../engine/check';

export type QuizPhase = 'answering' | 'retry' | 'correct' | 'reveal' | 'done';

export interface QuizState {
  questions: Question[];
  index: number;
  /** 這一題已經答錯幾次 */
  attempt: number;
  phase: QuizPhase;
  records: AnswerRecord[];
}

/** 開始一回合 */
export function startQuiz(questions: Question[]): QuizState {
  return { questions, index: 0, attempt: 0, phase: questions.length ? 'answering' : 'done', records: [] };
}

/** 送出答案；只有 answering 與 retry 階段會接受 */
export function answer(s: QuizState, r: Response): QuizState {
  if (s.phase !== 'answering' && s.phase !== 'retry') return s;
  const q = s.questions[s.index];
  if (checkAnswer(q, r)) {
    return { ...s, phase: 'correct', records: [...s.records, { question: q, correct: true, firstTry: s.attempt === 0 && isFirstTry(q, r) }] };
  }
  if (s.attempt === 0) return { ...s, attempt: 1, phase: 'retry' };
  return { ...s, attempt: s.attempt + 1, phase: 'reveal', records: [...s.records, { question: q, correct: false, firstTry: false }] };
}

/** 進到下一題；沒有下一題時進入 done */
export function nextQuestion(s: QuizState): QuizState {
  if (s.phase !== 'correct' && s.phase !== 'reveal') return s;
  const index = s.index + 1;
  if (index >= s.questions.length) return { ...s, phase: 'done' };
  return { ...s, index, attempt: 0, phase: 'answering' };
}

/** 結算成 SessionResult */
export function summarize(s: QuizState, activityId: string, subject: SubjectId, seconds: number): SessionResult {
  const total = s.questions.length;
  const correct = s.records.filter((r) => r.firstTry).length;
  const { stars, coins } = scoreSession(total, correct);
  return { activityId, subject, total, correct, stars, coins, seconds: Math.round(seconds), answers: s.records };
}
