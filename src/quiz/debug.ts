/**
 * 除錯用：目前顯示中的題目與寫字板資料（e2e 測試透過 window.__game.quiz 讀取，依題型自動作答）。
 */
import type { Question } from '../core/types';

export const quizDebug: {
  current: Question | null;
  /** 寫字板目前這個字的筆畫中心線（Hanzi Writer 座標：x 0～1024、y −124～900，y 向上） */
  strokes: number[][][] | null;
  /** 寫字板的邊長與內距（像素），e2e 換算座標用 */
  pad: { size: number; padding: number } | null;
  /** 射擊模式：各答案氣球的世界座標（e2e 投影成螢幕座標後點擊） */
  targets: { x: number; y: number; z: number }[];
} = { current: null, strokes: null, pad: null, targets: [] };
