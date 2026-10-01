/**
 * 射擊模式的題目轉換：把題目變成「最多 4 個答案氣球」的單選題。
 * - 數字題：加上常見錯誤的誘答數字
 * - 單選題：保留正解，最多再挑 3 個誘答；只有圖形（沒有文字或 emoji）的選項無法畫在氣球上，略過
 * - 其他題型（撥時鐘、付錢、排序、描寫）不適合射擊，回傳 null
 * 題目 id 不變，錯題本與「最近做過」都把它當成同一題。
 */
import type { Rng } from '../core/rng';
import type { ChoiceOption, ChoiceQuestion, Question, Visual } from '../core/types';
import { numberDistractors } from '../engine/util';

/** 射擊模式橫幅放得下的附圖（其餘附圖太大，題目不適合射擊） */
const BANNER_VISUALS: Visual['kind'][] = ['emoji', 'vertical', 'clock', 'bigtext', 'shape', 'money'];

/** 選項能不能畫在氣球上 */
const drawable = (o: ChoiceOption) => !!(o.text || o.emoji);

/** 轉成射擊模式的題目；不適合時回傳 null */
export function toArcade(q: Question, rng: Rng): ChoiceQuestion | null {
  if (q.visual && !BANNER_VISUALS.includes(q.visual.kind)) return null;
  if (q.type === 'number') {
    let wrong = numberDistractors(rng, q.answer, 0, Math.max(20, q.answer * 2 + 20)).slice(0, 3);
    // 誘答不夠時補上 ±1、±2
    for (const d of [1, -1, 2, -2, 3, 10]) {
      if (wrong.length >= 3) break;
      const v = q.answer + d;
      if (v >= 0 && v !== q.answer && !wrong.includes(v)) wrong.push(v);
    }
    wrong = wrong.slice(0, 3);
    const unit = q.unit ? ` ${q.unit}` : '';
    const values = rng.shuffle([q.answer, ...wrong]);
    return {
      ...q,
      type: 'choice',
      options: values.map((v) => ({ text: `${v}${unit}` })),
      answer: values.indexOf(q.answer),
    };
  }
  if (q.type === 'choice') {
    const correct = q.options[q.answer];
    if (!drawable(correct)) return null;
    const others = rng.shuffle(q.options.filter((o, i) => i !== q.answer && drawable(o))).slice(0, 3);
    if (others.length === 0) return null;
    const options = rng.shuffle([correct, ...others]);
    return { ...q, options, answer: options.indexOf(correct) };
  }
  return null;
}

/** 射擊計分（只用於畫面顯示，不影響星星與金幣）：答對 100 分，連擊每次多 20 分 */
export function hitPoints(combo: number): number {
  return 100 + Math.max(0, combo - 1) * 20;
}
