/**
 * 鏡頭縮放（自己的家第 9 節優化，docs/plans/home.md）：滑鼠滾輪、手機兩指捏合改變鏡頭距離的倍率。
 * 倍率放模組層級（鏡頭每一格都讀，不走 React 狀態）；1 是原本的距離，小於 1 拉近、大於 1 拉遠。
 * 只掛在 3D 畫布上（面板上的捲動不受影響）；倍率存在這台裝置，重新整理還在。
 */
import { player } from './input';

/** 倍率範圍 */
export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 1.7;
/** 存在這台裝置的鍵 */
const STORE_KEY = 'learning-island-camera-zoom';
/** 滾輪一格（deltaY 約 100）改變約一成 */
const WHEEL_RATE = 0.001;

/** 倍率夾在範圍裡（不是數字當 1） */
export function clampZoom(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
}

/** 滾輪：往下（deltaY > 0）拉遠、往上拉近 */
export function zoomByWheel(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(deltaY * WHEEL_RATE));
}

/** 兩指捏合：從開始時的倍率 startZoom 照兩指距離的比例改（張開拉近、捏起來拉遠） */
export function zoomByPinch(startZoom: number, startDist: number, nowDist: number): number {
  if (startDist <= 0 || nowDist <= 0) return clampZoom(startZoom);
  return clampZoom((startZoom * startDist) / nowDist);
}

/** 讀這台裝置存的倍率（讀不到是 1） */
function loadZoom(): number {
  try {
    const v = Number(localStorage.getItem(STORE_KEY));
    return v ? clampZoom(v) : 1;
  } catch {
    return 1;
  }
}

/** 目前的倍率（鏡頭每一格讀） */
export const camZoom = { value: typeof localStorage === 'undefined' ? 1 : loadZoom() };

/** 改倍率並存在這台裝置 */
export function setZoom(v: number): void {
  camZoom.value = clampZoom(v);
  try {
    localStorage.setItem(STORE_KEY, String(camZoom.value));
  } catch {
    // 私密瀏覽等存不了：這次照樣有效
  }
}

/** 兩個觸控點的距離 */
function touchDist(t: TouchList): number {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

/**
 * 在 3D 畫布上掛滾輪與兩指捏合；回傳取消的函式。
 * 第二指落下時取消第一指點地面設的目標（R3F 的點擊在第一指落下時就設了目標）
 */
export function attachZoom(el: HTMLElement): () => void {
  /** 捏合開始時的兩指距離與倍率 */
  let pinch: { dist: number; zoom: number } | null = null;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    setZoom(zoomByWheel(camZoom.value, e.deltaY));
  };
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      pinch = { dist: touchDist(e.touches), zoom: camZoom.value };
      player.target = null;
      player.autoEnter = null;
    }
  };
  const onTouchMove = (e: TouchEvent) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      setZoom(zoomByPinch(pinch.zoom, pinch.dist, touchDist(e.touches)));
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) pinch = null;
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchcancel', onTouchEnd);
  return () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchEnd);
  };
}
