/**
 * 班級頁的「學習分析」（docs/plans/learning-report.md 第 2 節）：全班平均的雷達圖，選一位孩子時疊上他的；
 * 弱項指標表；AI 分析全班或這位孩子（送出拿工作編號、查結果）；分析結果可以一鍵「針對這些指標 AI 出題」。
 */
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '../../../online/useAccount';
import { useCloud } from '../../../online/useCloud';
import type { AnalysisJobStatus, AnalysisResult, TeacherAnalysisResponse } from '../../../online/protocol';
import type { TeacherReport } from '../../../content/aiAnalysis';
import { indicatorLabel } from '../../../content/indicators';
import { RadarChart } from '../../RadarChart';
import { AREA_AXES, areaValues } from '../../LearningReport';
import { usePackRequest } from './packRequest';

/** 錯誤訊息 */
const messageOf = (err: unknown) => (err instanceof Error ? err.message : '發生錯誤，請再試一次');
/** 百分比 */
const pct = (r: number) => `${Math.round(r * 100)}%`;
/** 多久查一次、最多等多久（毫秒） */
const POLL_MS = 1500;
const WAIT_MS = 180_000;

export function TeacherAnalysis({ code }: { code: string }) {
  const call = useAccount((s) => s.call);
  const aiOn = useCloud((s) => s.aiQuestions);
  const [data, setData] = useState<TeacherAnalysisResponse | null>(null);
  /** 選的孩子（空字串是全班） */
  const [member, setMember] = useState('');
  /** 分析結果（全班與每個孩子各自記住） */
  const [reports, setReports] = useState<Record<string, AnalysisResult>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/teacher/rooms/${code}`;

  const reload = useCallback(async () => {
    try {
      setData(await call<TeacherAnalysisResponse>('GET', `${base}/analysis`));
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [call, base]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** AI 分析全班或選的孩子 */
  const analyze = async () => {
    setBusy(true);
    setError(null);
    try {
      const { job } = await call<{ job: string }>('POST', `${base}/ai-analysis`, member ? { member } : {});
      const deadline = Date.now() + WAIT_MS;
      for (;;) {
        await new Promise((ok) => setTimeout(ok, POLL_MS));
        const r = await call<AnalysisJobStatus>('GET', `${base}/ai-analysis/${job}`);
        if (r.status === 'done') {
          setReports((all) => ({ ...all, [member]: r.result }));
          break;
        }
        if (r.status === 'failed') throw new Error(r.error);
        if (Date.now() > deadline) throw new Error('AI 分析太久沒有回應，請再試一次');
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <p className="gift-error">{error}</p> : null;
  const m = data.members.find((x) => x.id === member) ?? null;
  const classValues = areaValues(data.class.areas);
  const series = m
    ? [
        { name: m.nickname, values: areaValues(m.areas), kind: 'main' as const },
        { name: '全班平均', values: classValues, kind: 'compare' as const },
      ]
    : [{ name: '全班平均', values: classValues, kind: 'main' as const }];
  const weak = m ? m.weak : data.class.weak;
  const result = reports[member];
  const report: TeacherReport | null = result && result.source !== 'rules' && result.report.kind !== 'kid' ? result.report : null;
  /** 「針對這些指標 AI 出題」要勾的指標：AI 分析的重點，沒有就用弱項指標 */
  const focusKeys = report?.focus.length ? report.focus.map((f) => f.indicator) : weak.map((w) => w.key);

  return (
    <section className="teacher-analysis" data-testid="teacher-analysis">
      <h3 style={{ margin: '10px 0 4px' }}>📊 學習分析</h3>
      <p className="plain small-note">依孩子作答的課綱指標分成 9 個學習面向，數字是第一次就答對的比例；作答少於 5 題的面向不算。</p>
      <div className="q-field q-inline" style={{ margin: '6px 0' }}>
        <label>
          看誰
          <select value={member} onChange={(e) => setMember(e.target.value)} data-testid="analysis-member">
            <option value="">全班（{data.class.students} 人）</option>
            {data.members.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nickname}（{x.sessions} 回合）
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn small white" onClick={() => void reload()} data-testid="analysis-reload">
          🔄 更新數字
        </button>
      </div>
      <div className="analysis-grid">
        <RadarChart axes={AREA_AXES} series={series} testId="analysis-radar" />
        <div>
          <h4 style={{ margin: '4px 0' }}>{m ? `${m.nickname}的弱項指標` : '全班的弱項指標'}</h4>
          {weak.length === 0 ? (
            <p className="plain">作答還不夠多，等孩子多玩幾回合。</p>
          ) : (
            <table className="report-table" data-testid="analysis-weak">
              <thead>
                <tr>
                  <th>指標</th>
                  <th>一次答對率</th>
                  <th>作答</th>
                  {!m && <th>練過</th>}
                </tr>
              </thead>
              <tbody>
                {weak.map((w) => (
                  <tr key={w.key}>
                    <td>
                      <strong>{w.key.slice(w.key.indexOf(':') + 1)}</strong> {indicatorLabel(w.key)}
                    </td>
                    <td>{pct(w.rate)}</td>
                    <td>{w.attempts} 題</td>
                    {!m && <td>{'students' in w ? `${(w as { students: number }).students} 人` : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {aiOn && (
        <div className="analysis-actions">
          <button type="button" className="btn small purple" disabled={busy || weak.length === 0} onClick={() => void analyze()} data-testid="analysis-ai">
            {busy ? '分析中…' : m ? `🤖 AI 分析${m.nickname}` : '🤖 AI 分析全班'}
          </button>
          {busy && <span className="plain small-note">一次約需半分鐘到一分鐘</span>}
        </div>
      )}
      {error && (
        <p className="gift-error" data-testid="analysis-error">
          {error}
        </p>
      )}
      {report && (
        <div className="analysis-report card" data-testid="analysis-report">
          <p style={{ margin: '0 0 6px' }}>{report.summary}</p>
          {report.strengths.length > 0 && (
            <p className="plain" style={{ margin: '4px 0' }}>
              <strong>強項：</strong>
              {report.strengths.join('、')}
            </p>
          )}
          {report.focus.length > 0 && (
            <>
              <strong>要加強</strong>
              <ul data-testid="analysis-focus">
                {report.focus.map((f) => (
                  <li key={f.indicator}>
                    <strong>{f.indicator.slice(f.indicator.indexOf(':') + 1)}</strong> {indicatorLabel(f.indicator)}：{f.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          {report.tips.length > 0 && (
            <>
              <strong>教學建議</strong>
              <ul>
                {report.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}
          <p className="plain small-note" style={{ margin: '4px 0' }}>
            {result?.source === 'cache' ? '作答數字和上次分析差不多，這是上次的分析。' : 'AI 依匿名的作答統計寫的建議（不含孩子的名字），請斟酌使用。'}
          </p>
        </div>
      )}
      {aiOn && focusKeys.length > 0 && (
        <button type="button" className="btn small" onClick={() => usePackRequest.getState().request(focusKeys)} data-testid="analysis-make-questions">
          🤖 針對這些指標 AI 出題
        </button>
      )}
    </section>
  );
}
