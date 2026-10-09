/**
 * 進入點：掛載 React，並提供 window.__game 除錯介面（e2e 測試用來讀狀態、傳送角色）。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useUi } from './store/useUi';
import { useGame } from './store/useGame';
import { player, teleport } from './world/input';
import { quizDebug } from './quiz/debug';
import { usePacks } from './store/usePacks';
import { speechDebug } from './audio/speech';
import { useCloud } from './online/useCloud';
import { usePresence } from './online/usePresence';
import { startPresenceDemo } from './online/presenceDemo';
import { useRealtime } from './online/realtimeClient';
import { useFriends } from './online/useFriends';
import { useGifts } from './online/useGifts';
import { puzzleDebug } from './puzzle/debug';
import { musicDebug } from './audio/music';
import { useGm } from './online/gmClient';
import { sceneDebug } from './world/sceneDebug';
import { useFriendDuel } from './online/useFriendDuel';
import './styles/global.css';

declare global {
  interface Window {
    __game?: {
      ui: typeof useUi;
      game: typeof useGame;
      player: typeof player;
      teleport: typeof teleport;
      quiz: typeof quizDebug;
      packs: typeof usePacks;
      /** 最近的朗讀紀錄（預錄語音或裝置語音） */
      speech: typeof speechDebug;
      /** 雲端同步狀態 */
      cloud: typeof useCloud;
      /** 同島其他玩家與公頻 */
      presence: typeof usePresence;
      /** 多人上線模擬（放一群假同學到島上）；回傳停止的函式 */
      presenceDemo: typeof startPresenceDemo;
      /** 即時連線狀態 */
      realtime: typeof useRealtime;
      /** 禮物狀態（待收下、送禮結果、送禮視窗） */
      gifts: typeof useGifts;
      /** 益智遊戲館：機器人的速度、目前遊戲的狀態 */
      puzzle: typeof puzzleDebug;
      /** 好友名單（島嶼互訪 I1） */
      friends: typeof useFriends;
      /** 背景配樂：想播的曲目與實際在播的曲目（L5：班級島與自己的島不同曲） */
      music: typeof musicDebug;
      /** 熊熊老師進島的連線狀態（老師 GM 的 G2） */
      gm: typeof useGm;
      /** 3D 場景的除錯狀態（NPC 熊熊老師有沒有畫出來） */
      scene: typeof sceneDebug;
      /** 和朋友益智對戰（島嶼互訪 I4）：送出與收到的邀請、進行中的一局 */
      duel: typeof useFriendDuel;
    };
  }
}

window.__game = {
  ui: useUi,
  game: useGame,
  player,
  teleport,
  quiz: quizDebug,
  packs: usePacks,
  speech: speechDebug,
  cloud: useCloud,
  presence: usePresence,
  presenceDemo: startPresenceDemo,
  realtime: useRealtime,
  gifts: useGifts,
  puzzle: puzzleDebug,
  friends: useFriends,
  music: musicDebug,
  gm: useGm,
  scene: sceneDebug,
  duel: useFriendDuel,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
