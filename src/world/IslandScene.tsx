/**
 * 島嶼場景：天空、海、地面、建築、熊熊老師、玩家角色。
 * mode：play 可操作；menu 背景顯示（選單打開時）；attract 標題畫面鏡頭環繞。
 */
import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { BUILDINGS } from './Buildings';
import { StaticMerge } from './StaticMerge';
import { Clouds, Dock, Flowers, Fountain, Ground, Sea, Trees } from './Nature';
import { Player, TargetMarker } from './Player';
import { Teacher } from './Teacher';
import { TEACHER_POS, ZONES, doorOf } from './layout';
import { placeFlowers, placeTrees, worldObstacles } from './scenery';
import { player } from './input';
import type { ZoneId } from '../store/useUi';
import type { AvatarConfig } from '../store/save';
import { sfx } from '../audio/sfx';
import { teacherTalk } from '../ui/teacherTips';

/** 漸層天空球（頂端較藍、地平線較淺） */
function SkyDome() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(320, 32, 16);
    const top = new THREE.Color('#4fc0ff');
    const horizon = new THREE.Color('#dff6ff');
    const colors: number[] = [];
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(0, pos.getY(i) / 320);
      const c = horizon.clone().lerp(top, Math.pow(h, 0.6));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, []);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

/** 標題畫面的環繞鏡頭 */
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

export function IslandScene({ mode, avatar, shadows }: { mode: 'play' | 'menu' | 'attract'; avatar: AvatarConfig | null; shadows: boolean }) {
  const trees = useMemo(() => placeTrees(), []);
  const flowers = useMemo(() => placeFlowers(), []);
  const obstacles = useMemo(() => worldObstacles(trees), [trees]);
  const interactive = mode === 'play';
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
    player.autoEnter = id;
  };

  return (
    <>
      <SkyDome />
      <fog attach="fog" args={['#dff6ff', 70, 190]} />
      <hemisphereLight args={['#e6f6ff', '#9bd27a', 1.25]} />
      <directionalLight
        ref={sun}
        position={[18, 32, 16]}
        intensity={1.7}
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
      <Ground onGroundTap={onGroundTap} />
      <Fountain />
      <Trees spots={trees} />
      <Flowers spots={flowers} />
      <Clouds />
      <Dock />
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
      {mode === 'attract' ? (
        <AttractCamera />
      ) : (
        <>
          <Player avatar={avatar ?? DEFAULT_AVATAR} obstacles={obstacles} active={interactive} />
          <TargetMarker />
        </>
      )}
    </>
  );
}
