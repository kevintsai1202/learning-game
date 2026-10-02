/**
 * 答題畫面：一次一題，題目會自動朗讀；答對有音效與舞台動畫，
 * 第一次答錯可以再試一次，第二次答錯會公布答案與解說。
 */
import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Question, Response } from '../core/types';
import { correctResponse } from '../engine/check';
import { answer, nextQuestion, startQuiz, summarize, type QuizState } from './session';
import { ChoiceInput, ClockInput, MoneyInput, NumberInput, OrderInput } from './inputs';
import { MoneyRow, VisualView } from './visuals';
import { prefetchSpeech, repeatSpeech, speak } from '../audio/speech';
import { sfx } from '../audio/sfx';
import { useUi } from '../store/useUi';
import type { ActivityDef } from '../activities/types';
import type { SessionResult } from '../core/types';
import { quizDebug } from './debug';
import { useStageQuiz } from './stageBus';
import { KidText } from '../ui/KidText';
import { hitPoints } from './arcade';
import { needsPlainText } from './annotation';
import { answerLine, answerText, optionSpeech, questionSpeech } from './spoken';
import { PRAISE, RETRY_LINE } from '../ui/lines';

/** 描寫元件（含 Hanzi Writer）較大，用到時才載入 */
const WriteInput = lazy(() => import('../writing/WriteInput'));

type Action = { type: 'answer'; r: Response } | { type: 'next' } | { type: 'reset'; questions: Question[] };

function reducer(s: QuizState, a: Action): QuizState {
  switch (a.type) {
    case 'answer':
      return answer(s, a.r);
    case 'next':
      return nextQuestion(s);
    case 'reset':
      return startQuiz(a.questions);
  }
}

interface QuizRunnerProps {
  activity: ActivityDef;
  questions: Question[];
  onFinish: (result: SessionResult) => void;
  onExit: () => void;
  /** 玩法：quiz 一般答題；shooter 氣球射擊（3D 舞台點氣球作答，畫面上方只留橫幅） */
  mode?: 'quiz' | 'shooter';
}

export function QuizRunner({ activity, questions, onFinish, onExit, mode = 'quiz' }: QuizRunnerProps) {
  const shooter = mode === 'shooter';
  /** 射擊模式的分數與連擊（只用於畫面，不影響星星與金幣） */
  const [score, setScore] = useState({ points: 0, combo: 0 });
  const [s, dispatch] = useReducer(reducer, questions, startQuiz);
  const startedAt = useRef(performance.now());
  const setMood = useUi((u) => u.setMood);
  const q = s.questions[s.index];
  /** 本題已經答錯的單選選項（標紅、不能再點） */
  const wrongPicks = useRef<Record<number, 'correct' | 'wrong'>>({});
  const praise = useMemo(() => PRAISE[(s.index * 7 + s.records.length) % PRAISE.length], [s.index, s.records.length]);

  // 換題時朗讀題目、清掉標記
  useEffect(() => {
    quizDebug.current = q ?? null;
    if (s.phase === 'answering') quizDebug.strokes = null;
    if (!q || s.phase !== 'answering') return;
    wrongPicks.current = {};
    const spoken = questionSpeech(q);
    speak(spoken.text, spoken.lang);
    // 先載入選項與公布答案的預錄音檔，孩子點 🔊 時才不會延遲
    prefetchSpeech([...(q.type === 'choice' ? q.options.map((o) => optionSpeech(q, o)) : []), answerLine(q)]);
  }, [q, s.index, s.phase]);

  // 讓 3D 舞台可以直接作答（例如點垃圾桶）；離開答題畫面時清掉
  useEffect(() => {
    useStageQuiz.setState({
      question: q ?? null,
      mode,
      pick: (index) => {
        if (q?.type !== 'choice') return;
        if (index !== q.answer) wrongPicks.current = { ...wrongPicks.current, [index]: 'wrong' };
        dispatch({ type: 'answer', r: { type: 'choice', index } });
      },
    });
  }, [q, mode]);
  useEffect(() => () => useStageQuiz.setState({ question: null, pick: null, mode: 'quiz' }), []);

  // 答題結果的回饋：音效、朗讀、舞台動畫
  useEffect(() => {
    if (s.phase === 'correct') {
      sfx.correct();
      setMood('happy');
      speak(praise);
      // 射擊模式：一次答對累積連擊與分數；第二次才答對連擊歸零
      const first = s.records[s.records.length - 1]?.firstTry ?? false;
      setScore((sc) => {
        const combo = first ? sc.combo + 1 : 0;
        return { points: sc.points + (first ? hitPoints(combo) : 50), combo };
      });
      const t = setTimeout(() => dispatch({ type: 'next' }), 1300);
      return () => clearTimeout(t);
    }
    if (s.phase === 'retry') {
      sfx.oops();
      setMood('oops');
      speak(RETRY_LINE);
    }
    if (s.phase === 'reveal') {
      setScore((sc) => ({ ...sc, combo: 0 }));
      sfx.oops();
      setMood('oops');
      const a = answerLine(q);
      speak(a.text, a.lang);
    }
    if (s.phase === 'done') {
      const seconds = (performance.now() - startedAt.current) / 1000;
      onFinish(summarize(s, activity.id, activity.subject, seconds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.index]);

  if (!q) return null;
  const busy = s.phase === 'correct' || s.phase === 'reveal' || s.phase === 'done';
  const submit = (r: Response) => {
    if (r.type === 'choice' && q.type === 'choice' && r.index !== q.answer) wrongPicks.current = { ...wrongPicks.current, [r.index]: 'wrong' };
    dispatch({ type: 'answer', r });
  };
  const marks: Record<number, 'correct' | 'wrong'> =
    q.type === 'choice' && (s.phase === 'correct' || s.phase === 'reveal') ? { ...wrongPicks.current, [q.answer]: 'correct' } : wrongPicks.current;

  return (
    <div className={`quiz card ${shooter ? 'shooter' : ''}`} data-testid="quiz" data-mode={mode}>
      <div className="quiz-head">
        <button className="btn round white" onClick={onExit} aria-label="離開">
          ✕
        </button>
        <div className="progress" aria-label={`第 ${s.index + 1} 題，共 ${s.questions.length} 題`}>
          {s.questions.map((_, i) => {
            const rec = s.records[i];
            const cls = i === s.index && !rec ? 'now' : rec ? (rec.firstTry ? 'done' : 'miss') : '';
            return <i key={i} className={cls} />;
          })}
        </div>
        {shooter && (
          <span className="hud-chip score-chip" data-testid="shooter-score">
            🎯 {score.points}
            {score.combo >= 2 && <span className="combo">連擊 ×{score.combo}</span>}
          </span>
        )}
        <button className="btn round white" onClick={repeatSpeech} aria-label="再聽一次">
          🔊
        </button>
      </div>
      <div className={`quiz-body ${needsPlainText(q) ? 'no-annot' : ''}`} key={s.index}>
        <div className="prompt pop-in" data-testid="prompt">
          <KidText text={q.prompt} />
        </div>
        {q.visual && (
          <div className="visual pop-in">
            <VisualView v={q.visual} />
          </div>
        )}
        {s.phase === 'retry' && <div className="feedback retry wiggle">再想想看！還有一次機會 💪</div>}
        {s.phase === 'correct' && (
          <div className="feedback good pop-in" data-testid="feedback-good">
            ⭐ {praise}
          </div>
        )}
        {s.phase === 'reveal' && (
          <>
            <div className="feedback reveal pop-in" data-testid="feedback-reveal">
              正確答案是：<KidText text={answerText(q)} />
            </div>
            {q.type === 'money' && <MoneyRow items={correctResponse(q).type === 'money' ? (correctResponse(q) as { items: number[] }).items : []} />}
            {q.explain && <div className="explain">💡 {q.explain}</div>}
            <button className="btn big green" onClick={() => dispatch({ type: 'next' })} data-testid="next">
              下一題 ▶
            </button>
          </>
        )}
        {s.phase !== 'reveal' &&
          (shooter && q.type === 'choice' ? (
            // 射擊模式：主要在 3D 舞台點氣球；這排小籤是替代操作（也讓輔助科技可用）
            <ChoiceInput key={q.id} q={q} disabled={busy} marks={marks} compact onPick={(index) => submit({ type: 'choice', index })} />
          ) : (
            <Answer q={q} disabled={busy} marks={marks} onSubmit={submit} />
          ))}
        {shooter && s.phase === 'answering' && <div className="shooter-hint">👇 點下面飄著的氣球，射中正確答案！</div>}
      </div>
    </div>
  );
}

/** 依題型挑作答元件；換題時用 key 重設內部狀態 */
function Answer({ q, disabled, marks, onSubmit }: { q: Question; disabled: boolean; marks: Record<number, 'correct' | 'wrong'>; onSubmit: (r: Response) => void }) {
  switch (q.type) {
    case 'choice':
      return <ChoiceInput key={q.id} q={q} disabled={disabled} marks={marks} onPick={(index) => onSubmit({ type: 'choice', index })} />;
    case 'number':
      return <NumberInput key={q.id} unit={q.unit} disabled={disabled} onSubmit={(value) => onSubmit({ type: 'number', value })} />;
    case 'order':
      return <OrderInput key={q.id} tokens={q.tokens} disabled={disabled} onSubmit={(tokens) => onSubmit({ type: 'order', tokens })} />;
    case 'clock':
      return <ClockInput key={q.id} step={q.step} disabled={disabled} onSubmit={(hour, minute) => onSubmit({ type: 'clock', hour, minute })} />;
    case 'money':
      return <MoneyInput key={q.id} denominations={q.denominations} disabled={disabled} onSubmit={(items) => onSubmit({ type: 'money', items })} />;
    case 'write':
      return (
        <Suspense fallback={<div className="feedback">寫字板準備中…</div>}>
          <WriteInput key={q.id} q={q} disabled={disabled} onDone={(completed, mistakes) => onSubmit({ type: 'write', completed, mistakes })} />
        </Suspense>
      );
  }
}
