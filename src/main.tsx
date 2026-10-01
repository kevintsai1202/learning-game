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
    };
  }
}

window.__game = { ui: useUi, game: useGame, player, teleport, quiz: quizDebug, packs: usePacks };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
