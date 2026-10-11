/**
 * 唯一的 3D 畫布：島上時畫島嶼，進屋時畫屋子裡（自己的家第二期），答題與結算時換成活動舞台。
 * 全程只用一個 WebGL context，平板比較不會因為建立太多 context 而當掉。
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { attachZoom } from './cameraZoom';
import { attachGestures, attachTurnKeys, isTouchDevice, orbit, resetYaw, setYaw, turnKeys, yawByKeys } from './cameraOrbit';
import { useEffect } from 'react';
import { IslandScene } from './IslandScene';
import { HomeScene } from './HomeScene';
import { houseKeyOf, setHouseKey, useHome } from '../store/useHome';
import { shownHome, useHostYard } from '../online/useHostYard';
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

/** 滑鼠滾輪、兩指捏合縮放鏡頭（只掛在 3D 畫布上） */
function ZoomControl() {
  const gl = useThree((s) => s.gl);
  useEffect(() => attachZoom(gl.domElement), [gl]);
  return null;
}

/**
 * 轉視角（第 10.5 節）：畫布上拖曳（觸控裝置只有右半邊）、兩指捏合、按住 Q／E。
 * 只在島上與屋裡能玩的時候掛（答題的舞台、標題畫面不轉）
 */
function OrbitControl() {
  const gl = useThree((s) => s.gl);
  useEffect(() => attachGestures(gl.domElement, isTouchDevice()), [gl]);
  useEffect(() => attachTurnKeys(), []);
  useFrame((_, dt) => {
    if (turnKeys.left || turnKeys.right) setYaw(yawByKeys(orbit.yaw, turnKeys.left, turnKeys.right, Math.min(dt, 0.05)));
  });
  return null;
}

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
  /** 伺服器給的島主房間（別人的家） */
  const hostHome = useHostYard((s) => s.home);
  const inside = useHome((s) => s.inside);
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
  /** 這座島的小屋是誰的（自己的家第二期）：換島、回到標題時在屋裡的人被迫出來 */
  const host = gm ? gmVisiting : visiting;
  const houseKey = mode === 'attract' ? null : houseKeyOf(look.home !== null, host);
  const houseName = look.home?.name ?? null;
  useEffect(() => {
    setHouseKey(houseKey, { teacher: gm });
    useHome.setState({ houseName });
  }, [houseKey, houseName, gm]);
  // 換島時視角回正（第 10.5 節；角度不存檔）
  useEffect(() => resetYaw(), [houseKey]);
  /** 在這座島的屋子裡（選單打開時照樣畫屋子，不互動） */
  const inHome = inside !== null && inside === houseKey;

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
      <ZoomControl />
      {mode === 'play' && !onStage && <OrbitControl />}
      {onStage ? (
        <StageScene avatar={profile?.avatar ?? FALLBACK_AVATAR} subject={theme} />
      ) : inHome ? (
        <HomeScene
          avatar={profile && !gm ? equippedOf(profile) : FALLBACK_AVATAR}
          home={shownHome({ visiting: host !== null, local: profile?.home, host: hostHome })}
          active={mode === 'play'}
          shadows={!low}
          gm={gm}
        />
      ) : (
        <IslandScene mode={mode} avatar={profile && !gm ? equippedOf(profile) : null} shadows={!low} look={look} gm={gm} />
      )}
    </Canvas>
  );
}
