/**
 * 熊熊老師的公告與集合（老師 GM 的 G2，孩子的裝置；docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：
 * 即時連線收到 announce、summon 時更新，畫面（src/ui/TeacherCalls.tsx）顯示上方的大字幕與集合卡片。
 */
import { create } from 'zustand';
import type { Screen } from '../store/useUi';

/**
 * 收到集合時怎麼處理（純函式）：在那一班的班級島、而且在島上 → now（直接過去）；
 * 在那一班的班級島但在建築裡 → go（卡片「過去」）；在別座島 → back（卡片「回班級島」，不自動拉走）
 */
export function summonKind(onThatClassIsland: boolean, screen: Screen): 'now' | 'go' | 'back' {
  if (!onThatClassIsland) return 'back';
  return screen === 'island' ? 'now' : 'go';
}

/** 一則公告（id 每則不同，畫面用來重新計時） */
export interface Announcement {
  id: number;
  room: string;
  text: string;
}

/** 一張集合卡片：去那一班的班級島上老師身邊的位置 */
export interface SummonCall {
  id: number;
  room: string;
  x: number;
  z: number;
  kind: 'go' | 'back';
}

interface TeacherCallsStore {
  /** 目前顯示的公告 */
  announce: Announcement | null;
  /** 還沒處理的集合卡片 */
  summon: SummonCall | null;
  showAnnounce: (room: string, text: string) => void;
  showSummon: (call: Omit<SummonCall, 'id'>) => void;
  clearAnnounce: () => void;
  clearSummon: () => void;
}

/** 每則公告與卡片的流水號 */
let seq = 0;

export const useTeacherCalls = create<TeacherCallsStore>((set) => ({
  announce: null,
  summon: null,
  showAnnounce: (room, text) => set({ announce: { id: ++seq, room, text } }),
  showSummon: (call) => set({ summon: { ...call, id: ++seq } }),
  clearAnnounce: () => set({ announce: null }),
  clearSummon: () => set({ summon: null }),
}));
