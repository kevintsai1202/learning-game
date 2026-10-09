/**
 * 遊玩時間與休息（docs/decisions.md「遊玩時間：玩一段時間要休息」，2026-10-09）：
 * - 每 30 秒：分頁在前景、在算遊玩時間的畫面、1 分鐘內有操作（點、滑、按鍵）才累計遊玩時間與這一輪的連續時間
 * - 連續玩滿家長設定的時間（預設 30 分鐘）就休息（預設 15 分鐘），照真實時間倒數，關掉再開也要等滿，時間到自動解鎖
 * - 家長設了每日上限時，超過就請孩子明天再來
 * 兩種鎖都可以用家長 PIN 解鎖。只在島上、建築、答題、結算、百寶屋、獎章、益智遊戲館顯示（選角畫面不鎖，兄弟姊妹可以換人玩）。
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/useGame';
import { useUi, type Screen } from '../store/useUi';
import { secondsPlayedOn } from '../store/save';
import { EMPTY_REST, isActive, restLeftSec } from '../store/rest';
import { speak } from '../audio/speech';
import { REST_LINE, REST_LINES } from './lines';
import { playTimeKind } from '../puzzle/time';

/** 多久累計一次（秒） */
const TICK_SECONDS = 30;
/** 會被鎖住的畫面 */
const LOCK_SCREENS: Screen[] = ['island', 'zone', 'activity', 'result', 'shop', 'badges', 'puzzle'];
/** 算「有操作」的事件（pointermove：按著搖桿走路、拖曳也算） */
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const;
/** 最後一次操作的時間 */
let lastInputAt = 0;

/** 剩下的秒數寫成「分:秒」 */
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function RestGuard() {
  const screen = useUi((s) => s.screen);
  const profile = useGame((s) => s.profile());
  const settings = useGame((s) => s.save.settings);
  const rest = useGame((s) => (s.save.activeProfileId ? (s.save.rest?.[s.save.activeProfileId] ?? null) : null));
  const endRest = useGame((s) => s.endRest);
  /** 現在時間（休息倒數每秒更新） */
  const [now, setNow] = useState(() => Date.now());
  /** 家長解鎖每日上限後，本次開啟期間不再提醒 */
  const [dailyUnlocked, setDailyUnlocked] = useState(false);
  /** 剛才有沒有在畫面上顯示休息（時間到時說「休息好了」） */
  const showedRest = useRef(false);

  // 有操作：記下時間
  useEffect(() => {
    const mark = () => {
      lastInputAt = Date.now();
    };
    for (const e of INPUT_EVENTS) window.addEventListener(e, mark, { passive: true });
    return () => {
      for (const e of INPUT_EVENTS) window.removeEventListener(e, mark);
    };
  }, []);

  // 每 30 秒累計一次（休息中、沒操作、背景分頁、不算遊玩時間的畫面都不算）。益智遊戲館的時間另外記一份（也算進整體）
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      const kind = playTimeKind(useUi.getState().screen);
      if (document.visibilityState !== 'visible' || kind === 'none' || !isActive(lastInputAt, t)) return;
      const g = useGame.getState();
      const pid = g.save.activeProfileId;
      if (!pid || restLeftSec(g.save.rest?.[pid] ?? EMPTY_REST, t) > 0) return;
      g.tickPlayTime(TICK_SECONDS, kind === 'puzzle');
      g.addRestTime(TICK_SECONDS, t);
      setNow(t);
    }, TICK_SECONDS * 1000);
    return () => clearInterval(id);
  }, []);

  const restUntil = rest?.restUntil ?? null;
  const left = rest ? restLeftSec(rest, now) : 0;
  // 休息中：每秒更新倒數
  useEffect(() => {
    if (restUntil === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [restUntil]);
  // 休息時間到：清掉休息（這一輪重新開始累計）；剛才有顯示休息就說「休息好了」
  useEffect(() => {
    if (restUntil === null || left > 0) return;
    endRest();
    if (showedRest.current) speak(REST_LINES.done);
    showedRest.current = false;
  }, [restUntil, left, endRest]);

  const resting = !!profile && left > 0 && LOCK_SCREENS.includes(screen);
  const dailyOver = !!profile && !resting && settings.dailyLimitMin > 0 && !dailyUnlocked && LOCK_SCREENS.includes(screen) && secondsPlayedOn(profile, new Date(now)) >= settings.dailyLimitMin * 60;
  useEffect(() => {
    if (resting) {
      showedRest.current = true;
      speak(REST_LINES.session);
    }
  }, [resting]);
  useEffect(() => {
    if (dailyOver) speak(REST_LINE);
  }, [dailyOver]);

  if (resting) {
    return (
      <RestCard testId="rest-lock" title={`玩了 ${settings.sessionLimitMin} 分鐘囉！`} text="讓眼睛休息一下，看看遠方、起來動一動，等一下再來玩吧！" onUnlock={endRest}>
        <p className="rest-countdown" data-testid="rest-countdown">
          還要休息 {mmss(left)}
        </p>
      </RestCard>
    );
  }
  if (dailyOver) {
    return <RestCard testId="daily-lock" title={`今天玩了 ${settings.dailyLimitMin} 分鐘囉！`} text="讓眼睛休息一下，起來動一動，明天再來冒險吧！" onUnlock={() => setDailyUnlocked(true)} />;
  }
  return null;
}

/** 休息的卡片：說明＋（家長設了 PIN 時）家長解鎖 */
function RestCard({ testId, title, text, onUnlock, children }: { testId: string; title: string; text: string; onUnlock: () => void; children?: React.ReactNode }) {
  const checkPin = useGame((s) => s.checkParentPin);
  const hasPin = useGame((s) => s.save.parent.pinHash !== null);
  const [pin, setPin] = useState('');
  return (
    <div className="panel-screen" style={{ zIndex: 50, background: 'rgba(43,42,76,.55)' }} data-testid={testId}>
      <div className="card pop-in" style={{ padding: 26, textAlign: 'center', width: 'min(520px, 100%)' }} role="alertdialog">
        <div style={{ fontSize: 64 }}>👀🌳</div>
        <p style={{ fontSize: 28, fontWeight: 800, margin: '8px 0' }}>{title}</p>
        <p style={{ fontSize: 22 }}>{text}</p>
        {children}
        {hasPin && (
          <div className="plain" style={{ marginTop: 14 }}>
            家長解鎖：
            <input
              className="text-input"
              style={{ width: 140, fontSize: 22 }}
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                setPin(v);
                if (v.length === 4) {
                  if (checkPin(v)) onUnlock();
                  setPin('');
                }
              }}
              aria-label="家長 PIN"
              data-testid="rest-pin"
            />
          </div>
        )}
      </div>
    </div>
  );
}
