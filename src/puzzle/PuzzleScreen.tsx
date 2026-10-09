/**
 * 益智遊戲館：選單（遊戲卡、今天還能玩多久、今天的益智金幣）→ 選玩法 → 遊戲 → 結算。
 * 選單、遊戲、結算都在這個畫面（screen 'puzzle'），休息提醒依這個畫面累計益智遊戲的時間。
 * 今天的益智遊戲時間用完時不能開新局；正在玩的那一局可以玩完。
 */
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
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
import { usePuzzleNow } from './now';
import type { PuzzleGameProps, PuzzleMode, PuzzleOutcome, PuzzleRun } from './types';
import QuizGame from './quiz/QuizGame';
import MemoryGame from './memory/MemoryGame';
import SpotGame from './spot/SpotGame';
import BlocksGame from './blocks/BlocksGame';
import TangramGame from './tangram/TangramGame';
import { useRealtime } from '../online/realtimeClient';
import { usePresence } from '../online/usePresence';
import { cancelInvite, clearDuelNote, duelCandidates, duelNoteText, inviteFriend, leaveDuel, useFriendDuel } from '../online/useFriendDuel';
import { DuelInviteCard } from '../ui/DuelInviteCard';

/** 各遊戲的元件（目錄 catalog.ts 是純資料，元件的對照放這裡） */
const GAME_COMPONENTS: Partial<Record<PuzzleGameId, ComponentType<PuzzleGameProps>>> = {
  quiz: QuizGame,
  memory: MemoryGame,
  spot: SpotGame,
  blocks: BlocksGame,
  tangram: TangramGame,
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
  // 正在玩的遊戲名稱（回報給老師「在做什麼」，老師 GM 的 G3）；離開益智遊戲館就清掉
  const playing = view.t === 'play' ? (puzzleGame(view.run.game)?.title ?? null) : null;
  useEffect(() => usePuzzleNow.setState({ title: playing }), [playing]);
  useEffect(() => () => usePuzzleNow.setState({ title: null }), []);
  const [picking, setPicking] = useState<PuzzleGameInfo | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  /** 和朋友對戰（島嶼互訪 I4）：送出的邀請、按了接受等開局、邀請的結果、進行中的一局 */
  const outgoing = useFriendDuel((s) => s.outgoing);
  const joining = useFriendDuel((s) => s.joining);
  const note = useFriendDuel((s) => s.note);
  const live = useFriendDuel((s) => s.live);
  /** 自己的連線斷了、這一局不算（顯示一次） */
  const [abortMsg, setAbortMsg] = useState<string | null>(null);
  /** 已經開始的對戰（同一局只開一次） */
  const startedDuel = useRef<string | null>(null);
  /** 已經結算過的那一局（種子）：遊戲元件萬一回報兩次，也只存一次檔、只給一次金幣 */
  const finishedSeed = useRef<number | null>(null);
  const zone = zoneById('puzzle');

  const now = new Date();
  const left = profile ? puzzleSecondsLeft(profile, limitMin, now) : null;
  const timeUp = left !== null && left <= 0;
  const coinsToday = profile ? puzzleToday(profile, now).coins : 0;
  /** 可以和朋友對戰：即時連線上線中、伺服器支援（島嶼互訪 I4） */
  const friendOnline = useRealtime((s) => s.status === 'online' && s.duel);
  const members = usePresence((s) => s.members);
  const selfId = usePresence((s) => s.selfId);
  /** 島上可以邀請的人 */
  const candidates = useMemo(() => duelCandidates(members, selfId), [members, selfId]);

  // 時間用完時在選單唸一次提醒
  const menuTimeUp = view.t === 'menu' && timeUp;
  useEffect(() => {
    if (menuTimeUp) speak(PUZZLE_LINES.timeUp);
  }, [menuTimeUp]);

  // 對戰開始（自己送的邀請被接受、或接受了別人的邀請）：換到對戰畫面
  useEffect(() => {
    if (!live || live.end || startedDuel.current === live.id) return;
    startedDuel.current = live.id;
    stopSpeaking();
    setPicking(null);
    setConfirmExit(false);
    setView({ t: 'play', run: { game: live.game, mode: 'friend', level: live.level, seed: live.seed, friend: { name: live.opponent.name, first: live.first } } });
  }, [live]);
  // 邀請的結果：唸固定的句子（畫面上寫名字）
  useEffect(() => {
    if (note) speak(duelNoteText(note).speech);
  }, [note]);
  // 離開益智遊戲館：收回送出的邀請；正在對戰就算離開（例如老師請大家集合）
  useEffect(
    () => () => {
      cancelInvite();
      leaveDuel();
    },
    [],
  );

  /** 開始一局（每局用新的種子） */
  const begin = (game: PuzzleGameId, mode: PuzzleMode, level: BotLevel) => {
    if (timeUp) return;
    sfx.tap();
    setPicking(null);
    setConfirmExit(false);
    setView({ t: 'play', run: { game, mode, level, seed: Math.floor(Math.random() * 1e9) } });
  };
  /** 一局玩完：存檔（金幣由存檔規則依星數與每日上限算）並顯示結算 */
  const finish = (run: PuzzleRun, outcome: PuzzleOutcome) => {
    if (finishedSeed.current === run.seed) return;
    finishedSeed.current = run.seed;
    const { coins, newBadges } = finishPuzzle({ game: run.game, stars: outcome.stars, answers: outcome.answers });
    // 和朋友對戰玩完了：讓伺服器收掉這一局（對方已經玩完，收到的 duelEnd 不理）
    if (run.mode === 'friend') leaveDuel();
    puzzleDebug.state = null;
    setConfirmExit(false);
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
  /** 確認離開這一局：和朋友對戰時對方直接贏 */
  const exitGame = () => {
    leaveDuel();
    backToMenu();
  };
  /** 和朋友對戰時自己的連線斷了：這一局不算 */
  const abortGame = (message: string) => {
    leaveDuel();
    backToMenu();
    setAbortMsg(message);
    speak(message);
  };

  if (view.t === 'play') {
    const Game = GAME_COMPONENTS[view.run.game];
    return (
      <div className="panel-screen">
        {Game && <Game key={view.run.seed} run={view.run} onFinish={(o) => finish(view.run, o)} onExit={() => setConfirmExit(true)} onAbort={abortGame} />}
        {confirmExit && (
          <div className="panel-screen" style={{ zIndex: 5 }}>
            <div className="card pop-in" style={{ padding: 24, textAlign: 'center', width: 'min(480px, 100%)' }} role="alertdialog">
              <p style={{ fontSize: 26, margin: '4px 0 18px' }}>{view.run.mode === 'friend' ? '要離開嗎？這一局會算朋友贏喔。' : '要離開嗎？這一局不會記錄喔。'}</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn white" onClick={() => setConfirmExit(false)}>
                  繼續玩
                </button>
                <button className="btn red" onClick={exitGame} data-testid="confirm-exit">
                  離開
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 和朋友玩（島嶼互訪 I4）的對話框：等對方接受、等開局、邀請的結果、連線斷了
  const duelDialogs = (
    <>
      {outgoing && (
        <DuelDialog testId="duel-waiting">
          <p>
            等 <b>{outgoing.name}</b> 接受邀請……
          </p>
          <button className="btn white" onClick={cancelInvite} data-testid="duel-cancel">
            取消
          </button>
        </DuelDialog>
      )}
      {joining && (
        <DuelDialog testId="duel-joining">
          <p>
            準備和 <b>{joining.name}</b> 一起玩……
          </p>
        </DuelDialog>
      )}
      {note && (
        <DuelDialog testId="duel-note">
          <p>{duelNoteText(note).text}</p>
          <button className="btn green" onClick={clearDuelNote} data-testid="duel-note-ok">
            好
          </button>
        </DuelDialog>
      )}
      {abortMsg && (
        <DuelDialog testId="duel-abort">
          <p>{abortMsg}</p>
          <button className="btn green" onClick={() => setAbortMsg(null)} data-testid="duel-abort-ok">
            好
          </button>
        </DuelDialog>
      )}
    </>
  );

  if (view.t === 'result') {
    return (
      <>
        <PuzzleResult view={view} timeUp={timeUp} onAgain={view.run.mode === 'friend' ? undefined : () => begin(view.run.game, view.run.mode, view.run.level)} onMenu={backToMenu} onLeave={leave} />
        <DuelInviteCard />
        {duelDialogs}
      </>
    );
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
                <span className="puzzle-modes">👤 自己玩・🤖 和機器人{friendOnline ? '・👫 和朋友' : ''}</span>
                <span className="stars">{starText(profile?.puzzle?.best[g.id] ?? 0)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* 時間用完時不顯示選玩法（按了也不能開始） */}
      {picking && !timeUp && (
        <ModePicker
          game={picking}
          onPick={(mode, level) => begin(picking.id, mode, level)}
          onClose={() => setPicking(null)}
          friends={friendOnline ? candidates : null}
          onInvite={(id, name, level) => {
            sfx.tap();
            setPicking(null);
            inviteFriend(id, name, picking.id, level);
          }}
        />
      )}
      <DuelInviteCard />
      {duelDialogs}
    </div>
  );
}

/** 和朋友玩的小對話框 */
function DuelDialog({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div className="panel-screen" style={{ zIndex: 5, background: 'rgba(43,42,76,.35)' }}>
      <div className="card pop-in duel-dialog" role="alertdialog" data-testid={testId}>
        {children}
      </div>
    </div>
  );
}

/**
 * 選玩法：自己玩，或和機器人比賽（簡單／普通／厲害）；連上線時還有和朋友玩（島嶼互訪 I4）：
 * 選難度（益智搶答不分）、點島上的朋友送出邀請。friends 是 null 表示不能和朋友玩（沒連線或伺服器不支援）
 */
function ModePicker({
  game,
  onPick,
  onClose,
  friends,
  onInvite,
}: {
  game: PuzzleGameInfo;
  onPick: (mode: PuzzleMode, level: BotLevel) => void;
  onClose: () => void;
  friends: { id: string; nickname: string }[] | null;
  onInvite: (id: string, name: string, level: BotLevel) => void;
}) {
  /** 和朋友玩的難度（預設普通） */
  const [friendLevel, setFriendLevel] = useState<BotLevel>(2);
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
        {game.soloLevels ? (
          <div className="level-pick">
            {LEVELS.map((l) => (
              <button key={l.level} className={`btn ${l.color}`} onClick={() => onPick('solo', l.level)} data-testid={`puzzle-solo-${l.level}`}>
                {l.name}
              </button>
            ))}
          </div>
        ) : (
          <button className="btn big green" style={{ width: '100%' }} onClick={() => onPick('solo', 1)} data-testid="puzzle-solo">
            開始 ▶
          </button>
        )}
        <p className="puzzle-mode-title">🤖 和機器人比賽：{game.vs}</p>
        <div className="level-pick">
          {LEVELS.map((l) => (
            <button key={l.level} className={`btn ${l.color}`} onClick={() => onPick('vs', l.level)} data-testid={`puzzle-vs-${l.level}`}>
              {l.name}
            </button>
          ))}
        </div>
        {friends && (
          <>
            <p className="puzzle-mode-title">👫 和朋友玩：{game.friend}</p>
            {friends.length === 0 ? (
              <p className="notice" data-testid="duel-no-friends">
                島上現在沒有其他小朋友，等朋友來了再邀請吧！
              </p>
            ) : (
              <>
                {game.soloLevels && (
                  <div className="level-pick">
                    {LEVELS.map((l) => (
                      <button
                        key={l.level}
                        className={`btn ${l.color}`}
                        aria-pressed={friendLevel === l.level}
                        onClick={() => setFriendLevel(l.level)}
                        data-testid={`duel-level-${l.level}`}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="duel-friends">
                  {friends.map((f) => (
                    <button key={f.id} className="btn" onClick={() => onInvite(f.id, f.nickname, game.soloLevels ? friendLevel : 1)} data-testid={`duel-invite-${f.nickname}`}>
                      👫 邀請 {f.nickname}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
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
  /** 再玩一次（和朋友對戰時沒有：要重新邀請） */
  onAgain?: () => void;
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
          {!timeUp && onAgain && (
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
