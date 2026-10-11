/**
 * 玩家角色控制器：每幀讀輸入、移動、碰撞、偵測門口，並讓鏡頭平滑跟隨。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Avatar, type MotionState } from './Avatar';
import { blobShadowTexture } from './materials';
import { WALK_RADIUS, ZONES, doorOf } from './layout';
import { lerpAngle, moveByInput, nearestDoor, resolveCollisions, stepToward, type Obstacle, type RoomRect } from './movement';
import { inputDirection, player } from './input';
import { useUi, type ZoneId } from '../store/useUi';
import type { AvatarConfig } from '../store/save';
import { sfx } from '../audio/sfx';
import { Trail } from './Trail';
import { PetFollower } from './Pets';
import { Html } from '@react-three/drei';
import { usePresence } from '../online/usePresence';
import { LABEL_DISTANCE_FACTOR } from './RemotePlayers';
import { Teacher } from './Teacher';
import { enterHome } from '../store/useHome';
import { roomCamera } from './room';
import { camZoom } from './cameraZoom';
import { decorViewShift } from './decorViewShift';
import { actSoundEvents } from './actSounds';
import { ACT_SFX } from './actSfx';
import { useDecor } from '../store/useDecor';
import { PoseWrap, STANDING, type PoseLift } from './PoseWrap';
import { sceneDebug } from './sceneDebug';
import { actFrame } from '../store/furnitureUse';
import { nowSec, spaceOf, stopUse } from '../store/useFurnitureUse';

/** 走路速度（公尺／秒） */
const SPEED = 5.2;
/** 靠近門口多少公尺內算「在門口」 */
const DOOR_RANGE = 1.9;

const DOORS = ZONES.map((z) => ({ id: z.id, ...doorOf(z) }));

interface PlayerProps {
  avatar: AvatarConfig;
  obstacles: Obstacle[];
  /** 是否接受操作（選單打開時暫停） */
  active: boolean;
  /** 老師以熊熊老師進島（老師 GM 的 G2）：畫熊熊老師、不偵測建築門口（老師不進建築） */
  teacher?: boolean;
  /** 可以走的範圍：島上是半徑（預設），屋裡是長方形（自己的家第二期） */
  bounds?: number | RoomRect;
  /** 偵測哪些建築的門口（預設島上的建築；屋裡沒有） */
  doors?: { id: ZoneId; x: number; z: number }[];
  /** 屋裡：鏡頭在房間裡跟著角色（比島上近，不會跑出房間） */
  roomView?: boolean;
}

export function Player({ avatar, obstacles, active, teacher = false, bounds = WALK_RADIUS, doors = DOORS, roomView = false }: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const motion = useRef<MotionState>({ speed: 0 });
  /** 用家具時的抬高、縮放、傾斜（PoseWrap 每格讀） */
  const lift = useRef<PoseLift>(STANDING);
  /** 家具包打開時畫面往上移了幾 px（第 10 節第 ① 批；慢慢移過去） */
  const viewShift = useRef(0);
  /** 上一格用家具的時間（音效從上一格到這一格之間放；換了一件家具重來） */
  const lastActT = useRef<{ act: object | null; t: number }>({ act: null, t: -1 });
  const lastNear = useRef<ZoneId | null>(null);
  const lookAt = useRef(new THREE.Vector3(player.pos.x, 1, player.pos.z - 3));
  const { camera, size } = useThree();
  // 卸下時（進建築、進出屋、回標題）把畫面移回來：整個畫布只有一個鏡頭
  useEffect(() => () => (camera as THREE.PerspectiveCamera).clearViewOffset(), [camera]);
  // e2e 讀自己的角色的姿勢與縮放（第 10.3 節：按「起來」後要站著、原比例）
  useEffect(() => {
    sceneDebug.playerLift = () => ({ pose: motion.current.pose ?? 'stand', ...lift.current });
    return () => {
      sceneDebug.playerLift = null;
    };
  }, []);
  const shadowTex = useMemo(() => blobShadowTexture(), []);
  /** 自己在公頻說的話：頭上的對話氣泡（和其他玩家同樣的樣式） */
  const bubble = usePresence((s) => (s.selfId ? (s.bubbles[s.selfId]?.text ?? null) : null));

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    let next = player.pos;
    let moving = false;
    // 用家具（第 9 節優化）：照時間軸擺在家具上；按鈕、方向鍵、點地面都會起來（溜滑梯途中不行，溜完自己起來）
    if (player.act) {
      const act = player.act;
      const t = nowSec() - act.t0;
      const f = actFrame(act.item, spaceOf(act.place), act.kind, t);
      // 音效（第 10 節第 ① 批）：坐下噗、爬梯子、咻、咚、鞦韆嘎
      if (lastActT.current.act !== act) lastActT.current = { act, t: -1 };
      for (const s of actSoundEvents(act.kind, lastActT.current.t, t)) ACT_SFX[s]();
      lastActT.current.t = t;
      if (act.kind === 'slide') player.target = null;
      const dir = inputDirection();
      if (f.done) stopUse(true);
      else if (active && act.kind !== 'slide' && (Math.hypot(dir.x, dir.z) > 0.05 || player.target)) stopUse();
      if (player.act) {
        // 位置設成座位的世界座標（位置訊息送出去才是座位）；移動與碰撞整段跳過
        player.pos = { x: f.x, z: f.z };
        player.heading = f.heading;
        motion.current.speed = 0;
        motion.current.pose = f.pose;
        lift.current = f;
      }
      next = player.pos;
    }
    // 沒在用家具就是站著、原比例：不管是這裡自己起來，還是在別處清掉 player.act（按「⬆️ 起來」、傳送、進出屋）。
    // 以前只在上面那段裡重設，按「起來」後會停在最後一格的坐姿、躺姿與縮放（使用者 2026-10-11 回報，第 10.3 節）
    if (!player.act && lift.current !== STANDING) {
      motion.current.pose = 'stand';
      lift.current = STANDING;
    }
    if (active && !player.act) {
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
            // 小屋不是建築（不走建築的選單）
            if (zone === 'home') enterHome();
            else useUi.getState().enterZone(zone);
          }
        }
      }
      next = resolveCollisions(next, obstacles, bounds, 0.45);
      // 被障礙物擋住、幾乎走不動時放棄目標，避免原地踏步
      if (player.target && Math.hypot(next.x - player.pos.x, next.z - player.pos.z) < SPEED * dt * 0.05) {
        player.target = null;
        player.autoEnter = null;
      }
    }
    const dx = next.x - player.pos.x;
    const dz = next.z - player.pos.z;
    if (!player.act) {
      motion.current.speed = moving ? Math.hypot(dx, dz) / Math.max(dt, 1e-3) : 0;
      if (Math.hypot(dx, dz) > 1e-4) player.heading = lerpAngle(player.heading, Math.atan2(dx, dz), Math.min(1, dt * 12));
    }
    player.pos = next;

    if (group.current) {
      group.current.position.set(next.x, 0, next.z);
      group.current.rotation.y = player.heading;
    }

    // 門口偵測：變更時才寫入 store
    const near = active && !teacher && !player.act ? nearestDoor(next, doors, DOOR_RANGE) : null;
    if (near !== lastNear.current) {
      lastNear.current = near;
      useUi.getState().setNearZone(near);
    }

    // 鏡頭慢慢跟上；換場景（進屋、出屋）的第一格直接跳到定位。距離都乘縮放倍率（滾輪、兩指捏合）
    const k = player.snapCamera ? 1 : 1 - Math.exp(-dt * 3.5);
    player.snapCamera = false;
    const zoom = camZoom.value;
    // 家具包或壁紙地板面板打開時，直式手機的畫面往上移（角色留在家具包上方）。每一格用當下的畫面大小重設：
    // 轉向或鍵盤彈出時畫面大小會變
    const d = useDecor.getState();
    const want = decorViewShift(size.width, size.height, d.bagOpen || d.surfaceOpen);
    viewShift.current += (want - viewShift.current) * Math.min(1, dt * 6);
    const cam = camera as THREE.PerspectiveCamera;
    if (want === 0 && viewShift.current < 0.5) {
      if (viewShift.current !== 0) {
        viewShift.current = 0;
        cam.clearViewOffset();
      }
    } else cam.setViewOffset(size.width, size.height, 0, viewShift.current, size.width, size.height);
    if (roomView) {
      // 屋裡：跟著角色，比島上近；看的點夾在房間裡
      const c = roomCamera(size.width / Math.max(size.height, 1), next, zoom);
      camera.position.lerp(new THREE.Vector3(c.position.x, c.position.y, c.position.z), k);
      lookAt.current.lerp(new THREE.Vector3(c.target.x, c.target.y, c.target.z), k);
      camera.lookAt(lookAt.current);
      return;
    }
    // 鏡頭跟隨：直式螢幕拉遠一點，才看得到左右兩邊的建築
    const portrait = size.height > size.width * 1.1;
    const back = (portrait ? 25 : 18.5) * zoom;
    const up = (portrait ? 22 : 15.5) * zoom;
    camera.position.lerp(new THREE.Vector3(next.x * 0.85, up, next.z + back), k);
    lookAt.current.lerp(new THREE.Vector3(next.x * 0.9, 1, next.z - 4), k);
    camera.lookAt(lookAt.current);
  });

  /** 寵物與走路特效每幀讀角色的位置、朝向、速度（它們在世界座標，不跟著角色的群組旋轉） */
  const getPos = () => group.current?.position;
  const getSpeed = () => motion.current.speed;
  return (
    <>
      <group ref={group}>
        <PoseWrap lift={lift}>{teacher ? <Teacher waving={false} /> : <Avatar config={avatar} motion={motion} />}</PoseWrap>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <planeGeometry args={[1.6, 1.6]} />
          <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
        </mesh>
        {bubble && (
          <Html position={[0, 2.3, 0]} distanceFactor={LABEL_DISTANCE_FACTOR} pointerEvents="none" zIndexRange={[20, 0]}>
            <div className="remote-label">
              <div className="chat-bubble" data-testid="self-bubble">
                {bubble}
              </div>
            </div>
          </Html>
        )}
      </group>
      {!teacher && avatar.trail && <Trail kind={avatar.trail} getPos={getPos} getSpeed={getSpeed} />}
      {!teacher && avatar.pet && <PetFollower pet={avatar.pet} getPos={getPos} getHeading={() => player.heading} getSpeed={getSpeed} />}
    </>
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
