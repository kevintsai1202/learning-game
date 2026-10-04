/**
 * 益智遊戲館的畫面共用型別：一局的設定、結果，以及每個遊戲元件的介面。
 */
import type { AnswerRecord } from '../core/types';
import type { PuzzleGameId } from '../store/puzzle';
import type { BotLevel, VsOutcome } from '../engine/puzzle/common';

/** 玩法：自己玩、和機器人比賽 */
export type PuzzleMode = 'solo' | 'vs';

/** 一局的設定 */
export interface PuzzleRun {
  game: PuzzleGameId;
  mode: PuzzleMode;
  /** 機器人的難度（自己玩時代表題目的難度） */
  level: BotLevel;
  /** 亂數種子：同一個種子出同一局 */
  seed: number;
}

/** 一局玩完的結果（交給 PuzzleScreen 存檔並顯示結算） */
export interface PuzzleOutcome {
  stars: 1 | 2 | 3;
  /** 結算畫面的一句話，例如「最多連對 7 題」「你 6：4 機器人」 */
  summary: string;
  /** 和機器人比賽的輸贏 */
  vs?: VsOutcome;
  /** 益智搶答的作答紀錄（進錯題本） */
  answers?: AnswerRecord[];
}

/** 每個遊戲元件的介面 */
export interface PuzzleGameProps {
  run: PuzzleRun;
  onFinish: (outcome: PuzzleOutcome) => void;
  /** 孩子按 ✕（由 PuzzleScreen 確認要不要離開） */
  onExit: () => void;
}
