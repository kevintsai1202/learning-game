/**
 * 教材版本總表：內建版本（src/content/editions/<科目>/*.json）＋家長匯入的版本包。
 * 匯入的版本 id 與內建相同時會覆蓋內建（用來修正生字表的年度差異）。
 */
import { editionSchema, type Edition, type EditionVolume } from './schema';
import { termOf, type CurriculumChoice } from '../../store/save';

/** 「依 108 課綱通用」：不跟課本單元，只用各主題活動 */
export const GENERIC_EDITION = 'generic';

/** 內建版本：建置時把 JSON 一起打包；格式錯誤的檔案在單元測試就會被抓到 */
const files = import.meta.glob('./*/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** 驗證並收集內建版本 */
function loadBuiltIn(): Edition[] {
  const out: Edition[] = [];
  for (const [path, data] of Object.entries(files)) {
    const r = editionSchema.safeParse(data);
    if (r.success) out.push(r.data);
    else console.warn(`教材版本檔格式錯誤，已略過：${path}`, r.error.issues[0]);
  }
  return out;
}

export const BUILT_IN_EDITIONS: Edition[] = loadBuiltIn();

/** 合併內建與匯入的版本（匯入的同 id 會覆蓋內建） */
export function mergeEditions(builtIn: Edition[], imported: Edition[]): Edition[] {
  const map = new Map(builtIn.map((e) => [e.id, e]));
  for (const e of imported) map.set(e.id, e);
  return [...map.values()];
}

/** 某科可選的版本 */
export function editionsFor(all: Edition[], subject: 'zh' | 'math'): Edition[] {
  return all.filter((e) => e.subject === subject).sort((a, b) => a.publisher.localeCompare(b.publisher, 'zh-Hant'));
}

/** 教材版本設定的一行說明，例如「國語 南一・數學 翰林・二年級上學期」（老師的班級頁、家長專區顯示班級版本用） */
export function curriculumText(all: Edition[], c: CurriculumChoice): string {
  const name = (subject: 'zh' | 'math') =>
    c[subject] === GENERIC_EDITION ? '108 課綱通用' : (all.find((e) => e.id === c[subject] && e.subject === subject)?.publisher ?? '找不到的版本');
  const term = c.term === 'auto' ? '學期自動' : `二年級${c.term}學期`;
  return `國語 ${name('zh')}・數學 ${name('math')}・${term}`;
}

/** 依設定的學期（auto 依日期）取出這一冊；沒有這學期的資料時回傳 null */
export function currentVolume(edition: Edition, term: '上' | '下' | 'auto', now: Date = new Date()): EditionVolume | null {
  const t = term === 'auto' ? termOf(now) : term;
  return edition.volumes.find((v) => v.term === t) ?? null;
}

/** 版本資料的完整度（家長區顯示）：有生字或技能的單元數／總單元數 */
export function coverageOf(volume: EditionVolume): { units: number; withData: number; verified: number; missing: number } {
  const withData = volume.units.filter((u) => (u.chars?.length ?? 0) > 0 || (u.skills?.length ?? 0) > 0).length;
  return {
    units: volume.units.length,
    withData,
    verified: volume.units.filter((u) => u.confidence === 'verified').length,
    missing: volume.units.filter((u) => u.confidence === 'missing').length,
  };
}
