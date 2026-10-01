/**
 * 玩家角色控制器：每幀讀輸入、移動、碰撞、偵測門口，並讓鏡頭平滑跟隨。
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Avatar, type MotionState } from './Avatar';
import { blobShadowTexture } from './materials';
import { WALK_RADIUS, ZONES, doorOf } from './layout';
import { moveByInput, nearestDoor, resolveCollisions, stepToward, type Obstacle } from './movement';
import { inputDirection, player } from './input';
import { useUi, type ZoneId } from '../store/useUi';
import type { AvatarConfig } from '../store/save';
import { sfx } from '../audio/sfx';

/** 走路速度（公尺／秒） */
const SPEED = 5.2;
/** 靠近門口多少公尺內算「在門口」 */
const DOOR_RANGE = 1.9;

const DOORS = ZONES.map((z) => ({ id: z.id, ...doorOf(z) }));

/** 角度插值（走最短的方向轉身） */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

interface PlayerProps {
  avatar: AvatarConfig;
  obstacles: Obstacle[];
  /** 是否接受操作（選單打開時暫停） */
  active: boolean;
}

export function Player({ avatar, obstacles, active }: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const motion = useRef<MotionState>({ speed: 0 });
  const lastNear = useRef<ZoneId | null>(null);
  const lookAt = useRef(new THREE.Vector3(player.pos.x, 1, player.pos.z - 3));
  const { camera, size } = useThree();
  const shadowTex = useMemo(() => blobShadowTexture(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    let next = player.pos;
    let moving = false;
    if (active) {
      const dir = inputDirection();
      if (Math.hypot(dir.x, dir.z) > 0.05) {
        player.target = null;
        player.autoEnter = null;
        next = moveByInput(player.pos, dir, SPEED, dt);
        moving = true;
      } else if (player.target) {
        const r = stepToward(player.pos, player.target, SPEED, dt);
        next = r.pos;
        moving = !r.arrived;
        if (r.arrived) {
          player.target = null;
          if (player.autoEnter) {
            const zone = player.autoEnter;
            player.autoEnter = null;
            sfx.door();
            useUi.getState().enterZone(zone);
          }
        }
      }
      next = resolveCollisions(next, obstacles, WALK_RADIUS, 0.45);
      // 被障礙物擋住、幾乎走不動時放棄目標，避免原地踏步
      if (player.target && Math.hypot(next.x - player.pos.x, next.z - player.pos.z) < SPEED * dt * 0.05) {
        player.target = null;
        player.autoEnter = null;
      }
    }
    const dx = next.x - player.pos.x;
    const dz = next.z - player.pos.z;
    motion.current.speed = moving ? Math.hypot(dx, dz) / Math.max(dt, 1e-3) : 0;
    if (Math.hypot(dx, dz) > 1e-4) player.heading = lerpAngle(player.heading, Math.atan2(dx, dz), Math.min(1, dt * 12));
    player.pos = next;

    if (group.current) {
      group.current.position.set(next.x, 0, next.z);
      group.current.rotation.y = player.heading;
    }

    // 門口偵測：變更時才寫入 store
    const near = active ? nearestDoor(next, DOORS, DOOR_RANGE) : null;
    if (near !== lastNear.current) {
      lastNear.current = near;
      useUi.getState().setNearZone(near);
    }

    // 鏡頭跟隨：直式螢幕拉遠一點，才看得到左右兩邊的建築
    const portrait = size.height > size.width * 1.1;
    const back = portrait ? 25 : 18.5;
    const up = portrait ? 22 : 15.5;
    const k = 1 - Math.exp(-dt * 3.5);
    camera.position.lerp(new THREE.Vector3(next.x * 0.85, up, next.z + back), k);
    lookAt.current.lerp(new THREE.Vector3(next.x * 0.9, 1, next.z - 4), k);
    camera.lookAt(lookAt.current);
  });

  return (
    <group ref={group}>
      <Avatar config={avatar} motion={motion} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[1.6, 1.6]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/** 目標點標記：點地面後出現一個會縮放的圈圈 */
export function TargetMarker() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = player.target;
    ref.current.visible = !!t;
    if (t) {
      ref.current.position.set(t.x, 0.05, t.z);
      const s = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.12;
      ref.current.scale.set(s, s, s);
    }
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.35, 0.55, 24]} />
      <meshBasicMaterial color="#ffc93c" transparent opacity={0.9} />
    </mesh>
  );
}
