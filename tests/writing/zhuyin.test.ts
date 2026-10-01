/**
 * 注音符號筆順中心線的結構檢查：符號齊全、筆數符合教育部資料、座標在字框內、每筆可判方向。
 */
import { describe, expect, it } from 'vitest';
import { CHAR_BOX, glyphChars, glyphData } from '../../src/writing/glyphs';
import { ZHUYIN_STROKES } from '../../src/writing/zhuyinStrokes';

/** 聲符 21 個的筆數（合計 46；ㄖ 採手冊主表 4 筆） */
const INITIALS: Record<string, number> = {
  ㄅ: 1, ㄆ: 2, ㄇ: 2, ㄈ: 2, ㄉ: 2, ㄊ: 3, ㄋ: 1, ㄌ: 2, ㄍ: 2, ㄎ: 2, ㄏ: 2,
  ㄐ: 2, ㄑ: 1, ㄒ: 2, ㄓ: 4, ㄔ: 3, ㄕ: 3, ㄖ: 4, ㄗ: 2, ㄘ: 2, ㄙ: 2,
};
/** 韻符 16 個的筆數（合計 33） */
const FINALS: Record<string, number> = {
  ㄚ: 3, ㄛ: 2, ㄜ: 2, ㄝ: 3, ㄞ: 3, ㄟ: 1, ㄠ: 3, ㄡ: 2, ㄢ: 2, ㄣ: 1, ㄤ: 3, ㄥ: 1, ㄦ: 2, ㄧ: 1, ㄨ: 2, ㄩ: 2,
};
/** 聲調符號（陰平不標）各 1 筆 */
const TONES: Record<string, number> = { ˊ: 1, ˇ: 1, ˋ: 1, '˙': 1 };

const sum = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);

describe('注音符號中心線', () => {
  it('37 個符號與 4 個聲調符號都有（陰平除外）', () => {
    expect(Object.keys(INITIALS)).toHaveLength(21);
    expect(Object.keys(FINALS)).toHaveLength(16);
    const expected = [...Object.keys(INITIALS), ...Object.keys(FINALS), ...Object.keys(TONES)].sort();
    expect(Object.keys(ZHUYIN_STROKES).sort()).toEqual(expected);
    expect(glyphChars('zhuyin').sort()).toEqual(expected);
  });

  it('聲符合計 46 筆、韻符合計 33 筆、ㄖ 為 4 筆', () => {
    expect(sum(INITIALS)).toBe(46);
    expect(sum(FINALS)).toBe(33);
    expect(ZHUYIN_STROKES['ㄖ']).toHaveLength(4);
  });

  it.each(Object.entries({ ...INITIALS, ...FINALS, ...TONES }))('%s 的筆數為 %i', (ch, n) => {
    expect(ZHUYIN_STROKES[ch]).toHaveLength(n);
  });

  it('所有點落在字框內、每筆至少 2 點且起訖點不重合', () => {
    for (const [ch, strokes] of Object.entries(ZHUYIN_STROKES)) {
      strokes.forEach((line, i) => {
        const where = `${ch} 第 ${i + 1} 筆`;
        expect(line.length, `${where} 點數`).toBeGreaterThanOrEqual(2);
        for (const [x, y] of line) {
          expect(x, `${where} x`).toBeGreaterThanOrEqual(CHAR_BOX.left);
          expect(x, `${where} x`).toBeLessThanOrEqual(CHAR_BOX.right);
          expect(y, `${where} y`).toBeGreaterThanOrEqual(CHAR_BOX.bottom);
          expect(y, `${where} y`).toBeLessThanOrEqual(CHAR_BOX.top);
        }
        const [sx, sy] = line[0];
        const [ex, ey] = line[line.length - 1];
        expect(Math.hypot(ex - sx, ey - sy), `${where} 起訖距離`).toBeGreaterThan(60);
      });
    }
  });

  it('glyphData 能產生與筆數相同的外框與 medians', () => {
    for (const [ch, strokes] of Object.entries(ZHUYIN_STROKES)) {
      const d = glyphData('zhuyin', ch)!;
      expect(d.strokes).toHaveLength(strokes.length);
      expect(d.medians).toHaveLength(strokes.length);
    }
  });
});
