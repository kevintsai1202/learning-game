/**
 * 院子的家具（自己的家第一期，docs/plans/home.md 第 3.2 節）：21 種低多邊形模型，全部用程式畫（原創）。
 * 每樣家具佔一格（約 1 公尺見方），模型以格子中心為原點、正面朝 +z（轉方向由外層 group 處理）。
 * 整個院子包在 StaticMerge 裡合併網格（平板上少很多 draw call）；院子換了就用新的 key 重新合併。
 * 風車的扇葉會轉（標成 dynamic，不合併）。
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { StaticMerge } from './StaticMerge';
import { cellToWorld, visibleYard, yardCells, type YardEdit, type YardItem } from '../store/yard';
import { decorAct } from '../store/useYardEdit';

/** 常用的顏色 */
const WOOD = '#b0773f';
const WOOD_DARK = '#7a4a24';
const LEAF = '#4aa84d';
const LEAF_DARK = '#2f8f5b';
const STONE = '#c9c3b5';
const WHITE = '#fffaf0';

/** 一個方塊 */
function Box({ p, s, c }: { p: [number, number, number]; s: [number, number, number]; c: string }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshToonMaterial color={c} />
    </mesh>
  );
}

/** 一根圓柱（rt 上半徑、rb 下半徑、h 高；n 是邊數） */
function Cyl({ p, rt, rb, h, c, n = 10 }: { p: [number, number, number]; rt: number; rb: number; h: number; c: string; n?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, n]} />
      <meshToonMaterial color={c} />
    </mesh>
  );
}

/** 一顆球 */
function Ball({ p, r, c }: { p: [number, number, number]; r: number; c: string }) {
  return (
    <mesh position={p} castShadow>
      <sphereGeometry args={[r, 10, 8]} />
      <meshToonMaterial color={c} />
    </mesh>
  );
}

/** 一個圓錐 */
function Cone({ p, r, h, c, n = 8 }: { p: [number, number, number]; r: number; h: number; c: string; n?: number }) {
  return (
    <mesh position={p} castShadow>
      <coneGeometry args={[r, h, n]} />
      <meshToonMaterial color={c} />
    </mesh>
  );
}

/** 花圃：木框裡一排小花 */
function FlowerBed({ color }: { color: string }) {
  return (
    <>
      <Box p={[0, 0.08, 0]} s={[0.9, 0.16, 0.6]} c={WOOD} />
      <Box p={[0, 0.17, 0]} s={[0.8, 0.04, 0.5]} c="#6b4a2f" />
      {[-0.28, 0, 0.28].map((x) =>
        [-0.12, 0.12].map((z) => (
          <group key={`${x},${z}`} position={[x, 0.2, z]}>
            <Cyl p={[0, 0.08, 0]} rt={0.015} rb={0.015} h={0.16} c={LEAF} n={5} />
            <Ball p={[0, 0.18, 0]} r={0.07} c={color} />
          </group>
        )),
      )}
    </>
  );
}

/** 一樣家具的模型（不認得的 id 不畫） */
export function FurnitureModel({ id }: { id: string }) {
  switch (id) {
    case 'decor.bed-red':
      return <FlowerBed color="#e8455a" />;
    case 'decor.bed-yellow':
      return <FlowerBed color="#f5c518" />;
    case 'decor.tulip':
      return (
        <>
          {[
            [-0.2, -0.1, '#ff6f91'],
            [0.15, -0.15, '#ffd23f'],
            [0, 0.18, '#b388ff'],
          ].map(([x, z, c]) => (
            <group key={String(c)} position={[x as number, 0, z as number]}>
              <Cyl p={[0, 0.18, 0]} rt={0.02} rb={0.02} h={0.36} c={LEAF} n={5} />
              <Cone p={[0, 0.42, 0]} r={0.08} h={0.16} c={c as string} n={6} />
            </group>
          ))}
        </>
      );
    case 'decor.grass':
      return (
        <>
          {[
            [-0.15, 0],
            [0.12, 0.1],
            [0.05, -0.15],
          ].map(([x, z]) => (
            <Cone key={`${x},${z}`} p={[x, 0.16, z]} r={0.16} h={0.32} c={LEAF} n={5} />
          ))}
        </>
      );
    case 'decor.mushroom':
      return (
        <>
          <Cyl p={[0, 0.15, 0]} rt={0.07} rb={0.09} h={0.3} c={WHITE} />
          <mesh position={[0, 0.3, 0]} castShadow>
            <sphereGeometry args={[0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshToonMaterial color="#e8455a" />
          </mesh>
          <Ball p={[0.1, 0.45, 0.08]} r={0.035} c={WHITE} />
          <Ball p={[-0.09, 0.47, -0.05]} r={0.03} c={WHITE} />
        </>
      );
    case 'decor.stone':
      return (
        <>
          {[
            [-0.2, -0.2, 0.22],
            [0.2, 0.15, 0.25],
          ].map(([x, z, r]) => (
            <mesh key={`${x},${z}`} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[r, 9]} />
              <meshToonMaterial color={STONE} />
            </mesh>
          ))}
        </>
      );
    case 'decor.tree':
      return (
        <>
          <Cyl p={[0, 0.35, 0]} rt={0.08} rb={0.11} h={0.7} c={WOOD_DARK} />
          <Ball p={[0, 0.95, 0]} r={0.38} c={LEAF} />
          <Ball p={[0.18, 0.8, 0.1]} r={0.25} c={LEAF_DARK} />
        </>
      );
    case 'decor.bush':
      return (
        <>
          <Ball p={[0, 0.25, 0]} r={0.3} c={LEAF_DARK} />
          <Ball p={[0.2, 0.2, 0.1]} r={0.2} c={LEAF} />
          <Ball p={[-0.18, 0.2, -0.05]} r={0.22} c={LEAF} />
        </>
      );
    case 'decor.fence':
      return (
        <>
          {[-0.4, 0, 0.4].map((x) => (
            <Box key={x} p={[x, 0.3, 0]} s={[0.1, 0.6, 0.08]} c={WOOD} />
          ))}
          <Box p={[0, 0.42, 0]} s={[0.95, 0.08, 0.05]} c={WOOD} />
          <Box p={[0, 0.2, 0]} s={[0.95, 0.08, 0.05]} c={WOOD} />
        </>
      );
    case 'decor.bench':
      return (
        <>
          <Box p={[0, 0.32, 0]} s={[0.9, 0.06, 0.36]} c={WOOD} />
          <Box p={[0, 0.58, -0.16]} s={[0.9, 0.3, 0.05]} c={WOOD} />
          {[-0.38, 0.38].map((x) => (
            <Box key={x} p={[x, 0.16, 0]} s={[0.06, 0.32, 0.32]} c={WOOD_DARK} />
          ))}
        </>
      );
    case 'decor.picnic':
      return (
        <>
          <Box p={[0, 0.5, 0]} s={[0.9, 0.06, 0.5]} c={WOOD} />
          {[-0.36, 0.36].map((x) => (
            <Box key={x} p={[x, 0.25, 0]} s={[0.06, 0.5, 0.4]} c={WOOD_DARK} />
          ))}
          {[-0.4, 0.4].map((z) => (
            <Box key={z} p={[0, 0.28, z]} s={[0.9, 0.05, 0.16]} c={WOOD} />
          ))}
          <Box p={[0.15, 0.56, 0.05]} s={[0.22, 0.06, 0.16]} c="#e8455a" />
        </>
      );
    case 'decor.parasol':
      return (
        <>
          <Cyl p={[0, 0.6, 0]} rt={0.025} rb={0.025} h={1.2} c={WHITE} n={6} />
          <Cone p={[0, 1.25, 0]} r={0.55} h={0.3} c="#ff8a3d" n={8} />
          <Cyl p={[0, 0.04, 0]} rt={0.18} rb={0.2} h={0.08} c={STONE} />
        </>
      );
    case 'decor.lamp':
      return (
        <>
          <Cyl p={[0, 0.75, 0]} rt={0.04} rb={0.06} h={1.5} c="#3b3a5e" n={8} />
          <Box p={[0, 1.58, 0]} s={[0.22, 0.22, 0.22]} c="#fff3b0" />
          <Cone p={[0, 1.76, 0]} r={0.2} h={0.16} c="#3b3a5e" n={4} />
          <Cyl p={[0, 0.04, 0]} rt={0.14} rb={0.16} h={0.08} c="#3b3a5e" n={8} />
        </>
      );
    case 'decor.mailbox':
      return (
        <>
          <Box p={[0, 0.35, 0]} s={[0.08, 0.7, 0.08]} c={WOOD_DARK} />
          <Box p={[0, 0.78, 0]} s={[0.3, 0.24, 0.42]} c="#e8455a" />
          <Box p={[0.17, 0.86, -0.1]} s={[0.03, 0.18, 0.06]} c="#f5c518" />
        </>
      );
    case 'decor.scarecrow':
      return (
        <>
          <Box p={[0, 0.55, 0]} s={[0.07, 1.1, 0.07]} c={WOOD_DARK} />
          <Box p={[0, 0.8, 0]} s={[0.8, 0.07, 0.07]} c={WOOD_DARK} />
          <Box p={[0, 0.72, 0]} s={[0.36, 0.36, 0.16]} c="#4a7fd4" />
          <Ball p={[0, 1.12, 0]} r={0.15} c="#f2d7a6" />
          <Cone p={[0, 1.3, 0]} r={0.22} h={0.2} c="#f5c518" n={8} />
        </>
      );
    case 'decor.crate':
      return (
        <>
          <Box p={[0, 0.25, 0]} s={[0.5, 0.5, 0.5]} c={WOOD} />
          <Box p={[0, 0.25, 0.255]} s={[0.5, 0.08, 0.01]} c={WOOD_DARK} />
          <Box p={[0, 0.25, -0.255]} s={[0.5, 0.08, 0.01]} c={WOOD_DARK} />
        </>
      );
    case 'decor.swing':
      return (
        <>
          {[-0.42, 0.42].map((x) => (
            <group key={x}>
              <Box p={[x, 0.6, -0.18]} s={[0.06, 1.25, 0.06]} c="#e8455a" />
              <Box p={[x, 0.6, 0.18]} s={[0.06, 1.25, 0.06]} c="#e8455a" />
            </group>
          ))}
          <Box p={[0, 1.22, 0]} s={[0.95, 0.06, 0.06]} c="#e8455a" />
          {[-0.15, 0.15].map((x) => (
            <Box key={x} p={[x, 0.82, 0]} s={[0.02, 0.8, 0.02]} c="#555" />
          ))}
          <Box p={[0, 0.42, 0]} s={[0.4, 0.05, 0.18]} c={WOOD} />
        </>
      );
    case 'decor.slide':
      return (
        <>
          <Box p={[-0.32, 0.45, -0.25]} s={[0.3, 0.9, 0.3]} c="#4a7fd4" />
          <mesh position={[0.12, 0.45, 0.1]} rotation={[0, 0, -0.75]} castShadow>
            <boxGeometry args={[1.05, 0.05, 0.3]} />
            <meshToonMaterial color="#f5c518" />
          </mesh>
          {[0.25, 0.5, 0.75].map((y) => (
            <Box key={y} p={[-0.32, y, 0.0]} s={[0.3, 0.04, 0.06]} c={WHITE} />
          ))}
        </>
      );
    case 'decor.sandbox':
      return (
        <>
          <Box p={[0, 0.08, 0]} s={[0.92, 0.16, 0.92]} c={WOOD} />
          <Box p={[0, 0.13, 0]} s={[0.8, 0.08, 0.8]} c="#f3d98b" />
          <Cone p={[0.15, 0.24, 0.1]} r={0.14} h={0.16} c="#e9c86b" n={6} />
          <Box p={[-0.2, 0.2, -0.15]} s={[0.14, 0.1, 0.1]} c="#e8455a" />
        </>
      );
    case 'decor.windmill':
      return <Windmill />;
    case 'decor.pond':
      return (
        <>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[0.46, 14]} />
            <meshToonMaterial color={STONE} />
          </mesh>
          <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.38, 14]} />
            <meshToonMaterial color="#5ec4e8" />
          </mesh>
          <Ball p={[0.12, 0.06, 0.08]} r={0.05} c="#ff8a3d" />
          <mesh position={[-0.15, 0.055, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.09, 8]} />
            <meshToonMaterial color={LEAF} />
          </mesh>
        </>
      );
    default:
      return null;
  }
}

/** 風車：塔身與屋頂合併；扇葉慢慢轉（dynamic，不合併） */
function Windmill() {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z += dt * 0.8;
  });
  return (
    <>
      <Cyl p={[0, 0.55, 0]} rt={0.22} rb={0.32} h={1.1} c={WHITE} n={8} />
      <Cone p={[0, 1.25, 0]} r={0.3} h={0.3} c="#e8455a" n={8} />
      <group ref={blades} position={[0, 1.0, 0.3]} userData={{ dynamic: true }}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0, 0]}>
            <boxGeometry args={[0.1, 0.9, 0.02]} />
            <meshToonMaterial color={WOOD} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/** 院子：把家具放到格子上（轉方向），整個院子合併網格；不認得的家具跳過、最多 60 個 */
export function YardDecor({ items }: { items: readonly YardItem[] }) {
  const shown = useMemo(() => visibleYard(items), [items]);
  /** 院子的內容換了就重新合併 */
  const key = useMemo(() => shown.map((it) => `${it.id}@${it.gx},${it.gz},${it.rot}`).join('|'), [shown]);
  return (
    <StaticMerge key={key}>
      {shown.map((it) => {
        const w = cellToWorld(it.gx, it.gz);
        return (
          <group key={`${it.gx},${it.gz}`} position={[w.x, 0, w.z]} rotation={[0, (it.rot * Math.PI) / 2, 0]}>
            <FurnitureModel id={it.id} />
          </group>
        );
      })}
    </StaticMerge>
  );
}

/**
 * 佈置模式的格子（docs/plans/home.md 第 3.4 節）：院子每一格一片薄板，點了就是點那一格。
 * 選著家具或正在移動時，空格子亮黃色（草地是綠的，用黃色才看得出來）；選起來的家具那一格是橘色；其他是淡淡的白色
 */
export function YardGrid({ edit }: { edit: YardEdit }) {
  const cells = yardCells();
  const taken = new Set(edit.items.map((it) => `${it.gx},${it.gz}`));
  const sel = edit.selected !== null ? edit.items[edit.selected] : null;
  const placing = edit.picking !== null || edit.moving;
  return (
    <group>
      {cells.map((c) => {
        const w = cellToWorld(c.gx, c.gz);
        const key = `${c.gx},${c.gz}`;
        const isSel = sel !== null && sel.gx === c.gx && sel.gz === c.gz;
        const lit = placing && !taken.has(key);
        const color = isSel ? '#ff8a3d' : lit ? '#ffe066' : '#ffffff';
        return (
          <mesh
            key={key}
            position={[w.x, 0.04, w.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              decorAct({ t: 'tap', gx: c.gx, gz: c.gz });
            }}
          >
            <planeGeometry args={[0.92, 0.92]} />
            <meshBasicMaterial color={color} transparent opacity={isSel ? 0.85 : lit ? 0.7 : 0.25} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}
