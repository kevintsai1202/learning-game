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
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
