/**
 * 國語「本課生字」出題器的接口：國語生字模組載入時註冊實作，
 * 課本單元活動（activities/units.ts）透過這裡取用。尚未註冊時單元活動不出題。
 */
import type { GenerateOptions, Question } from '../../core/types';

/** 一課的出題素材 */
export interface CharUnitInput {
  /** 本課生字 */
  chars: string[];
  /** 本課語詞（可為空） */
  words: string[];
  /** 單元識別（組題目 id 用） */
  unitId: string;
}

export type CharUnitGenerator = (input: CharUnitInput, opts: GenerateOptions) => Question[];

let impl: CharUnitGenerator | null = null;

/** 國語生字模組呼叫：註冊實作 */
export function registerCharUnitGenerator(g: CharUnitGenerator): void {
  impl = g;
}

/** 取得已註冊的實作（沒有時回傳 null） */
export function charUnitGenerator(): CharUnitGenerator | null {
  return impl;
}
