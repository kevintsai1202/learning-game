/**
 * 玩家角色控制器：每幀讀輸入、移動、碰撞、偵測門口，並讓鏡頭平滑跟隨。
 * 第 10.5 節：方向鍵與搖桿跟著鏡頭（moveInput）、鏡頭繞角色轉（orbit.yaw）、用家具時近拍與第一人稱（actCamera）。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Avatar, type MotionState } from './Avatar';
import { blobShadowTexture } from './materials';
import { WALK_RADIUS, ZONES, doorOf } from './layout';
import { lerpAngle, moveByInput, nearestDoor, resolveCollisions, stepToward, type Obstacle, type RoomRect } from './movement';
import { player } from './input';
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
import { camFor, followCamera, moveInput, normalizeYaw, orbit, useOrbit } from './cameraOrbit';
import { camZoom } from './cameraZoom';
import { decorViewShift } from './decorViewShift';
import { actSoundEvents } from './actSounds';
import { ACT_SFX } from './actSfx';
import { useDecor } from '../store/useDecor';
import { PoseWrap, STANDING, type PoseLift } from './PoseWrap';
import { sceneDebug } from './sceneDebug';
import { nowSec, stopUse } from '../store/useFurnitureUse';
import { frameOf, wallSec } from '../store/actFrame';
import { RIDES } from '../store/playground';
import { clampDeck, shipState, tallView } from '../store/grandRides';
import { occupiedOf } from '../store/useRides';
import type { PlayerAct } from './input';
import type { CamStyle } from './cameraOrbit';
import type { UseKind } from '../store/furnitureUse';

/** 用家具或玩遊樂器材的途中能不能起來（溜滑梯、溜滑梯城堡、大型設施不行，玩完自己起來） */
function lockedOf(act: PlayerAct): boolean {
  if (act.kind === 'grand') return true;
  return act.kind === 'ride' ? !!RIDES[act.ride].locked : act.kind === 'slide';
}

/** 音效照哪一種用法放（遊樂器材：鞦韆組當成鞦韆，其他坐上去噗一聲） */
function soundKindOf(act: PlayerAct): UseKind {
  // 大型設施：坐上去（踏上甲板）噗一聲
  if (act.kind === 'grand') return 'sit';
  if (act.kind !== 'ride') return act.kind;
  return act.ride === 'swingset' ? 'swing' : 'sit';
}

/** 第一人稱看哪裡（遊樂器材：溜滑梯城堡看接下來要去的地方、鞦韆組看臉朝的方向） */
function camStyleOf(act: PlayerAct): CamStyle {
  if (act.kind === 'grand') return act.ride;
  if (act.kind === 'ride') return act.ride === 'slidecastle' ? 'slide' : act.ride === 'swingset' ? 'swing' : 'sit';
  return act.kind === 'slide' ? 'slide' : act.kind === 'lie' ? 'lie' : act.kind === 'swing' ? 'swing' : 'sit';
}

/** 走路速度（公尺／秒） */
const SPEED = 5.2;
/** 在飛船甲板上走路的速度（甲板小，走慢一點） */
const DECK_SPEED = 3.2;

/**
 * 在飛船的甲板上走一步（docs/plans/grand-rides.md 第 2.3 節）：方向鍵與搖桿（鏡頭的方向，換成甲板的局部方向）
 * 或點甲板設的目標；走到欄杆、舵輪停住。回傳這一步走了多遠（走路的動作用）
 */
function walkDeck(deck: { x: number; z: number; h: number }, act: { target: { x: number; z: number } | null }, dt: number): number {
  const ship = shipState(wallSec());
  const c = Math.cos(ship.heading);
  const s = Math.sin(ship.heading);
  const dir = moveInput();
  let lx = 0;
  let lz = 0;
  if (Math.hypot(dir.x, dir.z) > 0.05) {
    act.target = null;
    // 世界的方向換成甲板上的方向（和 worldToDeck 一樣的轉法，不加位移）
    lx = dir.x * c - dir.z * s;
    lz = dir.x * s + dir.z * c;
    const len = Math.hypot(lx, lz);
    if (len > 1) {
      lx /= len;
      lz /= len;
    }
  } else if (act.target) {
    const dx = act.target.x - deck.x;
    const dz = act.target.z - deck.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) act.target = null;
    else {
      lx = dx / d;
      lz = dz / d;
    }
  }
  if (lx === 0 && lz === 0) return 0;
  const step = DECK_SPEED * dt;
  const next = clampDeck(deck.x + lx * step, deck.z + lz * step);
  const moved = Math.hypot(next.x - deck.x, next.z - deck.z);
  // 被欄杆擋住、幾乎走不動時放棄目標
  if (act.target && moved < step * 0.05) act.target = null;
  if (moved > 1e-4) deck.h = lerpAngle(deck.h, Math.atan2(next.x - deck.x, next.z - deck.z), Math.min(1, dt * 12));
  deck.x = next.x;
  deck.z = next.z;
  return moved;
}
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
  /** 班級島：靠近巨大摩天輪、飛船繫留塔時鏡頭拉遠、往上看（docs/plans/grand-rides.md 第 5 節） */
  tall?: boolean;
}

export function Player({ avatar, obstacles, active, teacher = false, bounds = WALK_RADIUS, doors = DOORS, roomView = false, tall = false }: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  /** 腳下的圓形影子（在設施上、離地時藏起來） */
  const shadow = useRef<THREE.Mesh>(null);
  /** 這一格角色在世界的高度與方向（大型設施：雲霄飛車跟著車廂翻轉；其他是 null，照朝向轉） */
  const world = useRef<{ y: number; quat: readonly [number, number, number, number] | null }>({ y: 0, quat: null });
  const motion = useRef<MotionState>({ speed: 0 });
  /** 用家具時的抬高、縮放、傾斜（PoseWrap 每格讀） */
  const lift = useRef<PoseLift>(STANDING);
  /** 角色的身體（第一人稱時藏起來，鏡頭才不會在頭裡面） */
  const body = useRef<THREE.Group>(null);
  /** 鏡頭現在用的角度：慢慢轉到 orbit.yaw（🧭 回正時沿著弧轉過去，不會穿過角色） */
  const camYaw = useRef(orbit.yaw);
  /** 近拍或第一人稱中（<html> 加 cam-near：名牌、島上的牌子、氣泡太近會放很大，先藏起來） */
  const camNear = useRef(false);
  useEffect(() => () => document.documentElement.classList.remove('cam-near'), []);
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
    // 大型設施：角色離地多高、有沒有跟著車廂翻轉（docs/plans/grand-rides.md）
    sceneDebug.playerWorld = () => ({ y: world.current.y, quat: world.current.quat });
    return () => {
      sceneDebug.playerLift = null;
      sceneDebug.playerWorld = null;
    };
  }, []);
  const shadowTex = useMemo(() => blobShadowTexture(), []);
  /** 自己在公頻說的話：頭上的對話氣泡（和其他玩家同樣的樣式） */
  const bubble = usePresence((s) => (s.selfId ? (s.bubbles[s.selfId]?.text ?? null) : null));

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    let next = player.pos;
    let moving = false;
    world.current = { y: 0, quat: null };
    // 用家具（第 9 節優化）與班級島的遊樂器材（docs/plans/playground.md）：照時間軸擺在上面；按鈕、方向鍵、
    // 點地面都會起來（溜滑梯、溜滑梯城堡途中不行，溜完自己起來）
    if (player.act) {
      const act = player.act;
      const t = nowSec() - act.t0;
      // 飛船的甲板上可以走動（先走這一步，再照飛船的位置換成世界座標）
      const deckMoved = active && act.kind === 'grand' && act.deck ? walkDeck(act.deck, act, dt) : 0;
      const f = frameOf(act, { now: nowSec(), wall: wallSec() }, occupiedOf);
      // 音效（第 10 節第 ① 批）：坐下噗、爬梯子、咻、咚、鞦韆嘎
      if (lastActT.current.act !== act) lastActT.current = { act, t: -1 };
      for (const s of actSoundEvents(soundKindOf(act), lastActT.current.t, t)) ACT_SFX[s]();
      lastActT.current.t = t;
      const locked = lockedOf(act);
      if (locked) player.target = null;
      const dir = moveInput();
      if (f.done) stopUse(true);
      else if (active && !locked && (Math.hypot(dir.x, dir.z) > 0.05 || player.target)) stopUse();
      if (player.act) {
        // 位置設成座位的世界座標（位置訊息送出去才是座位）；移動與碰撞整段跳過
        player.pos = { x: f.x, z: f.z };
        player.heading = f.heading;
        motion.current.speed = deckMoved / Math.max(dt, 1e-3);
        motion.current.pose = f.pose;
        // 雲霄飛車：外層群組直接設高度與方向（跟著車廂翻轉），不抬高、不傾斜
        lift.current = f.quat ? STANDING : f;
        // 大型設施：鏡頭跟著抬高、腳下的影子藏起來（家具照舊）
        if (act.kind === 'grand') world.current = { y: f.y, quat: f.quat ?? null };
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
      // 方向鍵與搖桿跟著鏡頭：「上」是鏡頭看的方向（第 10.5 節）
      const dir = moveInput();
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
      const q = world.current.quat;
      if (q) {
        group.current.position.set(next.x, world.current.y, next.z);
        group.current.quaternion.set(q[0], q[1], q[2], q[3]);
      } else {
        group.current.position.set(next.x, 0, next.z);
        group.current.rotation.set(0, player.heading, 0);
      }
    }
    // 在設施上離地時藏起腳下的影子（不然影子跟著飛到半空）
    if (shadow.current) shadow.current.visible = world.current.y < 0.3;

    // 門口偵測：變更時才寫入 store
    const near = active && !teacher && !player.act ? nearestDoor(next, doors, DOOR_RANGE) : null;
    if (near !== lastNear.current) {
      lastNear.current = near;
      useUi.getState().setNearZone(near);
    }

    // 鏡頭慢慢跟上；換場景（進屋、出屋）的第一格直接跳到定位。距離都乘縮放倍率（滾輪、兩指捏合）
    const k = player.snapCamera ? 1 : 1 - Math.exp(-dt * 3.5);
    // 轉視角：鏡頭的角度沿著弧慢慢轉過去（換場景時直接跳到）
    camYaw.current = player.snapCamera ? orbit.yaw : normalizeYaw(camYaw.current + normalizeYaw(orbit.yaw - camYaw.current) * Math.min(1, dt * 8));
    const yaw = camYaw.current;
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
    // 用家具時換視角（第 10.5 節）：近拍、第一人稱照用家具的時間軸算；第一人稱藏起自己的角色、鏡頭直接跳到定位
    const view = useOrbit.getState().view;
    const act = player.act;
    const clock = { now: nowSec(), wall: wallSec() };
    const ac = act ? camFor((dt) => frameOf(act, { now: clock.now + dt, wall: clock.wall + dt }, occupiedOf), camStyleOf(act), view, yaw, zoom) : null;
    // 第一人稱在雲霄飛車上：鏡頭的上是車廂的上（迴圈時畫面翻過去）；其他時候是世界的上
    const up = ac?.up;
    if (up) camera.up.set(up.x, up.y, up.z);
    else if (camera.up.y !== 1) camera.up.set(0, 1, 0);
    if (body.current) body.current.visible = !(ac && view === 'first');
    if (camNear.current !== !!ac) {
      camNear.current = !!ac;
      document.documentElement.classList.toggle('cam-near', camNear.current);
    }
    if (ac) {
      const kk = ac.snap ? 1 : k;
      camera.position.lerp(new THREE.Vector3(ac.position.x, ac.position.y, ac.position.z), kk);
      lookAt.current.lerp(new THREE.Vector3(ac.target.x, ac.target.y, ac.target.z), kk);
      camera.lookAt(lookAt.current);
      return;
    }
    if (roomView) {
      // 屋裡：跟著角色，比島上近；看的點夾在房間裡；繞看的點轉 yaw
      const c = roomCamera(size.width / Math.max(size.height, 1), next, zoom, yaw);
      camera.position.lerp(new THREE.Vector3(c.position.x, c.position.y, c.position.z), k);
      lookAt.current.lerp(new THREE.Vector3(c.target.x, c.target.y, c.target.z), k);
      camera.lookAt(lookAt.current);
      return;
    }
    // 鏡頭跟隨：直式螢幕拉遠一點，才看得到左右兩邊的建築；繞角色轉 yaw（yaw 0 和以前一樣）。
    // 在大型設施上整個抬高角色離地的高度；班級島上靠近巨大摩天輪、繫留塔時拉遠、看的點抬高（docs/plans/grand-rides.md 第 5 節）
    const portrait = size.height > size.width * 1.1;
    const tv = tall && !act ? tallView(next) : { zoom: 1, lift: 0 };
    const c = followCamera(next, yaw, zoom * tv.zoom, portrait);
    const riseY = world.current.y;
    camera.position.lerp(new THREE.Vector3(c.position.x, c.position.y + riseY, c.position.z), k);
    lookAt.current.lerp(new THREE.Vector3(c.target.x, c.target.y + riseY + tv.lift, c.target.z), k);
    camera.lookAt(lookAt.current);
  });

  /** 寵物與走路特效每幀讀角色的位置、朝向、速度（它們在世界座標，不跟著角色的群組旋轉） */
  const getPos = () => group.current?.position;
  const getSpeed = () => motion.current.speed;
  return (
    <>
      <group ref={group}>
        <group ref={body}>
          <PoseWrap lift={lift}>{teacher ? <Teacher waving={false} /> : <Avatar config={avatar} motion={motion} />}</PoseWrap>
        </group>
        <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <planeGeometry args={[1.6, 1.6]} />
          <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
        </mesh>
        {bubble && (
          <Html position={[0, 2.3, 0]} distanceFactor={LABEL_DISTANCE_FACTOR} pointerEvents="none" zIndexRange={[20, 0]} wrapperClass="scene-label">
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
