/**
 * 3D 垃圾分類：舞台前方擺三個桶子（資源回收、廚餘、一般垃圾），物品卡片在上方漂浮。
 * 孩子直接點 3D 桶子作答；答對時物品飛進桶子，答錯時桶子搖一搖。
 * 桶子順序與題目選項順序一致（見 engine/life/recycle.ts 的 RECYCLE_BINS）。
 */
import { useEffect, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { textTexture, toon } from './materials';
import { RECYCLE_BINS } from '../engine/life/recycle';
import { useStageQuiz } from '../quiz/stageBus';
import { useUi } from '../store/useUi';
import { sfx } from '../audio/sfx';

/** 桶子的 x 座標（擺在舞台前緣、靠近鏡頭） */
const BIN_X = [-1.3, 0, 1.3];
const BIN_Z = 3.1;

/** 一個垃圾桶：桶身、蓋子、正面標籤 */
function Bin({ index, shaking, onPick }: { index: number; shaking: boolean; onPick: (i: number) => void }) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const b = RECYCLE_BINS[index];
  const label = textTexture(`${b.emoji} ${b.text}`, { width: 384, height: 160, bg: '#ffffff', fg: '#2b2a4c', size: 62, border: b.color, corner: b.color });
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.z = shaking ? Math.sin(t * 40) * 0.08 : 0;
    const s = hover ? 1.08 : 1;
    ref.current.scale.lerp(new THREE.Vector3(s, s, s), 0.2);
  });
  const pick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    sfx.tap();
    onPick(index);
  };
  return (
    <group
      ref={ref}
      position={[BIN_X[index], 0, BIN_Z]}
      onPointerDown={pick}
      onPointerOver={() => {
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      <mesh material={toon(b.color)} position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.46, 0.38, 1.1, 20]} />
      </mesh>
      <mesh material={toon('#ffffff')} position={[0, 1.14, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.1, 20]} />
      </mesh>
      <mesh position={[0, 0.62, 0.47]}>
        <planeGeometry args={[0.86, 0.36]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function RecycleBins() {
  const question = useStageQuiz((s) => s.question);
  const pick = useStageQuiz((s) => s.pick);
  const item = useRef<THREE.Mesh>(null);
  /** 物品動畫：idle 漂浮、fly 飛進某個桶子 */
  const anim = useRef<{ mode: 'idle' | 'fly'; target: number; t: number }>({ mode: 'idle', target: 0, t: 0 });
  const [shake, setShake] = useState<number | null>(null);

  // 換題時物品回到上方
  useEffect(() => {
    anim.current = { mode: 'idle', target: 0, t: 0 };
    setShake(null);
  }, [question?.id]);

  // 用下方按鈕答對時，物品也飛進正確的桶子
  const mood = useUi((s) => s.mood);
  const moodTick = useUi((s) => s.moodTick);
  useEffect(() => {
    if (mood === 'happy' && question?.type === 'choice' && anim.current.mode === 'idle') {
      anim.current = { mode: 'fly', target: question.answer, t: 0 };
    }
  }, [mood, moodTick, question]);

  useFrame((state, dt) => {
    const m = item.current;
    if (!m) return;
    const a = anim.current;
    if (a.mode === 'idle') {
      m.position.set(0, 2.55 + Math.sin(state.clock.elapsedTime * 2) * 0.1, BIN_Z - 0.2);
      m.scale.setScalar(1);
      m.rotation.z = Math.sin(state.clock.elapsedTime * 1.5) * 0.08;
    } else {
      a.t = Math.min(1, a.t + dt * 1.8);
      const k = a.t;
      // 拋物線飛進桶子並縮小
      m.position.set(BIN_X[a.target] * k, 2.55 + Math.sin(k * Math.PI) * 0.6 - k * 1.6, BIN_Z - 0.2 + k * 0.2);
      m.scale.setScalar(1 - k * 0.8);
    }
  });

  if (question?.visual?.kind !== 'bins' || question.type !== 'choice') return null;
  const tex = textTexture(question.visual.item, { width: 256, height: 256, bg: '#fff6df', fg: '#2b2a4c', size: 170, border: '#2b2a4c' });
  const onPick = (i: number) => {
    if (!pick || anim.current.mode === 'fly') return;
    if (i === question.answer) {
      anim.current = { mode: 'fly', target: i, t: 0 };
    } else {
      setShake(i);
      setTimeout(() => setShake(null), 500);
    }
    pick(i);
  };
  return (
    <group>
      {RECYCLE_BINS.map((_, i) => (
        <Bin key={i} index={i} shaking={shake === i} onPick={onPick} />
      ))}
      <mesh ref={item}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshBasicMaterial map={tex} toneMapped={false} transparent />
      </mesh>
    </group>
  );
}
