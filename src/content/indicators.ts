/**
 * 課綱代碼對照（家長報表顯示用）：「科目:代碼」→ 課綱條文。
 * 條文逐字取自 docs/research/curriculum-108.md（已與官方 PDF 核對）。
 * 不同科目可能有相同代碼（例如國語文與生活課程都有 1-Ⅰ-1），所以鍵要加科目前綴。
 */
import type { SubjectId } from '../core/types';
import { LIFE_INDICATORS } from './life/codes';
import { EN_INDICATORS } from './en/codes';
import { ZH_LANGUAGE_INDICATORS } from './zh/codes-language';
import { ZH_CHARS_INDICATORS } from './zh/codes-chars';

export const INDICATORS: Record<string, string> = {
  // 數學二年級學習內容（條目名稱）
  'math:N-2-1': '一千以內的數',
  'math:N-2-2': '加減算式與直式計算',
  'math:N-2-3': '解題：加減應用問題',
  'math:N-2-4': '解題：簡單加減估算',
  'math:N-2-5': '解題：100元、500元、1000元',
  'math:N-2-6': '乘法',
  'math:N-2-7': '十十乘法',
  'math:N-2-8': '解題：兩步驟應用問題（加、減、乘）',
  'math:N-2-9': '解題：分裝與平分',
  'math:N-2-10': '單位分數的認識',
  'math:N-2-11': '長度：「公分」、「公尺」',
  'math:N-2-12': '容量、重量、面積',
  'math:N-2-13': '鐘面的時刻',
  'math:N-2-14': '時間：「年」、「月」、「星期」、「日」',
  'math:S-2-1': '物體之幾何特徵',
  'math:S-2-2': '簡單幾何形體',
  'math:S-2-3': '直尺操作',
  'math:S-2-4': '平面圖形的邊長',
  'math:S-2-5': '面積',
  'math:R-2-1': '大小關係與遞移律',
  'math:R-2-2': '三數相加，順序改變不影響其和',
  'math:R-2-3': '兩數相乘的順序不影響其積',
  'math:R-2-4': '加法與減法的關係',
  'math:D-2-1': '分類與呈現',
};

/** 把某科的「代碼 → 條文」表加上科目前綴併入總表 */
function addSubject(subject: SubjectId, table: Record<string, string>): void {
  for (const [code, text] of Object.entries(table)) INDICATORS[`${subject}:${code}`] = text;
}
addSubject('life', LIFE_INDICATORS);
addSubject('en', EN_INDICATORS);
addSubject('zh', ZH_LANGUAGE_INDICATORS);
addSubject('zh', ZH_CHARS_INDICATORS);

/** 取得課綱代碼的說明；key 為「科目:代碼」（沒有登錄時回傳空字串） */
export function indicatorLabel(key: string): string {
  return INDICATORS[key] ?? '';
}

/** 把存檔的鍵拆成科目與代碼 */
export function splitIndicatorKey(key: string): { subject: SubjectId | null; code: string } {
  const i = key.indexOf(':');
  if (i < 0) return { subject: null, code: key };
  return { subject: key.slice(0, i) as SubjectId, code: key.slice(i + 1) };
}
