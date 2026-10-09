/**
 * 積木大師「數數看」（規則在 src/engine/puzzle/blocks.ts）：看等角投影的積木堆，選出共有幾個積木（看不到的也要算）。
 * - 自己玩：8 題，答錯會在每一疊頂上標出幾個、列出加法。
 * - 和機器人：同一題搶答（流程在 ../useDuel.ts），機器人積木越多數越久。
 * 選項沿用答題的 ChoiceInput；題目不進錯題本（錯題複習畫不出積木圖）。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChoiceQuestion } from '../../core/types';
import { createRng } from '../../core/rng';
import { outcomeStars, vsOutcome } from '../../engine/puzzle/common';
import { BLOCKS_QUESTIONS, blocksStars, botBlocksMove, buildBlocksRound, type BlocksQuestion } from '../../engine/puzzle/blocks';
import { ChoiceInput } from '../../quiz/inputs';
import { quizDebug } from '../../quiz/debug';
import { DUEL_LINES, PRAISE, PUZZLE_LINES } from '../../ui/lines';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { puzzleDebug } from '../debug';
import type { PuzzleGameProps } from '../types';
import { useDuel, type DuelView } from '../useDuel';
import { useFriendEnd, useFriendQuizDuel } from '../useFriendGame';
import { BlocksView } from './BlocksView';

/** 換成單選題的格式（沿用 ChoiceInput 與 e2e 的自動作答） */
function asChoice(q: BlocksQuestion, index: number): ChoiceQuestion {
  return {
    id: `puzzle.blocks.${index}`,
    subject: 'math',
    skill: 'puzzle.blocks',
    indicators: ['S-2-1'],
    prompt: PUZZLE_LINES.blocksAsk,
    type: 'choice',
    options: q.options.map((n) => ({ text: `${n} 個` })),
    answer: q.answer,
  };
}

/** 換題時唸題目，並讓 e2e 讀得到目前題目 */
function useAskBlocks(choice: ChoiceQuestion) {
  useEffect(() => {
    quizDebug.current = choice;
    speak(PUZZLE_LINES.blocksAsk);
  }, [choice]);
}

export default function BlocksGame({ run, onFinish, onExit, onAbort }: PuzzleGameProps) {
  const round = useMemo(() => buildBlocksRound(run.seed, run.level), [run.seed, run.level]);
  const choices = useMemo(() => round.map(asChoice), [round]);
  useEffect(
    () => () => {
      quizDebug.current = null;
      puzzleDebug.state = null;
    },
    [],
  );
  if (run.mode === 'friend') return <FriendBlocks round={round} choices={choices} run={run} onFinish={onFinish} onExit={onExit} onAbort={onAbort} />;
  return run.mode === 'solo' ? (
    <SoloBlocks round={round} choices={choices} onFinish={onFinish} onExit={onExit} />
  ) : (
    <DuelBlocks round={round} choices={choices} run={run} onFinish={onFinish} onExit={onExit} />
  );
}

/** 共用的標題列 */
function Head({ onExit, children }: { onExit: () => void; children: ReactNode }) {
  return (
    <div className="puzzle-head">
      <button className="btn round white" onClick={onExit} aria-label="離開">
        ✕
      </button>
      <div className="grow">{children}</div>
    </div>
  );
}

// ---------- 自己玩 ----------

function SoloBlocks({ round, choices, onFinish, onExit }: { round: BlocksQuestion[]; choices: ChoiceQuestion[]; onFinish: PuzzleGameProps['onFinish']; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  /** 這一題的結果：還沒答（null）、答對、答錯 */
  const [result, setResult] = useState<null | 'good' | 'miss'>(null);
  const [marks, setMarks] = useState<Record<number, 'correct' | 'wrong'>>({});
  const q = round[index];
  const choice = choices[index];
  useAskBlocks(choice);
  useEffect(() => {
    puzzleDebug.state = { game: 'blocks', mode: 'solo', index, correct };
  }, [index, correct]);

  /** 下一題；答完就結算 */
  const next = () => {
    if (index + 1 >= round.length) {
      onFinish({ stars: blocksStars(correct, round.length), summary: `答對 ${correct}／${round.length} 題` });
      return;
    }
    setIndex((i) => i + 1);
    setResult(null);
    setMarks({});
  };
  useEffect(() => {
    if (result !== 'good') return;
    const t = setTimeout(next, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const pick = (i: number) => {
    if (result) return;
    const ok = i === q.answer;
    if (ok) setCorrect((c) => c + 1);
    setMarks(ok ? { [i]: 'correct' } : { [i]: 'wrong', [q.answer]: 'correct' });
    setResult(ok ? 'good' : 'miss');
    if (ok) {
      sfx.correct();
      speak(PRAISE[index % PRAISE.length]);
    } else {
      sfx.oops();
      speak(PUZZLE_LINES.blocksReveal);
    }
  };

  return (
    <div className="card puzzle-play" data-testid="blocks-game" data-mode="solo">
      <Head onExit={onExit}>
        <span className="hud-chip">
          第 {index + 1}／{BLOCKS_QUESTIONS} 題
        </span>
        <span className="hud-chip">⭐ 答對 {correct}</span>
      </Head>
      <div className="puzzle-body">
        <div className="prompt" data-testid="prompt">
          {PUZZLE_LINES.blocksAsk}
        </div>
        <BlocksView key={index} heights={q.heights} reveal={result === 'miss'} />
        <ChoiceInput key={choice.id} q={choice} disabled={result !== null} marks={marks} onPick={pick} />
      </div>
      {result === 'good' && (
        <div className="feedback good pop-in" data-testid="feedback-good">
          ⭐ 答對了！
        </div>
      )}
      {result === 'miss' && (
        <div className="puzzle-reveal">
          <button className="btn big green" onClick={next} data-testid="next">
            {index + 1 >= round.length ? '看結果 ▶' : '下一題 ▶'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 和機器人搶答（../useDuel.ts）、和朋友搶答（../useFriendGame.ts） ----------

/** 搶答時的對手：比分上的名字、狀態列開頭（「🤖 機器人」或「👫 小美」）、圖示、在數的時候 */
interface Opponent {
  name: string;
  who: string;
  icon: string;
  thinking: string;
}

/** 和機器人比賽的對手 */
const BOT: Opponent = { name: '機器人', who: '🤖 機器人', icon: '🤖', thinking: '🤖 機器人在數……' };

function DuelBlocks({
  round,
  choices,
  run,
  onFinish,
  onExit,
}: {
  round: BlocksQuestion[];
  choices: ChoiceQuestion[];
  run: PuzzleGameProps['run'];
  onFinish: PuzzleGameProps['onFinish'];
  onExit: () => void;
}) {
  /** 機器人用的亂數（同一局固定） */
  const rng = useMemo(() => createRng(run.seed ^ 0xb1c), [run.seed]);
  const { view, pick } = useDuel({
    total: round.length,
    botMove: (i) => botBlocksMove(round[i], run.level, rng),
    answer: (i) => round[i].answer,
    onResolve: (phase, i) => {
      if (phase === 'kid') {
        sfx.correct();
        speak(PRAISE[i % PRAISE.length]);
      } else {
        sfx.oops();
        speak(phase === 'bot' ? PUZZLE_LINES.botGotIt : PUZZLE_LINES.bothMissed);
      }
    },
    onDone: (duel) => {
      const outcome = vsOutcome(duel.kid, duel.bot);
      onFinish({ stars: outcomeStars(outcome), vs: outcome, summary: `你 ${duel.kid}：${duel.bot} 機器人` });
    },
  });
  const { duel } = view;
  useAskBlocks(choices[duel.index]);
  useEffect(() => {
    puzzleDebug.state = { game: 'blocks', mode: 'vs', ...duel };
  }, [duel]);
  /** 孩子作答（這一題已經有結果或已經答錯過就不算） */
  const kidPick = (i: number) => {
    const ok = i === round[duel.index].answer;
    if (pick(i) && !ok) sfx.oops();
  };
  return <DuelBlocksBoard round={round} choices={choices} view={view} opponent={BOT} onPick={kidPick} onExit={onExit} mode="vs" />;
}

/** 和朋友搶答 8 題（島嶼互訪 I4）：同一個種子出同一組積木，先收到的答對得分 */
function FriendBlocks({
  round,
  choices,
  run,
  onFinish,
  onExit,
  onAbort,
}: {
  round: BlocksQuestion[];
  choices: ChoiceQuestion[];
  run: PuzzleGameProps['run'];
  onFinish: PuzzleGameProps['onFinish'];
  onExit: () => void;
  onAbort: PuzzleGameProps['onAbort'];
}) {
  const name = run.friend?.name ?? '朋友';
  const { view, pick, waiting } = useFriendQuizDuel({
    total: round.length,
    answer: (i) => round[i].answer,
    onResolve: (phase, i) => {
      if (phase === 'kid') {
        sfx.correct();
        speak(PRAISE[i % PRAISE.length]);
      } else {
        sfx.oops();
        speak(phase === 'bot' ? DUEL_LINES.friendGotIt : PUZZLE_LINES.bothMissed);
      }
    },
    onDone: (duel) => {
      const outcome = vsOutcome(duel.kid, duel.bot);
      onFinish({ stars: outcomeStars(outcome), vs: outcome, summary: `你 ${duel.kid}：${duel.bot} ${name}` });
    },
  });
  const { duel } = view;
  useAskBlocks(choices[duel.index]);
  useFriendEnd(duel.done, name, onFinish, onAbort);
  useEffect(() => {
    puzzleDebug.state = { game: 'blocks', mode: 'friend', ...duel };
  }, [duel]);
  // 自己答錯（回音回來之後）叮一聲
  const kidWrong = view.kidPick !== null && view.kidPick !== round[duel.index].answer;
  useEffect(() => {
    if (kidWrong) sfx.oops();
  }, [kidWrong]);
  const opponent: Opponent = { name, who: `👫 ${name}`, icon: '👫', thinking: `👫 ${name}也在數……` };
  return <DuelBlocksBoard round={round} choices={choices} view={view} opponent={opponent} onPick={pick} onExit={onExit} mode="friend" waiting={waiting} />;
}

/** 搶答的畫面（和機器人、和朋友共用）：比分、積木、選項、狀態列 */
function DuelBlocksBoard({
  round,
  choices,
  view,
  opponent,
  onPick,
  onExit,
  mode,
  waiting = false,
}: {
  round: BlocksQuestion[];
  choices: ChoiceQuestion[];
  view: DuelView;
  opponent: Opponent;
  onPick: (i: number) => void;
  onExit: () => void;
  mode: 'vs' | 'friend';
  /** 送出作答、等回音（和朋友對戰） */
  waiting?: boolean;
}) {
  const { duel } = view;
  const q = round[duel.index];
  const choice = choices[duel.index];
  const resolved = duel.phase !== 'open';
  const marks: Record<number, 'correct' | 'wrong'> = {};
  if (view.kidPick !== null && view.kidPick !== q.answer) marks[view.kidPick] = 'wrong';
  if (resolved) marks[q.answer] = 'correct';
  const botOption = view.botPick !== null ? q.options[view.botPick] : null;
  return (
    <div className="card puzzle-play" data-testid="blocks-game" data-mode={mode}>
      <Head onExit={onExit}>
        <span className="scoreboard" data-testid="duel-score">
          🙋 你 {duel.kid}：{duel.bot} {opponent.name} {opponent.icon}
        </span>
        <span className="hud-chip">
          第 {duel.index + 1}／{round.length} 題
        </span>
      </Head>
      <div className="puzzle-body">
        <div className="prompt" data-testid="prompt">
          {PUZZLE_LINES.blocksAsk}
        </div>
        <BlocksView key={duel.index} heights={q.heights} reveal={resolved} />
        <ChoiceInput key={choice.id} q={choice} disabled={resolved || duel.kidOut || waiting} marks={marks} onPick={onPick} />
      </div>
      <div className="duel-status" role="status" data-testid="duel-status">
        {duel.phase === 'kid' && <span className="feedback good pop-in">⭐ 你搶到了！</span>}
        {duel.phase === 'bot' && <span className="feedback reveal pop-in">{opponent.who}搶先答對了！</span>}
        {duel.phase === 'none' && <span className="feedback reveal pop-in">都答錯了，看看每一疊有幾個。</span>}
        {duel.phase === 'open' && duel.kidOut && <span className="feedback retry">答錯了，這一題換{opponent.name}想想看……</span>}
        {duel.phase === 'open' && duel.botOut && botOption !== null && (
          <span className="feedback retry">
            {opponent.who}說 {botOption} 個，答錯了！換你搶答！
          </span>
        )}
        {duel.phase === 'open' && !duel.kidOut && !duel.botOut && <span className="bot-thinking">{opponent.thinking}</span>}
      </div>
    </div>
  );
}
