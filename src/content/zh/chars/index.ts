/**
 * 國語「生字與筆順」題材：生字資訊（注音、部首、筆畫、是否有台灣教育部筆順）與課本語詞。
 * charinfo.json 與 public/data/strokes/hanzi/ 由 scripts/build-hanzi-data.py 產生（覆蓋率報告見 docs/stroke-coverage.md）。
 */
import charinfo from './charinfo.json';
import kanghsuan from '../../editions/zh/kanghsuan.json';
import nani from '../../editions/zh/nani.json';
import hanlin from '../../editions/zh/hanlin.json';

/** 一個生字的資訊 */
export interface CharInfo {
  char: string;
  /** 所有可接受的讀音（注音含聲調：一聲不標、輕聲的 ˙ 放前面） */
  readings: string[];
  /** 主讀音（多音字依課本語詞判斷，無法判斷者先用最常見讀音） */
  reading: string;
  /** 部首（國小教學用的偏旁寫法，例如 氵、扌、艹） */
  radical: string;
  /** 康熙部首（例如 水、手、艸） */
  radicalKangxi: string;
  /** 筆畫數（可描寫的字＝筆順檔的筆數） */
  strokeCount: number;
  /** 有經過驗證的台灣教育部筆順檔，可以出描寫題 */
  writable: boolean;
  /** 筆順來源：animcjk、makemeahanzi，加 +reorder 表示依 CNS 重排過；不可寫為 null */
  strokeSource: string | null;
  /** 不可描寫的原因代碼 */
  unwritableReason?: string;
}

/** 全部生字資訊（依碼位排序） */
export const CHAR_INFO: readonly CharInfo[] = charinfo as CharInfo[];

/** 字 → 資訊 */
export const CHAR_BY = new Map<string, CharInfo>(CHAR_INFO.map((c) => [c.char, c]));

/** 字集（三版本二年級生字的聯集） */
export const ALL_CHARS: readonly string[] = CHAR_INFO.map((c) => c.char);

/** 可描寫的字（有台灣教育部筆順） */
export const WRITABLE_CHARS: readonly string[] = CHAR_INFO.filter((c) => c.writable).map((c) => c.char);

/** 三版本所有課本語詞（不重複，至少兩個字） */
export const ALL_WORDS: readonly string[] = (() => {
  const set = new Set<string>();
  for (const ed of [kanghsuan, nani, hanlin]) {
    for (const v of ed.volumes) {
      for (const u of v.units) {
        for (const w of ((u as { words?: string[] }).words ?? [])) if ([...w].length >= 2) set.add(w);
      }
    }
  }
  return [...set];
})();

/** 語詞集合（查「這個詞是不是真的語詞」用） */
export const WORD_SET: ReadonlySet<string> = new Set(ALL_WORDS);

/** 字 → 含有這個字的語詞（只列字集內的字） */
export const WORDS_BY_CHAR: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const w of ALL_WORDS) {
    for (const c of new Set([...w])) {
      if (!CHAR_BY.has(c)) continue;
      const list = m.get(c) ?? [];
      list.push(w);
      m.set(c, list);
    }
  }
  return m;
})();

/** 37 個注音符號（與 src/writing/zhuyinStrokes.ts 的字形表一致，由單元測試比對） */
export const ZHUYIN_SYMBOLS: readonly string[] = [...'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦㄧㄨㄩ'];

/** 常見部首（字集中出現最多的前 24 個，當部首題的干擾選項） */
export const COMMON_RADICALS: readonly string[] = (() => {
  const count = new Map<string, number>();
  for (const c of CHAR_INFO) count.set(c.radical, (count.get(c.radical) ?? 0) + 1);
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].codePointAt(0)! - b[0].codePointAt(0)!)
    .slice(0, 24)
    .map(([r]) => r);
})();

/** 主讀音 → 一個讀這個音的例字（選項朗讀用：裝置語音唸不準單獨的注音） */
export const EXAMPLE_BY_READING: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of CHAR_INFO) if (!m.has(c.reading)) m.set(c.reading, c.char);
  return m;
})();
