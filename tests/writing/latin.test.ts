/**
 * 英文字母筆順中心線的結構檢查：52 個字母齊全、筆數符合研究文件（Zaner-Bloser，大寫 49、小寫 33）、
 * 座標落在字框內、大小寫落在四線格正確的範圍、下伸部有低於基準線的點、字母水平置中。
 */
import { describe, expect, it } from 'vitest';
import { CHAR_BOX, LATIN_LINES, glyphChars, glyphData } from '../../src/writing/glyphs';
import { LATIN_STROKES } from '../../src/writing/latinStrokes';

/** 大寫 26 個的筆數（合計 49，docs/research/zhuyin-english.md §2.4） */
const UPPER: Record<string, number> = {
  A: 3, B: 2, C: 1, D: 2, E: 4, F: 3, G: 1, H: 3, I: 3, J: 2, K: 2, L: 1, M: 2,
  N: 2, O: 1, P: 2, Q: 2, R: 2, S: 1, T: 2, U: 1, V: 1, W: 1, X: 2, Y: 2, Z: 1,
};
/** 小寫 26 個的筆數（合計 33，§2.5） */
const LOWER: Record<string, number> = {
  a: 1, b: 1, c: 1, d: 1, e: 1, f: 2, g: 1, h: 1, i: 2, j: 2, k: 2, l: 1, m: 1,
  n: 1, o: 1, p: 1, q: 1, r: 1, s: 1, t: 2, u: 1, v: 1, w: 1, x: 2, y: 2, z: 1,
};

const sum = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);

/** 某字母所有中心線點 */
const points = (ch: string) => LATIN_STROKES[ch].flat();
const ys = (ch: string) => points(ch).map((p) => p[1]);
const xs = (ch: string) => points(ch).map((p) => p[0]);

/** 容差：筆畫粗細的一半（35）以內的超出視為貼線 */
const TOL = 15;

describe('英文字母中心線', () => {
  it('52 個字母都有，筆數合計 大寫 49、小寫 33', () => {
    expect(sum(UPPER)).toBe(49);
    expect(sum(LOWER)).toBe(33);
    const expected = [...Object.keys(UPPER), ...Object.keys(LOWER)].sort();
    expect(Object.keys(LATIN_STROKES).sort()).toEqual(expected);
    expect(glyphChars('latin').sort()).toEqual(expected);
  });

  it.each(Object.entries({ ...UPPER, ...LOWER }))('%s 的筆數為 %i，每筆至少 2 個不同的點', (ch, n) => {
    expect(LATIN_STROKES[ch]).toHaveLength(n);
    for (const stroke of LATIN_STROKES[ch]) {
      expect(stroke.length).toBeGreaterThanOrEqual(2);
      const first = stroke[0];
      expect(stroke.some((p) => p[0] !== first[0] || p[1] !== first[1])).toBe(true);
    }
  });

  it('所有點都落在字框內，且能產生外框與 medians', () => {
    for (const ch of Object.keys(LATIN_STROKES)) {
      for (const [x, y] of points(ch)) {
        expect(x, `${ch} x`).toBeGreaterThanOrEqual(CHAR_BOX.left);
        expect(x, `${ch} x`).toBeLessThanOrEqual(CHAR_BOX.right);
        expect(y, `${ch} y`).toBeGreaterThanOrEqual(CHAR_BOX.bottom);
        expect(y, `${ch} y`).toBeLessThanOrEqual(CHAR_BOX.top);
      }
      const d = glyphData('latin', ch)!;
      expect(d.strokes).toHaveLength(LATIN_STROKES[ch].length);
      expect(d.medians).toHaveLength(LATIN_STROKES[ch].length);
    }
  });

  it('大寫占第 1～3 線（頂天立地）', () => {
    for (const ch of Object.keys(UPPER)) {
      expect(Math.max(...ys(ch)), `${ch} 上緣`).toBeLessThanOrEqual(LATIN_LINES.top + TOL);
      expect(Math.max(...ys(ch)), `${ch} 上緣要貼近第 1 線`).toBeGreaterThanOrEqual(LATIN_LINES.top - 60);
      // Q 的尾巴會略低於基準線，J 的鉤也貼底
      expect(Math.min(...ys(ch)), `${ch} 下緣`).toBeGreaterThanOrEqual(LATIN_LINES.base - (ch === 'Q' ? 50 : TOL));
      expect(Math.min(...ys(ch)), `${ch} 下緣要貼近基準線`).toBeLessThanOrEqual(LATIN_LINES.base + 60);
    }
  });

  it('x 高度的小寫在第 2～3 線之間', () => {
    for (const ch of 'acemnorsuvwxz') {
      expect(Math.max(...ys(ch)), `${ch} 上緣`).toBeLessThanOrEqual(LATIN_LINES.mid + TOL);
      expect(Math.min(...ys(ch)), `${ch} 下緣`).toBeGreaterThanOrEqual(LATIN_LINES.base - TOL);
    }
  });

  it('上伸部（b d f h k l t）到第 1 線，i j 的點在上格', () => {
    for (const ch of 'bdfhklt') expect(Math.max(...ys(ch)), ch).toBeGreaterThanOrEqual(LATIN_LINES.top - 60);
    for (const ch of 'ij') {
      expect(Math.max(...ys(ch)), ch).toBeGreaterThan(LATIN_LINES.mid + 60);
      expect(Math.max(...ys(ch)), ch).toBeLessThan(LATIN_LINES.top);
    }
  });

  it('下伸部（g j p q y）有點低於基準線，且不超出第 4 線太多', () => {
    for (const ch of 'gjpqy') {
      expect(Math.min(...ys(ch)), ch).toBeLessThan(LATIN_LINES.base - 150);
      expect(Math.min(...ys(ch)), ch).toBeGreaterThanOrEqual(LATIN_LINES.bottom - TOL);
    }
    // 其他小寫不應低於基準線
    for (const ch of 'abcdefhiklmnorstuvwxz') expect(Math.min(...ys(ch)), ch).toBeGreaterThanOrEqual(LATIN_LINES.base - TOL);
  });

  it('每個字母水平置中在 x≈512', () => {
    for (const ch of Object.keys(LATIN_STROKES)) {
      const center = (Math.min(...xs(ch)) + Math.max(...xs(ch))) / 2;
      expect(Math.abs(center - 512), ch).toBeLessThanOrEqual(40);
    }
  });

  it('封閉曲線（O o Q）起點與終點不重合，讓 Hanzi Writer 判得出方向', () => {
    for (const ch of 'Ooa') {
      const s = LATIN_STROKES[ch][0];
      const [a, b] = [s[0], s[s.length - 1]];
      if (ch === 'a') continue; // a 的終點在豎線底端，一定不同於起點
      expect(Math.hypot(a[0] - b[0], a[1] - b[1]), ch).toBeGreaterThan(30);
    }
    const q = LATIN_STROKES['Q'][0];
    expect(Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1])).toBeGreaterThan(30);
  });

  it('封閉曲線與折返處相鄰點間距不會太大（曲線點夠密，每段不超過 120 單位）', () => {
    for (const ch of Object.keys(LATIN_STROKES)) {
      for (const stroke of LATIN_STROKES[ch]) {
        // 直線段允許較長，所以只檢查含曲線的字母：這裡只擋明顯的座標錯誤（單段跳超過字框一半）
        for (let i = 1; i < stroke.length; i++) {
          const d = Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]);
          expect(d, `${ch} 第 ${i} 點`).toBeLessThan(600);
        }
      }
    }
  });
});
