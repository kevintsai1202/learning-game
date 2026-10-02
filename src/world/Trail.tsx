/**
 * 走路特效：走路時在腳下冒出小花或星星，慢慢縮小消失（停下來就不再冒）。
 * 粒子用固定數量的網格輪流使用（不在每幀建立物件），位置用世界座標，才不會跟著角色移動。
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toon } from './materials';

/** 粒子數量、每顆存在幾秒、多久冒一顆 */
const COUNT = 14;
const LIFE = 1.3;
const SPAWN_EVERY = 0.11;
/** 速度超過多少才算在走路（公尺／秒） */
const WALKING = 0.6;

interface TrailProps {
  /** 走路特效的道具 id（trail.flowers、trail.stars） */
  kind: string;
  /** 每幀讀角色目前的位置（世界座標） */
  getPos: () => THREE.Vector3 | undefined;
  /** 每幀讀角色目前的速度 */
  getSpeed: () => number;
}

/** 一顆粒子的狀態 */
interface Particle {
  age: number;
  x: number;
  z: number;
  spin: number;
}

export function Trail({ kind, getPos, getSpeed }: TrailProps) {
  const meshes = useRef<(THREE.Object3D | null)[]>([]);
  const parts = useMemo<Particle[]>(() => Array.from({ length: COUNT }, () => ({ age: LIFE, x: 0, z: 0, spin: 0 })), []);
  const next = useRef(0);
  const timer = useRef(0);
  const stars = kind === 'trail.stars';

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const pos = getPos();
    timer.current += dt;
    // 走路時定時在腳邊冒一顆（輪流使用最舊的那顆）
    if (pos && getSpeed() > WALKING && timer.current >= SPAWN_EVERY) {
      timer.current = 0;
      const p = parts[next.current];
      next.current = (next.current + 1) % COUNT;
      p.age = 0;
      p.x = pos.x + (Math.random() - 0.5) * 0.5;
      p.z = pos.z + (Math.random() - 0.5) * 0.5;
      p.spin = Math.random() * Math.PI * 2;
    }
    parts.forEach((p, i) => {
      const m = meshes.current[i];
      if (!m) return;
      p.age += dt;
      const alive = p.age < LIFE;
      m.visible = alive;
      if (!alive) return;
      const k = 1 - p.age / LIFE;
      if (stars) {
        // 星星往上飄、轉圈
        m.position.set(p.x, 0.25 + p.age * 0.9, p.z);
        m.rotation.set(0, p.spin + p.age * 4, 0);
        m.scale.setScalar(0.4 + k * 0.6);
      } else {
        // 小花留在地上，慢慢縮小
        m.position.set(p.x, 0.04, p.z);
        m.rotation.set(0, p.spin, 0);
        m.scale.setScalar(Math.min(1, p.age * 6) * k);
      }
    });
  });

  return (
    <>
      {parts.map((_, i) =>
        stars ? (
          <mesh key={i} ref={(el) => void (meshes.current[i] = el)} visible={false} material={toon('#ffd84d')}>
            <octahedronGeometry args={[0.19, 0]} />
          </mesh>
        ) : (
          <group key={i} ref={(el) => void (meshes.current[i] = el)} visible={false}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} material={toon('#ff8fb8')}>
              <circleGeometry args={[0.21, 5]} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} material={toon('#ffe066')}>
              <circleGeometry args={[0.08, 8]} />
            </mesh>
          </group>
        ),
      )}
    </>
  );
}
