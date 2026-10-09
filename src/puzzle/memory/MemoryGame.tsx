/**
 * 記憶翻牌（規則在 src/engine/puzzle/memory.ts）：一次翻兩張，同一對就留在桌上。
 * - 自己玩：步數越少星星越多。
 * - 和機器人輪流：配對成功可以再翻一次；機器人只記得最近 2／4／8 張翻過的牌。
 * - 和朋友輪流（島嶼互訪 I4，規則在 src/engine/puzzle/friend.ts）：邀請的人先翻，翻牌等伺服器回音才算。
 * 翻開文字牌（英文單字、中文名稱）會唸出來。
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import { foldDuel, friendMemoryStep, startFriendMemory } from '../../engine/puzzle/friend';
import { sendDuelMove } from '../../online/useFriendDuel';
import { KidText } from '../../ui/KidText';
import { DUEL_LINES, PRAISE, PUZZLE_LINES } from '../../ui/lines';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { puzzleDebug } from '../debug';
import type { PuzzleGameProps } from '../types';
import { useFriendEnd, useFriendEvents } from '../useFriendGame';

type Action = { t: 'flip'; index: number; who: 'kid' | 'bot' } | { t: 'settle' };

function reducer(s: MemoryState, a: Action): MemoryState {
  return a.t === 'flip' ? flipCard(s, a.index, a.who) : settle(s);
}

/** 兩張不同對的牌給大家看多久再蓋回去（毫秒） */
const SHOW_MS = 1100;

export default function MemoryGame(props: PuzzleGameProps) {
  return props.run.mode === 'friend' ? <FriendMemory {...props} /> : <BotMemory {...props} />;
}

/** 自己玩、和機器人輪流 */
function BotMemory({ run, onFinish, onExit }: PuzzleGameProps) {
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

  useMemoryDebug(s, run.mode);

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

  return (
    <MemoryBoard
      s={s}
      mode={run.mode}
      pairs={pairs}
      opponent={vs ? { name: '機器人', icon: '🤖', turn: '🤖 機器人翻牌中……' } : null}
      canFlip={s.turn === 'kid' && s.open.length < 2}
      onFlip={(i) => flip(i, 'kid')}
      onExit={onExit}
    />
  );
}

/**
 * 和朋友輪流翻牌（島嶼互訪 I4）：牌桌由伺服器排好順序的翻牌算出來（兩邊一樣）。
 * 不同對的兩張在下一次翻牌前蓋回去、換人；畫面上先給大家看 SHOW_MS 再蓋（covered），輪到的人這時才能翻
 */
function FriendMemory({ run, onFinish, onExit, onAbort }: PuzzleGameProps) {
  const name = run.friend?.name ?? '朋友';
  const deck = useMemo(() => makeMemoryDeck(run.seed, run.level), [run.seed, run.level]);
  const pairs = PAIRS_BY_LEVEL[run.level];
  const events = useFriendEvents();
  const s = useMemo(() => foldDuel(events, startFriendMemory(deck, run.friend?.first ?? 'kid'), friendMemoryStep), [events, deck, run.friend?.first]);
  /** 兩張不同對的牌已經給大家看過了：畫面上蓋回去、換人 */
  const [covered, setCovered] = useState(false);
  /** 畫面上的狀態：看過的不同對兩張先蓋回去（和下一次翻牌時規則裡的蓋回一樣） */
  const shown = s.open.length >= 2 && covered ? settle(s) : s;
  /** 送出翻牌、還在等回音的步數（等回音時不能再翻） */
  const [sentAt, setSentAt] = useState<number | null>(null);
  const waiting = sentAt === events.length;

  useEffect(() => {
    setCovered(false);
    if (s.open.length < 2) return;
    const t = setTimeout(() => setCovered(true), SHOW_MS);
    return () => clearTimeout(t);
  }, [s.open.length, s.steps]);

  // 有人翻開一張牌：翻牌聲，文字牌唸出來
  const lastFlip = events.length ? events[events.length - 1] : null;
  useEffect(() => {
    if (lastFlip?.k !== 'flip' || lastFlip.i === undefined || (!s.open.includes(lastFlip.i) && !s.owner[lastFlip.i])) return;
    sfx.tap();
    const face = s.cards[lastFlip.i].face;
    if (face.text && face.lang) speak(face.text, face.lang);
    // 每一則動作只處理一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  const matched = s.scores.kid + s.scores.bot;
  useEffect(() => {
    if (matched > 0) sfx.correct();
  }, [matched]);

  // 換人時提醒（第一次輪到自己不唸）
  const turnSeen = useRef(false);
  useEffect(() => {
    if (shown.done) return;
    if (!turnSeen.current) {
      turnSeen.current = true;
      return;
    }
    speak(shown.turn === 'kid' ? PUZZLE_LINES.yourTurn : DUEL_LINES.friendTurn);
  }, [shown.turn, shown.done]);

  useMemoryDebug(shown, 'friend');
  useFriendEnd(s.done, name, onFinish, onAbort);

  // 全部配完就結算
  useEffect(() => {
    if (!s.done) return;
    const outcome = vsOutcome(s.scores.kid, s.scores.bot);
    onFinish({ stars: outcomeStars(outcome), vs: outcome, summary: `你 ${s.scores.kid}：${s.scores.bot} ${name}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.done]);

  /** 自己翻牌：照規則（蓋回之後）能翻才送，回音回來才翻開 */
  const flip = (i: number) => {
    if (waiting || flipCard(shown, i, 'kid') === shown) return;
    sendDuelMove('flip', i);
    setSentAt(events.length);
  };

  return (
    <MemoryBoard
      s={shown}
      mode="friend"
      pairs={pairs}
      opponent={{ name, icon: '👫', turn: `👫 ${name}翻牌中……` }}
      canFlip={shown.turn === 'kid' && shown.open.length < 2 && !waiting}
      onFlip={flip}
      onExit={onExit}
    />
  );
}

/** 讓 e2e 讀得到牌桌（離開遊戲時清掉） */
function useMemoryDebug(s: MemoryState, mode: string) {
  useEffect(() => {
    puzzleDebug.state = { game: 'memory', mode, turn: s.turn, steps: s.steps, scores: s.scores, open: s.open, done: s.done, pairs: s.cards.map((c) => c.pair), owner: s.owner };
  }, [s, mode]);
  useEffect(
    () => () => {
      puzzleDebug.state = null;
    },
    [],
  );
}

/** 牌桌（自己玩、和機器人、和朋友共用）：標題列的步數或比分、輪到誰，下面是牌 */
function MemoryBoard({
  s,
  mode,
  pairs,
  opponent,
  canFlip,
  onFlip,
  onExit,
}: {
  s: MemoryState;
  mode: string;
  pairs: number;
  /** 對手（自己玩時是 null）：比分上的名字、配到的牌上的圖示、對手翻牌時的提示 */
  opponent: { name: string; icon: string; turn: string } | null;
  canFlip: boolean;
  onFlip: (index: number) => void;
  onExit: () => void;
}) {
  const matched = s.scores.kid + s.scores.bot;
  const cols = s.cards.length <= 16 ? 4 : 5;
  const rows = Math.ceil(s.cards.length / cols);
  return (
    <div className="card puzzle-play" data-testid="memory-game" data-mode={mode}>
      <div className="puzzle-head">
        <button className="btn round white" onClick={onExit} aria-label="離開">
          ✕
        </button>
        <div className="grow">
          {opponent ? (
            <>
              <span className="scoreboard" data-testid="memory-score">
                🙋 你 {s.scores.kid}：{s.scores.bot} {opponent.name} {opponent.icon}
              </span>
              <span className={`hud-chip memory-turn ${s.turn}`} role="status" data-testid="memory-turn">
                {s.turn === 'kid' ? '輪到你翻牌' : opponent.turn}
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
          <Card key={i} index={i} card={card} up={s.open.includes(i) || !!s.owner[i]} owner={s.owner[i]} botIcon={opponent?.icon ?? '🤖'} disabled={!canFlip} onFlip={() => onFlip(i)} />
        ))}
      </div>
    </div>
  );
}

/** 一張牌：背面是拼圖花紋，翻開是文字或圖；配對成功的牌依配到的人上色（對手配到的標上對手的圖示） */
function Card({
  index,
  card,
  up,
  owner,
  botIcon,
  disabled,
  onFlip,
}: {
  index: number;
  card: MemoryCard;
  up: boolean;
  owner: 'kid' | 'bot' | null;
  botIcon: string;
  disabled: boolean;
  onFlip: () => void;
}) {
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
          {owner === 'bot' && <span className="who">{botIcon}</span>}
        </span>
      </span>
    </button>
  );
}
