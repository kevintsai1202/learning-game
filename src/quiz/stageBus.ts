/**
 * 答題器與 3D 舞台之間的橋：答題器放上目前題目與「選第幾個」的函式，
 * 舞台上的 3D 互動（例如點垃圾桶）就能直接作答。
 */
import { create } from 'zustand';
import type { Question } from '../core/types';

interface StageQuiz {
  question: Question | null;
  /** 目前玩法：射擊模式時 3D 舞台改成氣球射擊場 */
  mode: 'quiz' | 'shooter';
  /** 舞台上選了第 index 個選項（不在作答階段時答題器會忽略） */
  pick: ((index: number) => void) | null;
}

export const useStageQuiz = create<StageQuiz>(() => ({ question: null, pick: null, mode: 'quiz' }));
