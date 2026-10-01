/**
 * 生活村的 3D 小遊戲：垃圾分類大作戰（在 3D 舞台上點垃圾桶作答）。
 */
import { genRecycle } from '../engine/life/recycle';
import type { ActivityDef } from './types';

export const RECYCLE_ACTIVITY: ActivityDef = {
  id: 'life.recycle3d',
  zone: 'life',
  subject: 'life',
  title: '垃圾分類大作戰',
  icon: '♻️',
  group: '3D 小遊戲',
  indicators: ['B-Ⅰ-3', '6-Ⅰ-5'],
  count: 10,
  levels: false,
  description: '點舞台上的垃圾桶，把東西丟進正確的桶子',
  make: genRecycle,
};
