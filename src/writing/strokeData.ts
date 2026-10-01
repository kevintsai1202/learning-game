/**
 * 筆順資料載入：國字讀 public/data/strokes/hanzi/<碼位>.json（建置腳本產生，台灣教育部筆順），
 * 注音符號與英文字母由 glyphs 模組以中心線即時產生。
 * 資料格式同 Hanzi Writer：strokes（外框 SVG 路徑）＋ medians（中心線點列），1024 單位座標。
 */
export interface StrokeData {
  strokes: string[];
  medians: number[][][];
  /** 部首筆畫（國字才有） */
  radStrokes?: number[];
}

/** 已載入的資料快取 */
const cache = new Map<string, Promise<StrokeData>>();

/** 字元的十六進位碼位，例如「山」→ 5c71 */
export function codepointHex(ch: string): string {
  return ch.codePointAt(0)!.toString(16);
}

/** 動態載入注音／字母字形（只有用到時才下載；匯入字形模組時會自動註冊字形表） */
async function localGlyph(script: 'zhuyin' | 'latin', ch: string): Promise<StrokeData> {
  if (script === 'zhuyin') await import('./zhuyinStrokes');
  else await import('./latinStrokes');
  const { glyphData } = await import('./glyphs');
  const data = glyphData(script, ch);
  if (!data) throw new Error(`沒有「${ch}」的筆順資料`);
  return data;
}

/** 載入某個字的筆順資料 */
export function loadStrokeData(script: 'hanzi' | 'zhuyin' | 'latin', ch: string): Promise<StrokeData> {
  const key = `${script}:${ch}`;
  let p = cache.get(key);
  if (!p) {
    p =
      script === 'hanzi'
        ? fetch(`${import.meta.env.BASE_URL}data/strokes/hanzi/${codepointHex(ch)}.json`).then((r) => {
            if (!r.ok) throw new Error(`沒有「${ch}」的筆順資料`);
            return r.json() as Promise<StrokeData>;
          })
        : localGlyph(script, ch);
    // 失敗時不要快取，下次可以重試
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
