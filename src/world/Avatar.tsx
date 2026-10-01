/**
 * 小動物角色（熊、兔、貓、狗）：全部用基本幾何體組成，不需要外部模型檔。
 * 走路時腳與手會擺動、身體上下晃；mood 改變時會跳一下或歪頭。
 */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toon } from './materials';
import type { AvatarConfig } from '../store/save';
import type { StageMood } from '../store/useUi';
import { Hat } from './Hats';

/** 角色的即時移動狀態（由控制器每幀寫入，避免 React 重新渲染） */
export interface MotionState {
  /** 目前速度（公尺／秒） */
  speed: number;
}

interface AvatarProps {
  config: AvatarConfig;
  motion?: RefObject<MotionState>;
  mood?: StageMood;
  moodTick?: number;
}

/** 依底色算出肚子、口鼻部的淺色 */
function lighter(color: string, amount = 0.45): string {
  const c = new THREE.Color(color);
  c.lerp(new THREE.Color('#fff8ec'), amount);
  return `#${c.getHexString()}`;
}

export function Avatar({ config, motion, mood = 'idle', moodTick = 0 }: AvatarProps) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const tail = useRef<THREE.Group>(null);
  /** 走路相位與 mood 動畫起點 */
  const anim = useRef({ phase: 0, moodStart: -1, lastTick: -1 });

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const a = anim.current;
    if (moodTick !== a.lastTick) {
      a.lastTick = moodTick;
      a.moodStart = t;
    }
    const speed = motion?.current.speed ?? 0;
    const walking = speed > 0.1;
    a.phase += dt * (walking ? 9 + speed : 2);
    const swing = walking ? Math.sin(a.phase) * 0.6 : 0;
    if (legL.current && legR.current) {
      legL.current.rotation.x = swing;
      legR.current.rotation.x = -swing;
    }
    if (armL.current && armR.current) {
      armL.current.rotation.x = -swing * 0.8;
      armR.current.rotation.x = swing * 0.8;
    }
    if (tail.current) tail.current.rotation.z = Math.sin(t * (config.animal === 'dog' ? 14 : 3)) * 0.35;
    if (!body.current || !root.current) return;
    // 走路時上下晃，站著時輕輕呼吸
    body.current.position.y = walking ? Math.abs(Math.sin(a.phase)) * 0.12 : Math.sin(t * 2) * 0.02;
    // mood 動畫：答對跳一下、答錯歪頭、慶祝連跳
    const since = t - a.moodStart;
    let jump = 0;
    let tilt = 0;
    if (a.moodStart >= 0) {
      if (mood === 'happy' && since < 0.6) jump = Math.sin((since / 0.6) * Math.PI) * 0.8;
      if (mood === 'cheer' && since < 2.4) jump = Math.abs(Math.sin(since * Math.PI * 2.5)) * 0.6;
      if (mood === 'oops' && since < 1.2) tilt = Math.sin((since / 1.2) * Math.PI) * 0.35;
    }
    root.current.position.y = jump;
    body.current.rotation.z = tilt;
  });

  const fur = toon(config.color);
  const pale = toon(lighter(config.color));
  const dark = toon('#2b2a4c');
  const pink = toon('#ff9db0');
  const white = toon('#ffffff');

  return (
    <group ref={root}>
      <group ref={body}>
        {/* 身體與肚子 */}
        <mesh material={fur} position={[0, 0.78, 0]} castShadow>
          <capsuleGeometry args={[0.4, 0.42, 6, 16]} />
        </mesh>
        <mesh material={pale} position={[0, 0.74, 0.27]} scale={[0.75, 0.85, 0.45]}>
          <sphereGeometry args={[0.36, 16, 12]} />
        </mesh>
        {/* 頭 */}
        <group position={[0, 1.55, 0]}>
          <mesh material={fur} castShadow>
            <sphereGeometry args={[0.5, 24, 18]} />
          </mesh>
          {/* 口鼻與鼻子 */}
          <mesh material={pale} position={[0, -0.1, 0.42]} scale={[1.1, 0.8, 0.7]}>
            <sphereGeometry args={[0.17, 16, 12]} />
          </mesh>
          <mesh material={dark} position={[0, -0.04, 0.55]}>
            <sphereGeometry args={[0.055, 10, 8]} />
          </mesh>
          {/* 眼睛與反光 */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.18, 0.08, 0.43]}>
              <mesh material={dark}>
                <sphereGeometry args={[0.065, 12, 10]} />
              </mesh>
              <mesh material={white} position={[0.02, 0.025, 0.05]}>
                <sphereGeometry args={[0.02, 8, 6]} />
              </mesh>
            </group>
          ))}
          {/* 腮紅 */}
          {[-1, 1].map((s) => (
            <mesh key={s} material={pink} position={[s * 0.3, -0.1, 0.36]} scale={[1, 0.6, 0.4]}>
              <sphereGeometry args={[0.07, 10, 8]} />
            </mesh>
          ))}
          <Ears animal={config.animal} fur={fur} inner={pink} />
          {config.hat && <Hat id={config.hat} />}
        </group>
        {/* 手 */}
        <mesh ref={armL} material={fur} position={[-0.45, 0.95, 0]} rotation={[0, 0, 0.5]} castShadow>
          <capsuleGeometry args={[0.1, 0.3, 4, 8]} />
        </mesh>
        <mesh ref={armR} material={fur} position={[0.45, 0.95, 0]} rotation={[0, 0, -0.5]} castShadow>
          <capsuleGeometry args={[0.1, 0.3, 4, 8]} />
        </mesh>
        {/* 尾巴 */}
        <group ref={tail} position={[0, 0.55, -0.38]}>
          <Tail animal={config.animal} fur={fur} pale={pale} />
        </group>
      </group>
      {/* 腳 */}
      <mesh ref={legL} material={fur} position={[-0.18, 0.18, 0.02]} castShadow>
        <capsuleGeometry args={[0.13, 0.16, 4, 8]} />
      </mesh>
      <mesh ref={legR} material={fur} position={[0.18, 0.18, 0.02]} castShadow>
        <capsuleGeometry args={[0.13, 0.16, 4, 8]} />
      </mesh>
    </group>
  );
}

/** 各種動物的耳朵 */
function Ears({ animal, fur, inner }: { animal: AvatarConfig['animal']; fur: THREE.Material; inner: THREE.Material }) {
  if (animal === 'rabbit') {
    return (
      <>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.18, 0.55, -0.02]} rotation={[0, 0, -s * 0.15]}>
            <mesh material={fur}>
              <capsuleGeometry args={[0.1, 0.5, 4, 10]} />
            </mesh>
            <mesh material={inner} position={[0, 0, 0.06]} scale={[0.55, 0.85, 0.4]}>
              <capsuleGeometry args={[0.1, 0.5, 4, 10]} />
            </mesh>
          </group>
        ))}
      </>
    );
  }
  if (animal === 'cat') {
    return (
      <>
        {[-1, 1].map((s) => (
          <mesh key={s} material={fur} position={[s * 0.3, 0.42, 0]} rotation={[0, 0, -s * 0.35]}>
            <coneGeometry args={[0.17, 0.32, 4]} />
          </mesh>
        ))}
      </>
    );
  }
  if (animal === 'dog') {
    return (
      <>
        {[-1, 1].map((s) => (
          <mesh key={s} material={fur} position={[s * 0.47, 0.05, 0]} rotation={[0, 0, s * 0.25]} scale={[0.55, 1.25, 0.45]}>
            <sphereGeometry args={[0.22, 12, 10]} />
          </mesh>
        ))}
      </>
    );
  }
  // 熊：圓耳朵
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.34, 0.38, -0.02]}>
          <mesh material={fur}>
            <sphereGeometry args={[0.16, 12, 10]} />
          </mesh>
          <mesh material={inner} position={[0, 0, 0.08]} scale={[0.6, 0.6, 0.4]}>
            <sphereGeometry args={[0.16, 10, 8]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** 各種動物的尾巴 */
function Tail({ animal, fur, pale }: { animal: AvatarConfig['animal']; fur: THREE.Material; pale: THREE.Material }) {
  if (animal === 'cat') {
    return (
      <mesh material={fur} position={[0, 0.25, -0.1]} rotation={[-0.5, 0, 0]}>
        <capsuleGeometry args={[0.06, 0.5, 4, 8]} />
      </mesh>
    );
  }
  if (animal === 'dog') {
    return (
      <mesh material={fur} position={[0, 0.15, -0.05]} rotation={[-0.9, 0, 0]}>
        <capsuleGeometry args={[0.07, 0.25, 4, 8]} />
      </mesh>
    );
  }
  return (
    <mesh material={animal === 'rabbit' ? pale : fur}>
      <sphereGeometry args={[animal === 'rabbit' ? 0.15 : 0.11, 10, 8]} />
    </mesh>
  );
}
