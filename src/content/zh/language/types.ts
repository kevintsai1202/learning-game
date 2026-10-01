/**
 * 國語「注音拼讀、語詞、句子與閱讀」題材共用的型別與小工具。
 * 題材都是資料；出題器在 src/engine/zh/language/ 把資料變成題目。
 */

/** 難度 1～3 */
export type Lv = 1 | 2 | 3;

/**
 * 注音例字的拼音類型：
 * - two：聲符＋韻符（二拼，含單韻、複韻、聲隨韻、空韻）
 * - three：聲符＋介符＋單韻（三拼，如ㄍㄨㄚ、ㄒㄧㄚ、ㄒㄩㄝ，屬結合韻ㄧㄚ、ㄨㄛ、ㄩㄝ等）
 * - combo：介符＋複韻／聲隨韻的結合韻（如ㄧㄠ、ㄨㄟ、ㄧㄢ、ㄨㄥ）
 */
export type SyllableKind = 'two' | 'three' | 'combo';

/** 注音例字：一個國字、它的注音（含聲調標注）、拼音類型與可選的圖示 */
export interface ZhuyinEntry {
  char: string;
  /** 這個字的注音，例如「ㄇㄚˇ」；輕聲寫成「˙ㄇㄚ」 */
  zhuyin: string;
  kind: SyllableKind;
  /** 有對應圖示的字（名詞、動物等），用於「看注音選圖」 */
  emoji?: string;
}

/** 注音符號與聲調的字元範圍（資料檢查、題目拆解共用） */
export const BOPOMOFO_ONLY = /^˙?[ㄅ-ㄩ]+[ˊˇˋ]?$/;

/** 取聲調：一聲 1（無符號）、二聲 2、三聲 3、四聲 4、輕聲 5 */
export function toneOf(zhuyin: string): 1 | 2 | 3 | 4 | 5 {
  if (zhuyin.startsWith('˙')) return 5;
  if (zhuyin.endsWith('ˊ')) return 2;
  if (zhuyin.endsWith('ˇ')) return 3;
  if (zhuyin.endsWith('ˋ')) return 4;
  return 1;
}

/** 去掉聲調符號後的「音節本體」，例如ㄇㄚˇ → ㄇㄚ */
export function baseOf(zhuyin: string): string {
  return zhuyin.replace(/[˙ˊˇˋ]/g, '');
}

/** 一個聲調的口語說法 */
export const TONE_NAMES = ['', '一聲', '二聲', '三聲', '四聲', '輕聲'] as const;

/** 選詞填空題的（難度）標記，供出題器依難度加權抽題 */
export interface Leveled {
  level: Lv;
}
