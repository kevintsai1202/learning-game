/**
 * 活動查詢：固定活動、自訂題庫、課本單元與段考模擬（依目前小朋友的教材版本動態產生）。
 */
import { ALL_ACTIVITIES } from './registry';
import { examActivities, unitActivities } from './units';
import type { ActivityDef } from './types';
import { GENERIC_EDITION, currentVolume } from '../content/editions';
import type { Edition } from '../content/editions/schema';
import type { CurriculumChoice } from '../store/save';
import type { ZoneId } from '../store/useUi';

/** 解析出來的活動快取（結算畫面、3D 舞台要用標題與科目） */
const remembered = new Map<string, ActivityDef>();

/** 記住一個活動 */
export function rememberActivity(a: ActivityDef): void {
  remembered.set(a.id, a);
}

/** 依 id 找活動：先找記住的，再找固定活動 */
export function findActivity(id: string): ActivityDef | undefined {
  return remembered.get(id) ?? ALL_ACTIVITIES.find((a) => a.id === id);
}

/** 取得某科目前選用的版本與這一冊（通用版或缺資料時回傳 null） */
export function currentBook(all: Edition[], curriculum: CurriculumChoice, subject: 'zh' | 'math') {
  const id = curriculum[subject];
  if (id === GENERIC_EDITION) return null;
  const edition = all.find((e) => e.id === id && e.subject === subject);
  if (!edition) return null;
  const volume = currentVolume(edition, curriculum.term);
  return volume ? { edition, volume } : null;
}

/** 依小朋友的版本設定，取得某棟建築的課本相關活動（單元或段考模擬） */
export function curriculumActivities(zone: ZoneId, all: Edition[], curriculum: CurriculumChoice): ActivityDef[] {
  const out: ActivityDef[] = [];
  if (zone === 'zh' || zone === 'math') {
    const book = currentBook(all, curriculum, zone);
    if (book) out.push(...unitActivities(book.edition, book.volume));
  }
  if (zone === 'tower') {
    for (const subject of ['zh', 'math'] as const) {
      const book = currentBook(all, curriculum, subject);
      if (book) out.push(...examActivities(book.edition, book.volume));
    }
  }
  out.forEach(rememberActivity);
  return out;
}
