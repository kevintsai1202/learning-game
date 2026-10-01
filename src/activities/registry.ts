/**
 * 活動總表：集合各科活動，提供依建築、id 查詢。
 * 新增科目活動時，在這裡把該科的清單加進 ALL。
 */
import type { ZoneId } from '../store/useUi';
import { MATH_ACTIVITIES } from './math';
import { LIFE_ACTIVITIES } from './life';
import { RECYCLE_ACTIVITY } from './recycle';
import { EN_ACTIVITIES as EN_BASE } from './en';
import { ZH_LANGUAGE_ACTIVITIES as ZH_LANG_BASE } from './zhLanguage';
// 匯入國語生字模組時，同時註冊「本課生字」出題器（課本單元會用到）
import { ZH_CHARS_ACTIVITIES } from './zhChars';
import { examActivity } from './tower';
import type { ActivityDef } from './types';

/** 英語：除了字母描寫，其餘都是選擇題，可以用氣球射擊玩 */
const EN_ACTIVITIES: ActivityDef[] = EN_BASE.map((a) => (a.id === 'en.letter-write' ? a : { ...a, arcade: true }));

/** 國語語詞與句子：排序與閱讀以外都是選擇題，可以用氣球射擊玩 */
const ZH_LANGUAGE_ACTIVITIES: ActivityDef[] = ZH_LANG_BASE.map((a) => (a.id === 'zh.order' || a.id === 'zh.reading' ? a : { ...a, arcade: true }));

/** 各科活動（國語、英語、生活與健康的清單由各自模組提供） */
const SUBJECT_ACTIVITIES: ActivityDef[] = [...MATH_ACTIVITIES, RECYCLE_ACTIVITY, ...LIFE_ACTIVITIES, ...EN_ACTIVITIES, ...ZH_CHARS_ACTIVITIES, ...ZH_LANGUAGE_ACTIVITIES];

/** 挑戰塔的段考模擬 */
const TOWER_ACTIVITIES: ActivityDef[] = [
  examActivity('tower.math', 'math', '數學段考模擬', '📐', () => MATH_ACTIVITIES, '從數學各單元抽題，15 題、100 分制'),
  examActivity('tower.life', 'life', '生活與健康總複習', '🌈', () => LIFE_ACTIVITIES, '從生活與健康各主題抽題，15 題、100 分制'),
  examActivity('tower.zh', 'zh', '國語段考模擬', '📖', () => [...ZH_CHARS_ACTIVITIES, ...ZH_LANGUAGE_ACTIVITIES], '從國語生字、語詞、句子與閱讀抽題，15 題、100 分制'),
  examActivity('tower.en', 'en', '英語總複習', '🔤', () => EN_ACTIVITIES, '從英語各活動抽題，15 題、100 分制'),
];

export const ALL_ACTIVITIES: ActivityDef[] = [...SUBJECT_ACTIVITIES, ...TOWER_ACTIVITIES];

/** 某棟建築裡的活動 */
export function activitiesInZone(zone: ZoneId): ActivityDef[] {
  return ALL_ACTIVITIES.filter((a) => a.zone === zone);
}

/** 依 id 取得活動 */
export function getActivity(id: string): ActivityDef {
  const a = ALL_ACTIVITIES.find((x) => x.id === id);
  if (!a) throw new Error(`找不到活動：${id}`);
  return a;
}
