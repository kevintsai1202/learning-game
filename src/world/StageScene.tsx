/**
 * 活動舞台：答題時背景的小舞台，角色與熊熊老師會依答題結果做反應（跳、歪頭、慶祝），
 * 答對時會灑彩帶。舞台放在答題卡旁邊（橫式在左、直式在上）。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Avatar } from './Avatar';
import { Teacher } from './Teacher';
import { textTexture, toon } from './materials';
import { useUi } from '../store/useUi';
import { RecycleBins } from './RecycleBins';
import { ShooterStage } from './ShooterStage';
import { useStageQuiz } from '../quiz/stageBus';
import type { AvatarConfig } from '../store/save';
import type { SubjectId } from '../core/types';

/** 各科舞台配色與漂浮裝飾文字 */
const THEME: Record<SubjectId | 'mixed', { floor: string; bg: string; glyphs: string[] }> = {
  math: { floor: '#ffb36b', bg: '#ffe9cf', glyphs: ['1', '+', '3', '×', '5', '='] },
  zh: { floor: '#7ad36a', bg: '#e3f7d9', glyphs: ['山', 'ㄅ', '水', 'ㄇ', '日', '木'] },
  en: { floor: '#5fd0dd', bg: '#dcf6fa', glyphs: ['A', 'b', 'C', 'd', 'E', 'f'] },
  life: { floor: '#ffd75e', bg: '#fff5d1', glyphs: ['🌸', '☀️', '🍎', '🚦', '🌧️', '🐞'] },
  mixed: { floor: '#b9a2ff', bg: '#efe8ff', glyphs: ['★', '1', 'ㄅ', 'A', '★', '?'] },
};

/** 彩帶粒子 */
function Confetti() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const COUNT = 90;
  const parts = useMemo(
    () => Array.from({ length: COUNT }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), alive: 0 })),
    [],
  );
  const mood = useUi((s) => s.mood);
  const tick = useUi((s) => s.moodTick);
  useEffect(() => {
    if (mood !== 'happy' && mood !== 'cheer') return;
    const n = mood === 'cheer' ? COUNT : 36;
    parts.slice(0, n).forEach((pt) => {
      pt.p.set((Math.random() - 0.5) * 1.5, 2.6, (Math.random() - 0.5) * 1.0);
      pt.v.set((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 3);
      pt.alive = 2.2;
    });
  }, [mood, tick, parts]);
  useLayoutColor(mesh, COUNT);
  useFrame((_, dt) => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    parts.forEach((pt, i) => {
      if (pt.alive > 0) {
        pt.alive -= dt;
        pt.v.y -= 9 * dt;
        pt.p.addScaledVector(pt.v, dt);
        pt.r.x += dt * 6;
        pt.r.y += dt * 4;
      }
      const s = pt.alive > 0 ? 0.12 : 0;
      m.compose(pt.p, q.setFromEuler(pt.r), new THREE.Vector3(s, s * 0.4, s));
      mesh.current?.setMatrixAt(i, m);
    });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#ffffff" />
    </instancedMesh>
  );
}

/** 給彩帶上隨機顏色 */
function useLayoutColor(mesh: React.RefObject<THREE.InstancedMesh | null>, count: number) {
  useEffect(() => {
    const colors = ['#ff6b4a', '#ffc93c', '#3fbf7f', '#2f6fde', '#e8457c', '#8b5cf6'];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) mesh.current?.setColorAt(i, c.set(colors[i % colors.length]));
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [mesh, count]);
}

/** 漂浮的主題字塊 */
function FloatingGlyphs({ glyphs, color }: { glyphs: string[]; color: string }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    group.current?.children.forEach((c, i) => {
      const t = state.clock.elapsedTime * 0.5 + i;
      c.position.y = 2.2 + Math.sin(t * 1.3) * 0.4 + (i % 3) * 0.7;
      c.rotation.y = Math.sin(t) * 0.6;
    });
  });
  return (
    <group ref={group}>
      {glyphs.map((g, i) => {
        const a = (i / glyphs.length) * Math.PI * 2;
        const tex = textTexture(g, { width: 256, height: 256, bg: color, fg: '#ffffff', size: 150, border: '#ffffff' });
        return (
          <mesh key={i} position={[Math.sin(a) * 5.2, 2.2, Math.cos(a) * 1.5 - 3.5]}>
            <boxGeometry args={[0.7, 0.7, 0.7]} />
            <meshToonMaterial map={tex} />
          </mesh>
        );
      })}
    </group>
  );
}

/** 依畫面比例把舞台移到答題卡旁邊（橫式左側、直式上方） */
function StageCamera() {
  const { camera, size } = useThree();
  const mode = useStageQuiz((s) => s.mode);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const portrait = size.height > size.width * 1.1;
    if (mode === 'shooter') {
      // 射擊模式：答題卡縮成上方橫幅，舞台占滿全寬，不偏移視野
      cam.clearViewOffset();
      cam.position.set(0, 2.4, portrait ? 14.5 : 9.5);
      cam.lookAt(0, portrait ? 2.7 : 2.4, 0);
      cam.updateProjectionMatrix();
      return;
    }
    // 直式畫面舞台只占上方約四分之一，鏡頭再拉遠一些才放得下兩個角色
    cam.position.set(0, 3.4, portrait ? 17 : 11.5);
    cam.lookAt(0, 1.2, 0);
    if (portrait) cam.setViewOffset(size.width, size.height, 0, size.height * 0.37, size.width, size.height);
    else cam.setViewOffset(size.width, size.height, size.width * 0.3, 0, size.width, size.height);
    cam.updateProjectionMatrix();
    return () => {
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
    };
  }, [camera, size, mode]);
  return null;
}

export function StageScene({ avatar, subject }: { avatar: AvatarConfig; subject: SubjectId | 'mixed' }) {
  const theme = THEME[subject];
  const mood = useUi((s) => s.mood);
  const tick = useUi((s) => s.moodTick);
  const shooter = useStageQuiz((s) => s.mode) === 'shooter';
  return (
    <>
      <color attach="background" args={[theme.bg]} />
      <hemisphereLight args={['#ffffff', theme.floor, 1.3]} />
      <directionalLight position={[3, 8, 6]} intensity={1.5} />
      <StageCamera />
      <mesh material={toon(theme.floor)} position={[0, -0.25, 0]}>
        <cylinderGeometry args={[3.6, 3.8, 0.5, 40]} />
      </mesh>
      <mesh material={toon('#ffffff')} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.0, 3.25, 40]} />
      </mesh>
      {shooter ? (
        // 射擊模式：角色站在魔法砲旁邊、背對鏡頭看著氣球
        <group position={[-0.25, 0, 4.4]} rotation={[0, Math.PI, 0]} scale={0.62}>
          <Avatar config={avatar} mood={mood} moodTick={tick} />
        </group>
      ) : (
        <>
          <group position={[-1.1, 0, 0.4]} rotation={[0, 0.25, 0]}>
            <Avatar config={avatar} mood={mood} moodTick={tick} />
          </group>
          <group position={[1.4, 0, -0.3]} rotation={[0, -0.35, 0]}>
            <Teacher mood={mood} moodTick={tick} waving={false} />
          </group>
          <FloatingGlyphs glyphs={theme.glyphs} color={theme.floor} />
        </>
      )}
      <RecycleBins />
      <ShooterStage />
      <Confetti />
    </>
  );
}
