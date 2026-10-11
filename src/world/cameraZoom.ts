/**
 * 鏡頭縮放（自己的家第 9 節優化，docs/plans/home.md）：滑鼠滾輪、手機兩指捏合改變鏡頭距離的倍率。
 * 兩指捏合在 src/world/cameraOrbit.ts 的 attachGestures（第 10.5 節：和拖曳轉視角合成一個手勢，只算畫布上的手指）。
 * 倍率放模組層級（鏡頭每一格都讀，不走 React 狀態）；1 是原本的距離，小於 1 拉近、大於 1 拉遠。
 * 只掛在 3D 畫布上（面板上的捲動不受影響）；倍率存在這台裝置，重新整理還在。
 */
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

/** 在 3D 畫布上掛滑鼠滾輪縮放；回傳取消的函式（兩指捏合在 cameraOrbit.ts 的 attachGestures） */
export function attachZoom(el: HTMLElement): () => void {
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    setZoom(zoomByWheel(camZoom.value, e.deltaY));
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}
