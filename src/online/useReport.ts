/**
 * 學習報告的 AI 分析狀態（docs/plans/learning-report.md 第 3 節）：孩子的學習報告與家長分頁共用。
 * 雲端角色、伺服器開了 AI 才分析（先同步一次，伺服器用最新的存檔）；其他情況（單機、沒開 AI、資料不夠、
 * 今天的次數用完、AI 的句子不合格）畫面改用規則建議。結果記在記憶體，換角色就清掉。
 */
import { create } from 'zustand';
import { ApiFailure } from './api';
import { pollKidAnalysis, startKidAnalysis } from './cloudSync';
import { cloudDeps, useCloud } from './useCloud';
import { useGame } from '../store/useGame';
import type { KidReport } from '../content/aiAnalysis';

/** 多久查一次、最多等多久（毫秒） */
const POLL_MS = 1500;
const WAIT_MS = 180_000;

interface ReportStore {
  /** 結果屬於哪個角色 */
  profileId: string | null;
  /** idle 還沒分析；loading 分析中；ai 有 AI 的分析；rules 改用規則建議（note 說明原因，沒有就不顯示） */
  status: 'idle' | 'loading' | 'ai' | 'rules';
  report: KidReport | null;
  note: string | null;
  /** 分析（同一個角色已經有結果時不重來，除非 force） */
  load: (force?: boolean) => Promise<void>;
}

export const useReport = create<ReportStore>((set, get) => ({
  profileId: null,
  status: 'idle',
  report: null,
  note: null,
  load: async (force = false) => {
    const p = useGame.getState().profile();
    if (!p) return;
    if (!force && get().profileId === p.id && get().status !== 'idle') return;
    if (!p.cloud || !useCloud.getState().aiQuestions) {
      set({ profileId: p.id, status: 'rules', report: null, note: null });
      return;
    }
    set({ profileId: p.id, status: 'loading', report: null, note: null });
    /** 結束（換了角色就丟掉結果） */
    const finish = (patch: Partial<ReportStore>) => {
      if (useGame.getState().profile()?.id === p.id) set(patch);
    };
    try {
      // 先把還沒送出的進度送上去，伺服器才用最新的存檔分析
      await useCloud.getState().syncNow();
      const job = await startKidAnalysis(cloudDeps, p.id);
      const deadline = Date.now() + WAIT_MS;
      for (;;) {
        await new Promise((ok) => setTimeout(ok, POLL_MS));
        const r = await pollKidAnalysis(cloudDeps, p.id, job);
        if (r.status === 'running') {
          if (Date.now() > deadline) throw new Error('timeout');
          continue;
        }
        if (r.status === 'failed') throw new Error(r.error);
        if (r.result.source === 'rules' || r.result.report.kind !== 'kid') return finish({ status: 'rules', report: null, note: null });
        return finish({ status: 'ai', report: r.result.report, note: null });
      }
    } catch (err) {
      // 資料不夠不用說明（畫面本來就會請孩子多玩）；其他原因寫給大人看
      const note = err instanceof ApiFailure && err.code === 'not_enough_data' ? null : err instanceof ApiFailure && err.code === 'ai_quota' ? err.message : '連不上熊熊老師，先看看這些建議';
      finish({ status: 'rules', report: null, note });
    }
  },
}));
