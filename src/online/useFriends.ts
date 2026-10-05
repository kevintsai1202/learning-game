/**
 * 好友名單的 zustand store（島嶼互訪 I1；邏輯在 friends.ts）：即時連線收到 friends／friend 時更新，斷線時清空。
 * open 是好友名單面板有沒有打開。
 */
import { create } from 'zustand';
import { applyFriendMessage, type FriendsState } from './friends';
import type { ServerMessage } from './realtime';

interface FriendsStore {
  friends: FriendsState;
  /** 好友名單面板有沒有打開 */
  open: boolean;
  /** 套用一則伺服器訊息（friends／friend 以外的不變） */
  apply: (msg: ServerMessage) => void;
  /** 斷線時清空 */
  clear: () => void;
  setOpen: (open: boolean) => void;
}

export const useFriends = create<FriendsStore>((set) => ({
  friends: {},
  open: false,
  apply: (msg) => set((s) => ({ friends: applyFriendMessage(s.friends, msg) })),
  clear: () => set({ friends: {} }),
  setOpen: (open) => set({ open }),
}));
