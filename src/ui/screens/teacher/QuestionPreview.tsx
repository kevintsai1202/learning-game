/**
 * 題目預覽（班級題庫編輯器，docs/plans/ai-questions.md）：用孩子看到的樣子顯示題目，並標出正確答案給老師檢查。
 */
import type { Question } from '../../../core/types';
import { KidText } from '../../KidText';
import { VisualView } from '../../../quiz/visuals';
import { ChoiceInput } from '../../../quiz/inputs';

export function QuestionPreview({ q, testId }: { q: Question; testId?: string }) {
  return (
    <div className="q-preview" data-testid={testId}>
      <div className="prompt q-preview-prompt">{q.prompt ? <KidText text={q.prompt} /> : <span className="plain">（還沒寫題目）</span>}</div>
      {q.visual && <VisualView v={q.visual} />}
      {q.type === 'choice' && <ChoiceInput q={q} disabled marks={q.answer >= 0 ? { [q.answer]: 'correct' } : {}} onPick={() => undefined} compact />}
      {q.type === 'number' && (
        <p className="q-preview-answer">
          答案：<strong>{q.answer}</strong>
          {q.unit ?? ''}
        </p>
      )}
      {q.type === 'order' && (
        <>
          <div className="q-preview-tokens">
            {q.tokens.map((t, i) => (
              <span key={i} className="q-preview-token">
                <KidText text={t} />
              </span>
            ))}
          </div>
          <p className="q-preview-answer">正確順序：{q.answer.join('／')}</p>
        </>
      )}
      {q.type === 'write' && (
        <p className="q-preview-answer">
          描寫：<span className="q-preview-target">{q.target || '？'}</span>
        </p>
      )}
      {q.type === 'clock' && <p className="q-preview-answer">撥到 {q.hour} 點 {q.minute} 分</p>}
      {q.type === 'money' && <p className="q-preview-answer">付 {q.amount} 元</p>}
      {q.explain && <p className="q-preview-explain">💡 {q.explain}</p>}
    </div>
  );
}
