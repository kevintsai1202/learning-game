/**
 * 找不同（規則在 src/engine/puzzle/spotDiff.ts）：左右兩張島上風景，點出右圖不一樣的地方（點左圖或右圖都可以）。
 * - 自己玩：限時找完，越快星星越多；點錯扣 3 秒。
 * - 和機器人：同一組圖一起找，誰先點到就是誰的（圈圈顏色不同）；機器人每隔幾秒找到一處。點錯要停 1.5 秒。
 * - 和朋友（島嶼互訪 I4）：同上，伺服器先收到誰點到的算誰的。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRng } from '../../core/rng';
import { outcomeStars, vsOutcome } from '../../engine/puzzle/common';
import { DIFFS_BY_LEVEL, MISS_PENALTY_SECONDS, SPOT_SECONDS, botFindDelay, makeSpotScene, spotStars, spotTap } from '../../engine/puzzle/spotDiff';
import { PUZZLE_LINES } from '../../ui/lines';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { puzzleDebug } from '../debug';
import type { PuzzleGameProps } from '../types';
import { SceneView } from './SceneView';
import { foldDuel, friendSpotStep, startFriendSpot } from '../../engine/puzzle/friend';
import { sendDuelMove } from '../../online/useFriendDuel';
import { useFriendEnd, useFriendEvents } from '../useFriendGame';

/** 和機器人比賽時，孩子點錯要停多久才能再點（毫秒） */
const VS_MISS_LOCK_MS = 1500;
/** 點錯的叉叉顯示多久（毫秒） */
const MISS_SHOW_MS = 700;

export default function SpotGame(props: PuzzleGameProps) {
  return props.run.mode === 'friend' ? <FriendSpot {...props} /> : <BotSpot {...props} />;
}

/** 自己玩、和機器人一起找 */
function BotSpot({ run, onFinish, onExit }: PuzzleGameProps) {
  const vs = run.mode === 'vs';
  const scene = useMemo(() => makeSpotScene(run.seed, run.level), [run.seed, run.level]);
  const total = DIFFS_BY_LEVEL[run.level];
  const limit = SPOT_SECONDS[run.level];
  /** 每一處被誰找到 */
  const [found, setFound] = useState<('kid' | 'bot' | null)[]>(() => scene.diffs.map(() => null));
  /** 點錯扣的秒數（自己玩） */
  const [penalty, setPenalty] = useState(0);
  const [misses, setMisses] = useState<{ x: number; y: number; id: number }[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const startedAt = useRef(Date.now());
  /** 和機器人比賽時點錯後，到這個時間之前不能點 */
  const lockedUntil = useRef(0);
  const finished = useRef(false);
  const rng = useMemo(() => createRng(run.seed ^ 0x5f0), [run.seed]);

  const timeLeft = Math.max(0, limit - (now - startedAt.current) / 1000 - penalty);
  const kidCount = found.filter((f) => f === 'kid').length;
  const botCount = found.filter((f) => f === 'bot').length;
  const allFound = kidCount + botCount === total;
  const over = allFound || timeLeft <= 0;

  // 開始時說明玩法；計時（每 0.25 秒更新）
  useEffect(() => {
    speak(PUZZLE_LINES.spotStart);
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    puzzleDebug.state = { game: 'spot', mode: run.mode, diffs: scene.diffs.map(({ x, y, r }) => ({ x, y, r })), found, penalty, timeLeft, done: over };
  }, [scene, found, penalty, timeLeft, over, run.mode]);
  useEffect(
    () => () => {
      puzzleDebug.state = null;
    },
    [],
  );

  // 機器人：每隔幾秒找到一處（e2e 可以用 botDelayFactor 調速度）
  useEffect(() => {
    if (!vs || over) return;
    const t = setTimeout(
      () => {
        setFound((f) => {
          const left = f.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
          if (!left.length) return f;
          const next = f.slice();
          next[rng.pick(left)] = 'bot';
          return next;
        });
        sfx.oops();
      },
      botFindDelay(run.level, rng) * puzzleDebug.botDelayFactor,
    );
    return () => clearTimeout(t);
    // 每找到一處（不論誰找到）重新排下一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vs, over, botCount]);

  // 全部找到或時間到就結算
  useEffect(() => {
    if (!over || finished.current) return;
    finished.current = true;
    if (vs) {
      const outcome = vsOutcome(kidCount, botCount);
      onFinish({ stars: outcomeStars(outcome), vs: outcome, summary: `你 ${kidCount}：${botCount} 機器人` });
    } else {
      const summary = allFound ? `${total} 處全部找到了！還剩 ${Math.ceil(timeLeft)} 秒` : `找到 ${kidCount}／${total} 處`;
      onFinish({ stars: spotStars(kidCount, total, timeLeft, limit), summary });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  /** 孩子點了風景上的 (x, y) */
  const tap = (x: number, y: number) => {
    if (over || Date.now() < lockedUntil.current) return;
    const result = spotTap(
      scene,
      found.map((f, k) => (f ? k : -1)).filter((k) => k >= 0),
      x,
      y,
    );
    // 點在已經圈起來的地方（連點兩下、左右圖對照）：不算點錯
    if (result.kind === 'again') return;
    if (result.kind === 'hit') {
      const i = result.index;
      sfx.correct();
      setFound((f) => {
        if (f[i]) return f;
        const next = f.slice();
        next[i] = 'kid';
        return next;
      });
      return;
    }
    sfx.oops();
    if (vs) lockedUntil.current = Date.now() + VS_MISS_LOCK_MS;
    else setPenalty((p) => p + MISS_PENALTY_SECONDS);
    const id = Date.now();
    setMisses((m) => [...m, { x, y, id }]);
    setTimeout(() => setMisses((m) => m.filter((v) => v.id !== id)), MISS_SHOW_MS);
  };

  return (
    <div className="card puzzle-play" data-testid="spot-game" data-mode={run.mode}>
      <div className="puzzle-head">
        <button className="btn round white" onClick={onExit} aria-label="離開">
          ✕
        </button>
        <div className="grow">
          <span className={`hud-chip ${timeLeft < 10 ? 'spot-hurry' : ''}`} data-testid="spot-time">
            ⏱️ {Math.ceil(timeLeft)} 秒
          </span>
          {vs ? (
            <span className="scoreboard" data-testid="spot-score">
              🙋 你 {kidCount}：{botCount} 機器人 🤖
            </span>
          ) : (
            <span className="hud-chip" data-testid="spot-found">
              🔍 找到 {kidCount}／{total}
            </span>
          )}
        </div>
      </div>
      <p className="spot-hint">右邊的圖有 {total} 個地方不一樣，點點看！</p>
      <div className="spot-scenes">
        <SceneView objects={scene.left} diffs={scene.diffs} found={found} misses={misses} onTap={tap} testId="spot-left" label="左邊的圖" />
        <SceneView objects={scene.right} diffs={scene.diffs} found={found} misses={misses} onTap={tap} testId="spot-right" label="右邊的圖" />
      </div>
    </div>
  );
}

/**
 * 和朋友一起找（島嶼互訪 I4，規則在 src/engine/puzzle/friend.ts）：點到一處就送 claim，伺服器先收到誰的算誰的
 * （回音回來才圈起來）；自己的時間到了送 time，第一個 time 就結束，兩邊的結果才一樣。點錯停 1.5 秒（只在自己的裝置）
 */
function FriendSpot({ run, onFinish, onExit, onAbort }: PuzzleGameProps) {
  const name = run.friend?.name ?? '朋友';
  const scene = useMemo(() => makeSpotScene(run.seed, run.level), [run.seed, run.level]);
  const total = DIFFS_BY_LEVEL[run.level];
  const limit = SPOT_SECONDS[run.level];
  const events = useFriendEvents();
  const s = useMemo(() => foldDuel(events, startFriendSpot(total), friendSpotStep), [events, total]);
  const [misses, setMisses] = useState<{ x: number; y: number; id: number }[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const startedAt = useRef(Date.now());
  /** 點錯後，到這個時間之前不能點 */
  const lockedUntil = useRef(0);
  /** 已經送出 claim 的處（回音之前不重送） */
  const claimed = useRef(new Set<number>());
  /** 已經送出時間到 */
  const sentTime = useRef(false);
  const finished = useRef(false);

  const timeLeft = Math.max(0, limit - (now - startedAt.current) / 1000);
  const kidCount = s.found.filter((f) => f === 'kid').length;
  const botCount = s.found.filter((f) => f === 'bot').length;

  // 開始時說明玩法；計時（每 0.25 秒更新）
  useEffect(() => {
    speak(PUZZLE_LINES.spotStart);
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // 自己的時間到了：送 time（結束要等伺服器排好順序，之前送出的 claim 才算得一樣）
  useEffect(() => {
    if (timeLeft > 0 || s.done || sentTime.current) return;
    sentTime.current = true;
    sendDuelMove('time');
  }, [timeLeft, s.done]);

  // 朋友找到一處：叮一聲
  useEffect(() => {
    if (botCount > 0) sfx.oops();
  }, [botCount]);
  useEffect(() => {
    if (kidCount > 0) sfx.correct();
  }, [kidCount]);

  useEffect(() => {
    puzzleDebug.state = { game: 'spot', mode: 'friend', diffs: scene.diffs.map(({ x, y, r }) => ({ x, y, r })), found: s.found, penalty: 0, timeLeft, done: s.done };
  }, [scene, s, timeLeft]);
  useEffect(
    () => () => {
      puzzleDebug.state = null;
    },
    [],
  );

  useFriendEnd(s.done, name, onFinish, onAbort);
  useEffect(() => {
    if (!s.done || finished.current) return;
    finished.current = true;
    const outcome = vsOutcome(kidCount, botCount);
    onFinish({ stars: outcomeStars(outcome), vs: outcome, summary: `你 ${kidCount}：${botCount} ${name}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.done]);

  /** 孩子點了風景上的 (x, y) */
  const tap = (x: number, y: number) => {
    if (s.done || timeLeft <= 0 || Date.now() < lockedUntil.current) return;
    const result = spotTap(
      scene,
      s.found.map((f, k) => (f ? k : -1)).filter((k) => k >= 0),
      x,
      y,
    );
    if (result.kind === 'again') return;
    if (result.kind === 'hit') {
      if (claimed.current.has(result.index)) return;
      claimed.current.add(result.index);
      sendDuelMove('claim', result.index);
      return;
    }
    sfx.oops();
    lockedUntil.current = Date.now() + VS_MISS_LOCK_MS;
    const id = Date.now();
    setMisses((m) => [...m, { x, y, id }]);
    setTimeout(() => setMisses((m) => m.filter((v) => v.id !== id)), MISS_SHOW_MS);
  };

  return (
    <div className="card puzzle-play" data-testid="spot-game" data-mode="friend">
      <div className="puzzle-head">
        <button className="btn round white" onClick={onExit} aria-label="離開">
          ✕
        </button>
        <div className="grow">
          <span className={`hud-chip ${timeLeft < 10 ? 'spot-hurry' : ''}`} data-testid="spot-time">
            ⏱️ {Math.ceil(timeLeft)} 秒
          </span>
          <span className="scoreboard" data-testid="spot-score">
            🙋 你 {kidCount}：{botCount} {name} 👫
          </span>
        </div>
      </div>
      <p className="spot-hint">右邊的圖有 {total} 個地方不一樣，點點看！</p>
      <div className="spot-scenes">
        <SceneView objects={scene.left} diffs={scene.diffs} found={s.found} misses={misses} onTap={tap} testId="spot-left" label="左邊的圖" botIcon="👫" />
        <SceneView objects={scene.right} diffs={scene.diffs} found={s.found} misses={misses} onTap={tap} testId="spot-right" label="右邊的圖" botIcon="👫" />
      </div>
    </div>
  );
}
