/**
 * 生活與健康科的題材總表：每個活動一份種子題庫與選單資訊。
 */
import { COMMUNITY_ITEMS } from './community';
import { EMOTION_ITEMS } from './emotion';
import { ENVIRONMENT_ITEMS } from './environment';
import { HEALTH_ITEMS } from './health';
import { NATURE_ITEMS } from './nature';
import { SAFETY_ITEMS } from './safety';
import { SEASON_ITEMS } from './season';
import { TRAFFIC_ITEMS } from './traffic';
import type { LifeItem } from './types';

export type { LifeItem } from './types';
export { LIFE_INDICATORS } from './codes';

/** 一個生活與健康活動的題材 */
export interface LifeTopic {
  /** 活動 id（同時是題目的 skill），題目 id 為「活動 id:兩位數流水號」 */
  id: string;
  title: string;
  icon: string;
  /** 選單分組標題 */
  group: string;
  description: string;
  /** 種子題庫；只能在最後面追加，不要改順序 */
  items: LifeItem[];
}

/** 全部活動題材（選單顯示順序） */
export const LIFE_TOPICS: LifeTopic[] = [
  { id: 'life.season', title: '四季與天氣', icon: '🌦️', group: '認識周遭', description: '春夏秋冬有什麼不一樣？天氣變了要怎麼穿？', items: SEASON_ITEMS },
  { id: 'life.nature', title: '動物與植物', icon: '🌱', group: '認識周遭', description: '觀察動物和植物怎麼長大，學會照顧牠們。', items: NATURE_ITEMS },
  { id: 'life.community', title: '家人、學校與社區', icon: '🏘️', group: '認識周遭', description: '社區裡有哪些地方、哪些人在幫助我們？', items: COMMUNITY_ITEMS },
  { id: 'life.environment', title: '愛護環境與垃圾分類', icon: '♻️', group: '愛護與習慣', description: '垃圾要怎麼分？怎麼省水、省電、愛護地球？', items: ENVIRONMENT_ITEMS },
  { id: 'life.health', title: '健康好習慣', icon: '🧼', group: '愛護與習慣', description: '洗手、刷牙、均衡吃，做個健康小孩。', items: HEALTH_ITEMS },
  { id: 'life.traffic', title: '交通安全', icon: '🚦', group: '安全與相處', description: '紅綠燈、斑馬線、搭車，平安上學去。', items: TRAFFIC_ITEMS },
  { id: 'life.safety', title: '安全小達人', icon: '🛟', group: '安全與相處', description: '地震、火災、防溺水、遇到陌生人怎麼辦？', items: SAFETY_ITEMS },
  { id: 'life.emotion', title: '情緒與相處', icon: '🤝', group: '安全與相處', description: '認識心情，學會感謝、道歉與分享。', items: EMOTION_ITEMS },
];
