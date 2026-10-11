/**
 * 家具（自己的家，docs/plans/home.md）：島上的 21 種（第 3.2 節）與室內的 15 種（第二期，第 8 節）低多邊形模型，
 * 全部用程式畫（原創）。島上或屋裡都能擺（YardDecor 與 DecorGhost 吃擺放的地方 space）。
 * 家具依尺寸佔一格到四格（第 10.3 節；尺寸在 src/store/catalog.ts 的 size），模型以家具佔的格子的正中間（itemCenter）為原點、
 * 正面朝 +z（轉方向由外層 group 處理）。角色約 2.05 公尺高、0.9 公尺寬，床、溜滑梯、鞦韆照角色的大小畫（角色用家具不縮小）。
 * 整個院子包在 StaticMerge 裡合併網格（平板上少很多 draw call）；院子換了就用新的 key 重新合併。
 * 風車的扇葉會轉（標成 dynamic，不合併）。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { StaticMerge } from './StaticMerge';
import { YARD_SPACE, decorSize, itemCenter, visibleYard, type DecorSpace, type YardItem } from '../store/yard';
import { SLIDE, SWING_PIVOT, swingAngle } from '../store/furnitureUse';

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

/**
 * 高的家具（公尺；1 公尺以上才列）：屋裡擋在鏡頭與角色之間時變半透明（第 9 節優化）。
 * 球心在高度的一半，半徑照高度
 */
export const FURNITURE_HEIGHT: Record<string, number> = {
  'decor.bookshelf': 1.45,
  'decor.wardrobe': 1.7,
  'decor.floorlamp': 1.75,
  'decor.piano': 1.2,
  'decor.aquarium': 1.1,
  'decor.tv': 1.0,
  'decor.tree': 1.9,
  'decor.bush': 1.2,
  'decor.lamp': 2.0,
  'decor.parasol': 1.9,
  'decor.scarecrow': 1.6,
  'decor.swing': 2.95,
  'decor.slide': 1.6,
  'decor.windmill': 1.4,
  'decor.mailbox': 1.1,
};

/** 室內家具的顏色 */
const BLACK = '#2b2b33';
const CLOTH_RED = '#e8455a';
const CLOTH_BLUE = '#4a86e8';
const GLASS = '#9fe3f5';

/** 床（1×2，長 1.9 公尺）：床頭板在後面（-z，矮的，躺著的頭不會穿過去），白色床墊（頂 0.44）、藍色被子、白枕頭 */
function Bed() {
  return (
    <>
      <Box p={[0, 0.15, 0]} s={[0.94, 0.3, 1.9]} c={WOOD} />
      <Box p={[0, 0.37, 0.02]} s={[0.88, 0.14, 1.82]} c={WHITE} />
      <Box p={[0, 0.46, 0.35]} s={[0.9, 0.06, 1.2]} c={CLOTH_BLUE} />
      <Box p={[0, 0.48, -0.72]} s={[0.56, 0.1, 0.3]} c={WHITE} />
      <Box p={[0, 0.3, -0.96]} s={[0.96, 0.6, 0.06]} c={WOOD_DARK} />
    </>
  );
}

/** 書桌（2×1）：長桌面、四隻腳、右邊抽屜、筆筒、一本書 */
function Desk() {
  return (
    <>
      <Box p={[0, 0.62, 0]} s={[1.8, 0.06, 0.6]} c={WOOD} />
      {[-0.84, 0.84].map((x) => [-0.24, 0.24].map((z) => <Box key={`${x},${z}`} p={[x, 0.3, z]} s={[0.06, 0.6, 0.06]} c={WOOD_DARK} />))}
      <Box p={[0.55, 0.5, 0]} s={[0.5, 0.18, 0.55]} c={WOOD_DARK} />
      <Box p={[0.55, 0.5, 0.28]} s={[0.12, 0.04, 0.02]} c={WHITE} />
      <Cyl p={[-0.65, 0.72, -0.12]} rt={0.06} rb={0.06} h={0.14} c={CLOTH_RED} n={8} />
      <Box p={[-0.2, 0.67, -0.04]} s={[0.32, 0.04, 0.24]} c={CLOTH_BLUE} />
    </>
  );
}

/** 椅子：椅面、四隻腳、椅背在後面 */
function Chair() {
  return (
    <>
      <Box p={[0, 0.42, 0]} s={[0.46, 0.06, 0.46]} c={WOOD} />
      {[-0.19, 0.19].map((x) => [-0.19, 0.19].map((z) => <Box key={`${x},${z}`} p={[x, 0.2, z]} s={[0.05, 0.4, 0.05]} c={WOOD_DARK} />))}
      <Box p={[0, 0.7, -0.2]} s={[0.46, 0.5, 0.05]} c={WOOD} />
    </>
  );
}

/** 沙發（2×1）：長坐墊、椅背、兩邊扶手、兩個坐墊（頂 0.41） */
function Sofa() {
  return (
    <>
      <Box p={[0, 0.2, 0.05]} s={[1.9, 0.32, 0.62]} c={CLOTH_RED} />
      <Box p={[0, 0.5, -0.24]} s={[1.9, 0.6, 0.18]} c={CLOTH_RED} />
      {[-0.88, 0.88].map((x) => (
        <Box key={x} p={[x, 0.38, 0.05]} s={[0.14, 0.36, 0.62]} c="#c93448" />
      ))}
      {[-0.4, 0.4].map((x) => (
        <Box key={x} p={[x, 0.38, 0.08]} s={[0.76, 0.06, 0.5]} c="#f28b9b" />
      ))}
    </>
  );
}

/** 地毯（2×2）：可以走過去的一片布，有一圈邊 */
function Rug() {
  return (
    <>
      <Box p={[0, 0.012, 0]} s={[1.92, 0.02, 1.92]} c="#f2b33d" />
      <Box p={[0, 0.02, 0]} s={[1.5, 0.02, 1.5]} c={CLOTH_RED} />
      <Box p={[0, 0.026, 0]} s={[0.7, 0.02, 0.7]} c={WHITE} />
    </>
  );
}

/** 立燈：底座、長桿、燈罩、燈泡 */
function FloorLamp({ on = false }: { on?: boolean }) {
  return (
    <>
      <Cyl p={[0, 0.04, 0]} rt={0.2} rb={0.22} h={0.08} c={BLACK} n={10} />
      <Cyl p={[0, 0.8, 0]} rt={0.03} rb={0.03} h={1.5} c={BLACK} n={6} />
      <Cyl p={[0, 1.55, 0]} rt={0.16} rb={0.28} h={0.3} c={on ? '#fffbe0' : '#fff1b8'} n={10} />
      <Bulb p={[0, 1.45, 0]} r={0.08} on={on} />
    </>
  );
}

/**
 * 鞦韆的座椅與繩子：掛在橫桿（樞軸）下，有人在盪（t0 有值）就照時間前後擺，和盪的角色同一個角度。
 * 座椅比角色寬（角色 0.9 公尺寬），繩子在角色身體兩邊外面
 */
function SwingSeat({ t0 }: { t0: number | null }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.x = t0 === null ? 0 : swingAngle(performance.now() / 1000 - t0);
  });
  /** 座椅頂的高度與繩長 */
  const seatY = 0.42;
  const rope = SWING_PIVOT - seatY;
  return (
    <group ref={g} position={[0, SWING_PIVOT, 0]}>
      {[-0.46, 0.46].map((x) => (
        <Box key={x} p={[x, -rope / 2, 0]} s={[0.025, rope, 0.025]} c="#555" />
      ))}
      <Box p={[0, seatY - SWING_PIVOT, 0]} s={[0.98, 0.05, 0.28]} c={WOOD} />
    </group>
  );
}

/** 沙堡（沙坑堆好時）：城牆、三座塔、小旗子 */
function SandCastle() {
  const sand = '#e9c86b';
  return (
    <>
      <Box p={[0, 0.25, 0]} s={[0.5, 0.16, 0.4]} c={sand} />
      {[-0.22, 0.22].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0.32, -0.15]} rt={0.08} rb={0.09} h={0.3} c={sand} n={8} />
          <Cone p={[x, 0.53, -0.15]} r={0.1} h={0.12} c="#d9b24f" n={8} />
        </group>
      ))}
      <Cyl p={[0, 0.42, 0.02]} rt={0.1} rb={0.12} h={0.36} c={sand} n={8} />
      <Cone p={[0, 0.66, 0.02]} r={0.12} h={0.14} c="#d9b24f" n={8} />
      <Box p={[0.04, 0.8, 0.02]} s={[0.1, 0.06, 0.01]} c="#e8455a" />
      <Box p={[0, 0.76, 0.02]} s={[0.01, 0.14, 0.01]} c="#555" />
    </>
  );
}

/** 燈泡：開著時發亮，外面一圈半透明的光暈（不用真的燈光，平板才跑得動） */
function Bulb({ p, r, on }: { p: [number, number, number]; r: number; on: boolean }) {
  return (
    <>
      <mesh position={p}>
        <sphereGeometry args={[r, 10, 8]} />
        <meshToonMaterial color={on ? '#fff6a0' : '#e6d58a'} emissive={on ? '#ffd84d' : '#000000'} emissiveIntensity={on ? 1.2 : 0} />
      </mesh>
      {on && (
        <mesh position={p}>
          <sphereGeometry args={[r * 3.2, 12, 10]} />
          <meshBasicMaterial color="#fff2a8" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

/** 書架：靠後的木框、三層隔板、彩色的書 */
function Bookshelf() {
  const books = ['#e8455a', '#4a86e8', '#4aa84d', '#f2b33d', '#9b59b6'];
  return (
    <>
      <Box p={[0, 0.72, -0.28]} s={[0.92, 1.44, 0.06]} c={WOOD_DARK} />
      {[-0.43, 0.43].map((x) => (
        <Box key={x} p={[x, 0.72, -0.12]} s={[0.06, 1.44, 0.36]} c={WOOD} />
      ))}
      {[0.03, 0.5, 0.97, 1.41].map((y) => (
        <Box key={y} p={[0, y, -0.12]} s={[0.86, 0.05, 0.36]} c={WOOD} />
      ))}
      {[0.24, 0.71, 1.18].map((y, row) =>
        books.slice(row, row + 4).map((c, i) => <Box key={`${row},${i}`} p={[-0.27 + i * 0.18, y, -0.12]} s={[0.12, 0.36 - (i % 2) * 0.06, 0.28]} c={c} />),
      )}
    </>
  );
}

/** 電視：矮櫃上一台電視（畫面藍色） */
function Tv({ on = false }: { on?: boolean }) {
  return (
    <>
      <Box p={[0, 0.2, 0]} s={[0.9, 0.4, 0.42]} c={WOOD} />
      <Box p={[0, 0.72, -0.05]} s={[0.84, 0.54, 0.07]} c={BLACK} />
      <Box p={[0, 0.72, -0.01]} s={[0.74, 0.44, 0.01]} c={on ? '#5ec4e8' : '#26303d'} />
      {on && (
        <>
          <Box p={[0, 0.58, 0.0]} s={[0.74, 0.14, 0.01]} c="#4aa84d" />
          <Ball p={[0.2, 0.84, 0.0]} r={0.07} c="#ffd84d" />
        </>
      )}
      <Box p={[0, 0.43, -0.05]} s={[0.2, 0.06, 0.16]} c={BLACK} />
    </>
  );
}

/** 盆栽：陶盆裡的葉子 */
function Plant() {
  return (
    <>
      <Cyl p={[0, 0.2, 0]} rt={0.22} rb={0.16} h={0.4} c="#c96f3b" n={10} />
      <Cyl p={[0, 0.41, 0]} rt={0.2} rb={0.2} h={0.02} c="#6b4a2f" n={10} />
      <Ball p={[0, 0.65, 0]} r={0.24} c={LEAF} />
      <Ball p={[0.16, 0.8, 0.05]} r={0.16} c={LEAF_DARK} />
      <Ball p={[-0.14, 0.86, -0.04]} r={0.15} c={LEAF} />
    </>
  );
}

/** 鋼琴（2×1）：黑色琴身、白鍵與黑鍵在前面、琴椅（頂 0.34） */
function Piano() {
  return (
    <>
      <Box p={[0, 0.6, -0.22]} s={[1.5, 1.2, 0.5]} c={BLACK} />
      <Box p={[0, 0.68, 0.12]} s={[1.4, 0.06, 0.22]} c={WHITE} />
      {[-0.6, -0.45, -0.2, -0.05, 0.1, 0.35, 0.5].map((x) => (
        <Box key={x} p={[x, 0.72, 0.08]} s={[0.05, 0.04, 0.13]} c={BLACK} />
      ))}
      {[-0.66, 0.66].map((x) => (
        <Box key={x} p={[x, 0.32, 0.12]} s={[0.07, 0.64, 0.07]} c={BLACK} />
      ))}
      <Box p={[0, 0.3, 0.42]} s={[0.6, 0.08, 0.26]} c={BLACK} />
    </>
  );
}

/** 衣櫃：高高的木櫃、兩扇門、兩個把手 */
function Wardrobe() {
  return (
    <>
      <Box p={[0, 0.82, -0.18]} s={[0.92, 1.64, 0.56]} c={WOOD} />
      <Box p={[0, 0.82, 0.11]} s={[0.02, 1.5, 0.02]} c={WOOD_DARK} />
      {[-0.08, 0.08].map((x) => (
        <Ball key={x} p={[x, 0.85, 0.12]} r={0.035} c="#f2b33d" />
      ))}
      <Box p={[0, 1.66, -0.18]} s={[0.96, 0.06, 0.6]} c={WOOD_DARK} />
    </>
  );
}

/** 熊熊玩偶：坐著的棕色小熊 */
function Teddy() {
  const fur = '#b5794a';
  return (
    <>
      <Ball p={[0, 0.22, 0]} r={0.22} c={fur} />
      <Ball p={[0, 0.55, 0.02]} r={0.17} c={fur} />
      {[-0.12, 0.12].map((x) => (
        <Ball key={x} p={[x, 0.7, 0]} r={0.06} c={fur} />
      ))}
      <Ball p={[0, 0.51, 0.16]} r={0.07} c="#e8c9a0" />
      <Ball p={[0, 0.54, 0.22]} r={0.025} c={BLACK} />
      {[-0.17, 0.17].map((x) => (
        <Ball key={x} p={[x, 0.1, 0.15]} r={0.08} c={fur} />
      ))}
      <Box p={[0, 0.4, 0.14]} s={[0.16, 0.05, 0.03]} c={CLOTH_RED} />
    </>
  );
}

/** 玩具箱：彩色的箱子，上面有球和積木 */
function ToyBox() {
  return (
    <>
      <Box p={[0, 0.22, 0]} s={[0.76, 0.44, 0.54]} c={CLOTH_BLUE} />
      <Box p={[0, 0.46, 0]} s={[0.8, 0.05, 0.58]} c="#f2b33d" />
      <Box p={[0, 0.3, 0.28]} s={[0.4, 0.14, 0.01]} c={WHITE} />
      <Ball p={[-0.18, 0.6, 0.05]} r={0.1} c={CLOTH_RED} />
      <Box p={[0.15, 0.57, -0.05]} s={[0.16, 0.16, 0.16]} c={LEAF} />
    </>
  );
}

/** 餐桌（2×1）：長桌、四隻腳、兩個盤子與杯子 */
function DiningTable() {
  return (
    <>
      <Box p={[0, 0.7, 0]} s={[1.8, 0.06, 0.9]} c={WOOD} />
      {[-0.82, 0.82].map((x) => [-0.36, 0.36].map((z) => <Box key={`${x},${z}`} p={[x, 0.34, z]} s={[0.07, 0.68, 0.07]} c={WOOD_DARK} />))}
      {[-0.45, 0.45].map((x) => (
        <Cyl key={x} p={[x, 0.74, 0.15]} rt={0.15} rb={0.13} h={0.02} c={WHITE} n={12} />
      ))}
      <Ball p={[-0.45, 0.78, 0.15]} r={0.05} c={CLOTH_RED} />
      <Cyl p={[0, 0.79, -0.2]} rt={0.05} rb={0.04} h={0.12} c={GLASS} n={8} />
    </>
  );
}

/** 魚缸：木頭架子上的水族箱，裡面有水草和小魚 */
function Aquarium() {
  return (
    <>
      <Box p={[0, 0.25, 0]} s={[0.9, 0.5, 0.5]} c={WOOD_DARK} />
      <Box p={[0, 0.78, 0]} s={[0.86, 0.56, 0.46]} c={GLASS} />
      <Box p={[0, 0.53, 0]} s={[0.82, 0.04, 0.42]} c="#f2d9a0" />
      <Cone p={[-0.25, 0.68, -0.08]} r={0.06} h={0.26} c={LEAF} n={5} />
      <Cone p={[0.28, 0.66, 0.05]} r={0.05} h={0.22} c={LEAF_DARK} n={5} />
      <Box p={[-0.05, 0.82, 0.16]} s={[0.14, 0.08, 0.04]} c="#ff8a3d" />
      <Box p={[0.15, 0.92, 0.16]} s={[0.12, 0.07, 0.04]} c="#ffe066" />
      <Box p={[0, 1.07, 0]} s={[0.9, 0.04, 0.5]} c={BLACK} />
    </>
  );
}

/** 室內家具（第二期進屋）的模型；不是室內家具回傳 null。on：電視、立燈開著 */
function IndoorModel({ id, on = false }: { id: string; on?: boolean }) {
  switch (id) {
    case 'decor.bed':
      return <Bed />;
    case 'decor.desk':
      return <Desk />;
    case 'decor.chair':
      return <Chair />;
    case 'decor.sofa':
      return <Sofa />;
    case 'decor.rug':
      return <Rug />;
    case 'decor.floorlamp':
      return <FloorLamp on={on} />;
    case 'decor.bookshelf':
      return <Bookshelf />;
    case 'decor.tv':
      return <Tv on={on} />;
    case 'decor.plant':
      return <Plant />;
    case 'decor.piano':
      return <Piano />;
    case 'decor.wardrobe':
      return <Wardrobe />;
    case 'decor.teddy':
      return <Teddy />;
    case 'decor.toybox':
      return <ToyBox />;
    case 'decor.table':
      return <DiningTable />;
    case 'decor.aquarium':
      return <Aquarium />;
    default:
      return null;
  }
}

/** 一樣家具的模型（不認得的 id 不畫） */
/**
 * 一樣家具的模型（不認得的 id 不畫）。on：開關類開著、沙堡堆好了（第 9 節優化）；
 * swingT0：有人在盪這座鞦韆（開始的時間，performance.now 秒），座椅與繩子照時間繞橫桿擺
 */
export function FurnitureModel({ id, on = false, swingT0 = null }: { id: string; on?: boolean; swingT0?: number | null }) {
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
      // 長椅（2×1）：椅面頂 0.35、椅背、三組腳
      return (
        <>
          <Box p={[0, 0.32, 0]} s={[1.8, 0.06, 0.4]} c={WOOD} />
          <Box p={[0, 0.6, -0.18]} s={[1.8, 0.34, 0.05]} c={WOOD} />
          {[-0.8, 0, 0.8].map((x) => (
            <Box key={x} p={[x, 0.16, 0]} s={[0.06, 0.32, 0.36]} c={WOOD_DARK} />
          ))}
        </>
      );
    case 'decor.picnic':
      // 野餐桌（2×2）：中間長桌、前後兩條長凳（凳面頂 0.3、在 z ±0.75）、桌上一塊紅布
      return (
        <>
          <Box p={[0, 0.55, 0]} s={[1.8, 0.06, 0.7]} c={WOOD} />
          {[-0.72, 0.72].map((x) => (
            <Box key={x} p={[x, 0.27, 0]} s={[0.08, 0.54, 0.6]} c={WOOD_DARK} />
          ))}
          {[-0.75, 0.75].map((z) => (
            <group key={z}>
              <Box p={[0, 0.28, z]} s={[1.8, 0.05, 0.3]} c={WOOD} />
              {[-0.75, 0.75].map((x) => (
                <Box key={x} p={[x, 0.13, z]} s={[0.06, 0.26, 0.26]} c={WOOD_DARK} />
              ))}
            </group>
          ))}
          <Box p={[0.3, 0.61, 0.05]} s={[0.4, 0.06, 0.28]} c="#e8455a" />
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
          <Box p={[0, 1.58, 0]} s={[0.22, 0.22, 0.22]} c={on ? '#fffbe0' : '#fff3b0'} />
          <Bulb p={[0, 1.58, 0]} r={0.09} on={on} />
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
      // 鞦韆（2×2）：架子比角色坐著戴帽子還高（盪的時候頭不會穿過橫桿），兩邊的柱子在角色外面；
      // 座椅與繩子掛在橫桿上，有人在盪才擺
      return (
        <>
          {[-0.92, 0.92].map((x) => (
            <group key={x}>
              <Box p={[x, SWING_PIVOT / 2, -0.4]} s={[0.08, SWING_PIVOT, 0.08]} c="#e8455a" />
              <Box p={[x, SWING_PIVOT / 2, 0.4]} s={[0.08, SWING_PIVOT, 0.08]} c="#e8455a" />
              <Box p={[x, 0.5, 0]} s={[0.06, 0.06, 0.8]} c="#e8455a" />
            </group>
          ))}
          <Box p={[0, SWING_PIVOT + 0.03, 0]} s={[1.92, 0.08, 0.08]} c="#e8455a" />
          <SwingSeat t0={swingT0} />
        </>
      );
    case 'decor.slide':
      return <Slide />;
    case 'decor.sandbox':
      // 沙坑（2×2）：木框裡的沙（頂 0.17）；堆好時沙堡放大 1.5 倍（底部仍然貼著沙）
      return (
        <>
          <Box p={[0, 0.08, 0]} s={[1.9, 0.16, 1.9]} c={WOOD} />
          <Box p={[0, 0.13, 0]} s={[1.76, 0.08, 1.76]} c="#f3d98b" />
          {on ? (
            <group position={[0, -0.085, 0]} scale={1.5}>
              <SandCastle />
            </group>
          ) : (
            <>
              <Cone p={[0.35, 0.26, 0.25]} r={0.22} h={0.2} c="#e9c86b" n={6} />
              <Box p={[-0.4, 0.24, -0.3]} s={[0.2, 0.16, 0.2]} c="#e8455a" />
              <Box p={[-0.15, 0.19, 0.4]} s={[0.06, 0.03, 0.3]} c="#4a86e8" />
            </>
          )}
        </>
      );
    case 'decor.windmill':
      return <Windmill />;
    case 'decor.pond':
      // 小池塘（2×2）：石頭圍邊、水、兩條小魚、兩片荷葉
      return (
        <>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[0.94, 20]} />
            <meshToonMaterial color={STONE} />
          </mesh>
          <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.8, 20]} />
            <meshToonMaterial color="#5ec4e8" />
          </mesh>
          <Ball p={[0.25, 0.06, 0.15]} r={0.06} c="#ff8a3d" />
          <Ball p={[-0.2, 0.06, 0.3]} r={0.05} c="#ffd23f" />
          {[
            [-0.3, -0.2, 0.14],
            [0.35, -0.35, 0.11],
          ].map(([x, z, r]) => (
            <mesh key={`${x},${z}`} position={[x, 0.055, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[r, 8]} />
              <meshToonMaterial color={LEAF} />
            </mesh>
          ))}
        </>
      );
    default:
      // 室內家具（第二期進屋）
      return <IndoorModel id={id} on={on} />;
  }
}

/**
 * 溜滑梯（3×1）：左邊的塔（平台頂 SLIDE.top）、塔前面的梯子（角色面向梯子往上爬）、沿 +x 往下的滑道與兩邊的扶手。
 * 位置照 src/store/furnitureUse.ts 的 SLIDE（角色溜的時間軸用同一份）
 */
function Slide() {
  const { towerX, towerZ, top, chuteX0, chuteX1, chuteY1 } = SLIDE;
  /** 滑道的長度、傾斜角、中點 */
  const len = Math.hypot(chuteX1 - chuteX0, top - chuteY1);
  const tilt = -Math.atan2(top - chuteY1, chuteX1 - chuteX0);
  const mid: [number, number, number] = [(chuteX0 + chuteX1) / 2, (top + chuteY1) / 2, towerZ];
  /** 梯子貼在塔的正面 */
  const ladderZ = towerZ + 0.255;
  return (
    <>
      <Box p={[towerX, top / 2, towerZ]} s={[0.5, top, 0.45]} c="#4a7fd4" />
      <Box p={[towerX, top + 0.03, towerZ]} s={[0.6, 0.06, 0.55]} c="#3a6fc4" />
      {[-0.27, 0.27].map((dz) => (
        <Box key={dz} p={[towerX, top + 0.2, towerZ + dz]} s={[0.6, 0.06, 0.04]} c={WHITE} />
      ))}
      {[-0.2, 0.2].map((dx) => (
        <Box key={dx} p={[towerX + dx, top / 2, ladderZ]} s={[0.04, top, 0.04]} c={WHITE} />
      ))}
      {[0.25, 0.5, 0.75, 1.0, 1.25].map((y) => (
        <Box key={y} p={[towerX, y, ladderZ]} s={[0.4, 0.04, 0.05]} c={WHITE} />
      ))}
      <group position={mid} rotation={[0, 0, tilt]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[len, 0.05, 0.5]} />
          <meshToonMaterial color="#f5c518" />
        </mesh>
        {[-0.25, 0.25].map((dz) => (
          <mesh key={dz} position={[0, 0.06, dz]} castShadow>
            <boxGeometry args={[len, 0.1, 0.04]} />
            <meshToonMaterial color="#e8a518" />
          </mesh>
        ))}
      </group>
      <Box p={[chuteX1 - 0.12, chuteY1 / 2, towerZ]} s={[0.06, chuteY1, 0.4]} c="#e8a518" />
    </>
  );
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

/** 正在用的家具的樣子（第 9 節優化）：開關開著、沙堡堆好了（on）；有人在盪的鞦韆（swingT0） */
export interface LiveState {
  on?: boolean;
  swingT0?: number;
}

/**
 * 擺好的家具：放到格子上（轉方向），全部合併網格；不認得的家具跳過、最多擺放地方的上限個。
 * space 是島上（預設）或屋裡（HOME_SPACE，房間的座標）。faded 是要半透明的格子（"gx,gz"；擋住角色的高家具），
 * live 是正在用的格子（"gx,gz" → 開著、在盪）；這兩種不合併、另外畫（大部分的家具照舊合併，平板才跑得動）
 */
export function YardDecor({
  items,
  space = YARD_SPACE,
  faded = [],
  live = {},
}: {
  items: readonly YardItem[];
  space?: DecorSpace;
  faded?: readonly string[];
  live?: Record<string, LiveState>;
}) {
  const all = useMemo(() => visibleYard(items, space.max), [items, space]);
  const apart = (it: YardItem) => faded.includes(`${it.gx},${it.gz}`) || `${it.gx},${it.gz}` in live;
  const shown = useMemo(() => all.filter((it) => !apart(it)), [all, faded, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const fadedItems = useMemo(() => all.filter((it) => faded.includes(`${it.gx},${it.gz}`)), [all, faded]);
  const liveItems = useMemo(() => all.filter((it) => !faded.includes(`${it.gx},${it.gz}`) && `${it.gx},${it.gz}` in live), [all, faded, live]);
  /** 院子的內容換了就重新合併 */
  const key = useMemo(() => shown.map((it) => `${it.id}@${it.gx},${it.gz},${it.rot}`).join('|'), [shown]);
  return (
    <>
      <StaticMerge key={key}>
        {shown.map((it) => {
          const w = itemCenter(it, space);
          return (
            <group key={`${it.gx},${it.gz}`} position={[w.x, 0, w.z]} rotation={[0, (it.rot * Math.PI) / 2, 0]}>
              <FurnitureModel id={it.id} />
            </group>
          );
        })}
      </StaticMerge>
      {fadedItems.map((it) => (
        <FadedItem key={`${it.id}@${it.gx},${it.gz},${it.rot}`} item={it} space={space} />
      ))}
      {liveItems.map((it) => {
        const w = itemCenter(it, space);
        const st = live[`${it.gx},${it.gz}`];
        return (
          <group key={`${it.id}@${it.gx},${it.gz},${it.rot}`} position={[w.x, 0, w.z]} rotation={[0, (it.rot * Math.PI) / 2, 0]}>
            <FurnitureModel id={it.id} on={st.on} swingT0={st.swingT0 ?? null} />
          </group>
        );
      })}
    </>
  );
}

/** 半透明的一件家具（擋住角色時；模型的材質是各自的，改不透明度不影響別件） */
function FadedItem({ item, space }: { item: YardItem; space: DecorSpace }) {
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    group.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) {
        m.transparent = true;
        m.opacity = 0.3;
        m.depthWrite = false;
      }
      o.castShadow = false;
    });
  }, [item.id]);
  const w = itemCenter(item, space);
  return (
    <group ref={group} position={[w.x, 0, w.z]} rotation={[0, (item.rot * Math.PI) / 2, 0]}>
      <FurnitureModel id={item.id} />
    </group>
  );
}

/**
 * 預覽（動森做法，docs/plans/home.md 第 7 節）：選著的家具半透明地出現在角色面前，底下一片薄板蓋住家具佔的整塊
 * （第 10.3 節多格；gx, gz 是基準格），能放是綠色、不能放是紅色；上方一個上下跳的箭頭（角色背對鏡頭時，
 * 預覽會被角色擋住，箭頭還看得到）。每一格畫面都可能動，不放進 StaticMerge
 */
export function DecorGhost({ id, gx, gz, rot, ok, space = YARD_SPACE }: { id: string; gx: number; gz: number; rot: number; ok: boolean; space?: DecorSpace }) {
  const group = useRef<THREE.Group>(null);
  // 模型改成半透明（模型的材質是各自的，不會影響別的家具）
  useEffect(() => {
    group.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) {
        m.transparent = true;
        m.opacity = 0.55;
        m.depthWrite = false;
      }
      o.castShadow = false;
    });
  }, [id]);
  const arrow = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (arrow.current) arrow.current.position.y = 2.3 + Math.sin(state.clock.elapsedTime * 4) * 0.15;
  });
  const w = itemCenter({ id, gx, gz, rot: (rot % 4) as YardItem['rot'] }, space);
  /** 薄板的大小：家具佔的範圍（轉奇數次寬深互換） */
  const size = decorSize(id);
  const [pw, pd] = rot % 2 === 1 ? [size.d, size.w] : [size.w, size.d];
  return (
    <group position={[w.x, 0, w.z]}>
      <mesh ref={arrow} position={[0, 2.3, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.28, 0.5, 4]} />
        <meshBasicMaterial color={ok ? '#22c55e' : '#ef4444'} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[pw - 0.05, pd - 0.05]} />
        <meshBasicMaterial color={ok ? '#4ade80' : '#f87171'} transparent opacity={0.6} depthWrite={false} />
      </mesh>
      <group ref={group} rotation={[0, (rot * Math.PI) / 2, 0]} key={id}>
        <FurnitureModel id={id} />
      </group>
    </group>
  );
}
