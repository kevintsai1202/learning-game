/**
 * 小寵物：跟在角色左後方，慢一點才跟上；角色停下來時在旁邊慢慢繞圈，並轉頭面向鏡頭（孩子才看得到寵物的臉）。
 * 會飛的（蝴蝶、貓頭鷹、小龍、小魚缸）飄在半空中，其他的走路時一跳一跳。
 * 全部用基本幾何體做成；寵物朝 +z 方向（和角色相同，朝向 0 表示面向鏡頭）。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toon } from './materials';
import { lerpAngle } from './movement';

/** 飄在空中的寵物與高度（公尺） */
const HOVER: Record<string, number> = { 'pet.butterfly': 1.7, 'pet.owl': 1.6, 'pet.dragon': 1.5, 'pet.fishbowl': 1.0 };
/** 速度超過多少才算主人在走路 */
const WALKING = 0.5;
/** 主人停下來時寵物的朝向（四分之三側面朝向鏡頭） */
const IDLE_FACING = 0.65;

interface PetFollowerProps {
  /** 寵物的道具 id */
  pet: string;
  /** 每幀讀主人的位置、朝向、速度 */
  getPos: () => THREE.Vector3 | undefined;
  getHeading: () => number;
  getSpeed: () => number;
}

/** 跟著主人走的寵物 */
export function PetFollower({ pet, getPos, getHeading, getSpeed }: PetFollowerProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  /** 寵物目前的位置與目標位置（重複使用，不在每幀建立向量） */
  const pos = useRef<THREE.Vector3 | null>(null);
  const target = useRef(new THREE.Vector3());
  const hover = HOVER[pet];

  useFrame((state, rawDt) => {
    const owner = getPos();
    if (!owner || !group.current) return;
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const heading = getHeading();
    const moving = getSpeed() > WALKING;
    // 走路時待在主人左後方；停下來時繞著主人慢慢轉
    const angle = moving ? heading + Math.PI + 0.75 : t * 0.5;
    target.current.set(owner.x + Math.sin(angle) * 1.3, 0, owner.z + Math.cos(angle) * 1.3);
    if (!pos.current || pos.current.distanceTo(target.current) > 8) pos.current = target.current.clone();
    const before = pos.current.clone();
    pos.current.lerp(target.current, 1 - Math.exp(-dt * 3.5));
    group.current.position.copy(pos.current);
    // 主人走路時面向前進方向；主人停下來時轉成四分之三側面朝向鏡頭（鏡頭固定在南方，朝向 0 是正對鏡頭），
    // 臉和輪廓（恐龍的脖子、尾巴）都看得到
    const dx = pos.current.x - before.x;
    const dz = pos.current.z - before.z;
    const face = moving && Math.hypot(dx, dz) > 1e-3 ? Math.atan2(dx, dz) : IDLE_FACING;
    group.current.rotation.y = lerpAngle(group.current.rotation.y, face, Math.min(1, dt * 6));
    if (body.current) {
      body.current.position.y =
        hover !== undefined ? hover + Math.sin(t * 2.6) * 0.12 : Math.abs(Math.sin(t * (moving ? 11 : 2.5))) * (moving ? 0.2 : 0.04);
    }
  });

  return (
    <group ref={group}>
      <group ref={body}>
        <PetModel id={pet} />
      </group>
    </group>
  );
}

/** 依 id 畫寵物 */
export function PetModel({ id }: { id: string }) {
  switch (id) {
    case 'pet.chick':
      return <Chick />;
    case 'pet.butterfly':
      return <Butterfly />;
    case 'pet.fishbowl':
      return <Fishbowl />;
    case 'pet.dino':
      return <Dino />;
    case 'pet.dragon':
      return <Dragon />;
    case 'pet.owl':
      return <Owl />;
    default:
      return null;
  }
}

/** 兩顆黑眼睛（x 為左右距離的一半） */
function Eyes({ x, y, z, r = 0.025 }: { x: number; y: number; z: number; r?: number }) {
  return (
    <>
      <mesh position={[x, y, z]} material={toon('#2b2a4c')}>
        <sphereGeometry args={[r, 8, 6]} />
      </mesh>
      <mesh position={[-x, y, z]} material={toon('#2b2a4c')}>
        <sphereGeometry args={[r, 8, 6]} />
      </mesh>
    </>
  );
}

/** 一對會拍的翅膀：speed 拍動速度、amp 幅度 */
function useFlap(speed: number, amp: number) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const a = Math.sin(clock.elapsedTime * speed) * amp;
    if (left.current) left.current.rotation.z = a;
    if (right.current) right.current.rotation.z = -a;
  });
  return { left, right };
}

/** 小雞：黃色圓身體、小頭、橘色尖嘴與腳 */
function Chick() {
  const { left, right } = useFlap(9, 0.35);
  return (
    <group>
      <mesh position={[0, 0.22, 0]} material={toon('#ffd93b')}>
        <sphereGeometry args={[0.22, 14, 10]} />
      </mesh>
      <mesh position={[0, 0.48, 0.05]} material={toon('#ffd93b')}>
        <sphereGeometry args={[0.15, 14, 10]} />
      </mesh>
      <mesh position={[0, 0.47, 0.2]} rotation={[Math.PI / 2, 0, 0]} material={toon('#ff9a3c')}>
        <coneGeometry args={[0.045, 0.1, 8]} />
      </mesh>
      <Eyes x={0.065} y={0.52} z={0.16} />
      <group ref={left} position={[0.2, 0.25, 0]}>
        <mesh position={[0.04, 0, 0]} scale={[0.5, 0.35, 0.9]} material={toon('#ffc61a')}>
          <sphereGeometry args={[0.13, 10, 8]} />
        </mesh>
      </group>
      <group ref={right} position={[-0.2, 0.25, 0]}>
        <mesh position={[-0.04, 0, 0]} scale={[0.5, 0.35, 0.9]} material={toon('#ffc61a')}>
          <sphereGeometry args={[0.13, 10, 8]} />
        </mesh>
      </group>
      <mesh position={[0.08, 0.02, 0.04]} material={toon('#ff9a3c')}>
        <boxGeometry args={[0.07, 0.03, 0.1]} />
      </mesh>
      <mesh position={[-0.08, 0.02, 0.04]} material={toon('#ff9a3c')}>
        <boxGeometry args={[0.07, 0.03, 0.1]} />
      </mesh>
    </group>
  );
}

/** 蝴蝶：細身體、四片彩色翅膀快速拍動 */
function Butterfly() {
  const { left, right } = useFlap(16, 0.9);
  const wing = (side: 1 | -1) => (
    <>
      <mesh position={[side * 0.16, 0, 0.06]} scale={[1, 0.1, 0.9]} material={toon('#ff7ab8')}>
        <sphereGeometry args={[0.15, 12, 8]} />
      </mesh>
      <mesh position={[side * 0.12, 0, -0.1]} scale={[1, 0.1, 0.8]} material={toon('#a879ff')}>
        <sphereGeometry args={[0.11, 12, 8]} />
      </mesh>
    </>
  );
  return (
    <group rotation={[0.35, 0, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={toon('#4a3360')}>
        <capsuleGeometry args={[0.03, 0.24, 4, 8]} />
      </mesh>
      <group ref={left}>{wing(1)}</group>
      <group ref={right}>{wing(-1)}</group>
      <mesh position={[0.04, 0.06, 0.18]} rotation={[0.6, 0, -0.4]} material={toon('#4a3360')}>
        <cylinderGeometry args={[0.006, 0.006, 0.14, 4]} />
      </mesh>
      <mesh position={[-0.04, 0.06, 0.18]} rotation={[0.6, 0, 0.4]} material={toon('#4a3360')}>
        <cylinderGeometry args={[0.006, 0.006, 0.14, 4]} />
      </mesh>
    </group>
  );
}

/** 小魚缸：透明玻璃球裡有水和一條會繞圈游的小金魚 */
function Fishbowl() {
  const fish = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (fish.current) fish.current.rotation.y = clock.elapsedTime * 1.6;
  });
  return (
    <group scale={1.25}>
      <mesh>
        <sphereGeometry args={[0.28, 20, 14]} />
        <meshStandardMaterial color="#cdeeff" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <sphereGeometry args={[0.2, 18, 12]} />
        <meshStandardMaterial color="#8fd3ff" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <group ref={fish}>
        <group position={[0.09, -0.04, 0]} rotation={[0, Math.PI, 0]}>
          <mesh scale={[0.65, 0.75, 1]} material={toon('#ff7a1a')}>
            <sphereGeometry args={[0.1, 12, 8]} />
          </mesh>
          <mesh position={[0, 0, -0.12]} rotation={[-Math.PI / 2, 0, 0]} material={toon('#ff5a3c')}>
            <coneGeometry args={[0.06, 0.09, 6]} />
          </mesh>
          <mesh position={[0.04, 0.02, 0.06]} material={toon('#2b2a4c')}>
            <sphereGeometry args={[0.014, 6, 4]} />
          </mesh>
          <mesh position={[-0.04, 0.02, 0.06]} material={toon('#2b2a4c')}>
            <sphereGeometry args={[0.014, 6, 4]} />
          </mesh>
        </group>
      </group>
      <mesh position={[0, 0.27, 0]} rotation={[Math.PI / 2, 0, 0]} material={toon('#9fd8ff')}>
        <torusGeometry args={[0.12, 0.02, 6, 16]} />
      </mesh>
    </group>
  );
}

/** 小恐龍：綠色身體、長脖子、背上一排三角、尾巴 */
function Dino() {
  return (
    <group>
      <mesh position={[0, 0.26, 0]} scale={[1, 0.85, 1.3]} material={toon('#5fcf6a')}>
        <sphereGeometry args={[0.2, 14, 10]} />
      </mesh>
      <mesh position={[0, 0.45, 0.18]} rotation={[0.5, 0, 0]} material={toon('#5fcf6a')}>
        <cylinderGeometry args={[0.07, 0.09, 0.28, 10]} />
      </mesh>
      <mesh position={[0, 0.6, 0.27]} scale={[0.9, 0.85, 1.2]} material={toon('#5fcf6a')}>
        <sphereGeometry args={[0.11, 12, 10]} />
      </mesh>
      <Eyes x={0.06} y={0.65} z={0.36} r={0.02} />
      <mesh position={[0, 0.24, -0.3]} rotation={[-Math.PI / 2 - 0.3, 0, 0]} material={toon('#5fcf6a')}>
        <coneGeometry args={[0.09, 0.3, 10]} />
      </mesh>
      {[-0.1, 0.02, 0.14].map((z) => (
        <mesh key={z} position={[0, 0.43, z - 0.05]} material={toon('#ffb84d')}>
          <coneGeometry args={[0.035, 0.08, 4]} />
        </mesh>
      ))}
      {[
        [0.1, 0.12],
        [-0.1, 0.12],
        [0.1, -0.12],
        [-0.1, -0.12],
      ].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.07, z]} material={toon('#4cb857')}>
          <cylinderGeometry args={[0.04, 0.045, 0.14, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** 小龍：粉紅身體、黃肚子、兩支角、會拍的翅膀和尾巴（獎章「一週不間斷」） */
function Dragon() {
  const { left, right } = useFlap(5, 0.5);
  return (
    <group>
      <mesh scale={[0.9, 0.85, 1.2]} material={toon('#e8457c')}>
        <sphereGeometry args={[0.18, 14, 10]} />
      </mesh>
      <mesh position={[0, -0.03, 0.08]} scale={[0.7, 0.7, 0.8]} material={toon('#ffd36b')}>
        <sphereGeometry args={[0.14, 12, 8]} />
      </mesh>
      <mesh position={[0, 0.16, 0.18]} scale={[0.95, 0.85, 1.15]} material={toon('#e8457c')}>
        <sphereGeometry args={[0.13, 12, 10]} />
      </mesh>
      <Eyes x={0.06} y={0.2} z={0.29} r={0.022} />
      <mesh position={[0.06, 0.3, 0.14]} rotation={[-0.3, 0, -0.2]} material={toon('#fff1c2')}>
        <coneGeometry args={[0.025, 0.1, 6]} />
      </mesh>
      <mesh position={[-0.06, 0.3, 0.14]} rotation={[-0.3, 0, 0.2]} material={toon('#fff1c2')}>
        <coneGeometry args={[0.025, 0.1, 6]} />
      </mesh>
      <group ref={left} position={[0.12, 0.08, -0.02]}>
        <mesh position={[0.14, 0.02, 0]} rotation={[0, 0, -0.3]} scale={[1, 0.08, 0.7]} material={toon('#8b5cf6')}>
          <sphereGeometry args={[0.15, 10, 6]} />
        </mesh>
      </group>
      <group ref={right} position={[-0.12, 0.08, -0.02]}>
        <mesh position={[-0.14, 0.02, 0]} rotation={[0, 0, 0.3]} scale={[1, 0.08, 0.7]} material={toon('#8b5cf6')}>
          <sphereGeometry args={[0.15, 10, 6]} />
        </mesh>
      </group>
      <mesh position={[0, -0.04, -0.27]} rotation={[-Math.PI / 2 - 0.4, 0, 0]} material={toon('#e8457c')}>
        <coneGeometry args={[0.07, 0.26, 8]} />
      </mesh>
    </group>
  );
}

/** 貓頭鷹：圓滾滾的咖啡色身體、淺色臉、大眼睛、耳羽（獎章「技能大師」） */
function Owl() {
  const { left, right } = useFlap(4, 0.45);
  return (
    <group>
      <mesh scale={[1, 1.15, 0.95]} material={toon('#8b5a2b')}>
        <sphereGeometry args={[0.2, 14, 12]} />
      </mesh>
      <mesh position={[0, 0.05, 0.14]} scale={[1, 0.85, 0.4]} material={toon('#f2d6a8')}>
        <sphereGeometry args={[0.15, 14, 10]} />
      </mesh>
      {[0.065, -0.065].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.09, 0.19]} material={toon('#ffffff')}>
            <sphereGeometry args={[0.055, 12, 8]} />
          </mesh>
          <mesh position={[x, 0.09, 0.235]} material={toon('#2b2a4c')}>
            <sphereGeometry args={[0.028, 8, 6]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.02, 0.23]} rotation={[Math.PI / 2 + 0.3, 0, 0]} material={toon('#ffb84d')}>
        <coneGeometry args={[0.025, 0.06, 6]} />
      </mesh>
      <mesh position={[0.11, 0.24, 0]} rotation={[0, 0, -0.35]} material={toon('#6b4220')}>
        <coneGeometry args={[0.04, 0.12, 6]} />
      </mesh>
      <mesh position={[-0.11, 0.24, 0]} rotation={[0, 0, 0.35]} material={toon('#6b4220')}>
        <coneGeometry args={[0.04, 0.12, 6]} />
      </mesh>
      <group ref={left} position={[0.18, 0.02, 0]}>
        <mesh position={[0.05, 0, 0]} scale={[0.45, 1, 0.8]} material={toon('#6b4220')}>
          <sphereGeometry args={[0.13, 10, 8]} />
        </mesh>
      </group>
      <group ref={right} position={[-0.18, 0.02, 0]}>
        <mesh position={[-0.05, 0, 0]} scale={[0.45, 1, 0.8]} material={toon('#6b4220')}>
          <sphereGeometry args={[0.13, 10, 8]} />
        </mesh>
      </group>
    </group>
  );
}
