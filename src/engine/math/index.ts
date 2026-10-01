/**
 * 數學技能清單：每個技能對應一個出題器與課綱代碼。
 * 活動（遊戲關卡）從這裡挑技能出題；家長報表也用這份清單顯示技能名稱。
 */
import type { QuestionGenerator } from '../../core/types';
import { genAdd, genCompare, genEstimate, genPlaceValue, genSub, genWordAddSub } from './number';
import { genMulMeaning, genShare, genTimes, genTwoStep } from './multiply';
import { genClockRead, genClockSet, genTimeUnits } from './time';
import { genFraction, genLength, genMeasureCompare, genMoneyCount, genMoneyPay, genPerimeter } from './measure';
import { genChart, genShapes } from './geometry';

/** 數學技能 */
export interface MathSkill {
  id: string;
  /** 顯示名稱 */
  title: string;
  icon: string;
  /** 課綱代碼（技能層級；個別題目可能更細） */
  indicators: string[];
  generate: QuestionGenerator;
}

export const MATH_SKILLS: MathSkill[] = [
  { id: 'math.place-value', title: '一千以內的數', icon: '🔢', indicators: ['N-2-1'], generate: genPlaceValue },
  { id: 'math.add', title: '直式加法', icon: '➕', indicators: ['N-2-2'], generate: genAdd },
  { id: 'math.sub', title: '直式減法', icon: '➖', indicators: ['N-2-2'], generate: genSub },
  { id: 'math.word-addsub', title: '加減應用題', icon: '📝', indicators: ['N-2-3'], generate: genWordAddSub },
  { id: 'math.compare', title: '比大小', icon: '⚖️', indicators: ['R-2-1', 'R-2-2'], generate: genCompare },
  { id: 'math.estimate', title: '估一估', icon: '🤔', indicators: ['N-2-4'], generate: genEstimate },
  { id: 'math.mul-meaning', title: '乘法的意義', icon: '🍎', indicators: ['N-2-6'], generate: genMulMeaning },
  { id: 'math.times', title: '十十乘法', icon: '✖️', indicators: ['N-2-7'], generate: genTimes },
  { id: 'math.two-step', title: '兩步驟問題', icon: '🧩', indicators: ['N-2-8'], generate: genTwoStep },
  { id: 'math.share', title: '分裝與平分', icon: '🍬', indicators: ['N-2-9'], generate: genShare },
  { id: 'math.fraction', title: '單位分數', icon: '🍕', indicators: ['N-2-10'], generate: genFraction },
  { id: 'math.length', title: '公分與公尺', icon: '📏', indicators: ['N-2-11', 'S-2-3'], generate: genLength },
  { id: 'math.measure-compare', title: '比多少、比輕重', icon: '🫙', indicators: ['N-2-12', 'S-2-5'], generate: genMeasureCompare },
  { id: 'math.clock-read', title: '看時鐘', icon: '🕒', indicators: ['N-2-13'], generate: genClockRead },
  { id: 'math.clock-set', title: '撥時鐘', icon: '⏰', indicators: ['N-2-13'], generate: genClockSet },
  { id: 'math.time-units', title: '星期與月曆', icon: '📅', indicators: ['N-2-14'], generate: genTimeUnits },
  { id: 'math.money-count', title: '數錢', icon: '💰', indicators: ['N-2-5'], generate: genMoneyCount },
  { id: 'math.money-pay', title: '買東西付錢', icon: '🛒', indicators: ['N-2-5'], generate: genMoneyPay },
  { id: 'math.shapes', title: '形狀與形體', icon: '🔺', indicators: ['S-2-1', 'S-2-2'], generate: genShapes },
  { id: 'math.perimeter', title: '繞一圈多長', icon: '🟦', indicators: ['S-2-4'], generate: genPerimeter },
  { id: 'math.chart', title: '看統計圖', icon: '📊', indicators: ['D-2-1'], generate: genChart },
];

/** 依 id 取得技能，找不到時丟出錯誤 */
export function getMathSkill(id: string): MathSkill {
  const s = MATH_SKILLS.find((x) => x.id === id);
  if (!s) throw new Error(`找不到數學技能：${id}`);
  return s;
}
