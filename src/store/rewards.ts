/**
 * 老師發的獎勵（老師 GM 的 G3，docs/plans/teacher-gm.md 第 6 節第 4 點、第 13 節 G2＋G3 實作設計；伺服器共用的純函式）：
 * 金幣每次 1～50 枚、貼紙是送禮用的 8 種之一，老師沒有每日上限（使用者決定，第 12 節第 4 點）。
 * 伺服器在交易裡直接改孩子的存檔；不走送禮的「待收下／退回」流程（老師的獎勵沒有扣款方，也不需要拒絕）。
 */
import { findSticker, receiveGift } from './gifts';
import type { Profile } from './save';

/** 每次最多幾枚金幣 */
export const REWARD_COINS_MAX = 50;
/** 收禮紀錄上寫的送禮人（百寶屋的貼紙簿看得到） */
export const REWARD_FROM = '熊熊老師';

/** 一份獎勵：金幣、貼紙至少一種 */
export interface Reward {
  coins?: number;
  sticker?: string;
}

/** 是不是可以當獎勵的貼紙（送禮用的那 8 種） */
export function isRewardSticker(id: string): boolean {
  return !!findSticker(id);
}

/** 收到獎勵後的存檔：金幣加上去；貼紙張數加一，收禮紀錄記熊熊老師（date 是收禮紀錄的日期） */
export function applyReward(p: Profile, reward: Reward, date: string): Profile {
  let next = p;
  if (reward.coins && reward.coins > 0) next = { ...next, coins: next.coins + reward.coins };
  if (reward.sticker && isRewardSticker(reward.sticker)) next = receiveGift(next, { itemId: reward.sticker, from: REWARD_FROM }, date);
  return next;
}
