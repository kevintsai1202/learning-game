/**
 * 益智遊戲共用的規則（純函式）：機器人難度、和機器人比賽的輸贏與星數。
 */

/** 機器人的難度：1 簡單、2 普通、3 厲害 */
export type BotLevel = 1 | 2 | 3;

/** 和機器人比賽的結果 */
export type VsOutcome = 'win' | 'tie' | 'lose';

/** 依比分判斷輸贏 */
export function vsOutcome(kid: number, bot: number): VsOutcome {
  return kid > bot ? 'win' : kid === bot ? 'tie' : 'lose';
}

/** 和機器人比賽的星數：贏 3 星、平手 2 星、輸 1 星（玩完就至少 1 星） */
export function outcomeStars(o: VsOutcome): 1 | 2 | 3 {
  return o === 'win' ? 3 : o === 'tie' ? 2 : 1;
}
