/**
 * 益智遊戲館：選單（遊戲卡、今天還能玩多久、今天的益智金幣）→ 選玩法 → 遊戲 → 結算。
 * 選單、遊戲、結算都在這個畫面（screen 'puzzle'），休息提醒依這個畫面累計益智遊戲的時間。
 * 今天的益智遊戲時間用完時不能開新局；正在玩的那一局可以玩完。
 */
import { useEffect, useState, type ComponentType } from 'react';
import { useUi } from '../store/useUi';
import { useGame } from '../store/useGame';
import { PUZZLE_DAILY_COIN_CAP, type PuzzleGameId } from '../store/puzzle';
import { puzzleToday } from '../store/save';
import { badgeById } from '../store/badges';
import { doorOf, zoneById } from '../world/layout';
import { teleport } from '../world/input';
import { speak, stopSpeaking } from '../audio/speech';
import { sfx } from '../audio/sfx';
import { PUZZLE_LINES, RESULT_MESSAGES, newBadgeLine } from '../ui/lines';
import { starText } from '../ui/screens/ZoneMenu';
import type { BotLevel } from '../engine/puzzle/common';
import { PUZZLE_GAMES, puzzleGame, type PuzzleGameInfo } from './catalog';
import { puzzleSecondsLeft } from './time';
import { puzzleDebug } from './debug';
import type { PuzzleGameProps, PuzzleMode, PuzzleOutcome, PuzzleRun } from './types';
import QuizGame from './quiz/QuizGame';

/** 各遊戲的元件（目錄 catalog.ts 是純資料，元件的對照放這裡） */
const GAME_COMPONENTS: Partial<Record<PuzzleGameId, ComponentType<PuzzleGameProps>>> = {
  quiz: QuizGame,
};

/** 機器人的三種難度 */
const LEVELS: { level: BotLevel; name: string; color: string }[] = [
  { level: 1, name: '簡單', color: 'green' },
  { level: 2, name: '普通', color: '' },
  { level: 3, name: '厲害', color: 'red' },
];

/** 畫面上正在做什麼：選單、玩一局、看結算 */
type View = { t: 'menu' } | { t: 'play'; run: PuzzleRun } | { t: 'result'; run: PuzzleRun; outcome: PuzzleOutcome; coins: number; newBadges: string[] };

export function PuzzleScreen() {
  const goto = useUi((s) => s.goto);
  const profile = useGame((s) => s.profile());
  const limitMin = useGame((s) => s.save.settings.puzzleLimitMin);
  const finishPuzzle = useGame((s) => s.finishPuzzle);
  const [view, setView] = useState<View>({ t: 'menu' });
  const [picking, setPicking] = useState<PuzzleGameInfo | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const zone = zoneById('puzzle');

  const now = new Date();
  const left = profile ? puzzleSecondsLeft(profile, limitMin, now) : null;
  const timeUp = left !== null && left <= 0;
  const coinsToday = profile ? puzzleToday(profile, now).coins : 0;

  // 時間用完時在選單唸一次提醒
  const menuTimeUp = view.t === 'menu' && timeUp;
  useEffect(() => {
    if (menuTimeUp) speak(PUZZLE_LINES.timeUp);
  }, [menuTimeUp]);

  /** 開始一局（每局用新的種子） */
  const begin = (game: PuzzleGameId, mode: PuzzleMode, level: BotLevel) => {
    if (timeUp) return;
    sfx.tap();
    setPicking(null);
    setView({ t: 'play', run: { game, mode, level, seed: Math.floor(Math.random() * 1e9) } });
  };
  /** 一局玩完：存檔（金幣由存檔規則依星數與每日上限算）並顯示結算 */
  const finish = (run: PuzzleRun, outcome: PuzzleOutcome) => {
    const { coins, newBadges } = finishPuzzle({ game: run.game, stars: outcome.stars, answers: outcome.answers });
    puzzleDebug.state = null;
    setView({ t: 'result', run, outcome, coins, newBadges });
  };
  const backToMenu = () => {
    stopSpeaking();
    puzzleDebug.state = null;
    setConfirmExit(false);
    setView({ t: 'menu' });
  };
  const leave = () => {
    stopSpeaking();
    teleport(doorOf(zone));
    goto('island');
  };

  if (view.t === 'play') {
    const Game = GAME_COMPONENTS[view.run.game];
    return (
      <div className="panel-screen">
        {Game && <Game key={view.run.seed} run={view.run} onFinish={(o) => finish(view.run, o)} onExit={() => setConfirmExit(true)} />}
        {confirmExit && (
          <div className="panel-screen" style={{ zIndex: 5 }}>
            <div className="card pop-in" style={{ padding: 24, textAlign: 'center', width: 'min(480px, 100%)' }} role="alertdialog">
              <p style={{ fontSize: 26, margin: '4px 0 18px' }}>要離開嗎？這一局不會記錄喔。</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn white" onClick={() => setConfirmExit(false)}>
                  繼續玩
                </button>
                <button className="btn red" onClick={backToMenu} data-testid="confirm-exit">
                  離開
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view.t === 'result') {
    return <PuzzleResult view={view} timeUp={timeUp} onAgain={() => begin(view.run.game, view.run.mode, view.run.level)} onMenu={backToMenu} onLeave={leave} />;
  }

  return (
    <div className="panel-screen">
      <div className="panel card" role="dialog" aria-label={zone.name} data-testid="puzzle-menu">
        <div className="panel-head">
          <span className="ribbon" style={{ background: zone.color }}>
            {zone.icon} {zone.name}
          </span>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>
            {zone.intro}
            <span className="hud-chip puzzle-chip" data-testid="puzzle-time-left">
              ⏱️ {left === null ? '今天不限時間' : timeUp ? '今天的時間用完了' : `今天還可以玩 ${Math.ceil(left / 60)} 分鐘`}
            </span>
            <span className="hud-chip puzzle-chip" data-testid="puzzle-coins-today">
              🪙 今天 {coinsToday}／{PUZZLE_DAILY_COIN_CAP}
            </span>
          </h2>
          <button className="btn small white" onClick={leave} data-testid="leave-zone">
            回島上
          </button>
        </div>
        <div className="panel-body">
          {timeUp && (
            <p className="puzzle-time-up" data-testid="puzzle-time-up">
              ⏰ {PUZZLE_LINES.timeUp}
            </p>
          )}
          <div className="activity-grid">
            {PUZZLE_GAMES.filter((g) => GAME_COMPONENTS[g.id]).map((g) => (
              <button
                key={g.id}
                className="activity-card"
                disabled={timeUp}
                style={timeUp ? { opacity: 0.55, cursor: 'default' } : undefined}
                onClick={() => {
                  sfx.tap();
                  speak(g.title);
                  setPicking(g);
                }}
                data-testid={`puzzle-${g.id}`}
              >
                <span className="icon">{g.icon}</span>
                <span className="name">{g.title}</span>
                <span className="puzzle-modes">👤 自己玩・🤖 和機器人</span>
                <span className="stars">{starText(profile?.puzzle?.best[g.id] ?? 0)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {picking && <ModePicker game={picking} onPick={(mode, level) => begin(picking.id, mode, level)} onClose={() => setPicking(null)} />}
    </div>
  );
}

/** 選玩法：自己玩，或和機器人比賽（簡單／普通／厲害） */
function ModePicker({ game, onPick, onClose }: { game: PuzzleGameInfo; onPick: (mode: PuzzleMode, level: BotLevel) => void; onClose: () => void }) {
  return (
    <div className="panel-screen" style={{ background: 'rgba(43,42,76,.35)' }}>
      <div className="card pop-in" style={{ padding: 22, width: 'min(560px, 100%)' }} role="dialog" aria-label="選玩法">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 44 }}>{game.icon}</span>
          <h2 style={{ margin: 0, flex: 1, fontSize: 28 }}>{game.title}</h2>
          <button className="btn small white" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </div>
        <p style={{ fontSize: 18, margin: '8px 0 14px' }}>{game.description}</p>
        <p className="puzzle-mode-title">👤 自己玩：{game.solo}</p>
        <button className="btn big green" style={{ width: '100%' }} onClick={() => onPick('solo', 1)} data-testid="puzzle-solo">
          開始 ▶
        </button>
        <p className="puzzle-mode-title">🤖 和機器人比賽：{game.vs}</p>
        <div className="level-pick">
          {LEVELS.map((l) => (
            <button key={l.level} className={`btn ${l.color}`} onClick={() => onPick('vs', l.level)} data-testid={`puzzle-vs-${l.level}`}>
              {l.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 結算：星星、這局的成績、金幣（拿滿了就說明）、新獎章 */
function PuzzleResult({
  view,
  timeUp,
  onAgain,
  onMenu,
  onLeave,
}: {
  view: Extract<View, { t: 'result' }>;
  timeUp: boolean;
  onAgain: () => void;
  onMenu: () => void;
  onLeave: () => void;
}) {
  const { outcome, coins, newBadges } = view;
  const game = puzzleGame(view.run.game);
  const message = outcome.vs ? PUZZLE_LINES[outcome.vs] : RESULT_MESSAGES[outcome.stars];

  useEffect(() => {
    sfx.fanfare();
    const timers = Array.from({ length: outcome.stars }, (_, i) => setTimeout(() => sfx.star(i), 500 + i * 350));
    if (coins > 0) timers.push(setTimeout(() => sfx.coin(), 600 + outcome.stars * 350));
    speak(message);
    // 金幣拿滿了、得到新獎章：等鼓勵的話唸完再說
    const later = coins === 0 ? PUZZLE_LINES.coinCap : newBadges.length ? newBadgeLine(badgeById(newBadges[0])?.name ?? '') : null;
    if (later) timers.push(setTimeout(() => speak(later), 2600));
    return () => timers.forEach(clearTimeout);
  }, [outcome, coins, newBadges, message]);

  return (
    <div className="panel-screen">
      <div className="card result pop-in" data-testid="puzzle-result">
        <span className="ribbon">
          {game?.icon} {game?.title}
        </span>
        <div className="result-stars" aria-label={`${outcome.stars} 顆星`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < outcome.stars ? '' : 'off'} style={{ animationDelay: `${0.4 + i * 0.35}s` }}>
              ⭐
            </span>
          ))}
        </div>
        <p style={{ fontSize: 26, fontWeight: 800 }} data-testid="puzzle-summary">
          {outcome.summary}
        </p>
        <p>{message}</p>
        {coins > 0 ? (
          <p style={{ fontSize: 28, fontWeight: 800 }} data-testid="puzzle-coins">
            🪙 +{coins}
          </p>
        ) : (
          <p className="notice" data-testid="puzzle-coin-cap">
            🪙 {PUZZLE_LINES.coinCap}
          </p>
        )}
        {newBadges.length > 0 && (
          <div className="new-badges" data-testid="new-badges">
            {newBadges.map((id) => {
              const b = badgeById(id);
              return b ? (
                <div key={id} className="new-badge">
                  <span className="new-badge-icon">{b.icon}</span>
                  <span>
                    新獎章：<b>{b.name}</b>
                  </span>
                </div>
              ) : null;
            })}
          </div>
        )}
        {timeUp && <p className="puzzle-time-up">⏰ {PUZZLE_LINES.timeUp}</p>}
        <div className="result-actions">
          {!timeUp && (
            <button className="btn green" onClick={onAgain} data-testid="puzzle-again">
              ↻ 再玩一次
            </button>
          )}
          <button className="btn white" onClick={onMenu} data-testid="puzzle-back-menu">
            選別的遊戲
          </button>
          <button className="btn white" onClick={onLeave} data-testid="back-to-island">
            回島上
          </button>
        </div>
      </div>
    </div>
  );
}
