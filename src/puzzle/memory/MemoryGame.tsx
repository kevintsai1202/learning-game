/**
 * 記憶翻牌（規則在 src/engine/puzzle/memory.ts）：一次翻兩張，同一對就留在桌上。
 * - 自己玩：步數越少星星越多。
 * - 和機器人輪流：配對成功可以再翻一次；機器人只記得最近 2／4／8 張翻過的牌。
 * 翻開文字牌（英文單字、中文名稱）會唸出來。
 */
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { createRng } from '../../core/rng';
import { vsOutcome, outcomeStars } from '../../engine/puzzle/common';
import {
  BOT_MEMORY,
  PAIRS_BY_LEVEL,
  botPicks,
  flipCard,
  makeMemoryDeck,
  memoryStars,
  remember,
  settle,
  startMemory,
  type MemoryCard,
  type MemoryState,
} from '../../engine/puzzle/memory';
import { KidText } from '../../ui/KidText';
import { PRAISE, PUZZLE_LINES } from '../../ui/lines';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { puzzleDebug } from '../debug';
import type { PuzzleGameProps } from '../types';

type Action = { t: 'flip'; index: number; who: 'kid' | 'bot' } | { t: 'settle' };

function reducer(s: MemoryState, a: Action): MemoryState {
  return a.t === 'flip' ? flipCard(s, a.index, a.who) : settle(s);
}

/** 兩張不同對的牌給大家看多久再蓋回去（毫秒） */
const SHOW_MS = 1100;

export default function MemoryGame({ run, onFinish, onExit }: PuzzleGameProps) {
  const vs = run.mode === 'vs';
  const deck = useMemo(() => makeMemoryDeck(run.seed, run.level), [run.seed, run.level]);
  const [s, dispatch] = useReducer(reducer, deck, (d) => startMemory(d, run.mode === 'solo' ? 'solo' : 'vs'));
  const pairs = PAIRS_BY_LEVEL[run.level];
  /** 機器人記得的牌（由舊到新） */
  const memory = useRef<number[]>([]);
  /** 機器人這一回合打算翻的兩張 */
  const plan = useRef<[number, number] | null>(null);
  const rng = useMemo(() => createRng(run.seed ^ 0x6e6), [run.seed]);

  /** 翻一張牌：機器人也看得到（記進記憶），文字牌唸出來 */
  const flip = (index: number, who: 'kid' | 'bot') => {
    if (flipCard(s, index, who) === s) return;
    memory.current = remember(memory.current, index, BOT_MEMORY[run.level]);
    sfx.tap();
    const face = s.cards[index].face;
    if (face.text && face.lang) speak(face.text, face.lang);
    dispatch({ t: 'flip', index, who });
  };
  // flip 會用到最新的 s，計時器要透過 ref 呼叫
  const flipRef = useRef(flip);
  flipRef.current = flip;

  useEffect(() => {
    puzzleDebug.state = { game: 'memory', mode: run.mode, turn: s.turn, steps: s.steps, scores: s.scores, open: s.open, done: s.done, pairs: s.cards.map((c) => c.pair), owner: s.owner };
  }, [s, run.mode]);
  useEffect(
    () => () => {
      puzzleDebug.state = null;
    },
    [],
  );

  // 配對成功的音效；不同對就給大家看一下再蓋回去
  const matched = s.scores.kid + s.scores.bot;
  useEffect(() => {
    if (matched === 0) return;
    sfx.correct();
  }, [matched]);
  useEffect(() => {
    if (s.open.length < 2) return;
    const t = setTimeout(() => dispatch({ t: 'settle' }), SHOW_MS);
    return () => clearTimeout(t);
  }, [s.open.length]);

  // 機器人的回合：想一下翻第一張，再翻第二張（e2e 可以用 botDelayFactor 調速度）
  useEffect(() => {
    if (!vs || s.turn !== 'bot' || s.done || s.open.length !== 0) return;
    plan.current = botPicks(s, memory.current, rng);
    const first = plan.current[0];
    const t = setTimeout(() => flipRef.current(first, 'bot'), (700 + rng.next() * 600) * puzzleDebug.botDelayFactor);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vs, s.turn, s.done, s.open.length, s.steps]);
  useEffect(() => {
    if (!vs || s.turn !== 'bot' || s.open.length !== 1 || !plan.current) return;
    const second = plan.current[1];
    const t = setTimeout(() => flipRef.current(second, 'bot'), (800 + rng.next() * 600) * puzzleDebug.botDelayFactor);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vs, s.turn, s.open.length]);

  // 換回孩子時提醒（機器人翻牌看得到，不另外唸）
  useEffect(() => {
    if (vs && s.steps > 0 && !s.done && s.turn === 'kid') speak(PUZZLE_LINES.yourTurn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.turn]);

  // 全部配完就結算
  useEffect(() => {
    if (!s.done) return;
    if (!vs) {
      speak(PRAISE[s.steps % PRAISE.length]);
      onFinish({ stars: memoryStars(s.steps, pairs), summary: `用 ${s.steps} 步配完 ${pairs} 對` });
      return;
    }
    const outcome = vsOutcome(s.scores.kid, s.scores.bot);
    onFinish({ stars: outcomeStars(outcome), vs: outcome, summary: `你 ${s.scores.kid}：${s.scores.bot} 機器人` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.done]);

  const cols = s.cards.length <= 16 ? 4 : 5;
  const rows = Math.ceil(s.cards.length / cols);
  return (
    <div className="card puzzle-play" data-testid="memory-game" data-mode={run.mode}>
      <div className="puzzle-head">
        <button className="btn round white" onClick={onExit} aria-label="離開">
          ✕
        </button>
        <div className="grow">
          {vs ? (
            <>
              <span className="scoreboard" data-testid="memory-score">
                🙋 你 {s.scores.kid}：{s.scores.bot} 機器人 🤖
              </span>
              <span className={`hud-chip memory-turn ${s.turn}`} role="status" data-testid="memory-turn">
                {s.turn === 'kid' ? '輪到你翻牌' : '🤖 機器人翻牌中……'}
              </span>
            </>
          ) : (
            <>
              <span className="hud-chip" data-testid="memory-steps">
                👣 {s.steps} 步
              </span>
              <span className="hud-chip">
                🃏 配對 {matched}／{pairs}
              </span>
            </>
          )}
        </div>
      </div>
      <div
        className="memory-grid"
        style={{ ['--cols' as string]: cols, maxWidth: `max(340px, calc((100dvh - 200px) * ${((cols / rows) * 0.8).toFixed(3)}))` }}
        role="group"
        aria-label="牌"
      >
        {s.cards.map((card, i) => (
          <Card key={i} index={i} card={card} up={s.open.includes(i) || !!s.owner[i]} owner={s.owner[i]} disabled={s.turn !== 'kid' || s.open.length >= 2} onFlip={() => flip(i, 'kid')} />
        ))}
      </div>
    </div>
  );
}

/** 一張牌：背面是拼圖花紋，翻開是文字或圖；配對成功的牌依配到的人上色 */
function Card({ index, card, up, owner, disabled, onFlip }: { index: number; card: MemoryCard; up: boolean; owner: 'kid' | 'bot' | null; disabled: boolean; onFlip: () => void }) {
  const { text, emoji, lang } = card.face;
  return (
    <button
      className={`memory-card ${up ? 'up' : ''} ${owner ?? ''}`}
      onClick={onFlip}
      disabled={disabled || up}
      aria-label={up ? (text ?? emoji ?? '') : `第 ${index + 1} 張牌`}
      data-testid={`memory-card-${index}`}
    >
      <span className="inner">
        <span className="side back" aria-hidden="true">
          🧩
        </span>
        <span className="side front">
          {emoji && <span className="emoji">{emoji}</span>}
          {text && (lang === 'zh-TW' ? <KidText text={text} /> : <span className={lang === 'en-US' ? 'en' : ''}>{text}</span>)}
          {owner === 'bot' && <span className="who">🤖</span>}
        </span>
      </span>
    </button>
  );
}
