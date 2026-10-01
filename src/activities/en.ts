/**
 * 英語屋的活動：字母（描寫、配對、聽字母、開頭音）、單字圖卡（綜合與各主題）、生活與教室用語、句型。
 * 二年級沒有國定英語課，內容依臺北市、新北市低年級英語綱要與國定第二學習階段（前導）自編；
 * 不要求拼寫，書寫只做字母描寫。
 */
import { EN_SKILLS } from '../engine/en';
import type { ActivityDef } from './types';

export const EN_ACTIVITIES: ActivityDef[] = EN_SKILLS.map((s) => ({
  id: s.id,
  zone: 'en' as const,
  subject: 'en' as const,
  title: s.title,
  icon: s.icon,
  group: s.group,
  indicators: s.indicators,
  count: s.count,
  levels: s.levels,
  description: s.description,
  make: s.generate,
}));
