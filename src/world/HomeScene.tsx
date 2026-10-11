/**
 * 自己的家第二期：屋子裡（docs/plans/home.md 第 8 節）。和島嶼共用同一個 3D 畫布，進屋時換成這個場景。
 * - 10×10 公尺的房間（房間的座標，中心在原點）：地板＋左、右、後三面牆（鏡頭在前上方，前面只有門口兩邊的矮牆）；
 *   前緣中間是門口的腳踏墊，站上去出現「回到島上」，往前走出去也會回到島上。
 * - 壁紙與地板照島主選的（顏色與花紋用程式畫，原創）；擺好的家具照島主的房間。
 * - 角色在長方形範圍裡走（家具擋路照島上）；鏡頭固定看整間房。
 */
import { useEffect, useMemo } from 'react';
import { useThree, useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Player, TargetMarker } from './Player';
import { YardDecor } from './Furniture';
import { DecorLayer } from './DecorLayer';
import { RemotePlayers } from './RemotePlayers';
import { inputDirection, player } from './input';
import { DOOR_MAT, ROOM_RECT, atRoomExit, onDoorMat } from './room';
import { sceneDebug } from './sceneDebug';
import { HOME_SPACE, type HomeState } from '../store/home';
import { decorObstacles } from '../store/yard';
import { leaveHome, useHome } from '../store/useHome';
import type { AvatarConfig } from '../store/save';
import { sfx } from '../audio/sfx';

/** 屋外的背景色（房間像一個打開前面的娃娃屋） */
const BACKDROP = '#3d2c22';
/** 牆高（公尺） */
const WALL_H = 3;
/** 門口兩邊的矮牆高度（不擋鏡頭） */
const FRONT_H = 0.4;
/** 牆厚 */
const WALL_T = 0.2;

/** 壁紙與地板的花紋 */
type Pattern = 'plain' | 'dots' | 'stripes' | 'stars' | 'planks' | 'tiles' | 'grass' | 'check';
interface SurfaceLook {
  base: string;
  pattern: Pattern;
  accent: string;
}

/** 壁紙的外觀（id 在 src/store/catalog.ts 的 WALLPAPERS） */
const WALL_LOOKS: Record<string, SurfaceLook> = {
  'wall.cream': { base: '#fbf1dc', pattern: 'plain', accent: '#fbf1dc' },
  'wall.mint': { base: '#c9f0dc', pattern: 'plain', accent: '#c9f0dc' },
  'wall.sky': { base: '#cfe6ff', pattern: 'plain', accent: '#cfe6ff' },
  'wall.pink': { base: '#ffdce6', pattern: 'dots', accent: '#ff9fbf' },
  'wall.stripe': { base: '#fff3b8', pattern: 'stripes', accent: '#ffd84d' },
  'wall.star': { base: '#2d3a7a', pattern: 'stars', accent: '#ffe066' },
};
/** 地板的外觀（id 在 src/store/catalog.ts 的 FLOORS） */
const FLOOR_LOOKS: Record<string, SurfaceLook> = {
  'floor.wood': { base: '#c89463', pattern: 'planks', accent: '#a8743f' },
  'floor.tile': { base: '#f4f4f0', pattern: 'tiles', accent: '#cfcfc6' },
  'floor.grass': { base: '#8fd16a', pattern: 'grass', accent: '#6cb84a' },
  'floor.carpet': { base: '#6f9de8', pattern: 'plain', accent: '#6f9de8' },
  'floor.check': { base: '#f4f4f0', pattern: 'check', accent: '#3a3a44' },
  'floor.pinkwood': { base: '#f2b3c6', pattern: 'planks', accent: '#d98aa3' },
};

/** 畫一條線 */
function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

/** 畫一張 128×128 的花紋（一張貼圖代表 2 公尺見方） */
function drawPattern(look: SurfaceLook): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = look.base;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = look.accent;
  g.strokeStyle = look.accent;
  switch (look.pattern) {
    case 'dots':
      for (const [x, y] of [
        [32, 32],
        [96, 32],
        [0, 96],
        [64, 96],
        [128, 96],
      ]) {
        g.beginPath();
        g.arc(x, y, 9, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'stripes':
      for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 14, 128);
      break;
    case 'stars':
      for (const [x, y, r] of [
        [24, 30, 7],
        [88, 18, 5],
        [64, 70, 8],
        [110, 96, 6],
        [20, 108, 5],
      ]) {
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const rr = i % 2 ? r * 0.45 : r;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
      }
      break;
    case 'planks':
      g.lineWidth = 3;
      for (let y = 0; y <= 128; y += 32) line(g, 0, y, 128, y);
      for (let row = 0; row < 4; row++) {
        const x = row % 2 ? 40 : 96;
        line(g, x, row * 32, x, row * 32 + 32);
      }
      break;
    case 'tiles':
      g.lineWidth = 4;
      for (let v = 0; v <= 128; v += 64) {
        line(g, 0, v, 128, v);
        line(g, v, 0, v, 128);
      }
      break;
    case 'grass':
      for (let i = 0; i < 40; i++) {
        const x = (i * 53) % 128;
        const y = (i * 29) % 128;
        g.fillRect(x, y, 3, 8);
      }
      break;
    case 'check':
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) if ((x + y) % 2) g.fillRect(x * 64, y * 64, 64, 64);
      break;
    case 'plain':
      break;
  }
  return c;
}

/** 壁紙或地板的貼圖（width、height 是貼的面有幾公尺；一張貼圖 2 公尺見方）；換了就丟掉舊的 */
function useSurface(look: SurfaceLook, width: number, height: number): THREE.CanvasTexture {
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(drawPattern(look));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(width / 2, height / 2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [look, width, height]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** 房間：地板、三面牆、門口兩邊的矮牆、踢腳板、後牆的窗戶、門口的腳踏墊；點地板走過去 */
function Room({ wall, floor, onFloorTap }: { wall: string; floor: string; onFloorTap: (x: number, z: number) => void }) {
  const W = ROOM_RECT.halfX * 2;
  const D = ROOM_RECT.halfZ * 2;
  const wallLook = WALL_LOOKS[wall] ?? WALL_LOOKS['wall.cream'];
  const floorLook = FLOOR_LOOKS[floor] ?? FLOOR_LOOKS['floor.wood'];
  const backTex = useSurface(wallLook, W, WALL_H);
  const sideTex = useSurface(wallLook, D, WALL_H);
  const floorTex = useSurface(floorLook, W, D);
  const tap = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onFloorTap(e.point.x, e.point.z);
  };
  /** 門口兩邊矮牆的長度 */
  const sideLen = ROOM_RECT.halfX - DOOR_MAT.halfX;
  return (
    <>
      {/* 地基與地板 */}
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[W + 0.6, 0.3, D + 0.6]} />
        <meshToonMaterial color="#8a6a4f" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onPointerDown={tap}>
        <planeGeometry args={[W, D]} />
        <meshToonMaterial map={floorTex} />
      </mesh>
      {/* 後牆與左右牆 */}
      <mesh position={[0, WALL_H / 2, -ROOM_RECT.halfZ - WALL_T / 2]} receiveShadow>
        <boxGeometry args={[W + WALL_T * 2, WALL_H, WALL_T]} />
        <meshToonMaterial map={backTex} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (ROOM_RECT.halfX + WALL_T / 2), WALL_H / 2, 0]} receiveShadow>
          <boxGeometry args={[WALL_T, WALL_H, D]} />
          <meshToonMaterial map={sideTex} />
        </mesh>
      ))}
      {/* 踢腳板 */}
      <mesh position={[0, 0.08, -ROOM_RECT.halfZ + 0.02]}>
        <boxGeometry args={[W, 0.16, 0.04]} />
        <meshToonMaterial color="#8a5a32" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (ROOM_RECT.halfX - 0.02), 0.08, 0]}>
          <boxGeometry args={[0.04, 0.16, D]} />
          <meshToonMaterial color="#8a5a32" />
        </mesh>
      ))}
      {/* 門口兩邊的矮牆（前面不畫高牆，鏡頭才看得到房間） */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (ROOM_RECT.halfX - sideLen / 2 + WALL_T / 2), FRONT_H / 2, ROOM_RECT.halfZ + WALL_T / 2]} castShadow receiveShadow>
          <boxGeometry args={[sideLen + WALL_T, FRONT_H, WALL_T]} />
          <meshToonMaterial color="#d9b48a" />
        </mesh>
      ))}
      {/* 後牆的窗戶：木框、天空、十字窗櫺 */}
      <group position={[2.6, 1.7, -ROOM_RECT.halfZ + 0.01]}>
        <mesh>
          <boxGeometry args={[1.8, 1.3, 0.06]} />
          <meshToonMaterial color="#8a5a32" />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <boxGeometry args={[1.6, 1.1, 0.02]} />
          <meshBasicMaterial color="#a8dcff" />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <boxGeometry args={[0.06, 1.1, 0.02]} />
          <meshToonMaterial color="#8a5a32" />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <boxGeometry args={[1.6, 0.06, 0.02]} />
          <meshToonMaterial color="#8a5a32" />
        </mesh>
      </group>
      {/* 門口的腳踏墊 */}
      <mesh position={[DOOR_MAT.x, 0.015, DOOR_MAT.z]} receiveShadow onPointerDown={tap}>
        <boxGeometry args={[DOOR_MAT.halfX * 2 - 0.1, 0.03, DOOR_MAT.halfZ * 2 - 0.1]} />
        <meshToonMaterial color="#9b5a2e" />
      </mesh>
      <mesh position={[DOOR_MAT.x, 0.032, DOOR_MAT.z]}>
        <boxGeometry args={[DOOR_MAT.halfX * 2 - 0.5, 0.01, DOOR_MAT.halfZ * 2 - 0.45]} />
        <meshToonMaterial color="#e0a96b" />
      </mesh>
    </>
  );
}

/** e2e 用：把房間的座標換成畫面座標（sceneDebug.project） */
function RoomProbe() {
  const { camera, gl } = useThree();
  useEffect(() => {
    sceneDebug.project = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    return () => {
      sceneDebug.project = null;
    };
  }, [camera, gl]);
  return null;
}

/**
 * 每一格畫面：站在腳踏墊上就出現「回到島上」（onMat）；站在前緣的門口往前推就直接走出去。
 * 離開這個場景時清掉腳踏墊的狀態
 */
function DoorProbe({ active }: { active: boolean }) {
  useFrame(() => {
    const mat = active && onDoorMat(player.pos);
    if (mat !== useHome.getState().onMat) useHome.setState({ onMat: mat });
    if (active && atRoomExit(player.pos, inputDirection())) {
      sfx.door();
      leaveHome();
    }
  });
  useEffect(() => () => useHome.setState({ onMat: false }), []);
  return null;
}

export function HomeScene({
  avatar,
  home,
  active,
  shadows,
  gm = false,
}: {
  /** 自己的角色外觀（熊熊老師畫熊熊老師） */
  avatar: AvatarConfig;
  /** 要畫的房間（自己的家畫本機存檔的，別人的家畫伺服器給的） */
  home: HomeState;
  /** 可以走動（選單打開時不行） */
  active: boolean;
  shadows: boolean;
  /** 熊熊老師進屋 */
  gm?: boolean;
}) {
  /** 自己的家（不是朋友的家、不是熊熊老師）可以佈置 */
  const own = useHome((s) => s.houseKey === 'mine');
  const canDeco = own && !gm && active;
  /** 擋路的家具（地毯可以走過去） */
  const obstacles = useMemo(() => decorObstacles(home.items, HOME_SPACE), [home.items]);
  /** 點地板：走過去（範圍外的會被夾回房間裡） */
  const onFloorTap = (x: number, z: number) => {
    if (!active) return;
    player.target = { x, z };
    player.autoEnter = null;
  };
  return (
    <>
      <color attach="background" args={[BACKDROP]} />
      <hemisphereLight args={['#fff6e6', '#8a6a4f', 1.15]} />
      <directionalLight
        position={[4, 10, 6]}
        intensity={1.5}
        color="#fff4e0"
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-far={30}
        shadow-bias={-0.0006}
      />
      <RoomProbe />
      <Room wall={home.wall} floor={home.floor} onFloorTap={onFloorTap} />
      <YardDecor items={home.items} space={HOME_SPACE} />
      {canDeco && <DecorLayer space={HOME_SPACE} />}
      <Player avatar={avatar} obstacles={obstacles} active={active} teacher={gm} bounds={ROOM_RECT} doors={[]} roomView />
      <TargetMarker />
      {/* 屋裡的其他人（朋友、熊熊老師；自己的家第二期） */}
      <RemotePlayers place="home" />
      <DoorProbe active={active} />
    </>
  );
}
