/**
 * 一題的編輯表單（G6，docs/plans/teacher-gm.md 第 7.3 節）：依題型顯示不同欄位，旁邊即時預覽孩子看到的樣子。
 * 編輯中允許空白；存檔前由 buildPack 檢查（packEditor.ts）。排序題填正確順序，存檔時自動打亂成詞卡。
 */
import type { ChoiceOption, Question } from '../../../core/types';
import { EDITOR_TYPES, EDITOR_TYPE_LABELS, finalizeQuestion, indicatorKeysOf, newQuestion, questionProblems, withIndicators, type EditorType } from '../../../store/packEditor';
import { IndicatorPicker } from './IndicatorPicker';
import { QuestionPreview } from './QuestionPreview';

/** 單選題最多幾個選項（題庫格式的上限） */
const MAX_OPTIONS = 6;
/** 排序題最多幾張詞卡 */
const MAX_TOKENS = 12;

export function QuestionForm({ q, onChange, onDone, testId }: { q: Question; onChange: (q: Question) => void; onDone: () => void; testId: string }) {
  const problems = questionProblems(q);
  /** 換題型：保留題目文字、課綱、解說，答案欄位重來 */
  const changeType = (type: EditorType) => {
    if (type === q.type) return;
    const fresh = newQuestion(type, { id: q.id, subject: q.subject, indicators: [...q.indicators] });
    onChange({ ...fresh, prompt: q.prompt, ...(q.explain ? { explain: q.explain } : {}), ...(q.source ? { source: q.source } : {}) } as Question);
  };
  /** 改共同欄位 */
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch } as Question);

  return (
    <div className="q-form" data-testid={testId}>
      <div className="q-form-fields">
        <label className="q-field">
          題型
          <select value={q.type} onChange={(e) => changeType(e.target.value as EditorType)} data-testid={`${testId}-type`}>
            {EDITOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {EDITOR_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="q-field">
          題目
          <textarea rows={2} value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} data-testid={`${testId}-prompt`} />
        </label>

        {q.type === 'choice' && (
          <div className="q-field">
            選項（點圓圈設定正確答案；emoji 可以不填）
            {q.options.map((o, i) => {
              /** 改一個選項 */
              const setOption = (patch: Partial<ChoiceOption>) => set({ options: q.options.map((x, j) => (j === i ? { ...x, ...patch } : x)) } as Partial<Question>);
              return (
                <div key={i} className="q-option-row">
                  <input type="radio" name={`${testId}-answer`} checked={q.answer === i} onChange={() => set({ answer: i } as Partial<Question>)} title="正確答案" data-testid={`${testId}-correct-${i}`} />
                  <input className="q-option-text" value={o.text ?? ''} placeholder={`選項 ${i + 1}`} onChange={(e) => setOption({ text: e.target.value })} data-testid={`${testId}-option-${i}`} />
                  <input className="q-option-emoji" value={o.emoji ?? ''} placeholder="emoji" onChange={(e) => setOption({ emoji: e.target.value })} data-testid={`${testId}-emoji-${i}`} />
                  {q.options.length > 2 && (
                    <button
                      type="button"
                      className="btn small white"
                      onClick={() => set({ options: q.options.filter((_, j) => j !== i), answer: q.answer === i ? 0 : q.answer > i ? q.answer - 1 : q.answer } as Partial<Question>)}
                      title="刪掉這個選項"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            {q.options.length < MAX_OPTIONS && (
              <button type="button" className="btn small white" onClick={() => set({ options: [...q.options, { text: '' }] } as Partial<Question>)} data-testid={`${testId}-add-option`}>
                ＋ 選項
              </button>
            )}
          </div>
        )}

        {q.type === 'number' && (
          <div className="q-field q-inline">
            <label>
              答案
              <input type="number" value={Number.isFinite(q.answer) ? q.answer : ''} onChange={(e) => set({ answer: Number(e.target.value) } as Partial<Question>)} data-testid={`${testId}-answer`} />
            </label>
            <label>
              單位（可以不填）
              <input value={q.unit ?? ''} onChange={(e) => set({ unit: e.target.value || undefined } as Partial<Question>)} data-testid={`${testId}-unit`} />
            </label>
          </div>
        )}

        {q.type === 'order' && (
          <div className="q-field">
            詞卡（照正確順序填，存檔時會自動打亂）
            {q.answer.map((t, i) => (
              <div key={i} className="q-option-row">
                <span className="q-order-no">{i + 1}</span>
                <input className="q-option-text" value={t} onChange={(e) => set({ answer: q.answer.map((x, j) => (j === i ? e.target.value : x)) } as Partial<Question>)} data-testid={`${testId}-token-${i}`} />
                {q.answer.length > 2 && (
                  <button type="button" className="btn small white" onClick={() => set({ answer: q.answer.filter((_, j) => j !== i) } as Partial<Question>)} title="刪掉這張詞卡">
                    ✕
                  </button>
                )}
              </div>
            ))}
            {q.answer.length < MAX_TOKENS && (
              <button type="button" className="btn small white" onClick={() => set({ answer: [...q.answer, ''] } as Partial<Question>)} data-testid={`${testId}-add-token`}>
                ＋ 詞卡
              </button>
            )}
          </div>
        )}

        {q.type === 'write' && (
          <div className="q-field q-inline">
            <label>
              要寫的字
              <input maxLength={4} value={q.target} onChange={(e) => set({ target: e.target.value } as Partial<Question>)} data-testid={`${testId}-target`} />
            </label>
            <label>
              種類
              <select value={q.script} onChange={(e) => set({ script: e.target.value as 'hanzi' | 'zhuyin' | 'latin' } as Partial<Question>)}>
                <option value="hanzi">國字</option>
                <option value="zhuyin">注音</option>
                <option value="latin">英文字母</option>
              </select>
            </label>
            <p className="plain small-note">國字只有遊戲內建筆順資料的字才能描寫（台灣教育部筆順）。</p>
          </div>
        )}

        <div className="q-field">
          課綱指標（可以多選，同一題的科目跟著第一個指標）
          <IndicatorPicker value={indicatorKeysOf(q)} onChange={(keys) => onChange(withIndicators(q, keys))} testId={`${testId}-indicators`} />
        </div>
        <label className="q-field">
          解說（答錯兩次後給孩子看，可以不填）
          <textarea rows={2} value={q.explain ?? ''} onChange={(e) => set({ explain: e.target.value })} data-testid={`${testId}-explain`} />
        </label>
        <label className="q-field">
          朗讀文字（題目有符號或 emoji 時填，唸給孩子聽；可以不填）
          <input value={q.speak ?? ''} onChange={(e) => set({ speak: e.target.value })} />
        </label>
        <label className="q-field">
          出處
          <input value={q.source ?? ''} onChange={(e) => set({ source: e.target.value })} />
        </label>
        {problems.length > 0 && (
          <ul className="q-problems" data-testid={`${testId}-problems`}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <button type="button" className="btn small" onClick={onDone} data-testid={`${testId}-done`}>
          完成這一題
        </button>
      </div>
      <div className="q-form-preview">
        <p className="plain small-note">孩子看到的樣子</p>
        <QuestionPreview q={finalizeQuestion(q, 1)} />
      </div>
    </div>
  );
}
