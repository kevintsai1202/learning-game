/**
 * 益智搶答：從各科題庫出四選一題目（規則在 src/engine/puzzle/quizBattle.ts）。
 * - 自己玩：連續答對挑戰，答錯 3 題或答完 20 題結束，看最多能連對幾題。
 * - 和機器人：搶答 10 題，先答對的得分；答錯的人這一題不能再答。
 * 孩子作答的題目都記下來，結算時交給 PuzzleScreen 存檔（答錯的進錯題本）。
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { AnswerRecord, ChoiceQuestion } from '../../core/types';
import type { ActivityDef } from '../../activities/types';
import type { Edition } from '../../content/editions/schema';
import { ALL_ACTIVITIES } from '../../activities/registry';
import { curriculumActivities } from '../../activities/resolve';
import { createRng } from '../../core/rng';
import { useGame } from '../../store/useGame';
import { useEditions } from '../../store/useEditions';
import { DEFAULT_CURRICULUM, type CurriculumChoice } from '../../store/save';
import {
  DUEL_QUESTIONS,
  STREAK_MAX_MISSES,
  STREAK_MAX_QUESTIONS,
  botMove,
  buildQuizQuestions,
  duelAnswer,
  duelNext,
  duelOutcome,
  outcomeStars,
  startDuel,
  startStreak,
  streakAnswer,
  streakStars,
  type BotLevel,
  type DuelState,
} from '../../engine/puzzle/quizBattle';
import { ChoiceInput } from '../../quiz/inputs';
import { VisualView } from '../../quiz/visuals';
import { needsPlainText } from '../../quiz/annotation';
import { answerLine, answerText, optionSpeech, questionSpeech } from '../../quiz/spoken';
import { quizDebug } from '../../quiz/debug';
import { KidText } from '../../ui/KidText';
import { PRAISE, PUZZLE_LINES } from '../../ui/lines';
import { prefetchSpeech, repeatSpeech, speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { puzzleDebug } from '../debug';
import type { PuzzleGameProps } from '../types';

/** 益智搶答可以出題的活動：各科的固定活動（挑戰塔與停用的除外），加上孩子目前課本的單元 */
function quizActivities(editions: Edition[], curriculum: CurriculumChoice): ActivityDef[] {
  return [
    ...ALL_ACTIVITIES.filter((a) => a.zone !== 'tower' && !a.disabledReason),
    ...curriculumActivities('zh', editions, curriculum).filter((a) => !a.disabledReason),
    ...curriculumActivities('math', editions, curriculum).filter((a) => !a.disabledReason),
  ];
}

export default function QuizGame({ run, onFinish, onExit }: PuzzleGameProps) {
  const editions = useEditions((s) => s.all);
  const profile = useGame((s) => s.profile());
  const solo = run.mode === 'solo';
  const questions = useMemo(
    () =>
      buildQuizQuestions(
        quizActivities(editions, profile?.curriculum ?? DEFAULT_CURRICULUM),
        solo ? STREAK_MAX_QUESTIONS : DUEL_QUESTIONS,
        run.seed,
        profile?.recent['puzzle.quiz'] ?? [],
      ),
    // 只在開局時出題：答題中存檔變動（例如錯題本）不應換題
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run.seed],
  );
  // 離開遊戲時清掉 e2e 讀的狀態
  useEffect(
    () => () => {
      quizDebug.current = null;
      puzzleDebug.state = null;
    },
    [],
  );

  if (!questions.length) {
    return (
      <div className="card puzzle-play">
        <p style={{ fontSize: 24 }}>這裡沒有題目喔！</p>
        <button className="btn" onClick={onExit}>
          回選單
        </button>
      </div>
    );
  }
  return solo ? (
    <SoloQuiz questions={questions} onFinish={onFinish} onExit={onExit} />
  ) : (
    <DuelQuiz questions={questions} level={run.level} seed={run.seed} onFinish={onFinish} onExit={onExit} />
  );
}

/** 換題時朗讀題目、先載入選項與公布答案的語音，並讓 e2e 讀得到目前題目 */
function useAsk(q: ChoiceQuestion) {
  useEffect(() => {
    quizDebug.current = q;
    const s = questionSpeech(q);
    speak(s.text, s.lang);
    prefetchSpeech([...q.options.map((o) => optionSpeech(q, o)), answerLine(q)]);
  }, [q]);
}

/** 題目、附圖與四個選項 */
function QuestionView({ q, marks, disabled, onPick }: { q: ChoiceQuestion; marks: Record<number, 'correct' | 'wrong'>; disabled: boolean; onPick: (i: number) => void }) {
  return (
    <div className={`puzzle-body ${needsPlainText(q) ? 'no-annot' : ''}`} key={q.id}>
      <div className="prompt pop-in" data-testid="prompt">
        <KidText text={q.prompt} />
      </div>
      {q.visual && (
        <div className="visual pop-in">
          <VisualView v={q.visual} />
        </div>
      )}
      <ChoiceInput key={q.id} q={q} disabled={disabled} marks={marks} onPick={onPick} />
    </div>
  );
}

// ---------- 自己玩：連續答對挑戰 ----------

function SoloQuiz({ questions, onFinish, onExit }: { questions: ChoiceQuestion[]; onFinish: PuzzleGameProps['onFinish']; onExit: () => void }) {
  const [streak, setStreak] = useState(startStreak);
  const [index, setIndex] = useState(0);
  /** 這一題的結果：還沒答（null）、答對、答錯 */
  const [result, setResult] = useState<null | 'good' | 'miss'>(null);
  const [marks, setMarks] = useState<Record<number, 'correct' | 'wrong'>>({});
  /** 孩子的作答紀錄（結算時存檔） */
  const answers = useRef<AnswerRecord[]>([]);
  const q = questions[index];
  useAsk(q);
  useEffect(() => {
    puzzleDebug.state = { game: 'quiz', mode: 'solo', index, ...streak };
  }, [index, streak]);

  /** 下一題；挑戰結束就結算 */
  const next = () => {
    if (streak.done) {
      onFinish({ stars: streakStars(streak.best), summary: `最多連對 ${streak.best} 題`, answers: answers.current });
      return;
    }
    setIndex((i) => i + 1);
    setResult(null);
    setMarks({});
  };

  // 答對：停一下就換下一題（答錯要等孩子看完正確答案按「下一題」）
  useEffect(() => {
    if (result !== 'good') return;
    const t = setTimeout(next, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const pick = (i: number) => {
    if (result) return;
    const correct = i === q.answer;
    answers.current.push({ question: q, correct, firstTry: correct });
    setStreak((s) => streakAnswer(s, correct, questions.length));
    setMarks(correct ? { [i]: 'correct' } : { [i]: 'wrong', [q.answer]: 'correct' });
    setResult(correct ? 'good' : 'miss');
    if (correct) {
      sfx.correct();
      speak(PRAISE[answers.current.length % PRAISE.length]);
    } else {
      sfx.oops();
      const a = answerLine(q);
      speak(a.text, a.lang);
    }
  };

  const hearts = Array.from({ length: STREAK_MAX_MISSES }, (_, i) => (i < STREAK_MAX_MISSES - streak.misses ? '❤️' : '🤍')).join('');
  return (
    <div className="card puzzle-play" data-testid="quiz-game" data-mode="solo">
      <div className="puzzle-head">
        <button className="btn round white" onClick={onExit} aria-label="離開">
          ✕
        </button>
        <div className="grow">
          <span className="hud-chip" data-testid="quiz-streak">
            🔥 連對 {streak.streak} 題
          </span>
          <span className="hud-chip">🏆 最多 {streak.best}</span>
          <span className="hud-chip" aria-label={`還有 ${STREAK_MAX_MISSES - streak.misses} 次機會`}>
            {hearts}
          </span>
        </div>
        <button className="btn round white" onClick={repeatSpeech} aria-label="再聽一次">
          🔊
        </button>
      </div>
      <QuestionView q={q} marks={marks} disabled={result !== null} onPick={pick} />
      {result === 'good' && (
        <div className="feedback good pop-in" data-testid="feedback-good">
          ⭐ 答對了！
        </div>
      )}
      {result === 'miss' && (
        <div className="puzzle-reveal">
          <div className="feedback reveal pop-in" data-testid="feedback-reveal">
            正確答案是：<KidText text={answerText(q)} />
          </div>
          {q.explain && <div className="explain">💡 {q.explain}</div>}
          <button className="btn big green" onClick={next} data-testid="next">
            {streak.done ? '看結果 ▶' : '下一題 ▶'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 和機器人搶答 ----------

/** 搶答的畫面狀態：比賽進度，加上這一題孩子與機器人選了哪一個 */
interface DuelView {
  duel: DuelState;
  kidPick: number | null;
  botPick: number | null;
}

type DuelAction = { t: 'kid' | 'bot'; pick: number; correct: boolean } | { t: 'next'; total: number };

function duelReducer(s: DuelView, a: DuelAction): DuelView {
  if (a.t === 'next') {
    const duel = duelNext(s.duel, a.total);
    return duel === s.duel ? s : { duel, kidPick: null, botPick: null };
  }
  const duel = duelAnswer(s.duel, a.t, a.correct);
  // 沒被接受的作答（這一題已經有結果、或已經答錯過）不改畫面
  if (duel === s.duel) return s;
  return a.t === 'kid' ? { ...s, duel, kidPick: a.pick } : { ...s, duel, botPick: a.pick };
}

function DuelQuiz({
  questions,
  level,
  seed,
  onFinish,
  onExit,
}: {
  questions: ChoiceQuestion[];
  level: BotLevel;
  seed: number;
  onFinish: PuzzleGameProps['onFinish'];
  onExit: () => void;
}) {
  const [view, dispatch] = useReducer(duelReducer, { duel: startDuel(), kidPick: null, botPick: null });
  const { duel } = view;
  const answers = useRef<AnswerRecord[]>([]);
  /** 機器人用的亂數（同一局固定） */
  const rng = useMemo(() => createRng(seed ^ 0xb07), [seed]);
  const q = questions[duel.index];
  useAsk(q);
  useEffect(() => {
    puzzleDebug.state = { game: 'quiz', mode: 'vs', ...duel };
  }, [duel]);

  // 每一題開始時排好機器人什麼時候答、選哪一個（e2e 可以用 botDelayFactor 調速度）
  useEffect(() => {
    const move = botMove(q, level, rng);
    const t = setTimeout(() => dispatch({ t: 'bot', pick: move.pick, correct: move.pick === q.answer }), move.delayMs * puzzleDebug.botDelayFactor);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.index]);

  // 這一題有結果：音效與朗讀，停一下換下一題
  useEffect(() => {
    if (duel.phase === 'open' || duel.done) return;
    if (duel.phase === 'kid') {
      sfx.correct();
      speak(PRAISE[duel.index % PRAISE.length]);
    } else {
      sfx.oops();
      speak(duel.phase === 'bot' ? PUZZLE_LINES.botGotIt : PUZZLE_LINES.bothMissed);
    }
    const t = setTimeout(() => dispatch({ t: 'next', total: questions.length }), duel.phase === 'kid' ? 1400 : 2600);
    return () => clearTimeout(t);
  }, [duel.phase, duel.index, duel.done, questions.length]);

  // 比完了就結算
  useEffect(() => {
    if (!duel.done) return;
    const outcome = duelOutcome(duel);
    onFinish({ stars: outcomeStars(outcome), vs: outcome, summary: `你 ${duel.kid}：${duel.bot} 機器人`, answers: answers.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel.done]);

  const pick = (i: number) => {
    if (duel.phase !== 'open' || duel.kidOut) return;
    const correct = i === q.answer;
    answers.current.push({ question: q, correct, firstTry: correct });
    if (!correct) sfx.oops();
    dispatch({ t: 'kid', pick: i, correct });
  };

  const resolved = duel.phase !== 'open';
  const marks: Record<number, 'correct' | 'wrong'> = {};
  if (view.kidPick !== null && view.kidPick !== q.answer) marks[view.kidPick] = 'wrong';
  if (resolved) marks[q.answer] = 'correct';
  const botOption = view.botPick !== null ? q.options[view.botPick] : null;
  return (
    <div className="card puzzle-play" data-testid="quiz-game" data-mode="vs">
      <div className="puzzle-head">
        <button className="btn round white" onClick={onExit} aria-label="離開">
          ✕
        </button>
        <div className="grow">
          <span className="scoreboard" data-testid="duel-score">
            🙋 你 {duel.kid}：{duel.bot} 機器人 🤖
          </span>
          <span className="hud-chip">
            第 {duel.index + 1}／{questions.length} 題
          </span>
        </div>
        <button className="btn round white" onClick={repeatSpeech} aria-label="再聽一次">
          🔊
        </button>
      </div>
      <QuestionView q={q} marks={marks} disabled={resolved || duel.kidOut} onPick={pick} />
      <div className="duel-status" role="status" data-testid="duel-status">
        {duel.phase === 'kid' && <span className="feedback good pop-in">⭐ 你搶到了！</span>}
        {duel.phase === 'bot' && <span className="feedback reveal pop-in">🤖 機器人搶先答對了！</span>}
        {duel.phase === 'none' && (
          <span className="feedback reveal pop-in">
            都答錯了，正確答案是：<KidText text={answerText(q)} />
          </span>
        )}
        {duel.phase === 'open' && duel.kidOut && <span className="feedback retry">答錯了，這一題換機器人想想看……</span>}
        {duel.phase === 'open' && duel.botOut && botOption && (
          <span className="feedback retry">🤖 機器人選了「{botOption.text ?? botOption.emoji}」，答錯了！換你搶答！</span>
        )}
        {duel.phase === 'open' && !duel.kidOut && !duel.botOut && <span className="bot-thinking">🤖 機器人在想……</span>}
      </div>
    </div>
  );
}
