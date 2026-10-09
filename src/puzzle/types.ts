/**
 * 益智遊戲館的畫面共用型別：一局的設定、結果，以及每個遊戲元件的介面。
 */
import type { AnswerRecord } from '../core/types';
import type { PuzzleGameId } from '../store/puzzle';
import type { BotLevel, VsOutcome } from '../engine/puzzle/common';
import type { DuelSide } from '../engine/puzzle/friend';

/** 玩法：自己玩、和機器人比賽、和朋友對戰（島嶼互訪 I4） */
export type PuzzleMode = 'solo' | 'vs' | 'friend';

/** 一局的設定 */
export interface PuzzleRun {
  game: PuzzleGameId;
  mode: PuzzleMode;
  /** 機器人的難度（自己玩時代表題目的難度） */
  level: BotLevel;
  /** 亂數種子：同一個種子出同一局 */
  seed: number;
  /** 和朋友對戰：朋友在這座島上的名字、誰先手（記憶翻牌）；動作在 useFriendDuel 的 live.events */
  friend?: { name: string; first: DuelSide };
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
  /** 和朋友對戰時自己的連線斷了：這一局不算，PuzzleScreen 顯示原因後回選單 */
  onAbort?: (message: string) => void;
}
