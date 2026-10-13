/**
 * 從學習分析跳到 AI 出題（docs/plans/learning-report.md 第 2 節）：分析結果按「針對這些指標 AI 出題」時放進要勾的指標，
 * 班級題庫（ClassPacks）看到就打開編輯器、展開 AI 出題並預先勾好。
 */
import { create } from 'zustand';

interface PackRequest {
  /** 要預先勾好的指標鍵；null 是沒有要求 */
  indicators: string[] | null;
  request: (indicators: string[]) => void;
  clear: () => void;
}

export const usePackRequest = create<PackRequest>((set) => ({
  indicators: null,
  request: (indicators) => set({ indicators }),
  clear: () => set({ indicators: null }),
}));
