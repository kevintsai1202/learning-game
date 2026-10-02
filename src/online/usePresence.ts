/**
 * 同島成員與公頻的 zustand store（邏輯在 presence.ts）。
 * 位置更新很頻繁：3D 元件在每幀用 getState() 讀，不訂閱位置，避免每次移動都重畫 React 元件。
 */
import { create } from 'zustand';
import { BUBBLE_MS, addChat, emptyPresence, expireBubbles, moveMember, removeMember, setZone, upsertMember, type PresenceState, type RemoteMember } from './presence';
import type { ZoneId } from '../store/useUi';

interface PresenceStore extends PresenceState {
  upsert: (m: RemoteMember) => void;
  remove: (id: string) => void;
  move: (id: string, x: number, z: number, heading: number) => void;
  setZone: (id: string, zone: ZoneId | null) => void;
  /** 某位成員說話（公頻一則＋頭上氣泡）；at 沒給就用現在時間 */
  say: (id: string, text: string, at?: number) => void;
  /** 清空（離開房間、停止模擬） */
  clear: () => void;
}

export const usePresence = create<PresenceStore>((set) => ({
  ...emptyPresence(),
  upsert: (m) => set((s) => upsertMember(s, m)),
  remove: (id) => set((s) => removeMember(s, id)),
  move: (id, x, z, heading) => set((s) => moveMember(s, id, x, z, heading)),
  setZone: (id, zone) => set((s) => setZone(s, id, zone)),
  say: (id, text, at = Date.now()) => {
    set((s) => addChat(s, id, text, at));
    // 氣泡時間到就清掉（畫面才會收起來）
    setTimeout(() => set((s) => expireBubbles(s, Date.now())), Math.max(0, at + BUBBLE_MS - Date.now()) + 50);
  },
  clear: () => set(emptyPresence()),
}));
