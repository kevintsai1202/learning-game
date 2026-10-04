/**
 * 和機器人搶答的共用流程（益智搶答、積木大師）：規則在 src/engine/puzzle/quizBattle.ts。
 * 每一題開始時排好機器人什麼時候答、選哪一個；先答對的得分，答錯的人這一題不能再答；
 * 這一題有結果就停一下換下一題（孩子搶到 1.4 秒、其他 2.6 秒，讓孩子看清楚正確答案），比完了回報。
 */
import { useEffect, useReducer, useRef } from 'react';
import { duelAnswer, duelNext, startDuel, type DuelState } from '../engine/puzzle/quizBattle';
import { puzzleDebug } from './debug';

/** 搶答的畫面狀態：比賽進度，加上這一題孩子與機器人選了哪一個 */
export interface DuelView {
  duel: DuelState;
  kidPick: number | null;
  botPick: number | null;
}

type DuelAction = { t: 'kid' | 'bot'; pick: number; correct: boolean } | { t: 'next'; total: number };

function duelReducer(s: DuelView, a: DuelAction): DuelView {
  if (a.t === 'next') {
    const duel = duelNext(s.duel, a.total);
    return duel === s.duel ? s : { duel, kidPick: null, botPick: null };
  }
  const duel = duelAnswer(s.duel, a.t, a.correct);
  // 沒被接受的作答（這一題已經有結果、或已經答錯過）不改畫面
  if (duel === s.duel) return s;
  return a.t === 'kid' ? { ...s, duel, kidPick: a.pick } : { ...s, duel, botPick: a.pick };
}

/** useDuel 的設定 */
export interface DuelOptions {
  /** 共幾題 */
  total: number;
  /** 第 index 題機器人的作答：等幾毫秒、選哪一個 */
  botMove: (index: number) => { delayMs: number; pick: number };
  /** 第 index 題的正解索引 */
  answer: (index: number) => number;
  /** 這一題有結果時（音效、朗讀） */
  onResolve?: (phase: 'kid' | 'bot' | 'none', index: number) => void;
  /** 比完了 */
  onDone: (duel: DuelState) => void;
}

/**
 * 和機器人搶答。回傳畫面狀態，以及孩子作答的函式（回傳這次作答有沒有被接受，被接受才記錄作答）。
 * 機器人的速度可以用 puzzleDebug.botDelayFactor 調（e2e）。
 */
export function useDuel(opts: DuelOptions): { view: DuelView; pick: (index: number) => boolean } {
  const [view, dispatch] = useReducer(duelReducer, { duel: startDuel(), kidPick: null, botPick: null });
  const { duel } = view;
  // 設定裡的函式每次重繪都換新，計時器透過 ref 呼叫最新的
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    if (duel.done) return;
    const move = latest.current.botMove(duel.index);
    const correct = move.pick === latest.current.answer(duel.index);
    const t = setTimeout(() => dispatch({ t: 'bot', pick: move.pick, correct }), move.delayMs * puzzleDebug.botDelayFactor);
    return () => clearTimeout(t);
  }, [duel.index, duel.done]);

  useEffect(() => {
    if (duel.phase === 'open' || duel.done) return;
    latest.current.onResolve?.(duel.phase, duel.index);
    const t = setTimeout(() => dispatch({ t: 'next', total: latest.current.total }), duel.phase === 'kid' ? 1400 : 2600);
    return () => clearTimeout(t);
  }, [duel.phase, duel.index, duel.done]);

  useEffect(() => {
    if (duel.done) latest.current.onDone(duel);
    // 只在比完的那一次回報
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.done]);

  const pick = (index: number): boolean => {
    if (duel.phase !== 'open' || duel.kidOut || duel.done) return false;
    dispatch({ t: 'kid', pick: index, correct: index === latest.current.answer(duel.index) });
    return true;
  };
  return { view, pick };
}
