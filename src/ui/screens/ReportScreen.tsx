/**
 * 孩子的學習報告（docs/plans/learning-report.md 第 2 節）：島上按「📊 學習報告」打開。
 * 雷達圖（9 個學習面向的一次答對率）、一句鼓勵與最多 3 個建議（按 🔊 唸、按「去練習」到那一棟建築）、面向清單。
 * 雲端角色由熊熊老師（AI）寫建議；單機或連不上時用規則建議。
 */
import { useEffect, useMemo } from 'react';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { areaStats, areaById } from '../../content/learningAreas';
import { nameHere } from '../../store/island';
import { useReport } from '../../online/useReport';
import { RadarChart } from '../RadarChart';
import { AREA_AXES, AreaTable, areaValues, kidAdvice } from '../LearningReport';
import { REPORT_LINES } from '../lines';
import { KidText } from '../KidText';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';

export function ReportScreen() {
  const profile = useGame((s) => s.profile());
  const goto = useUi((s) => s.goto);
  const enterZone = useUi((s) => s.enterZone);
  const status = useReport((s) => s.status);
  const report = useReport((s) => s.report);
  const note = useReport((s) => s.note);
  const load = useReport((s) => s.load);
  const stats = useMemo(() => areaStats(profile?.indicators ?? {}), [profile?.indicators]);
  const hasData = stats.some((s) => s.rate !== null);
  const advice = kidAdvice(stats, status === 'ai' ? report : null);

  // 打開時唸開場、開始分析（同一個角色已經分析過就用上次的結果）
  useEffect(() => {
    speak(hasData ? REPORT_LINES.intro : REPORT_LINES.noData);
    if (hasData) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!profile) return null;
  return (
    <div className="panel-screen">
      <div className="panel card report-panel" role="dialog" aria-label="學習報告">
        <div className="panel-head">
          <span className="ribbon" style={{ background: 'var(--sea)' }}>
            📊 學習報告
          </span>
          <h2 style={{ fontSize: 22 }}>
            <KidText text={`${nameHere(profile)}的本領`} />
          </h2>
          <button className="btn small white" onClick={() => goto('island')} data-testid="report-back">
            回島上
          </button>
        </div>
        <div className="panel-body report-body">
          <RadarChart axes={AREA_AXES} series={[{ name: nameHere(profile), values: areaValues(stats), kind: 'main' }]} testId="report-radar" />
          <div className="report-advice">
            {status === 'loading' && (
              <p className="plain" data-testid="report-loading">
                🐻 熊熊老師正在看你的報告…
              </p>
            )}
            {advice.cheer && status !== 'loading' && (
              <div className="report-cheer" data-testid="report-cheer">
                <KidText text={advice.cheer} />
                <button className="btn round white small-say" onClick={() => speak(advice.cheer!)} aria-label="唸出來">
                  🔊
                </button>
              </div>
            )}
            {status !== 'loading' &&
              advice.tips.map((t) => {
                const a = areaById(t.area);
                return (
                  <div key={t.area} className="report-tip" data-testid={`report-tip-${t.area}`}>
                    <span className="report-tip-emoji">{a.emoji}</span>
                    <KidText text={t.text} />
                    <button className="btn round white small-say" onClick={() => speak(t.text)} aria-label="唸出來">
                      🔊
                    </button>
                    <button
                      className="btn small green"
                      onClick={() => {
                        sfx.door();
                        enterZone(a.zone);
                      }}
                      data-testid={`report-go-${t.area}`}
                    >
                      去練習 ▶
                    </button>
                  </div>
                );
              })}
            {status === 'ai' && <p className="plain small-note" data-testid="report-source">🐻 熊熊老師（AI）看了你的作答寫的建議</p>}
            {note && <p className="plain small-note">{note}</p>}
          </div>
          <AreaTable stats={stats} testId="report-areas" />
        </div>
      </div>
    </div>
  );
}
