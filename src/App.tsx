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
import { ClassScreen } from './ui/screens/ClassScreen';
import { ClassroomScreen } from './ui/screens/ClassroomScreen';
import { TeacherScreen } from './ui/screens/TeacherScreen';
import { BadgesScreen } from './ui/screens/BadgesScreen';
import { PuzzleScreen } from './puzzle/PuzzleScreen';
import { RestGuard } from './ui/RestGuard';
import { startCloudSync } from './online/useCloud';
import { startRealtime } from './online/realtimeClient';
import { useAccount } from './online/useAccount';
import { readEmailLink, stripEmailLink } from './online/emailLinks';
import { readJoinCode, stripJoinCode } from './online/joinLink';
import { readClaimCode, stripClaimCode } from './online/claimLink';
import { islandLook } from './store/island';

/** 在島上走、進建築時的畫面（配樂依島：有班級的孩子在自己的島播 home，L5） */
const ON_ISLAND: Screen[] = ['island', 'zone'];

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
  class: 'island',
  classroom: 'island',
  teacher: 'shop',
  badges: 'shop',
  puzzle: 'quiz',
};

export function App() {
  const screen = useUi((s) => s.screen);
  const settings = useGame((s) => s.save.settings);
  /** 有班級的孩子切到自己的島（L5）：島上換另一首曲子 */
  const onOwnIsland = useGame((s) => {
    const p = s.profile();
    return !!p && islandLook(p).kind === 'mine';
  });

  // 套用設定：語音、音效、注音字型
  useEffect(() => {
    configureSpeech({ enabled: settings.voice, rate: settings.voiceRate, clips: settings.voiceClips });
    setSfxEnabled(settings.sfx);
    setMusicEnabled(settings.music);
    document.body.classList.toggle('no-zhuyin', !settings.zhuyin);
  }, [settings]);

  // 雲端角色的同步排程與即時連線（沒有雲端角色時什麼都不做）
  useEffect(() => startCloudSync(), []);
  useEffect(() => startRealtime(), []);

  // 掃老師的 QR code 打開（?join=班級代碼）：先從網址拿掉，到帳號頁讓家長登入並選孩子加入（docs/plans/class-join.md）
  useEffect(() => {
    const code = readJoinCode(window.location.search);
    if (!code) return;
    window.history.replaceState(window.history.state, '', stripJoinCode(window.location.href));
    useAccount.getState().setJoining({ code });
    useUi.getState().goto('teacher');
  }, []);

  // 老師給的家長連結卡打開（?claim=代碼，L4）：先從網址拿掉，到帳號頁讓家長登入並把孩子連到自己的帳號
  useEffect(() => {
    const code = readClaimCode(window.location.search);
    if (!code) return;
    window.history.replaceState(window.history.state, '', stripClaimCode(window.location.href));
    useAccount.getState().setClaiming(code);
    useUi.getState().goto('teacher');
  }, []);

  // 從信裡的連結打開（?verify=／?reset=）：先從網址拿掉（重新整理不會再送一次），交給帳號頁處理
  useEffect(() => {
    const link = readEmailLink(window.location.search);
    if (!link) return;
    window.history.replaceState(window.history.state, '', stripEmailLink(window.location.href));
    useAccount.getState().setEmailLink(link);
    useUi.getState().goto('teacher');
  }, []);

  // 換畫面、換島就換配樂
  useEffect(() => playMusic(onOwnIsland && ON_ISLAND.includes(screen) ? 'home' : SCREEN_MUSIC[screen]), [screen, onOwnIsland]);

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
        {screen === 'class' && <ClassScreen />}
        {screen === 'classroom' && <ClassroomScreen />}
        {screen === 'teacher' && <TeacherScreen />}
        {screen === 'badges' && <BadgesScreen />}
        {screen === 'puzzle' && <PuzzleScreen />}
        <RestGuard />
      </div>
    </>
  );
}
