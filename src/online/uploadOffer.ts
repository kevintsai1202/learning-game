/**
 * 家長登入後「這台裝置上有○○，是你的孩子嗎？」（L2，存到雲端的決定 A；docs/plans/login-ux-review.md）：
 * 要問哪些角色，以及家長按「不是」的紀錄。
 * 「不是」記在這台裝置的 localStorage，依大人帳號分開（換另一位家長登入會再問）；讀寫不到（無痕模式、被封鎖、
 * 不在瀏覽器裡）時當作沒有紀錄，不丟錯誤。
 */
import type { KidSummary } from './protocol';
import type { Profile } from '../store/save';

/** localStorage 的鍵：大人帳號 id → 說過「不是」的角色 id */
const KEY = 'learning-island-upload-declined';

/** 讀整份紀錄（讀不到或格式不對是空的） */
function readAll(): Record<string, string[]> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : null;
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

/** 這位家長說過「不是」的角色 id */
export function readDeclined(userId: string): string[] {
  const list = readAll()[userId];
  return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
}

/** 記下這位家長對這些角色說了「不是」（寫不進去就算了：之後還會再問） */
export function addDeclined(userId: string, profileIds: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const all = readAll();
    all[userId] = [...new Set([...(all[userId] ?? []), ...profileIds])];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // 無痕模式等不能存：這次開著的頁面裡卡片已經收起來，下次登入再問
  }
}

/**
 * 要問家長的角色：這台裝置上還沒存到雲端、雲端也沒有同一個角色 id（以前在別台裝置存過的，用孩子清單的「在這台裝置玩」換）、
 * 而且這位家長沒說過「不是」的
 */
export function profilesToOffer(profiles: Profile[], kids: KidSummary[], declined: string[]): Profile[] {
  return profiles.filter((p) => !p.cloud && !kids.some((k) => k.profileId === p.id) && !declined.includes(p.id));
}
