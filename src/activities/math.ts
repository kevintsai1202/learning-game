/**
 * 數學城堡的活動：每個數學技能是一個活動，依單元分組。
 */
import { MATH_SKILLS } from '../engine/math';
import type { ActivityDef } from './types';

/** 適合氣球射擊模式的技能（題目以數字或文字選項為主） */
const ARCADE_SKILLS = new Set([
  'math.place-value',
  'math.add',
  'math.sub',
  'math.word-addsub',
  'math.compare',
  'math.estimate',
  'math.mul-meaning',
  'math.times',
  'math.two-step',
  'math.share',
  'math.money-count',
  'math.clock-read',
  'math.time-units',
  'math.measure-compare',
  'math.perimeter',
]);

/** 技能分組（選單顯示順序） */
const GROUPS: { title: string; skills: string[] }[] = [
  { title: '數與計算', skills: ['math.place-value', 'math.add', 'math.sub', 'math.word-addsub', 'math.compare', 'math.estimate'] },
  { title: '乘法與分裝', skills: ['math.mul-meaning', 'math.times', 'math.two-step', 'math.share'] },
  { title: '時間', skills: ['math.clock-read', 'math.clock-set', 'math.time-units'] },
  { title: '量與實測', skills: ['math.money-count', 'math.money-pay', 'math.length', 'math.measure-compare', 'math.fraction'] },
  { title: '圖形與統計', skills: ['math.shapes', 'math.perimeter', 'math.chart'] },
];

export const MATH_ACTIVITIES: ActivityDef[] = GROUPS.flatMap((g) =>
  g.skills.map((id) => {
    const s = MATH_SKILLS.find((x) => x.id === id);
    if (!s) throw new Error(`數學活動分組裡的技能不存在：${id}`);
    return {
      id: s.id,
      zone: 'math' as const,
      subject: 'math' as const,
      title: s.title,
      icon: s.icon,
      group: g.title,
      indicators: s.indicators,
      count: 10,
      levels: true,
      arcade: ARCADE_SKILLS.has(s.id),
      make: s.generate,
    };
  }),
);
