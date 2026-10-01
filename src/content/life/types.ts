/**
 * 生活與健康題庫的資料格式與撰寫輔助函式。
 * 題庫以「種子題庫」形式寫在各主題檔，出題時由 src/engine/life 打散取題。
 * 注意：題目的 id 由「活動 id + 題庫順序」決定，之後新增題目請一律加在陣列最後面，
 * 不要插入或調換順序，否則錯題本裡記錄的舊 id 會對到不同題目。
 */
import type { ChoiceOption, Visual } from '../../core/types';

/** 預設的題目依據說明 */
export const SELF_MADE = '依 108 課綱自編';

/** 題庫共同欄位 */
interface LifeItemBase {
  prompt: string;
  /** 朗讀文字；省略時若 prompt 含 emoji，會自動去掉 emoji 後朗讀 */
  speak?: string;
  explain: string;
  /** 108 課綱代碼（須收錄在 LIFE_INDICATORS） */
  indicators: string[];
  source: string;
  visual?: Visual;
}

/** 單選題：right 為正解，wrong 為誘答（出題時與正解一起打散） */
export interface LifeChoiceItem extends LifeItemBase {
  kind: 'choice';
  right: ChoiceOption;
  wrong: ChoiceOption[];
}

/** 是非題：選項固定為「對／錯」，不打散 */
export interface LifeTrueFalseItem extends LifeItemBase {
  kind: 'tf';
  truth: boolean;
}

/** 排序題：steps 為正確順序 */
export interface LifeOrderItem extends LifeItemBase {
  kind: 'order';
  steps: string[];
}

export type LifeItem = LifeChoiceItem | LifeTrueFalseItem | LifeOrderItem;

/** 撰寫題目時可選的額外欄位 */
export interface ItemExtra {
  speak?: string;
  source?: string;
  visual?: Visual;
}

/** 把「文字|emoji」簡寫轉成選項，例如 '春天|🌸'；沒有 | 時只有文字 */
export function opt(s: string): ChoiceOption {
  const [text, emoji] = s.split('|');
  return emoji ? { text, emoji } : { text };
}

/** 寫一題單選題：right 與 wrong 都用「文字|emoji」簡寫 */
export function choice(prompt: string, right: string, wrong: string[], explain: string, indicators: string[], extra: ItemExtra = {}): LifeChoiceItem {
  return { kind: 'choice', prompt, right: opt(right), wrong: wrong.map(opt), explain, indicators, source: extra.source ?? SELF_MADE, speak: extra.speak, visual: extra.visual };
}

/** 寫一題是非題：truth 為這個敘述是否正確 */
export function tf(prompt: string, truth: boolean, explain: string, indicators: string[], extra: ItemExtra = {}): LifeTrueFalseItem {
  return { kind: 'tf', prompt, truth, explain, indicators, source: extra.source ?? SELF_MADE, speak: extra.speak, visual: extra.visual };
}

/** 寫一題排序題：steps 依正確順序給 */
export function order(prompt: string, steps: string[], explain: string, indicators: string[], extra: ItemExtra = {}): LifeOrderItem {
  return { kind: 'order', prompt, steps, explain, indicators, source: extra.source ?? SELF_MADE, speak: extra.speak, visual: extra.visual };
}
