/**
 * 遊玩時間：每 30 秒累計一次；超過家長設定的每日上限時，請孩子休息（家長可輸入 PIN 解鎖）。
 */
import { useEffect, useState } from 'react';
import { useGame } from '../store/useGame';
import { useUi } from '../store/useUi';
import { secondsPlayedOn } from '../store/save';
import { speak } from '../audio/speech';

const TICK_SECONDS = 30;

export function RestGuard() {
  const screen = useUi((s) => s.screen);
  const tick = useGame((s) => s.tickPlayTime);
  const profile = useGame((s) => s.profile());
  const limitMin = useGame((s) => s.save.settings.dailyLimitMin);
  const checkPin = useGame((s) => s.checkParentPin);
  const hasPin = useGame((s) => s.save.parent.pinHash !== null);
  /** 家長解鎖後，本次開啟期間不再提醒 */
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');

  // 在島上或答題時才算遊玩時間（標題、家長區不算）；分頁在背景時不計
  useEffect(() => {
    const id = setInterval(() => {
      const s = useUi.getState().screen;
      if (document.visibilityState === 'visible' && s !== 'title' && s !== 'parent' && s !== 'profiles') tick(TICK_SECONDS);
    }, TICK_SECONDS * 1000);
    return () => clearInterval(id);
  }, [tick]);

  const over = !!profile && limitMin > 0 && !unlocked && screen !== 'parent' && secondsPlayedOn(profile, new Date()) >= limitMin * 60;
  useEffect(() => {
    if (over) speak('今天玩很久囉！讓眼睛休息一下，看看遠方吧。');
  }, [over]);
  if (!over) return null;
  return (
    <div className="panel-screen" style={{ zIndex: 50, background: 'rgba(43,42,76,.55)' }}>
      <div className="card pop-in" style={{ padding: 26, textAlign: 'center', width: 'min(520px, 100%)' }} role="alertdialog">
        <div style={{ fontSize: 64 }}>👀🌳</div>
        <p style={{ fontSize: 28, fontWeight: 800, margin: '8px 0' }}>今天玩了 {limitMin} 分鐘囉！</p>
        <p style={{ fontSize: 22 }}>讓眼睛休息一下，起來動一動，明天再來冒險吧！</p>
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
                  if (checkPin(v)) setUnlocked(true);
                  setPin('');
                }
              }}
              aria-label="家長 PIN"
            />
          </div>
        )}
      </div>
    </div>
  );
}
