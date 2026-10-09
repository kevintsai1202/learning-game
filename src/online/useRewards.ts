/**
 * 收到老師獎勵的畫面狀態（老師 GM 的 G3，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：
 * 還沒看過的獎勵（金幣、貼紙已經由伺服器加進存檔，這裡只管卡片）。
 * 什麼時候重新讀取：進到島上（卡片掛載時）、即時連線連上（welcome）、收到 reward 訊息。卡片只在島上顯示。
 */
import { create } from 'zustand';
import { fetchRewards, markRewardsSeen } from './cloudSync';
import type { RewardInfo } from './protocol';
import { cloudDeps } from './useCloud';
import { useGame } from '../store/useGame';

interface RewardStore {
  /** 目前的資料屬於哪位角色（換角色時不顯示舊的） */
  profileId: string | null;
  /** 還沒看過的獎勵（舊的在前） */
  rewards: RewardInfo[];
  /** 重新讀取；連不上就保留原本的 */
  load: () => Promise<void>;
  /** 看過了（先從畫面拿掉，再告訴伺服器；失敗也不再顯示） */
  seen: (id: string) => Promise<void>;
  /** 清掉（離線、換角色） */
  clear: () => void;
}

/** 目前的雲端角色 id；本機角色回傳 null */
const activeCloudId = (): string | null => {
  const p = useGame.getState().profile();
  return p?.cloud ? p.id : null;
};

export const useRewards = create<RewardStore>((set, get) => ({
  profileId: null,
  rewards: [],
  load: async () => {
    const id = activeCloudId();
    if (!id) return set({ profileId: null, rewards: [] });
    try {
      const rewards = await fetchRewards(cloudDeps, id);
      // 讀取期間換了角色：丟掉這次的結果
      if (activeCloudId() !== id) return;
      set({ profileId: id, rewards });
    } catch {
      // 連不上：等下次（回到島上、重新連線或收到通知）再讀
    }
  },
  seen: async (rewardId) => {
    const id = get().profileId;
    set({ rewards: get().rewards.filter((r) => r.id !== rewardId) });
    if (id) await markRewardsSeen(cloudDeps, id, [rewardId]).catch(() => undefined);
  },
  clear: () => set({ profileId: null, rewards: [] }),
}));
