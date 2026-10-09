/**
 * 好友名單（島嶼互訪 I1，docs/plans/islands.md）：純函式，依伺服器的 friends／friend 訊息更新名單，
 * 並決定顯示順序與狀態文字。狀態只寫在哪座島，不顯示建築（使用者決定）。
 */
import type { FriendState, ServerMessage } from './realtime';

/** 好友名單：帳號 id → 朋友 */
export type FriendsState = Record<string, FriendState>;

/** 套用一則伺服器訊息：friends 換成整份名單，friend 更新一位（沒有就加進去），其他訊息不變 */
export function applyFriendMessage(s: FriendsState, msg: ServerMessage): FriendsState {
  switch (msg.t) {
    case 'friends':
      return Object.fromEntries(msg.list.map((f) => [f.id, f]));
    case 'friend':
      return { ...s, [msg.friend.id]: msg.friend };
    default:
      return s;
  }
}

/** 顯示順序：線上的排前面，同一組依暱稱排 */
export function sortedFriends(s: FriendsState): FriendState[] {
  return Object.values(s).sort((a, b) => Number(b.online) - Number(a.online) || a.nickname.localeCompare(b.nickname, 'zh-Hant'));
}

/** 線上的朋友有幾位 */
export function onlineFriendCount(s: FriendsState): number {
  return Object.values(s).filter((f) => f.online).length;
}

/** 狀態文字：在班級島、在自己的島（開放中）、在○○的島（不認識島主時「在朋友的島」）、離線 */
export function friendStatusText(f: FriendState): string {
  if (!f.online) return '離線';
  if (f.host !== undefined) return `在${f.host || '朋友'}的島`;
  if (f.island !== 'own') return '在班級島';
  return f.open ? '在自己的島（開放中）' : '在自己的島';
}

/** 能不能去他的島玩（島嶼互訪 I2）：線上、在自己的島而且開放中；熊熊老師不是島主 */
export function canVisit(f: FriendState): boolean {
  return f.online && f.island === 'own' && f.host === undefined && !!f.open && !f.id.startsWith('teacher:');
}
