/**
 * 島嶼場景：天空、海、地面、建築、熊熊老師、玩家角色、同房間的其他玩家。
 * mode：play 可操作；menu 背景顯示（選單打開時）；attract 標題畫面鏡頭環繞。
 * look（L5）：班級島白天＋班級旗子；有班級的孩子在自己的島是黃昏；自己的島有小屋與門牌（小屋地上的樹拿掉）。
 * gm（老師 GM 的 G2）：老師以熊熊老師進島，自己畫成熊熊老師、點建築只走到門口不進去；
 * 島上有熊熊老師（老師自己，或孩子看到老師進島）時，廣場上的 NPC 熊熊老師藏起來。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { YardDecor } from './Furniture';
import { DecorLayer } from './DecorLayer';
import { HOUSE_TREE_CLEAR, YARD_SPACE, yardObstacles } from '../store/yard';
import { occluders, type Occluder } from './occlusion';
import { fadeGroup } from './fadeGroup';
import { UseProbe, useLiveMap } from './UseLayer';
import { useGame } from '../store/useGame';
import { useRealtime } from '../online/realtimeClient';
import { useGm } from '../online/gmClient';
import { shownYard, useHostYard } from '../online/useHostYard';
import { HOUSE_DOOR_RANGE, houseDoor } from './room';
import { useHome } from '../store/useHome';
import { isTap, resetYaw } from './cameraOrbit';

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
/** 擋住角色時要隱形的建築群組（id → three 的 group）；建築在 ZONES，自己的島多一棟小屋（house） */
const occluderGroups = new Map<string, THREE.Group>();
function setOccluderGroup(id: string, g: THREE.Group | null): void {
  if (g) occluderGroups.set(id, g);
  else occluderGroups.delete(id);
}

/** 建築的包圍球：球心在建築中間高度，半徑比碰撞半徑大一點（挑戰塔比較高，球大一點） */
function occluderSpheres(hasHome: boolean): Occluder[] {
  const out: Occluder[] = ZONES.map((z) => ({ id: z.id, x: z.x, y: z.id === 'tower' ? 4 : 2.5, z: z.z, r: z.radius + (z.id === 'tower' ? 2 : 1) }));
  if (hasHome) out.push({ id: 'house', x: HOUSE.x, y: 2, z: HOUSE.z, r: HOUSE.radius + 1 });
  return out;
}

/**
 * 擋住角色的建築變半透明（第 9 節優化；原本是整棟隱形）：每一格畫面算鏡頭到角色頭頂的線段穿過哪些建築，
 * 那幾棟的材質換成半透明副本（fadeGroup），走出來換回原材質。sceneDebug.hiddenZones 給 e2e 與點建築的判斷用
 * （半透明的建築點了不會進去，點擊穿過去點到地面）
 */
function OcclusionHider({ hasHome, onChange }: { hasHome: boolean; /** 半透明的建築換了（小屋的「○○的家」牌子是 DOM，要另外變淡） */ onChange: (hidden: string[]) => void }) {
  const { camera } = useThree();
  const spheres = useMemo(() => occluderSpheres(hasHome), [hasHome]);
  const last = useRef('');
  useFrame(() => {
    const hidden = occluders(camera.position, { x: player.pos.x, y: 1, z: player.pos.z }, spheres);
    const key = hidden.join(',');
    if (key === last.current) return;
    last.current = key;
    sceneDebug.hiddenZones = hidden;
    for (const [id, g] of occluderGroups) fadeGroup(g, hidden.includes(id));
    onChange(hidden);
  });
  // 卸下（標題畫面、換場景）時換回原材質：島嶼場景可能還在（標題畫面的島）
  useEffect(() => {
    sceneDebug.buildingLook = (id) => {
      const g = occluderGroups.get(id);
      if (!g) return null;
      let opacity = 1;
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && o.visible && !Array.isArray(m)) opacity = Math.min(opacity, m.opacity);
      });
      return { visible: g.visible, opacity };
    };
    return () => {
      sceneDebug.hiddenZones = [];
      sceneDebug.buildingLook = null;
      for (const g of occluderGroups.values()) fadeGroup(g, false);
    };
  }, []);
  return null;
}

/**
 * 小屋門口（自己的家第二期）：每一格畫面看角色是不是站在小屋門口（出現「進去嗎？」）。
 * 熊熊老師也算（老師可以進孩子的家）；離開島嶼場景時清掉
 */
function HouseDoorProbe({ active }: { active: boolean }) {
  useFrame(() => {
    const d = houseDoor();
    const near = active && Math.hypot(player.pos.x - d.x, player.pos.z - d.z) <= HOUSE_DOOR_RANGE;
    if (near !== useHome.getState().nearDoor) useHome.setState({ nearDoor: near });
  });
  useEffect(() => () => useHome.setState({ nearDoor: false }), []);
  return null;
}

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
  /** 島上有別人是熊熊老師（老師進島了；在孩子的屋子裡也算，NPC 不會跑回廣場） */
  const teacherHere = usePresence((s) => Object.values(s.members).some((m) => m.role === 'teacher' && m.id !== s.selfId));
  /** 廣場上的 NPC 熊熊老師要不要藏起來：真的熊熊老師在島上時（標題畫面不藏） */
  const hideNpc = mode !== 'attract' && (gm || teacherHere);
  useEffect(() => {
    sceneDebug.npcTeacher = !hideNpc;
  }, [hideNpc]);
  // 回到島上（出屋、答完題）時視角回正（第 10.5 節）
  useEffect(() => resetYaw(), []);
  const allTrees = useMemo(() => placeTrees(), []);
  const hasHome = look.home !== null;
  const hasFlag = look.flag !== null;
  /** 自己的島空出小屋周圍（自己的家，docs/plans/home.md；其他島的樹一棵不動；擺家具的格子用同一個半徑） */
  const yardClear = HOUSE_TREE_CLEAR;
  const trees = useMemo(() => (hasHome ? treesAway(allTrees, HOUSE, yardClear) : allTrees), [allTrees, hasHome, yardClear]);
  const allFlowers = useMemo(() => placeFlowers(), []);
  const flowers = useMemo(() => (hasHome ? allFlowers.filter((f) => Math.hypot(f.x - HOUSE.x, f.z - HOUSE.z) > yardClear) : allFlowers), [allFlowers, hasHome, yardClear]);
  /** 島上的擺設：自己的島畫本機存檔的，別人的島（拜訪朋友、熊熊老師去孩子的島）畫伺服器給的；班級島沒有 */
  const localYard = useGame((s) => s.profile()?.yard);
  const hostYard = useHostYard((s) => s.items);
  const kidVisiting = useRealtime((s) => s.visiting !== null);
  const gmVisiting = useGm((s) => s.visiting !== null);
  const visiting = gm ? gmVisiting : kidVisiting;
  const yard = hasHome && mode !== 'attract' ? shownYard({ ownIsland: true, visiting, local: localYard, host: hostYard }) : null;
  /** 可以佈置：自己的島、不是拜訪別人、不是熊熊老師、在島上玩（動森做法：角色面前出現預覽） */
  const canDeco = hasHome && !visiting && !gm && mode === 'play';
  /** 島上正在用的家具（開關、沙堡、有人在盪的鞦韆；第 9 節優化） */
  const liveYard = useLiveMap('yard');
  /** 小屋擋住角色而半透明（「○○的家」牌子是 DOM，不會跟著 3D 的材質，要另外變淡） */
  const [houseHidden, setHouseHidden] = useState(false);
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
  const interactive = mode === 'play';
  const sun = useRef<THREE.DirectionalLight>(null);

  /** 點地面：走過去 */
  const onGroundTap = (x: number, z: number) => {
    if (!interactive) return;
    player.target = { x, z };
    player.autoEnter = null;
  };

  /** 點建築：走到門口後自動進去（擋住角色而隱形的建築不算；放開、沒拖動才算，第 10.5 節） */
  const onBuildingTap = (id: ZoneId) => (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || sceneDebug.hiddenZones.includes(id)) return;
    e.stopPropagation();
    if (!isTap(e.delta)) return;
    sfx.tap();
    const zone = ZONES.find((z) => z.id === id)!;
    player.target = doorOf(zone);
    // 熊熊老師不進建築，只走到門口
    player.autoEnter = gm ? null : id;
  };

  /** 點小屋：走到門口後自動進屋（熊熊老師也可以；擋住角色而隱形時不算；放開、沒拖動才算） */
  const onHouseTap = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || sceneDebug.hiddenZones.includes('house')) return;
    e.stopPropagation();
    if (!isTap(e.delta)) return;
    sfx.tap();
    player.target = houseDoor();
    player.autoEnter = 'home';
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
      {look.home && (
        <group
          ref={(g) => setOccluderGroup('house', g)}
          onClick={onHouseTap}
          onPointerOver={() => interactive && (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <KidHouse name={look.home.name} labelFaded={houseHidden} />
        </group>
      )}
      {look.home && mode !== 'attract' && <HouseDoorProbe active={interactive} />}
      {look.home && <IslandPlate name={look.home.name} />}
      {yard && <YardDecor items={yard} live={liveYard} />}
      {yard && mode !== 'attract' && <UseProbe items={yard} place="yard" active={interactive} />}
      {canDeco && <DecorLayer space={YARD_SPACE} />}
      {mode !== 'attract' && <OcclusionHider hasHome={hasHome} onChange={(h) => setHouseHidden(h.includes('house'))} />}
      {ZONES.map((z) => {
        const B = BUILDINGS[z.id];
        return (
          <group
            key={z.id}
            ref={(g) => setOccluderGroup(z.id, g)}
            position={[z.x, 0, z.z]}
            rotation={[0, z.rotY, 0]}
            onClick={onBuildingTap(z.id)}
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
          onClick={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            if (isTap(e.delta)) teacherTalk();
          }}
        >
          <Teacher />
        </group>
      )}
      {mode === 'attract' ? (
        <AttractCamera />
      ) : (
        <>
          <Player avatar={avatar ?? DEFAULT_AVATAR} obstacles={obstacles} active={interactive} teacher={gm} />
          <TargetMarker />
          {/* 同房間的其他玩家（沒有人在線上時什麼都不畫） */}
          <RemotePlayers items={yard ?? []} />
        </>
      )}
    </>
  );
}
