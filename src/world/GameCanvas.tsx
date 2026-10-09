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
import { equippedOf } from '../store/catalog';
import { classesOf, islandLook, lookWithVisit } from '../store/island';
import { useRealtime } from '../online/realtimeClient';
import { useGm } from '../online/gmClient';
import { sceneLookOf } from './landmarks';
import { TEACHER_NAME } from '../online/realtime';

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
  /** 老師以熊熊老師進的班級（老師 GM 的 G2） */
  const gmRoom = useUi((s) => s.gmRoom);
  const gm = screen === 'gm' && gmRoom !== null;
  /** 在朋友的島上（島嶼互訪 I2） */
  const visiting = useRealtime((s) => s.visiting);
  /** 熊熊老師在班上某個孩子的島上（島嶼互訪 I2） */
  const gmVisiting = useGm((s) => s.visiting);
  const low = quality === 'low' || (quality === 'auto' && isLowEnd());
  const onStage = screen === 'activity' || screen === 'result';
  const activity = run ? findActivity(run.activityId) : undefined;
  const theme = zone === 'tower' ? 'mixed' : (activity?.subject ?? 'math');
  const mode = screen === 'island' || gm ? 'play' : screen === 'title' || screen === 'profiles' ? 'attract' : 'menu';
  /** 島的外觀（L5）：標題與選角畫面是中性的白天；熊熊老師在那一班的班級島；其他時候依這個角色在哪座島 */
  const look = gm
    ? gmVisiting
      ? sceneLookOf({ kind: 'friend', kidName: TEACHER_NAME, hostName: gmVisiting.name }, [gmRoom.code])
      : sceneLookOf({ kind: 'class', kidName: TEACHER_NAME, classCode: gmRoom.code, className: gmRoom.name }, [gmRoom.code])
    : sceneLookOf(mode === 'attract' || !profile ? null : lookWithVisit(islandLook(profile), visiting), classesOf(profile).map((r) => r.code));

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
        <IslandScene mode={mode} avatar={profile && !gm ? equippedOf(profile) : null} shadows={!low} look={look} gm={gm} />
      )}
    </Canvas>
  );
}
