/**
 * 唯一的 3D 畫布：島上時畫島嶼，答題與結算時換成活動舞台。
 * 全程只用一個 WebGL context，平板比較不會因為建立太多 context 而當掉。
 */
import { Canvas } from '@react-three/fiber';
import { IslandScene } from './IslandScene';
import { StageScene } from './StageScene';
import { useUi } from '../store/useUi';
import { useGame } from '../store/useGame';
import { findActivity } from '../activities/resolve';
import type { AvatarConfig } from '../store/save';

const FALLBACK_AVATAR: AvatarConfig = { animal: 'bear', color: '#8b5a2b', hat: null };

/** 粗略判斷是否為低效能裝置（觸控裝置且核心數少） */
function isLowEnd(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= 4 || mem <= 3;
}

export function GameCanvas() {
  const screen = useUi((s) => s.screen);
  const zone = useUi((s) => s.zone);
  const run = useUi((s) => s.run);
  const quality = useGame((s) => s.save.settings.quality);
  const profile = useGame((s) => s.profile());
  const low = quality === 'low' || (quality === 'auto' && isLowEnd());
  const onStage = screen === 'activity' || screen === 'result';
  const activity = run ? findActivity(run.activityId) : undefined;
  const theme = zone === 'tower' ? 'mixed' : (activity?.subject ?? 'math');
  const mode = screen === 'island' ? 'play' : screen === 'title' || screen === 'profiles' ? 'attract' : 'menu';

  return (
    <Canvas
      className="game-canvas"
      shadows={!low}
      flat
      dpr={low ? [1, 1.25] : [1, 1.75]}
      gl={{ antialias: !low, powerPreference: 'high-performance' }}
      camera={{ fov: 45, near: 0.1, far: 600, position: [0, 14, 30] }}
      onCreated={({ gl, camera }) => {
        // 除錯用：e2e 可讀 draw call 數量（gl.info.render.calls），也能把 3D 座標投影成螢幕座標來點擊
        if (window.__game) Object.assign(window.__game, { gl, camera });
      }}
    >
      {onStage ? (
        <StageScene avatar={profile?.avatar ?? FALLBACK_AVATAR} subject={theme} />
      ) : (
        <IslandScene mode={mode} avatar={profile?.avatar ?? null} shadows={!low} />
      )}
    </Canvas>
  );
}
