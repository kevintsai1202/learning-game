/**
 * 益智遊戲館現在正在玩哪個遊戲（PuzzleScreen 開局時寫入、回到選單時清掉）：
 * 回報給老師「在做什麼」用（老師 GM 的 G3，src/online/doing.ts）。
 */
import { create } from 'zustand';

export const usePuzzleNow = create<{ title: string | null }>(() => ({ title: null }));
