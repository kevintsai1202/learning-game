/**
 * 益智遊戲館的時間規則（純函式）：哪些畫面算遊玩時間、益智遊戲今天還能玩多久。
 * 益智遊戲館有自己的每日上限（家長專區設定），玩的時間同時算進整體的每日上限。
 */
import type { Screen } from '../store/useUi';
import { puzzleToday, type Profile } from '../store/save';

/** 這個畫面的遊玩時間怎麼算：不算（標題、選角、家長區）、一般、益智遊戲館 */
export function playTimeKind(screen: Screen): 'none' | 'play' | 'puzzle' {
  if (screen === 'title' || screen === 'profiles' || screen === 'parent') return 'none';
  return screen === 'puzzle' ? 'puzzle' : 'play';
}

/** 今天在益智遊戲館還能玩幾秒（最少 0）；limitMin 為 0（不另外限制）時回傳 null */
export function puzzleSecondsLeft(p: Profile, limitMin: number, now: Date): number | null {
  if (limitMin <= 0) return null;
  return Math.max(0, limitMin * 60 - puzzleToday(p, now).seconds);
}
