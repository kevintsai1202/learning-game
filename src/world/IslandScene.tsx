/**
 * 島嶼場景：天空、海、地面、建築、熊熊老師、玩家角色、同房間的其他玩家。
 * mode：play 可操作；menu 背景顯示（選單打開時）；attract 標題畫面鏡頭環繞。
 * look（L5）：班級島白天＋班級旗子；有班級的孩子在自己的島是黃昏；自己的島有小屋與門牌（小屋地上的樹拿掉）。
 * gm（老師 GM 的 G2）：老師以熊熊老師進島，自己畫成熊熊老師、點建築只走到門口不進去；
 * 島上有熊熊老師（老師自己，或孩子看到老師進島）時，廣場上的 NPC 熊熊老師藏起來。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { BUILDINGS } from './Buildings';
import { StaticMerge } from './StaticMerge';
import { Clouds, Dock, Flowers, Fountain, Ground, Sea, Trees } from './Nature';
import { Player, TargetMarker } from './Player';
import { RemotePlayers } from './RemotePlayers';
import { Teacher } from './Teacher';
import { TEACHER_POS, ZONES, doorOf } from './layout';
import { placeFlowers, placeTrees, worldObstacles } from './scenery';
import { player } from './input';
import type { ZoneId } from '../store/useUi';
import type { AvatarConfig } from '../store/save';
import { sfx } from '../audio/sfx';
import { teacherTalk } from '../ui/teacherTips';
import { ClassFlag, IslandPlate, KidHouse } from './IslandLandmarks';
import { treesAway, type SceneLook } from './landmarks';
import { FLAGPOLE, HOUSE, PLATE } from './layout';
import { usePresence } from '../online/usePresence';
import { sceneDebug } from './sceneDebug';
import { YardDecor, YardGrid } from './Furniture';
import { useYardEdit } from '../store/useYardEdit';
import { YARD_RADIUS, yardObstacles } from '../store/yard';
import { useGame } from '../store/useGame';
import { useRealtime } from '../online/realtimeClient';
import { useGm } from '../online/gmClient';
import { shownYard, useHostYard } from '../online/useHostYard';

/** 天空與燈光（L5）：白天是原本的樣子；黃昏是暖橘的地平線、偏紫的天頂、低而偏橘的太陽 */
const SKY = {
  day: { top: '#4fc0ff', horizon: '#dff6ff', fog: '#dff6ff', hemiSky: '#e6f6ff', hemiGround: '#9bd27a', hemi: 1.25, sun: '#ffffff', sunPos: [18, 32, 16], sunIntensity: 1.7 },
  sunset: { top: '#5d6bd8', horizon: '#ffb58a', fog: '#ffc7a0', hemiSky: '#ffd8b5', hemiGround: '#8fb86a', hemi: 1.05, sun: '#ffb46b', sunPos: [34, 14, 8], sunIntensity: 1.55 },
} as const;

/** 漸層天空球（頂端較藍、地平線較淺；黃昏時頂端偏紫、地平線暖橘） */
function SkyDome({ sky }: { sky: SceneLook['sky'] }) {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(320, 32, 16);
    const top = new THREE.Color(SKY[sky].top);
    const horizon = new THREE.Color(SKY[sky].horizon);
    const colors: number[] = [];
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(0, pos.getY(i) / 320);
      const c = horizon.clone().lerp(top, Math.pow(h, 0.6));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [sky]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

/** 標題畫面的環繞鏡頭 */
/** e2e 用：把 3D 座標換成畫面座標（sceneDebug.project） */
function SceneProbe() {
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

function AttractCamera() {
  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.08;
    state.camera.position.set(Math.sin(t) * 38, 20, Math.cos(t) * 38);
    state.camera.lookAt(0, 0, -2);
  });
  return null;
}

/** 預設角色（還沒選角色時在島上走的是小黑熊） */
const DEFAULT_AVATAR: AvatarConfig = { animal: 'bear', color: '#8b5a2b', hat: null };

export function IslandScene({
  mode,
  avatar,
  shadows,
  look,
  gm = false,
}: {
  mode: 'play' | 'menu' | 'attract';
  avatar: AvatarConfig | null;
  shadows: boolean;
  look: SceneLook;
  /** 老師以熊熊老師進島 */
  gm?: boolean;
}) {
  /** 島上有別人是熊熊老師（老師進島了；在建築裡的不算） */
  const teacherHere = usePresence((s) => Object.values(s.members).some((m) => m.role === 'teacher' && m.id !== s.selfId && m.zone === null));
  /** 廣場上的 NPC 熊熊老師要不要藏起來：真的熊熊老師在島上時（標題畫面不藏） */
  const hideNpc = mode !== 'attract' && (gm || teacherHere);
  useEffect(() => {
    sceneDebug.npcTeacher = !hideNpc;
  }, [hideNpc]);
  const allTrees = useMemo(() => placeTrees(), []);
  const hasHome = look.home !== null;
  const hasFlag = look.flag !== null;
  /** 自己的島空出小屋與院子（自己的家，docs/plans/home.md；其他島的樹一棵不動） */
  const yardClear = YARD_RADIUS + 0.6;
  const trees = useMemo(() => (hasHome ? treesAway(allTrees, HOUSE, yardClear) : allTrees), [allTrees, hasHome, yardClear]);
  const allFlowers = useMemo(() => placeFlowers(), []);
  const flowers = useMemo(() => (hasHome ? allFlowers.filter((f) => Math.hypot(f.x - HOUSE.x, f.z - HOUSE.z) > yardClear) : allFlowers), [allFlowers, hasHome, yardClear]);
  /** 院子：自己的島畫本機存檔的，別人的島（拜訪朋友、熊熊老師去孩子的島）畫伺服器給的；班級島沒有 */
  const localYard = useGame((s) => s.profile()?.yard);
  const hostYard = useHostYard((s) => s.items);
  const kidVisiting = useRealtime((s) => s.visiting !== null);
  const gmVisiting = useGm((s) => s.visiting !== null);
  const savedYard = hasHome && mode !== 'attract' ? shownYard({ ownIsland: true, visiting: gm ? gmVisiting : kidVisiting, local: localYard, host: hostYard }) : null;
  /** 佈置模式（自己的家）：畫正在改的院子與格子；角色不走路、點地面與建築沒有作用 */
  const editing = useYardEdit((s) => s.edit);
  const yard = editing ? editing.items : savedYard;
  /** 碰撞：建築、噴水池、老師、樹，加上這座島的地標（小屋、門牌、旗桿） */
  const obstacles = useMemo(
    () => [
      ...worldObstacles(trees),
      ...(hasHome ? [{ x: HOUSE.x, z: HOUSE.z, r: HOUSE.radius }, { x: PLATE.x, z: PLATE.z, r: 0.5 }] : []),
      ...(hasFlag ? [{ x: FLAGPOLE.x, z: FLAGPOLE.z, r: 0.5 }] : []),
      // 院子裡擋路的家具（別人的院子也擋，不會走進島主的鞦韆）
      ...yardObstacles(yard ?? []),
    ],
    [trees, hasHome, hasFlag, yard],
  );
  const sky = SKY[look.sky];
  const interactive = mode === 'play' && !editing;
  const sun = useRef<THREE.DirectionalLight>(null);

  /** 點地面：走過去 */
  const onGroundTap = (x: number, z: number) => {
    if (!interactive) return;
    player.target = { x, z };
    player.autoEnter = null;
  };

  /** 點建築：走到門口後自動進去 */
  const onBuildingTap = (id: ZoneId) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    sfx.tap();
    const zone = ZONES.find((z) => z.id === id)!;
    player.target = doorOf(zone);
    // 熊熊老師不進建築，只走到門口
    player.autoEnter = gm ? null : id;
  };

  return (
    <>
      <SkyDome sky={look.sky} />
      {/* key：換天空時重建霧與半球光（它們的顏色是建構參數） */}
      <fog key={`fog-${look.sky}`} attach="fog" args={[sky.fog, 70, 190]} />
      <hemisphereLight key={`hemi-${look.sky}`} args={[sky.hemiSky, sky.hemiGround, sky.hemi]} />
      <directionalLight
        ref={sun}
        position={[...sky.sunPos]}
        color={sky.sun}
        intensity={sky.sunIntensity}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-far={90}
        shadow-bias={-0.0006}
      />
      <Sea />
      <SceneProbe />
      <Ground onGroundTap={onGroundTap} />
      <Fountain />
      <Trees spots={trees} />
      <Flowers spots={flowers} />
      <Clouds />
      <Dock />
      {look.flag && <ClassFlag name={look.flag.name} color={look.flag.color} />}
      {look.home && <KidHouse name={look.home.name} label={!editing} />}
      {look.home && <IslandPlate name={look.home.name} />}
      {yard && <YardDecor items={yard} />}
      {editing && <YardGrid edit={editing} />}
      {ZONES.map((z) => {
        const B = BUILDINGS[z.id];
        return (
          <group
            key={z.id}
            position={[z.x, 0, z.z]}
            rotation={[0, z.rotY, 0]}
            onPointerDown={onBuildingTap(z.id)}
            onPointerOver={() => interactive && (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <StaticMerge>
              <B />
            </StaticMerge>
          </group>
        );
      })}
      {!hideNpc && (
        <group
          position={[TEACHER_POS.x, 0, TEACHER_POS.z]}
          rotation={[0, -0.3, 0]}
          onPointerDown={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            teacherTalk();
          }}
        >
          <Teacher />
        </group>
      )}
      {mode === 'attract' ? (
        <AttractCamera />
      ) : (
        <>
          <Player avatar={avatar ?? DEFAULT_AVATAR} obstacles={obstacles} active={interactive} teacher={gm} decorating={!!editing} />
          <TargetMarker />
          {/* 同房間的其他玩家（沒有人在線上時什麼都不畫） */}
          <RemotePlayers />
        </>
      )}
    </>
  );
}
