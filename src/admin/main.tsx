/**
 * 營運者監控頁的進入點（admin.html，docs/plans/admin.md）：和遊戲分開打包，不載入 3D 與遊戲的程式。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp';
import './admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
