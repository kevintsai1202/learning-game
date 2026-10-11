/**
 * 轉視角的按鈕（自己的家第 10.5 節，docs/plans/home.md）：
 * - CamResetButton「🧭」：轉過視角時才出現，按了回到原本的方向（手機在右側直排圖示、電腦在右上角、熊熊老師在上方的晶片列）。
 * - CamViewButton「🎥 換視角」：用家具時換跟拍 → 近拍 → 第一人稱（電腦版的家具卡片；手機在右下的大動作鍵）。
 * 狀態在 src/world/cameraOrbit.ts。
 */
import { cycleView, resetYaw, useOrbit, type CamView } from '../world/cameraOrbit';
import { sfx } from '../audio/sfx';

/** 視角模式的名字（給朗讀器與滑鼠提示） */
export const VIEW_NAME: Record<CamView, string> = { follow: '跟拍', close: '近拍', first: '第一人稱' };

/** 按 🧭：回到原本的方向 */
function reset(): void {
  sfx.tap();
  resetYaw();
}

/** 🧭 回正；variant：rail 是手機的右側直排圖示、round 是電腦右上角的圓鈕、chip 是熊熊老師上方的晶片 */
export function CamResetButton({ variant }: { variant: 'rail' | 'round' | 'chip' }) {
  const rotated = useOrbit((s) => s.rotated);
  if (!rotated) return null;
  if (variant === 'round')
    return (
      <button className="btn round white" onClick={reset} aria-label="視角轉回來" title="視角轉回來" data-testid="cam-reset">
        🧭
      </button>
    );
  if (variant === 'chip')
    return (
      <button className="hud-chip" style={{ paddingLeft: 14 }} onClick={reset} aria-label="視角轉回來" data-testid="cam-reset">
        🧭 轉回來
      </button>
    );
  return (
    <button className="hud-chip" onClick={reset} aria-label="視角轉回來" data-testid="cam-reset">
      <span className="chip-icon">🧭</span>{' '}
      <span className="chip-text" data-short="回正">
        轉回來
      </span>
    </button>
  );
}

/** 換到下一個視角（給大動作鍵與家具卡片共用） */
export function nextCamView(): void {
  sfx.tap();
  cycleView();
}

/** 電腦版家具卡片上的「🎥 換視角」（用家具時） */
export function CamViewButton() {
  const view = useOrbit((s) => s.view);
  return (
    <button className="btn small white" onClick={nextCamView} aria-label={`換視角（現在：${VIEW_NAME[view]}）`} title={`現在：${VIEW_NAME[view]}`} data-testid="cam-view">
      🎥 換視角
    </button>
  );
}
