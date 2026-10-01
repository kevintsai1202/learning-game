/**
 * 組一回合的題目：先向出題器要一個比較大的題目池（約三回合份量），
 * 再優先挑「最近沒做過」的題目，避免孩子一直遇到同一題。
 */
import { createRng } from '../core/rng';
import type { Question } from '../core/types';
import type { ActivityDef } from '../activities/types';

/** 題目池是每回合題數的幾倍 */
const POOL_FACTOR = 3;

/**
 * 從題目池挑 count 題：沒做過的優先；不夠時補「最久以前做過」的。
 * recent 由舊到新排列。最後依種子打散順序，讓補進來的舊題不會都擠在最後。
 */
export function pickFresh(pool: Question[], recent: string[], count: number, seed: number): Question[] {
  const seenAt = new Map(recent.map((id, i) => [id, i]));
  const fresh = pool.filter((q) => !seenAt.has(q.id));
  const seen = pool.filter((q) => seenAt.has(q.id)).sort((a, b) => seenAt.get(a.id)! - seenAt.get(b.id)!);
  const picked = [...fresh, ...seen].slice(0, count);
  return createRng(seed ^ 0x5eed).shuffle(picked);
}

/** 向出題器要題目池；題目空間小的技能湊不滿時，自動減少數量重試，不會丟出錯誤 */
export function generatePool(activity: ActivityDef, seed: number, level: 1 | 2 | 3, want: number): Question[] {
  let n = want;
  while (n >= 1) {
    try {
      return activity.make({ seed, count: n, level, allowFewer: true });
    } catch {
      n = Math.floor(n / 2);
    }
  }
  return [];
}

/** 組一回合：題目池約三回合份量，優先挑最近沒做過的 */
export function buildSession(activity: ActivityDef, opts: { seed: number; level: 1 | 2 | 3 }, recent: string[]): Question[] {
  const pool = generatePool(activity, opts.seed, opts.level, activity.count * POOL_FACTOR);
  // 去掉題目池裡重複的 id（多個出題器混合時可能重複）
  const unique = [...new Map(pool.map((q) => [q.id, q])).values()];
  return pickFresh(unique, recent, activity.count, opts.seed);
}
