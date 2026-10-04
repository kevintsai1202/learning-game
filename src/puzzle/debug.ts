/**
 * 除錯用（e2e 透過 window.__game.puzzle 讀寫）：調整機器人的速度、讀取目前遊戲公開的狀態。
 * 益智搶答的目前題目另外放在 quizDebug.current，沿用 e2e 原本的自動作答。
 */
export const puzzleDebug: {
  /** 機器人反應時間的倍數：e2e 設很大（機器人幾乎不會答）或很小（馬上答）；平常是 1 */
  botDelayFactor: number;
  /** 目前遊戲公開給 e2e 的狀態（各遊戲自己定義內容），沒有在玩時是 null */
  state: unknown;
} = { botDelayFactor: 1, state: null };
