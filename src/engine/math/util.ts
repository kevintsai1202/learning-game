/**
 * 數學出題器工具：共用工具由 ../util 轉出，這裡只放數學文字題用的人物與物品。
 */
import type { Rng } from '../../core/rng';

export { generateUnique, sample, shuffleChoices, zhNumber, timeText, numberDistractors, type Level } from '../util';

/** 文字題裡的人物（台灣常見的稱呼） */
export const PEOPLE = ['小明', '小美', '小華', '阿傑', '小芳', '哥哥', '姊姊', '弟弟', '妹妹', '阿公', '阿嬤', '老師'];

/** 文字題裡的物品與量詞 */
export const ITEMS = [
  { name: '貼紙', mw: '張', emoji: '⭐' },
  { name: '彈珠', mw: '顆', emoji: '🔮' },
  { name: '故事書', mw: '本', emoji: '📚' },
  { name: '鉛筆', mw: '枝', emoji: '✏️' },
  { name: '蘋果', mw: '顆', emoji: '🍎' },
  { name: '氣球', mw: '個', emoji: '🎈' },
  { name: '卡片', mw: '張', emoji: '🃏' },
  { name: '花', mw: '朵', emoji: '🌸' },
] as const;

/** 從人物清單挑兩個不同的人 */
export function twoPeople(rng: Rng): [string, string] {
  const [a, b] = rng.shuffle(PEOPLE);
  return [a, b];
}
