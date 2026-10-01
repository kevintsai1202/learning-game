/**
 * 自然景物：海、沙灘與草地、步道、廣場噴水池、樹、花、雲、碼頭與小船。
 * 重複出現的物件用 InstancedMesh 一次畫完，平板也跑得動。
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { toon } from './materials';
import { FOUNTAIN, ISLAND_RADIUS, WALK_RADIUS } from './layout';
import { PLAZA, pathSegments, type TreeSpot } from './scenery';
import { StaticMerge } from './StaticMerge';

/** 海：深色海面、淺水環、會呼吸的白色浪花 */
export function Sea() {
  const foam = useRef<THREE.Mesh>(null);
  const shallow = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (foam.current) {
      const s = 1 + Math.sin(t * 1.2) * 0.012;
      foam.current.scale.set(s, s, 1);
      (foam.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 1.2) * 0.25;
    }
    if (shallow.current) shallow.current.rotation.z = t * 0.02;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]}>
        <circleGeometry args={[220, 64]} />
        <meshToonMaterial color="#38b6d0" />
      </mesh>
      <mesh ref={shallow} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]}>
        <ringGeometry args={[ISLAND_RADIUS - 1, ISLAND_RADIUS + 9, 64]} />
        <meshBasicMaterial color="#8fe6f0" transparent opacity={0.55} />
      </mesh>
      <mesh ref={foam} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <ringGeometry args={[ISLAND_RADIUS + 0.2, ISLAND_RADIUS + 1.1, 72]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/** 沙灘外緣做成不規則的海岸線 */
function useBeachGeometry(): THREE.CylinderGeometry {
  return useMemo(() => {
    const g = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 2, 1.2, 96, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1) continue;
      const a = Math.atan2(z, x);
      const k = 1 + 0.035 * Math.sin(a * 5) + 0.02 * Math.sin(a * 11 + 1.3);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
  }, []);
}

/** 步道石（沿著步道等距擺放的扁圓石） */
function SteppingStones() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: { x: number; z: number; r: number }[] = [];
    for (const s of pathSegments()) {
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      for (let d = PLAZA.radius + 0.6; d < len; d += 1.05) {
        const t = d / len;
        const jitter = Math.sin(d * 3.1) * 0.18;
        out.push({ x: s.ax + (s.bx - s.ax) * t + jitter, z: s.az + (s.bz - s.az) * t - jitter, r: 0.42 + ((d * 7) % 3) * 0.05 });
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    spots.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 0.03, s.z), new THREE.Quaternion(), new THREE.Vector3(s.r, 1, s.r * 0.85));
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length]} material={toon('#f4e7c5')} receiveShadow>
      <cylinderGeometry args={[1, 1, 0.08, 10]} />
    </instancedMesh>
  );
}

/** 地面：沙灘、草地、廣場、步道；點地面就走過去 */
export function Ground({ onGroundTap }: { onGroundTap?: (x: number, z: number) => void }) {
  const beach = useBeachGeometry();
  const handle = (e: ThreeEvent<PointerEvent>) => {
    if (!onGroundTap) return;
    e.stopPropagation();
    onGroundTap(e.point.x, e.point.z);
  };
  return (
    <group>
      <mesh geometry={beach} material={toon('#ffe3a3')} position={[0, -0.68, 0]} receiveShadow onPointerDown={handle} />
      <mesh material={toon('#8fd66a')} position={[0, -0.16, 0]} receiveShadow onPointerDown={handle}>
        <cylinderGeometry args={[WALK_RADIUS + 0.5, WALK_RADIUS + 1.1, 0.32, 72]} />
      </mesh>
      {/* 廣場 */}
      <mesh material={toon('#f6ebcf')} rotation={[-Math.PI / 2, 0, 0]} position={[PLAZA.x, 0.012, PLAZA.z]} receiveShadow onPointerDown={handle}>
        <circleGeometry args={[PLAZA.radius, 48]} />
      </mesh>
      <mesh material={toon('#e9dab3')} rotation={[-Math.PI / 2, 0, 0]} position={[PLAZA.x, 0.008, PLAZA.z]}>
        <ringGeometry args={[PLAZA.radius, PLAZA.radius + 0.35, 48]} />
      </mesh>
      <SteppingStones />
    </group>
  );
}

/** 中央噴水池：水柱上下跳動 */
export function Fountain() {
  const drops = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    drops.current?.children.forEach((c, i) => {
      const p = (t * 0.9 + i / 8) % 1;
      const a = (i / 8) * Math.PI * 2;
      c.position.set(Math.cos(a) * p * 1.1, 1.6 + Math.sin(p * Math.PI) * 1.2, Math.sin(a) * p * 1.1);
    });
  });
  return (
    <StaticMerge>
    <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
      <mesh material={toon('#e7e1f7')} position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[FOUNTAIN.radius, FOUNTAIN.radius + 0.15, 0.6, 32]} />
      </mesh>
      <mesh position={[0, 0.58, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[FOUNTAIN.radius - 0.2, 32]} />
        <meshBasicMaterial color="#7fdcf0" />
      </mesh>
      <mesh material={toon('#e7e1f7')} position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.25, 0.35, 1.0, 12]} />
      </mesh>
      <mesh material={toon('#e7e1f7')} position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.7, 0.5, 0.2, 16]} />
      </mesh>
      <group ref={drops} userData={{ dynamic: true }}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.09, 8, 6]} />
            <meshBasicMaterial color="#bff3ff" />
          </mesh>
        ))}
      </group>
    </group>
    </StaticMerge>
  );
}

/** 樹：樹幹與樹冠各用一個 InstancedMesh；椰子樹另外畫 */
export function Trees({ spots }: { spots: TreeSpot[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const rounds = useRef<THREE.InstancedMesh>(null);
  const pines = useRef<THREE.InstancedMesh>(null);
  const land = spots.filter((s) => s.kind !== 'palm');
  const roundSpots = land.filter((s) => s.kind === 'round');
  const pineSpots = land.filter((s) => s.kind === 'pine');
  const palms = spots.filter((s) => s.kind === 'palm');
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    land.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 0.6 * s.s, s.z), q, new THREE.Vector3(s.s, s.s, s.s));
      trunks.current?.setMatrixAt(i, m);
    });
    roundSpots.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 1.9 * s.s, s.z), q, new THREE.Vector3(s.s, s.s * 0.95, s.s));
      rounds.current?.setMatrixAt(i, m);
      rounds.current?.setColorAt(i, c.set(s.color));
    });
    pineSpots.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 2.1 * s.s, s.z), q, new THREE.Vector3(s.s, s.s, s.s));
      pines.current?.setMatrixAt(i, m);
      pines.current?.setColorAt(i, c.set(s.color));
    });
    for (const r of [trunks, rounds, pines]) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
    }
  }, [land, roundSpots, pineSpots]);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, land.length]} material={toon('#a0693c')} castShadow>
        <cylinderGeometry args={[0.18, 0.26, 1.2, 7]} />
      </instancedMesh>
      <instancedMesh ref={rounds} args={[undefined, undefined, roundSpots.length]} castShadow>
        <icosahedronGeometry args={[1.15, 1]} />
        <meshToonMaterial color="#ffffff" />
      </instancedMesh>
      <instancedMesh ref={pines} args={[undefined, undefined, pineSpots.length]} castShadow>
        <coneGeometry args={[1.0, 2.6, 8]} />
        <meshToonMaterial color="#ffffff" />
      </instancedMesh>
      <StaticMerge>
        {palms.map((p, i) => (
          <Palm key={i} spot={p} />
        ))}
      </StaticMerge>
    </group>
  );
}

/** 椰子樹：彎彎的樹幹加上一圈扁葉子 */
function Palm({ spot }: { spot: TreeSpot }) {
  const lean = Math.atan2(spot.x, spot.z);
  return (
    <group position={[spot.x, -0.1, spot.z]} rotation={[0, lean, 0]} scale={spot.s}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} material={toon(i % 2 ? '#c28b55' : '#b07a48')} position={[0, 0.4 + i * 0.62, i * i * 0.04]} rotation={[0.08 * i, 0, 0]}>
          <cylinderGeometry args={[0.16 - i * 0.012, 0.19 - i * 0.012, 0.66, 7]} />
        </mesh>
      ))}
      <group position={[0, 3.3, 0.7]}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} material={toon('#3fbf7f')} rotation={[0, (i / 6) * Math.PI * 2, 0.9]} position={[0, 0, 0]}>
            <coneGeometry args={[0.35, 2.0, 4]} />
          </mesh>
        ))}
        <mesh material={toon('#7a4a2a')} position={[0, -0.2, 0.1]}>
          <sphereGeometry args={[0.18, 8, 6]} />
        </mesh>
      </group>
    </group>
  );
}

/** 草地上的小花 */
export function Flowers({ spots }: { spots: { x: number; z: number; color: string }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      m.makeTranslation(s.x, 0.1, s.z);
      ref.current?.setMatrixAt(i, m);
      ref.current?.setColorAt(i, c.set(s.color));
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length]}>
      <icosahedronGeometry args={[0.12, 0]} />
      <meshToonMaterial color="#ffffff" />
    </instancedMesh>
  );
}

/** 天上慢慢飄的雲 */
export function Clouds() {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        x: -60 + i * 15,
        y: 16 + (i % 3) * 3,
        z: -40 + ((i * 37) % 50),
        s: 1.4 + (i % 4) * 0.4,
        speed: 0.6 + (i % 3) * 0.3,
      })),
    [],
  );
  useFrame((_, dt) => {
    group.current?.children.forEach((c, i) => {
      c.position.x += clouds[i].speed * dt;
      if (c.position.x > 70) c.position.x = -70;
    });
  });
  const white = toon('#ffffff');
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          <StaticMerge>
          <mesh material={white}>
            <sphereGeometry args={[1.2, 12, 10]} />
          </mesh>
          <mesh material={white} position={[1.2, -0.2, 0.2]}>
            <sphereGeometry args={[0.9, 12, 10]} />
          </mesh>
          <mesh material={white} position={[-1.2, -0.25, 0]}>
            <sphereGeometry args={[0.85, 12, 10]} />
          </mesh>
          <mesh material={white} position={[0.4, 0.6, -0.2]}>
            <sphereGeometry args={[0.8, 12, 10]} />
          </mesh>
          </StaticMerge>
        </group>
      ))}
    </group>
  );
}

/** 南邊的碼頭與會晃動的小帆船 */
export function Dock() {
  const boat = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (boat.current) {
      boat.current.position.y = -0.55 + Math.sin(t * 1.5) * 0.08;
      boat.current.rotation.z = Math.sin(t * 1.1) * 0.06;
    }
  });
  const wood = toon('#c28b55');
  return (
    <StaticMerge>
    <group position={[3.5, 0, 0]}>
      <mesh material={wood} position={[0, -0.25, 27]} receiveShadow>
        <boxGeometry args={[2.2, 0.2, 8]} />
      </mesh>
      {[-1, 1].map((s) =>
        [24, 27, 30].map((z) => (
          <mesh key={`${s}${z}`} material={toon('#9a6a3c')} position={[s * 1.05, -0.6, z]}>
            <cylinderGeometry args={[0.13, 0.13, 1.2, 6]} />
          </mesh>
        )),
      )}
      <group ref={boat} position={[2.8, -0.55, 30]} userData={{ dynamic: true }}>
        <mesh material={toon('#ff6b4a')} scale={[1, 0.45, 2.2]}>
          <sphereGeometry args={[1, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        </mesh>
        <mesh material={toon('#ffffff')} position={[0, 1.4, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 2.6, 6]} />
        </mesh>
        <mesh material={toon('#ffffff')} position={[0, 1.6, 0.55]} rotation={[0, Math.PI / 2, 0]}>
          <coneGeometry args={[1.0, 2.0, 3]} />
        </mesh>
      </group>
    </group>
    </StaticMerge>
  );
}
