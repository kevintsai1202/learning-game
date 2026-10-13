/**
 * 學習報告的共用元件（docs/plans/learning-report.md 第 2 節）：孩子的學習報告與家長分頁共用。
 * - AreaTable：9 個面向的清單（答對率長條、作答題數），也是雷達圖的數據表
 * - kidAdvice：要給孩子的鼓勵與建議（有 AI 的分析就用，否則用規則建議）
 */
import type { AreaStat, AreaId } from '../content/learningAreas';
import { LEARNING_AREAS, areaById, ruleTipAreas } from '../content/learningAreas';
import type { KidReport } from '../content/aiAnalysis';
import { REPORT_LINES, REPORT_TIPS } from './lines';
import { KidText } from './KidText';
import type { RadarAxis } from './RadarChart';

/** 雷達圖的軸（9 個面向） */
export const AREA_AXES: RadarAxis[] = LEARNING_AREAS.map((a) => ({ id: a.id, label: a.label, short: a.short, emoji: a.emoji }));

/** 面向的數值（依雷達圖的順序） */
export const areaValues = (stats: { area: AreaId; rate: number | null }[]) => LEARNING_AREAS.map((a) => stats.find((s) => s.area === a.id)?.rate ?? null);

/** 面向清單：長條是一次答對率，作答太少寫「練習太少」 */
export function AreaTable({ stats, testId }: { stats: AreaStat[]; testId?: string }) {
  return (
    <table className="area-table" data-testid={testId}>
      <tbody>
        {stats.map((s) => {
          const a = areaById(s.area);
          return (
            <tr key={s.area} data-testid={testId ? `${testId}-${s.area}` : undefined}>
              <th scope="row">
                <span>{a.emoji}</span> <KidText text={a.label} />
              </th>
              <td className="area-bar-cell">
                <span className="area-bar">
                  <i style={{ width: `${Math.round((s.rate ?? 0) * 100)}%` }} />
                </span>
              </td>
              <td className="area-pct">{s.rate === null ? <span className="plain">練習太少</span> : `${Math.round(s.rate * 100)}%`}</td>
              <td className="area-count plain">{s.attempts} 題</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 給孩子的一個建議：哪個面向、說什麼、是不是預錄的固定句子 */
export interface KidTip {
  area: AreaId;
  text: string;
}

/** 要給孩子的鼓勵與建議：有 AI 的分析就用；否則規則建議（最弱的面向配固定句子），都很好時只鼓勵 */
export function kidAdvice(stats: AreaStat[], report: KidReport | null): { cheer: string | null; tips: KidTip[] } {
  if (report) return { cheer: report.cheer, tips: report.tips };
  if (!stats.some((s) => s.rate !== null)) return { cheer: REPORT_LINES.noData, tips: [] };
  const areas = ruleTipAreas(stats);
  const tips = areas.map((area) => ({ area, text: REPORT_TIPS[area] }));
  return { cheer: tips.length ? null : REPORT_LINES.allGood, tips };
}
