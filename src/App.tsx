/**
 * 主程式：底層是 3D 畫布，上面疊一層 DOM 介面，依目前畫面切換。
 */
import { useEffect } from 'react';
import { GameCanvas } from './world/GameCanvas';
import { useUi } from './store/useUi';
import { useGame } from './store/useGame';
import { configureSpeech } from './audio/speech';
import { setSfxEnabled, unlockAudio } from './audio/sfx';
import { ensurePlaying, playMusic, setMusicEnabled, type Track } from './audio/music';
import type { Screen } from './store/useUi';
import { attachKeyboard } from './world/input';
import { TitleScreen } from './ui/screens/TitleScreen';
import { ProfilesScreen } from './ui/screens/ProfilesScreen';
import { IslandHud } from './ui/screens/IslandHud';
import { ZoneMenu } from './ui/screens/ZoneMenu';
import { ActivityScreen } from './ui/screens/ActivityScreen';
import { ResultScreen } from './ui/screens/ResultScreen';
import { ShopScreen } from './ui/screens/ShopScreen';
import { ParentScreen } from './ui/screens/ParentScreen';
import { RestGuard } from './ui/RestGuard';

/** 各畫面的配樂 */
const SCREEN_MUSIC: Record<Screen, Track> = {
  title: 'island',
  profiles: 'island',
  island: 'island',
  zone: 'island',
  activity: 'quiz',
  result: 'result',
  shop: 'shop',
  parent: 'shop',
};

export function App() {
  const screen = useUi((s) => s.screen);
  const settings = useGame((s) => s.save.settings);

  // 套用設定：語音、音效、注音字型
  useEffect(() => {
    configureSpeech({ enabled: settings.voice, rate: settings.voiceRate, clips: settings.voiceClips });
    setSfxEnabled(settings.sfx);
    setMusicEnabled(settings.music);
    document.body.classList.toggle('no-zhuyin', !settings.zhuyin);
  }, [settings]);

  // 換畫面就換配樂
  useEffect(() => playMusic(SCREEN_MUSIC[screen]), [screen]);

  // 鍵盤操作；每次點擊都確認音訊已解鎖、配樂有在播（瀏覽器要求有使用者手勢才能發聲）
  useEffect(() => {
    const detach = attachKeyboard();
    const unlock = () => {
      unlockAudio();
      ensurePlaying();
    };
    window.addEventListener('pointerdown', unlock);
    return () => {
      detach();
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  return (
    <>
      <GameCanvas />
      <div className="overlay" data-screen={screen}>
        {screen === 'title' && <TitleScreen />}
        {screen === 'profiles' && <ProfilesScreen />}
        {screen === 'island' && <IslandHud />}
        {screen === 'zone' && <ZoneMenu />}
        {screen === 'activity' && <ActivityScreen />}
        {screen === 'result' && <ResultScreen />}
        {screen === 'shop' && <ShopScreen />}
        {screen === 'parent' && <ParentScreen />}
        <RestGuard />
      </div>
    </>
  );
}
