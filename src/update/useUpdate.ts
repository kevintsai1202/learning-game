/**
 * 更新通知的檢查與套用（docs/plans/update-notice.md）：
 * - 網頁裡的版本號（建置時寫進來的 __BUILD_ID__；開發模式是空的，不檢查）和 version.json 的比對。
 * - 什麼時候讀：每 5 分鐘（setInterval，真的時鐘；分頁在背景不讀）、切回分頁時、班級連線重新接上時
 *   （收到 welcome、而且這個網頁之前已經收過一次；剛打開網頁的第一次不讀）。
 * - 套用：把現在的畫面記在 sessionStorage，重新整理；重新載入後 takeResume 拿回來，回到原本的地方。
 * 規則（有沒有新版、自動或等、回到哪裡）在 updateRules.ts。
 */
import { create } from 'zustand';
import type { Screen } from '../store/useUi';
import { isNewVersion, resumeScreenOf } from './updateRules';

/** 網頁裡的版本號（vite.config.ts 的 define；單元測試沒有 define 時是空的） */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '';

/** 多久讀一次（毫秒） */
const CHECK_EVERY_MS = 5 * 60 * 1000;
/** 重新整理後要回到的畫面（sessionStorage：重新整理還在、關掉分頁就沒了） */
const RESUME_KEY = 'learning-island-resume';

interface UpdateStore {
  /** 有新版了（version.json 的版本號和網頁裡的不一樣） */
  available: boolean;
}

export const useUpdate = create<UpdateStore>(() => ({ available: false }));

/** 讀一次 version.json 比對（加時間參數、不用快取）；有新版回傳 true。讀不到不算（離線、伺服器更新中） */
export async function checkForUpdate(): Promise<boolean> {
  if (!BUILD_ID) return false;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const fresh = isNewVersion(BUILD_ID, await res.json());
    if (fresh) useUpdate.setState({ available: true });
    return fresh;
  } catch {
    return false;
  }
}

/** 這個網頁收過 welcome 了沒（第一次是剛打開，不讀） */
let welcomed = false;

/** 孩子或熊熊老師的連線收到 welcome：之前收過（重新接上、換島）就讀一次（伺服器部署完會斷線重連，通常就是剛更新） */
export function onServerWelcome(): void {
  if (welcomed) void checkForUpdate();
  welcomed = true;
}

/** 開始定時讀（App 掛載時呼叫一次）；回傳停止的函式 */
export function startUpdateWatch(): () => void {
  if (!BUILD_ID) return () => undefined;
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  }, CHECK_EVERY_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** 更新：記下重新整理後要回到哪個畫面，重新整理（存檔與待上傳的操作都在裝置上，不會掉） */
export function applyUpdate(screen: Screen): void {
  const target = resumeScreenOf(screen);
  try {
    if (target) sessionStorage.setItem(RESUME_KEY, target);
    else sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // 存不了就照平常從標題畫面開始
  }
  window.location.reload();
}

/** 重新載入後：拿走重新整理前記下的畫面（只拿一次） */
export function takeResume(): Screen | null {
  try {
    const s = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
    return (s as Screen | null) ?? null;
  } catch {
    return null;
  }
}

/** e2e 用（window.__game.update）：狀態、現在檢查一次、網頁的版本號 */
export const updateDebug = { store: useUpdate, check: checkForUpdate, buildId: BUILD_ID };
