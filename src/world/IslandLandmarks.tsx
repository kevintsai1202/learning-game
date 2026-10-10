/**
 * 島上的地標（L5，docs/plans/login-ux-review.md 第 4.5 節）：
 * - 班級島：噴水池旁的旗桿，旗面是班級的顏色，上面寫班級名稱
 * - 自己的島：孩子的小屋（門朝出生點，門前留空地；之後朝動物森友會的方向讓孩子進屋、佈置）與步道旁的島門牌
 * 文字一律用 DOM（drei Html，照專案規則不用 three 渲染文字），不攔截點擊（才能點地面走路）。
 */
import { useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import { StaticMerge } from './StaticMerge';
import { FLAGPOLE, HOUSE, PLATE } from './layout';

/**
 * 牌子文字隨距離縮放的係數：縮放＝係數 ÷（2·tan(視角/2)·距離）。旗子、小屋多半在 25～40 公尺外，
 * 比同學的名牌（係數 20）大一點，從出生點看得清楚
 */
const LABEL_DISTANCE_FACTOR = 30;

/**
 * 3D 物件上的文字牌（drei Html）：等 3D 畫布的事件容器接好才掛上。
 * drei Html 掛在事件容器（還沒接好時改掛畫布的上一層）；容器換了它會在同一個節點上重建 React root，
 * 舊的 root 卸載時要移除的節點已經被新的清掉，就會拋出 removeChild 錯誤（重新整理後直接進自己的島時，
 * 牌子比事件容器早幾毫秒掛上）。同學的名牌都在連線後才出現，不會遇到
 */
function SceneLabel({ position, children }: { position: [number, number, number]; children: ReactNode }) {
  const connected = useThree((s) => s.events.connected);
  if (!connected) return null;
  return (
    <Html position={position} center distanceFactor={LABEL_DISTANCE_FACTOR} pointerEvents="none" zIndexRange={[20, 0]} wrapperClass="scene-label">
      {children}
    </Html>
  );
}

/** 班級旗子：旗桿＋隨風輕擺的旗面＋班級名稱 */
export function ClassFlag({ name, color }: { name: string; color: string }) {
  const cloth = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(state.clock.elapsedTime * 1.6) * 0.12;
  });
  return (
    <group position={[FLAGPOLE.x, 0, FLAGPOLE.z]}>
      <StaticMerge>
        {/* 底座與旗桿 */}
        <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.45, 0.55, 0.3, 12]} />
          <meshToonMaterial color="#b9b2a6" />
        </mesh>
        <mesh position={[0, 2.3, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 4.4, 8]} />
          <meshToonMaterial color="#f4f1ea" />
        </mesh>
        <mesh position={[0, 4.55, 0]}>
          <sphereGeometry args={[0.14, 10, 8]} />
          <meshToonMaterial color="#ffc93c" />
        </mesh>
      </StaticMerge>
      {/* 旗面：從旗桿往東伸出，繞旗桿輕擺 */}
      <group ref={cloth} position={[0, 3.85, 0]}>
        <mesh position={[0.95, 0, 0]} castShadow>
          <boxGeometry args={[1.8, 1.1, 0.05]} />
          <meshToonMaterial color={color} />
        </mesh>
        <SceneLabel position={[0.95, 0, 0.06]}>
          {/* 牌子用旗子的顏色當底：遠遠就看得出是哪一班的旗子 */}
          <div className="island-sign flag" style={{ background: color }} data-testid="island-flag">
            🏫 {name}
          </div>
        </SceneLabel>
      </group>
    </group>
  );
}

/** 孩子的小屋：木牆、紅屋頂、門、窗、煙囪；門上寫「○○的家」 */
export function KidHouse({ name, label = true }: { name: string; /** 顯示「○○的家」牌子（佈置院子時藏起來，不擋格子） */ label?: boolean }) {
  return (
    <group position={[HOUSE.x, 0, HOUSE.z]} rotation={[0, HOUSE.rotY, 0]}>
      <StaticMerge>
        {/* 地基與牆 */}
        <mesh position={[0, 0.12, 0]} receiveShadow>
          <boxGeometry args={[3.6, 0.24, 3.2]} />
          <meshToonMaterial color="#b9b2a6" />
        </mesh>
        <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.2, 2, 2.8]} />
          <meshToonMaterial color="#f6d7a7" />
        </mesh>
        {/* 屋頂：四角錐 */}
        <mesh position={[0, 2.85, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[2.55, 1.4, 4]} />
          <meshToonMaterial color="#e8573f" />
        </mesh>
        {/* 煙囪 */}
        <mesh position={[0.8, 3.15, -0.5]} castShadow>
          <boxGeometry args={[0.4, 0.9, 0.4]} />
          <meshToonMaterial color="#9b6a4a" />
        </mesh>
        {/* 門（朝 +z，也就是朝出生點）與門把 */}
        <mesh position={[0, 0.85, 1.42]}>
          <boxGeometry args={[0.8, 1.4, 0.08]} />
          <meshToonMaterial color="#8b5a2b" />
        </mesh>
        <mesh position={[0.25, 0.85, 1.48]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshToonMaterial color="#ffc93c" />
        </mesh>
        {/* 門兩側的窗 */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 1.05, 1.35, 1.42]}>
            <boxGeometry args={[0.6, 0.55, 0.06]} />
            <meshToonMaterial color="#bfe9ff" />
          </mesh>
        ))}
        {/* 門前的踏石（門前留空地，之後的門口互動用） */}
        {[2.0, 2.8].map((d) => (
          <mesh key={d} position={[0, 0.03, d]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[0.38, 12]} />
            <meshToonMaterial color="#d8d2c4" />
          </mesh>
        ))}
      </StaticMerge>
      {label && (
        <SceneLabel position={[0, 1.9, 1.5]}>
          <div className="island-sign home" data-testid="island-home">
            🏠 {name}的家
          </div>
        </SceneLabel>
      )}
    </group>
  );
}

/** 島門牌（上岸後往廣場走的步道旁）：兩根木柱＋橫板，寫「○○的島」 */
export function IslandPlate({ name }: { name: string }) {
  return (
    <group position={[PLATE.x, 0, PLATE.z]} rotation={[0, -0.35, 0]}>
      <StaticMerge>
        {[-0.7, 0.7].map((x) => (
          <mesh key={x} position={[x, 0.6, 0]} castShadow>
            <boxGeometry args={[0.14, 1.2, 0.14]} />
            <meshToonMaterial color="#8b5a2b" />
          </mesh>
        ))}
        <mesh position={[0, 1.15, 0]} castShadow>
          <boxGeometry args={[1.8, 0.6, 0.1]} />
          <meshToonMaterial color="#c8935a" />
        </mesh>
      </StaticMerge>
      <SceneLabel position={[0, 1.15, 0.08]}>
        <div className="island-sign plate" data-testid="island-plate">
          🏝️ {name}的島
        </div>
      </SceneLabel>
    </group>
  );
}
