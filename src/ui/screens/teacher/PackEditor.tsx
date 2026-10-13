/**
 * 班級題庫編輯器（G6，docs/plans/teacher-gm.md 第 7.3 節；docs/plans/ai-questions.md）：
 * 題庫名稱、題目清單（每題預覽孩子看到的樣子）、新增、修改、刪除、上下移動；AI 出題的草稿也放進來，
 * 標「AI 草稿」與提醒，老師逐題檢查、可以單題重出。按「儲存」才存到伺服器（新增或換掉整包）。
 */
import { useMemo, useRef, useState } from 'react';
import { useAccount } from '../../../online/useAccount';
import { useCloud } from '../../../online/useCloud';
import type { Question } from '../../../core/types';
import type { ContentPack } from '../../../content/schema';
import type { AiDraft, AiQuestionType } from '../../../content/aiQuestions';
import { AI_TYPES } from '../../../content/aiQuestions';
import { EDITOR_TYPES, EDITOR_TYPE_LABELS, buildPack, finalizeQuestion, indicatorKeysOf, newQuestion, questionProblems, type EditorType } from '../../../store/packEditor';
import { warningsOf } from '../../../content/aiQuestions';
import { hasZhuyin } from '../../../content/zhuyinCharset';
import { QuestionPreview } from './QuestionPreview';
import { QuestionForm } from './QuestionForm';
import { AiPanel } from './AiPanel';
import { runAiJob } from './aiJob';

/** 編輯中的一題：題目、AI 給的提醒、是不是 AI 草稿（老師改過就不算草稿） */
interface Draft {
  q: Question;
  warnings: string[];
  ai: boolean;
}

/** 新題目的 id（同一包裡不重複即可） */
const newId = () => `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function PackEditor({
  code,
  packId,
  initial,
  startWithAi,
  onClose,
}: {
  code: string;
  /** 要修改的題庫；null 是新的 */
  packId: string | null;
  initial: ContentPack | null;
  /** 打開就展開 AI 出題 */
  startWithAi: boolean;
  /** 關掉：saved 是存好後的訊息，沒存是 null */
  onClose: (saved: string | null) => void;
}) {
  const call = useAccount((s) => s.call);
  const aiOn = useCloud((s) => s.aiQuestions);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [drafts, setDrafts] = useState<Draft[]>(() => (initial?.questions ?? []).map((q) => ({ q, warnings: [], ai: false })));
  /** 正在編輯第幾題 */
  const [editing, setEditing] = useState<number | null>(null);
  const [showAi, setShowAi] = useState(startWithAi && aiOn);
  const [addType, setAddType] = useState<EditorType>('choice');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** 正在重出的題目 id */
  const [redoing, setRedoing] = useState<string | null>(null);
  const [redoError, setRedoError] = useState<string | null>(null);
  /** 儲存用的打亂種子（排序題的詞卡） */
  const seed = useRef(Math.floor(Math.random() * 1e9));

  const prompts = useMemo(() => drafts.map((d) => d.q.prompt).filter(Boolean), [drafts]);
  const aiCount = drafts.filter((d) => d.ai).length;

  /** 改一題（老師改過就不再標 AI 草稿；提醒重新算） */
  const update = (i: number, q: Question) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { q, warnings: warningsOf(finalizeQuestion(q, 1), hasZhuyin), ai: false } : d)));
  const remove = (i: number) => {
    setDrafts((ds) => ds.filter((_, j) => j !== i));
    setEditing(null);
  };
  const move = (i: number, by: -1 | 1) =>
    setDrafts((ds) => {
      const j = i + by;
      if (j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = () => {
    const last = drafts[drafts.length - 1]?.q;
    setDrafts((ds) => [...ds, { q: newQuestion(addType, { id: newId(), subject: last?.subject, indicators: last ? [...last.indicators] : [] }), warnings: [], ai: false }]);
    setEditing(drafts.length);
  };
  /** AI 出好一批：接在最後面 */
  const addAi = (list: AiDraft[]) => setDrafts((ds) => [...ds, ...list.map((d) => ({ q: d.question, warnings: d.warnings, ai: true }))]);

  /** 單題重出：同一個指標與題型、避開已有的題目，換掉這一題 */
  const redo = async (i: number) => {
    const d = drafts[i];
    const key = indicatorKeysOf(d.q)[0];
    if (!key || !(AI_TYPES as readonly string[]).includes(d.q.type)) return;
    setRedoing(d.q.id);
    setRedoError(null);
    try {
      const r = await runAiJob(call, code, { indicators: [key], count: 1, types: [d.q.type as AiQuestionType], difficulty: d.q.difficulty ?? 2, avoid: prompts.slice(-40) });
      const fresh = r.drafts[0];
      if (!fresh) throw new Error(r.dropped[0] ?? 'AI 這次出的題目沒有通過檢查，請再試一次');
      setDrafts((ds) => ds.map((x) => (x.q.id === d.q.id ? { q: fresh.question, warnings: fresh.warnings, ai: true } : x)));
    } catch (err) {
      setRedoError(err instanceof Error ? err.message : '重出失敗，請再試一次');
    } finally {
      setRedoing(null);
    }
  };

  const save = async () => {
    const r = buildPack(title, drafts.map((d) => d.q), seed.current);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      if (packId) await call('PATCH', `/api/teacher/rooms/${code}/packs/${packId}`, { pack: r.pack });
      else await call('POST', `/api/teacher/rooms/${code}/packs`, { pack: r.pack });
      onClose(`已儲存「${r.pack.title}」（${r.pack.questions.length} 題），班上的孩子在挑戰塔的「班級題庫」看得到`);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : '儲存失敗，請再試一次']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-screen pack-editor-layer" data-testid="pack-editor">
      <div className="card pack-editor" role="dialog" aria-label="編輯班級題庫">
        <div className="pack-editor-head">
          <h3 style={{ margin: 0, flex: 1 }}>{packId ? '✏️ 修改班級題庫' : '📚 新的班級題庫'}</h3>
          <button type="button" className="btn small white" onClick={() => onClose(null)} disabled={busy} data-testid="pack-cancel">
            不存了
          </button>
          <button type="button" className="btn small" onClick={() => void save()} disabled={busy} data-testid="pack-save">
            💾 儲存
          </button>
        </div>
        <label className="q-field">
          題庫名稱（孩子在挑戰塔看到的名字）
          <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="例如：十十乘法練習" data-testid="pack-title" />
        </label>
        {errors.length > 0 && (
          <ul className="q-problems" data-testid="pack-errors">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        {aiOn && !showAi && (
          <button type="button" className="btn small" onClick={() => setShowAi(true)} data-testid="pack-open-ai">
            🤖 AI 出題
          </button>
        )}
        {showAi && <AiPanel code={code} avoid={prompts} onDrafts={addAi} onClose={() => setShowAi(false)} />}
        {aiCount > 0 && <p className="notice">有 {aiCount} 題是 AI 草稿（黃色框），請逐題看過；改過的題目就不再標草稿。</p>}
        {redoError && <p className="gift-error">{redoError}</p>}

        <ol className="q-list" data-testid="q-list">
          {drafts.map((d, i) => {
            const problems = questionProblems(d.q);
            return (
              <li key={d.q.id} className={`q-card ${d.ai ? 'ai' : ''}`} data-testid={`q-card-${i}`}>
                <div className="q-card-head">
                  <span className="q-card-no">第 {i + 1} 題</span>
                  <span className="q-tag">{EDITOR_TYPE_LABELS[d.q.type as EditorType] ?? d.q.type}</span>
                  {d.q.indicators.map((c) => (
                    <span key={c} className="q-tag soft">
                      {c}
                    </span>
                  ))}
                  {d.ai && (
                    <span className="q-tag ai" data-testid={`q-ai-${i}`}>
                      AI 草稿
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn small white" onClick={() => move(i, -1)} disabled={i === 0} title="往上移">
                    ⬆️
                  </button>
                  <button type="button" className="btn small white" onClick={() => move(i, 1)} disabled={i === drafts.length - 1} title="往下移">
                    ⬇️
                  </button>
                  <button type="button" className="btn small white" onClick={() => setEditing(editing === i ? null : i)} data-testid={`q-edit-${i}`}>
                    ✏️ 修改
                  </button>
                  {aiOn && (AI_TYPES as readonly string[]).includes(d.q.type) && d.q.indicators.length > 0 && (
                    <button type="button" className="btn small white" onClick={() => void redo(i)} disabled={redoing !== null} data-testid={`q-redo-${i}`}>
                      {redoing === d.q.id ? '重出中…' : '🔁 重出'}
                    </button>
                  )}
                  <button type="button" className="btn small white" onClick={() => remove(i)} data-testid={`q-delete-${i}`}>
                    🗑️
                  </button>
                </div>
                {d.warnings.length > 0 && (
                  <ul className="q-warnings" data-testid={`q-warnings-${i}`}>
                    {d.warnings.map((w) => (
                      <li key={w}>⚠️ {w}</li>
                    ))}
                  </ul>
                )}
                {editing === i ? (
                  <QuestionForm q={d.q} onChange={(q) => update(i, q)} onDone={() => setEditing(null)} testId={`q-form-${i}`} />
                ) : (
                  <>
                    <QuestionPreview q={finalizeQuestion(d.q, 1)} testId={`q-preview-${i}`} />
                    {problems.length > 0 && <p className="q-problems-line">還沒填完：{problems[0]}</p>}
                  </>
                )}
              </li>
            );
          })}
        </ol>
        {!drafts.length && <p className="plain">還沒有題目：按下面的「新增一題」自己出，或用「AI 出題」。</p>}
        <div className="q-add-row">
          <select value={addType} onChange={(e) => setAddType(e.target.value as EditorType)} data-testid="q-add-type">
            {EDITOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {EDITOR_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button type="button" className="btn small" onClick={add} data-testid="q-add">
            ＋ 新增一題
          </button>
        </div>
      </div>
    </div>
  );
}
