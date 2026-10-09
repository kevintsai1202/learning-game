/**
 * 孩子在做什麼（老師 GM 的 G3，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：回報給老師的活動名稱（純函式，有單元測試）。
 * 送名稱而不是活動 id：課本單元與段考的 id 帶有中文學期、題庫包的 id 不固定，老師的裝置也查不到孩子裝置上的單元名稱。
 * 伺服器只放記憶體、只給老師看（成員表的「在哪裡」），同學看不到。
 */
import { DOING_MAX } from './realtime';
import type { Screen } from '../store/useUi';

/**
 * 這時候要回報的名稱：答題與結算是活動名稱；益智遊戲館正在玩時是遊戲名稱；其他時候（島上、建築選單、百寶屋）沒有。
 * 太長的截到 DOING_MAX 字
 */
export function doingLabel(screen: Screen, activityTitle: string | null, puzzleTitle: string | null): string | null {
  const label = screen === 'activity' || screen === 'result' ? activityTitle : screen === 'puzzle' ? puzzleTitle : null;
  if (!label) return null;
  return [...label.trim()].slice(0, DOING_MAX).join('') || null;
}
