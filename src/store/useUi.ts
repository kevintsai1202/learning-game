/**
 * 畫面狀態（不存檔）：目前在哪個畫面、哪個建築、哪個活動，以及 3D 舞台的情緒。
 */
import { create } from 'zustand';
import type { SessionResult } from '../core/types';

/**
 * 畫面（class：孩子用班級代碼登入；classroom：學校平板用教室密碼看班上名單進島（L3）；teacher：老師的班級管理；
 * badges：獎章簿；puzzle：益智遊戲館，選單與遊戲都在這個畫面）
 */
export type Screen = 'title' | 'profiles' | 'island' | 'zone' | 'activity' | 'result' | 'parent' | 'shop' | 'class' | 'classroom' | 'teacher' | 'badges' | 'puzzle';

/** 島上的區域（建築） */
export type ZoneId = 'math' | 'zh' | 'en' | 'life' | 'tower' | 'shop' | 'puzzle';

/** 有自己畫面的建築（其他建築都用活動選單 zone） */
const OWN_SCREEN: Partial<Record<ZoneId, Screen>> = { shop: 'shop', puzzle: 'puzzle' };

/** 正在進行的活動 */
export interface ActivityRun {
  activityId: string;
  level: 1 | 2 | 3;
  seed: number;
  /** 從錯題本出題時帶入題目 id 清單 */
  reviewIds?: string[];
  /** 玩法：一般答題或氣球射擊（預設一般答題） */
  mode?: 'quiz' | 'shooter';
}

/** 3D 舞台上角色的反應 */
export type StageMood = 'idle' | 'happy' | 'oops' | 'cheer';

interface UiStore {
  screen: Screen;
  zone: ZoneId | null;
  /** 角色目前靠近的建築門口（顯示「進去嗎？」） */
  nearZone: ZoneId | null;
  run: ActivityRun | null;
  lastResult: SessionResult | null;
  /** 上一回合新得到的獎章 id（結算畫面慶祝） */
  lastNewBadges: string[];
  mood: StageMood;
  /** mood 變更的序號，讓相同情緒連續觸發也能重播動畫 */
  moodTick: number;
  /** 熊熊老師的對話泡泡 */
  bubble: { text: string; id: number } | null;
  goto: (screen: Screen) => void;
  /** 顯示對話泡泡（幾秒後由介面自動收起） */
  say: (text: string) => void;
  clearBubble: () => void;
  enterZone: (zone: ZoneId) => void;
  setNearZone: (zone: ZoneId | null) => void;
  startActivity: (run: ActivityRun) => void;
  showResult: (result: SessionResult, newBadges?: string[]) => void;
  setMood: (mood: StageMood) => void;
}

export const useUi = create<UiStore>((set) => ({
  screen: 'title',
  zone: null,
  nearZone: null,
  run: null,
  lastResult: null,
  lastNewBadges: [],
  mood: 'idle',
  moodTick: 0,
  bubble: null,
  goto: (screen) => set({ screen }),
  say: (text) => set((s) => ({ bubble: { text, id: (s.bubble?.id ?? 0) + 1 } })),
  clearBubble: () => set({ bubble: null }),
  enterZone: (zone) => set({ zone, screen: OWN_SCREEN[zone] ?? 'zone' }),
  setNearZone: (nearZone) => set({ nearZone }),
  startActivity: (run) => set({ run, screen: 'activity', mood: 'idle' }),
  showResult: (lastResult, newBadges = []) => set({ lastResult, lastNewBadges: newBadges, screen: 'result', mood: 'cheer' }),
  setMood: (mood) => set((s) => ({ mood, moodTick: s.moodTick + 1 })),
}));
