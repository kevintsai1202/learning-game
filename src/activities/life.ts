/**
 * 生活與健康屋的活動：每個主題一個活動，固定題庫、不分難度，每回合 10 題。
 */
import { LIFE_TOPICS, makeLifeQuestions } from '../engine/life';
import type { ActivityDef } from './types';

export const LIFE_ACTIVITIES: ActivityDef[] = LIFE_TOPICS.map((t) => ({
  id: t.id,
  zone: 'life' as const,
  subject: 'life' as const,
  title: t.title,
  icon: t.icon,
  group: t.group,
  // 活動涵蓋的課綱代碼：題庫裡所有題目用到的代碼聯集
  indicators: [...new Set(t.items.flatMap((i) => i.indicators))],
  count: 10,
  levels: false,
  description: t.description,
  make: (opts) => makeLifeQuestions(t, opts),
}));
