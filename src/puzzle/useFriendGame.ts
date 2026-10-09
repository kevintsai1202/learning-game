/**
 * 和朋友對戰（島嶼互訪 I4）的畫面共用流程：讀這一局伺服器排好順序的動作、搶答類的流程、對方離開或自己斷線。
 * 規則在 src/engine/puzzle/friend.ts（兩台裝置依序套用同一串動作，算出的狀態一樣）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { foldDuel, friendDuelStep, startFriendDuel, type DuelEvent } from '../engine/puzzle/friend';
import type { DuelState } from '../engine/puzzle/quizBattle';
import { sendDuelMove, useFriendDuel } from '../online/useFriendDuel';
import { DUEL_LINES } from '../ui/lines';
import { speak } from '../audio/speech';
import type { PuzzleGameProps } from './types';
import type { DuelView } from './useDuel';

/** 搶答類每一題有結果後兩邊都看多久再送 ready（毫秒；不分誰搶到，兩邊一樣久） */
export const FRIEND_REVEAL_MS = 2200;

const NO_EVENTS: DuelEvent[] = [];

/**
 * 這一局伺服器排好順序的動作。玩完時 PuzzleScreen 會收掉這一局（live 變成 null），
 * 這時保留最後一次的動作，畫面在換到結算之前不會跳回開局
 */
export function useFriendEvents(): DuelEvent[] {
  const events = useFriendDuel((s) => s.live?.events ?? null);
  const last = useRef<DuelEvent[]>(NO_EVENTS);
  if (events) last.current = events;
  return last.current;
}

/**
 * 對方中途離開（按 ✕、斷線、離開這座島）時直接贏（3 星，docs/plans/islands.md 第 10 節第 5 點）；
 * 自己的連線斷了時這一局不算。done 是這一局已經依動作結束（結束之後對方離開不理）
 */
export function useFriendEnd(done: boolean, name: string, onFinish: PuzzleGameProps['onFinish'], onAbort: PuzzleGameProps['onAbort']): void {
  const end = useFriendDuel((s) => s.live?.end ?? null);
  const latest = useRef({ done, name, onFinish, onAbort });
  latest.current = { done, name, onFinish, onAbort };
  useEffect(() => {
    const l = latest.current;
    if (!end || l.done) return;
    if (end === 'lost') {
      l.onAbort?.(DUEL_LINES.lost);
      return;
    }
    speak(DUEL_LINES.friendLeft);
    l.onFinish({ stars: 3, vs: 'win', summary: `${l.name} 離開了，你贏了！` });
  }, [end]);
}

/** useFriendQuizDuel 的設定 */
export interface FriendQuizOptions {
  /** 共幾題 */
  total: number;
  /** 第 index 題的正解索引 */
  answer: (index: number) => number;
  /** 這一題有結果時（音效、朗讀） */
  onResolve?: (phase: 'kid' | 'bot' | 'none', index: number) => void;
  /** 比完了 */
  onDone: (duel: DuelState) => void;
}

/**
 * 和朋友搶答（益智搶答、積木大師）：畫面狀態由伺服器排好順序的動作算出來（和 useDuel 同樣的形狀，畫面共用）。
 * 孩子作答時送 pick，回音回來才算（先收到的答對得分）；這一題有結果後 FRIEND_REVEAL_MS 送 ready，第一個 ready 就換題。
 * waiting 是送出作答、還在等回音（這時不能再點）
 */
export function useFriendQuizDuel(opts: FriendQuizOptions): { view: DuelView; pick: (option: number) => boolean; waiting: boolean } {
  const events = useFriendEvents();
  const latest = useRef(opts);
  latest.current = opts;
  const view = useMemo(() => foldDuel(events, startFriendDuel(), (s, e) => friendDuelStep(s, e, (i) => latest.current.answer(i), latest.current.total)), [events]);
  const { duel } = view;
  /** 送出、還沒回音的作答是第幾題 */
  const [sentFor, setSentFor] = useState<number | null>(null);

  useEffect(() => {
    if (duel.phase === 'open' || duel.done) return;
    latest.current.onResolve?.(duel.phase, duel.index);
    const t = setTimeout(() => sendDuelMove('ready', duel.index), FRIEND_REVEAL_MS);
    return () => clearTimeout(t);
  }, [duel.phase, duel.index, duel.done]);

  useEffect(() => {
    if (duel.done) latest.current.onDone(duel);
    // 只在比完的那一次回報
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.done]);

  // 回音回來了（這一題自己的作答有結果）、或換題了：可以再點
  const waiting = sentFor === duel.index && view.kidPick === null && duel.phase === 'open';

  const pick = (option: number): boolean => {
    if (duel.phase !== 'open' || duel.kidOut || duel.done || waiting) return false;
    sendDuelMove('pick', duel.index, option);
    setSentFor(duel.index);
    return true;
  };
  return { view, pick, waiting };
}
