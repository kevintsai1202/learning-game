/**
 * 學習報告的雷達圖（docs/plans/learning-report.md 第 2 節）：每個軸是一個學習面向，數值是一次答對率（0～100%）。
 * 主角（孩子或選的那位學生）用強調色實線＋淡色填滿，對照（全班平均）用灰色虛線；兩條時有圖例。
 * 形狀畫在 SVG，軸的名稱放 HTML（注音字型要在 DOM 裡才有注音）；每個頂點滑過或點一下顯示數值。
 * 作答太少的面向（null）畫在中心、名稱變灰，提示寫「練習太少」。
 */
import { useState } from 'react';
import { KidText } from './KidText';

/** 一個軸 */
export interface RadarAxis {
  id: string;
  /** 完整名稱（提示與無障礙用） */
  label: string;
  /** 軸上顯示的短名稱（沒給就用 label） */
  short?: string;
  emoji: string;
}

/** 一條數列：values 和軸一一對應，0～1，null 是練習太少 */
export interface RadarSeries {
  name: string;
  values: (number | null)[];
  /** main 是主角，compare 是對照 */
  kind: 'main' | 'compare';
}

/** SVG 的邊長（viewBox）、圓心、半徑、軸名稱離圓心多遠 */
const SIZE = 300;
const C = SIZE / 2;
const R = 92;
const LABEL_R = R + 34;
/** 刻度圈 */
const RINGS = [0.25, 0.5, 0.75, 1];

/** 第 i 個軸、比例 v 的座標（第一個軸朝正上方，順時針） */
function point(i: number, n: number, v: number): [number, number] {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return [C + Math.cos(a) * R * v, C + Math.sin(a) * R * v];
}

/** 百分比文字 */
const pct = (v: number | null) => (v === null ? '練習太少' : `${Math.round(v * 100)}%`);

export function RadarChart({ axes, series, testId }: { axes: RadarAxis[]; series: RadarSeries[]; testId?: string }) {
  const n = axes.length;
  /** 滑過或點的軸 */
  const [active, setActive] = useState<number | null>(null);
  const main = series.find((s) => s.kind === 'main') ?? series[0];
  const compare = series.find((s) => s.kind === 'compare');
  /** 數列的多邊形頂點（null 畫在中心） */
  const polygon = (s: RadarSeries) => s.values.map((v, i) => point(i, n, v ?? 0).join(',')).join(' ');

  return (
    <figure className="radar" data-testid={testId}>
      <div className="radar-box">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`雷達圖：${axes.map((a, i) => `${a.label} ${pct(main?.values[i] ?? null)}`).join('、')}`}>
          {/* 刻度圈與軸線 */}
          {RINGS.map((r) => (
            <polygon key={r} className="radar-ring" points={axes.map((_, i) => point(i, n, r).join(',')).join(' ')} />
          ))}
          {axes.map((a, i) => {
            const [x, y] = point(i, n, 1);
            return <line key={a.id} className="radar-axis" x1={C} y1={C} x2={x} y2={y} />;
          })}
          {compare && <polygon className="radar-compare" points={polygon(compare)} data-testid={testId ? `${testId}-compare` : undefined} />}
          {main && <polygon className="radar-main" points={polygon(main)} data-testid={testId ? `${testId}-main` : undefined} />}
          {/* 主角的頂點：滑過或點一下顯示數值（點擊範圍比圓點大） */}
          {main?.values.map((v, i) => {
            const [x, y] = point(i, n, v ?? 0);
            return (
              <g key={axes[i].id} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => setActive(active === i ? null : i)}>
                <circle cx={x} cy={y} r={14} fill="transparent" />
                {v !== null && <circle className="radar-dot" cx={x} cy={y} r={4} />}
                <title>{`${axes[i].label}：${pct(v)}${compare ? `，${compare.name} ${pct(compare.values[i])}` : ''}`}</title>
              </g>
            );
          })}
        </svg>
        {/* 軸的名稱（HTML，注音字型才有注音） */}
        {axes.map((a, i) => {
          const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
          const x = C + Math.cos(angle) * LABEL_R;
          const y = C + Math.sin(angle) * LABEL_R;
          const v = main?.values[i] ?? null;
          return (
            <button
              key={a.id}
              type="button"
              className={`radar-label ${v === null ? 'empty' : ''} ${active === i ? 'on' : ''}`}
              style={{ left: `${(x / SIZE) * 100}%`, top: `${(y / SIZE) * 100}%` }}
              onClick={() => setActive(active === i ? null : i)}
              data-testid={testId ? `${testId}-label-${a.id}` : undefined}
            >
              <span>{a.emoji}</span>
              <KidText text={a.short ?? a.label} />
            </button>
          );
        })}
      </div>
      {/* 數值提示放在圖的下面（不蓋住下方的軸名稱）；沒選的時候留同樣的高度，畫面不跳動 */}
      <div className="radar-tip" role="status" data-testid={testId ? `${testId}-tip` : undefined}>
        {active !== null ? (
          <>
            {axes[active].emoji} {axes[active].label}：{pct(main?.values[active] ?? null)}
            {compare && `（${compare.name} ${pct(compare.values[active])}）`}
          </>
        ) : (
          <span className="plain small-note">點面向的名稱看數字</span>
        )}
      </div>
      {series.length > 1 && (
        <figcaption className="radar-legend">
          {series.map((s) => (
            <span key={s.name} className={`radar-key ${s.kind}`}>
              <i />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
