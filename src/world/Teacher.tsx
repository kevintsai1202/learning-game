/**
 * 熊熊老師：台灣黑熊造型的嚮導（胸前白色 V 字、圓眼鏡），站在中央廣場，
 * 在活動舞台上會依答題結果做出反應。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toon } from './materials';
import type { StageMood } from '../store/useUi';

interface TeacherProps {
  mood?: StageMood;
  moodTick?: number;
  /** 揮手打招呼 */
  waving?: boolean;
}

/** 胸前 V 字（台灣黑熊的月牙斑）用兩根扁長方體拼成 */
function ChestV() {
  const m = toon('#fff6df');
  return (
    <group position={[0, 1.02, 0.36]}>
      <mesh material={m} position={[-0.11, 0, 0]} rotation={[0, 0, -0.55]}>
        <boxGeometry args={[0.07, 0.34, 0.06]} />
      </mesh>
      <mesh material={m} position={[0.11, 0, 0]} rotation={[0, 0, 0.55]}>
        <boxGeometry args={[0.07, 0.34, 0.06]} />
      </mesh>
    </group>
  );
}

export function Teacher({ mood = 'idle', moodTick = 0, waving = true }: TeacherProps) {
  const root = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const anim = useRef({ start: -1, tick: -1 });
  const black = toon('#26262e');
  const muzzle = toon('#c9a27a');
  const white = toon('#ffffff');
  const glass = toon('#ffc93c');

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = anim.current;
    if (moodTick !== a.tick) {
      a.tick = moodTick;
      a.start = t;
    }
    const since = t - a.start;
    if (arm.current) {
      const wave = waving || (mood === 'cheer' && since < 2.5) || (mood === 'happy' && since < 1);
      arm.current.rotation.z = wave ? 2.4 + Math.sin(t * 8) * 0.35 : 0.5;
    }
    if (head.current) {
      head.current.rotation.z = mood === 'oops' && since < 1.5 ? Math.sin(since * 6) * 0.15 : Math.sin(t * 1.3) * 0.04;
    }
    if (root.current) {
      root.current.position.y = mood === 'cheer' && since < 2.4 ? Math.abs(Math.sin(since * Math.PI * 2)) * 0.3 : 0;
    }
  });

  return (
    <group ref={root} scale={1.35}>
      <mesh material={black} position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.46, 0.5, 6, 16]} />
      </mesh>
      <ChestV />
      <group ref={head} position={[0, 1.72, 0]}>
        <mesh material={black} castShadow>
          <sphereGeometry args={[0.5, 24, 18]} />
        </mesh>
        <mesh material={muzzle} position={[0, -0.12, 0.4]} scale={[1.1, 0.85, 0.8]}>
          <sphereGeometry args={[0.19, 16, 12]} />
        </mesh>
        <mesh material={black} position={[0, -0.04, 0.57]}>
          <sphereGeometry args={[0.06, 10, 8]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            {/* 耳朵 */}
            <mesh material={black} position={[s * 0.36, 0.38, 0]}>
              <sphereGeometry args={[0.17, 12, 10]} />
            </mesh>
            {/* 眼睛 */}
            <mesh material={white} position={[s * 0.18, 0.1, 0.44]}>
              <sphereGeometry args={[0.07, 10, 8]} />
            </mesh>
            {/* 圓眼鏡 */}
            <mesh material={glass} position={[s * 0.18, 0.1, 0.47]}>
              <torusGeometry args={[0.11, 0.018, 6, 20]} />
            </mesh>
          </group>
        ))}
        <mesh material={glass} position={[0, 0.12, 0.5]}>
          <boxGeometry args={[0.1, 0.02, 0.02]} />
        </mesh>
      </group>
      {/* 左手揮動 */}
      <group ref={arm} position={[-0.5, 1.15, 0]}>
        <mesh material={black} position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.12, 0.34, 4, 8]} />
        </mesh>
      </group>
      {/* 右手拿教鞭 */}
      <group position={[0.5, 1.0, 0.1]} rotation={[0.3, 0, -0.4]}>
        <mesh material={black}>
          <capsuleGeometry args={[0.12, 0.3, 4, 8]} />
        </mesh>
        <mesh material={toon('#a0522d')} position={[0.05, 0.35, 0.15]} rotation={[0.6, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.8, 6]} />
        </mesh>
        <mesh material={toon('#e8457c')} position={[0.05, 0.68, 0.39]}>
          <sphereGeometry args={[0.05, 8, 6]} />
        </mesh>
      </group>
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} material={black} position={[x, 0.18, 0.04]}>
          <capsuleGeometry args={[0.15, 0.16, 4, 8]} />
        </mesh>
      ))}
    </group>
  );
}
