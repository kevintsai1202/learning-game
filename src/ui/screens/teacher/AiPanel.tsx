/**
 * 老師 AI 出題的面板（docs/plans/ai-questions.md 第 1 節）：勾課綱指標（可多選、可跨科）、選題數、題型、難度，
 * 可以寫補充說明；按「開始出題」後每 5 題一批連續送出，每批出完就把草稿交給編輯器，顯示進度與今天還能出幾題。
 */
import { useState } from 'react';
import { useAccount } from '../../../online/useAccount';
import { AI_DIFFICULTY_LABELS, AI_MAX_INDICATORS, AI_MAX_TOTAL, AI_NOTE_MAX, AI_TYPES, AI_TYPE_LABELS, type AiDraft, type AiQuestionType } from '../../../content/aiQuestions';
import { planBatches } from '../../../store/packEditor';
import { IndicatorPicker } from './IndicatorPicker';
import { runAiJob } from './aiJob';

/** 題數的選項 */
const TOTALS = [5, 10, 15, 20].filter((n) => n <= AI_MAX_TOTAL);

export function AiPanel({
  code,
  avoid,
  initialIndicators,
  onDrafts,
  onClose,
}: {
  code: string;
  /** 預先勾好的指標（從學習分析跳過來時） */
  initialIndicators?: string[];
  /** 編輯器裡已經有的題目文字（避免重複） */
  avoid: string[];
  /** 一批草稿出好了 */
  onDrafts: (drafts: AiDraft[]) => void;
  onClose: () => void;
}) {
  const call = useAccount((s) => s.call);
  const [indicators, setIndicators] = useState<string[]>(() => (initialIndicators ?? []).slice(0, AI_MAX_INDICATORS));
  const [total, setTotal] = useState(5);
  const [types, setTypes] = useState<AiQuestionType[]>([...AI_TYPES]);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);
  const [note, setNote] = useState('');
  /** 進度：出好幾題／要出幾題；null 是沒在出 */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** 被丟掉的題目與原因（AI 出錯、檢查沒過） */
  const [dropped, setDropped] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<string | null>(null);

  const canStart = indicators.length > 0 && types.length > 0 && !progress;

  /** 一批一批出題：每批出完就交給編輯器；出錯就停在那一批 */
  const start = async () => {
    if (!canStart) return;
    setError(null);
    setFinished(null);
    setDropped([]);
    const batches = planBatches(total);
    const made: string[] = [];
    let done = 0;
    setProgress({ done, total });
    try {
      for (const count of batches) {
        const r = await runAiJob(call, code, {
          indicators,
          count,
          types,
          difficulty,
          ...(note.trim() ? { note: note.trim() } : {}),
          avoid: [...avoid, ...made].slice(-AI_MAX_TOTAL * 2),
        });
        made.push(...r.drafts.map((d) => d.question.prompt));
        onDrafts(r.drafts);
        done += count;
        setProgress({ done, total });
        setRemaining(r.remaining);
        if (r.dropped.length) setDropped((d) => [...d, ...r.dropped]);
      }
      setFinished(`出好了 ${made.length} 題，請在下面逐題檢查，再按「儲存」`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 出題失敗，請再試一次');
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="ai-panel card" data-testid="ai-panel">
      <div className="ai-panel-head">
        <h3 style={{ margin: 0, flex: 1 }}>🤖 AI 出題</h3>
        <button type="button" className="btn small white" onClick={onClose} disabled={!!progress} data-testid="ai-close">
          收起
        </button>
      </div>
      <p className="plain small-note">AI 依你勾的課綱出草稿，程式會先檢查格式與答案；每一題都要你看過、改好再儲存，孩子才看得到。</p>
      <div className="q-field">
        課綱指標（可以多選、跨科，最多 {AI_MAX_INDICATORS} 個）
        <IndicatorPicker value={indicators} onChange={setIndicators} max={AI_MAX_INDICATORS} testId="ai-indicators" />
      </div>
      <div className="q-field q-inline">
        <label>
          題數
          <select value={total} onChange={(e) => setTotal(Number(e.target.value))} data-testid="ai-total">
            {TOTALS.map((n) => (
              <option key={n} value={n}>
                {n} 題
              </option>
            ))}
          </select>
        </label>
        <label>
          難度
          <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value) as 1 | 2 | 3)} data-testid="ai-difficulty">
            {([1, 2, 3] as const).map((d) => (
              <option key={d} value={d}>
                {AI_DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="q-field q-inline">
        題型
        {AI_TYPES.map((t) => (
          <label key={t} className="q-check">
            <input
              type="checkbox"
              checked={types.includes(t)}
              onChange={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}
              data-testid={`ai-type-${t}`}
            />
            {AI_TYPE_LABELS[t]}
          </label>
        ))}
      </div>
      <label className="q-field">
        補充說明（可以不填，例如「第三課生字：山、水、火」「主題：中秋節」）
        <textarea rows={2} maxLength={AI_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} data-testid="ai-note" />
        <span className="small-note ai-privacy">請不要寫學生的姓名或個人資料：這段文字會送給 AI 服務出題。</span>
      </label>
      <div className="ai-panel-actions">
        <button type="button" className="btn" disabled={!canStart} onClick={() => void start()} data-testid="ai-generate">
          {progress ? '出題中…' : '🤖 開始出題'}
        </button>
        {progress && (
          <span className="plain" data-testid="ai-progress">
            熊熊老師正在出題…已出 {progress.done}／{progress.total} 題（一批約需半分鐘到一分鐘）
          </span>
        )}
        {remaining !== null && !progress && (
          <span className="plain small-note" data-testid="ai-remaining">
            今天還能出 {remaining} 題
          </span>
        )}
      </div>
      {finished && (
        <p className="notice" data-testid="ai-finished">
          {finished}
        </p>
      )}
      {error && (
        <p className="gift-error" data-testid="ai-error">
          {error}
        </p>
      )}
      {dropped.length > 0 && (
        <details className="ai-dropped" data-testid="ai-dropped">
          <summary>有 {dropped.length} 題沒有通過檢查，已經丟掉</summary>
          <ul>
            {dropped.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
