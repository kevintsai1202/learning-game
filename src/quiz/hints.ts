/**
 * 選項的 emoji 改成提示（2026-10-13 使用者決定，docs/decisions.md「選項的 emoji 改成提示」）。純函式。
 * - 有文字的選項預設只顯示文字，按「💡 提示」才出現 emoji（避免用圖案猜答案，例如題目是草莓、正確選項也畫草莓）
 * - 只有 emoji、沒有文字的選項（英語圖卡等），emoji 就是答案，一律顯示
 * - 挑戰塔是考試，沒有提示；錯題再挑戰雖然登記在挑戰塔，是練習，照樣有提示
 * - 按不按提示都不影響計分
 * - 是非題的 ⭕對／❌錯 只是裝飾，一律顯示，是非題也不出現提示按鈕（2026-10-13 使用者決定）
 */
import type { ChoiceOption, Question } from '../core/types';
import type { ActivityDef } from '../activities/types';

/** 是非題的 ⭕對／❌錯（只有配「對」「錯」才算；⭕ 配別的文字，例如英語的「把字圈起來」，照樣是提示） */
function isTrueFalseMark(o: ChoiceOption): boolean {
  return (o.emoji === '⭕' && o.text === '對') || (o.emoji === '❌' && o.text === '錯');
}

/** 有文字、emoji 又不是是非題記號的選項：emoji 要按提示才顯示 */
function emojiIsHint(o: ChoiceOption): boolean {
  return !!o.emoji && !!o.text && !isTrueFalseMark(o);
}

/** 這個選項現在要不要顯示 emoji；revealed 是這一題按過提示了 */
export function optionShowsEmoji(o: ChoiceOption, revealed: boolean): boolean {
  return !!o.emoji && (revealed || !emojiIsHint(o));
}

/** 這一題有沒有提示可看：單選題至少有一個 emoji 要按提示才顯示的選項 */
export function hasEmojiHint(q: Question): boolean {
  return q.type === 'choice' && q.options.some(emojiIsHint);
}

/** 這個活動能不能用提示：挑戰塔是考試不行，錯題再挑戰（review.）例外 */
export function hintsAllowed(activity: Pick<ActivityDef, 'id' | 'zone'>): boolean {
  return activity.zone !== 'tower' || activity.id.startsWith('review.');
}
