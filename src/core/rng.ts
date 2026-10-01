/**
 * 可指定種子的亂數產生器（mulberry32）。
 * 出題器一律用它，同一個種子永遠產生同一組題目，測試與重現錯題都靠這個性質。
 */
export interface Rng {
  /** 0（含）～1（不含）之間的浮點數 */
  next(): number;
  /** min～max（兩端都含）之間的整數 */
  int(min: number, max: number): number;
  /** 從陣列隨機取一個元素 */
  pick<T>(arr: readonly T[]): T;
  /** 回傳打亂順序的新陣列（不改動原陣列） */
  shuffle<T>(arr: readonly T[]): T[];
  /** 以機率 p 回傳 true */
  chance(p: number): boolean;
}

/** 建立亂數產生器；seed 為任意整數 */
export function createRng(seed: number): Rng {
  // mulberry32 的內部狀態，只取 32 位元
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => {
    if (max < min) throw new Error(`int(): max(${max}) 小於 min(${min})`);
    return min + Math.floor(next() * (max - min + 1));
  };
  return {
    next,
    int,
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('pick(): 陣列是空的');
      return arr[int(0, arr.length - 1)];
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    chance(p: number): boolean {
      return next() < p;
    },
  };
}

/** 由字串算出穩定的 32 位元雜湊（FNV-1a），用來把文字轉成種子或產生題目 id */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
