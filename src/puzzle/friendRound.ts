/**
 * 和朋友對戰的一局（島嶼互訪 I4）：兩台裝置用同一個種子出同一局。
 * 益智搶答只從各科固定活動出題（不含各自課本的單元，使用者 2026-10-09 決定），兩邊才一樣；
 * 邀請帶這一局的指紋，對方算出來不一樣就是網頁版本不同（部署途中一邊還開著舊網頁）。
 */
import type { ChoiceQuestion } from '../core/types';
import { ALL_ACTIVITIES } from '../activities/registry';
import type { PuzzleGameId } from '../store/puzzle';
import type { BotLevel } from '../engine/puzzle/common';
import { DUEL_QUESTIONS, buildQuizQuestions } from '../engine/puzzle/quizBattle';
import { buildBlocksRound } from '../engine/puzzle/blocks';
import { makeMemoryDeck } from '../engine/puzzle/memory';
import { makeSpotScene } from '../engine/puzzle/spotDiff';
import { pickShape } from '../engine/puzzle/tangramShapes';

/** 和朋友對戰時益智搶答可以出題的活動：各科固定活動（挑戰塔與停用的除外） */
export const FRIEND_QUIZ_ACTIVITIES = ALL_ACTIVITIES.filter((a) => a.zone !== 'tower' && !a.disabledReason);

/** 和朋友搶答的題目：同一個種子出同一組題（不避開最近做過的題目，兩邊的紀錄不一樣） */
export function friendQuizQuestions(seed: number): ChoiceQuestion[] {
  return buildQuizQuestions(FRIEND_QUIZ_ACTIVITIES, DUEL_QUESTIONS, seed, []);
}

/** 這一局出好的內容（只用來算指紋） */
function roundOf(game: PuzzleGameId, seed: number, level: BotLevel): unknown {
  switch (game) {
    case 'quiz':
      return friendQuizQuestions(seed);
    case 'blocks':
      return buildBlocksRound(seed, level);
    case 'memory':
      return makeMemoryDeck(seed, level);
    case 'spot':
      return makeSpotScene(seed, level);
    case 'tangram':
      return pickShape(seed, level);
  }
}

/** 字串的 32 位元 FNV-1a 雜湊，寫成 36 進位 */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** 這一局的指紋：遊戲、種子、難度與出好的內容的雜湊 */
export function duelCheck(game: PuzzleGameId, seed: number, level: BotLevel): string {
  return hash(JSON.stringify([game, seed, level, roundOf(game, seed, level)]));
}
