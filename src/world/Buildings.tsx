/**
 * 島上的六棟建築：數學城堡、文字森林、ABC 海灘、生活村、挑戰塔、百寶屋。
 * 每棟都以原點為中心、正面朝 +z，由 IslandScene 依 layout 擺放與旋轉。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { textTexture, toon } from './materials';
import type { ZoneId } from '../store/useUi';

/** 楷書字型（字塊上的國字用） */
const KAI_FONT = '"TW-Kai", "BiauKai", "DFKai-SB", "標楷體", "Kaiti TC", "KaiTi", serif';

/** 招牌：木柱加上寫著名稱的板子 */
export function Signboard({ text, color, position }: { text: string; color: string; position: [number, number, number] }) {
  const tex = textTexture(text, { width: 640, height: 220, bg: '#fff6df', fg: '#2b2a4c', size: 92, border: color, corner: '#a0693c' });
  return (
    <group position={position}>
      <mesh material={toon('#a0693c')} position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 1.4, 8]} />
      </mesh>
      <mesh position={[0, 1.55, 0.05]} castShadow>
        <boxGeometry args={[2.3, 0.8, 0.1]} />
        <meshToonMaterial attach="material-0" color="#a0693c" />
        <meshToonMaterial attach="material-1" color="#a0693c" />
        <meshToonMaterial attach="material-2" color="#a0693c" />
        <meshToonMaterial attach="material-3" color="#a0693c" />
        <meshBasicMaterial attach="material-4" map={tex} toneMapped={false} />
        <meshToonMaterial attach="material-5" color="#a0693c" />
      </mesh>
    </group>
  );
}

/** 有字的方塊（六面都貼同一個字） */
function LetterBlock({ text, color, size = 0.8, font, position, rotation }: { text: string; color: string; size?: number; font?: string; position: [number, number, number]; rotation?: [number, number, number] }) {
  const tex = textTexture(text, { width: 256, height: 256, bg: color, fg: '#ffffff', size: 170, font, border: '#ffffff' });
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={[size, size, size]} />
      <meshToonMaterial map={tex} />
    </mesh>
  );
}

/** 拱門形的門 */
function Door({ w = 1.3, h = 1.7, z, color = '#5a3b2e' }: { w?: number; h?: number; z: number; color?: string }) {
  const m = toon(color);
  return (
    <group position={[0, 0, z]}>
      <mesh material={m} position={[0, (h - w / 2) / 2, 0]}>
        <boxGeometry args={[w, h - w / 2, 0.12]} />
      </mesh>
      <mesh material={m} position={[0, h - w / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[w / 2, w / 2, 0.12, 20, 1, false, -Math.PI / 2, Math.PI]} />
      </mesh>
      <mesh material={toon('#ffc93c')} position={[w * 0.28, h * 0.42, 0.08]}>
        <sphereGeometry args={[0.07, 8, 6]} />
      </mesh>
    </group>
  );
}

/** 數學城堡：兩座圓塔、中央鐘樓（顯示現在時間）、數字方塊 */
export function MathCastle() {
  const hourHand = useRef<THREE.Group>(null);
  const minuteHand = useRef<THREE.Group>(null);
  useFrame(() => {
    const now = new Date();
    const m = now.getMinutes() + now.getSeconds() / 60;
    const h = (now.getHours() % 12) + m / 60;
    if (minuteHand.current) minuteHand.current.rotation.z = -(m / 60) * Math.PI * 2;
    if (hourHand.current) hourHand.current.rotation.z = -(h / 12) * Math.PI * 2;
  });
  const wall = toon('#fff1d6');
  const tower = toon('#ffe0b3');
  return (
    <group>
      <mesh material={wall} position={[0, 1.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.2, 3.6, 3.6]} />
      </mesh>
      {/* 城垛 */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} material={wall} position={[-2.2 + i * 0.88, 3.85, 1.6]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.4]} />
        </mesh>
      ))}
      {/* 中央鐘樓 */}
      <mesh material={tower} position={[0, 3.6, -0.7]} castShadow>
        <cylinderGeometry args={[1.25, 1.35, 7.2, 20]} />
      </mesh>
      <mesh material={toon('#ff8a3d')} position={[0, 8.2, -0.7]} castShadow>
        <coneGeometry args={[1.6, 2.2, 20]} />
      </mesh>
      <group position={[0, 5.4, 0.6]}>
        <mesh material={toon('#ffffff')} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.95, 0.95, 0.12, 32]} />
        </mesh>
        <mesh material={toon('#2b2a4c')}>
          <torusGeometry args={[0.95, 0.08, 8, 32]} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <mesh key={i} material={toon('#2b2a4c')} position={[Math.sin(a) * 0.78, Math.cos(a) * 0.78, 0.08]}>
              <boxGeometry args={[0.06, i % 3 === 0 ? 0.18 : 0.1, 0.03]} />
            </mesh>
          );
        })}
        {/* 指針以一端為軸心：外層 group 旋轉，網格往上位移半個長度 */}
        <group ref={hourHand} position={[0, 0, 0.1]} userData={{ dynamic: true }}>
          <mesh material={toon('#2b2a4c')} position={[0, 0.25, 0]}>
            <boxGeometry args={[0.09, 0.5, 0.03]} />
          </mesh>
        </group>
        <group ref={minuteHand} position={[0, 0, 0.13]} userData={{ dynamic: true }}>
          <mesh material={toon('#ff6b4a')} position={[0, 0.36, 0]}>
            <boxGeometry args={[0.05, 0.72, 0.03]} />
          </mesh>
        </group>
      </group>
      {/* 兩側圓塔 */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 2.9, 0, 0.9]}>
          <mesh material={tower} position={[0, 2.6, 0]} castShadow>
            <cylinderGeometry args={[1, 1.05, 5.2, 18]} />
          </mesh>
          <mesh material={toon('#ff6b4a')} position={[0, 6.0, 0]} castShadow>
            <coneGeometry args={[1.3, 1.8, 18]} />
          </mesh>
          <mesh material={toon('#a0693c')} position={[0, 7.3, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1, 6]} />
          </mesh>
          <mesh material={toon(s < 0 ? '#2f6fde' : '#ffc93c')} position={[0.3, 7.6, 0]}>
            <boxGeometry args={[0.55, 0.35, 0.04]} />
          </mesh>
          <mesh material={toon('#5a3b2e')} position={[0, 3.6, 1.0]}>
            <boxGeometry args={[0.4, 0.6, 0.1]} />
          </mesh>
        </group>
      ))}
      {/* 「實際的門」在建築外圍 radius 內側 */}
      <Door z={1.82} w={1.5} h={2.0} />
      <LetterBlock text="1" color="#ff6b4a" position={[-1.7, 0.4, 2.6]} rotation={[0, 0.3, 0]} />
      <LetterBlock text="2" color="#2f6fde" position={[-1.75, 1.2, 2.55]} rotation={[0, -0.2, 0]} />
      <LetterBlock text="3" color="#3fbf7f" position={[1.8, 0.4, 2.6]} rotation={[0, -0.25, 0]} />
      <LetterBlock text="×" color="#8b5cf6" size={0.6} position={[1.7, 1.1, 2.6]} rotation={[0, 0.3, 0]} />
      <Signboard text="數學城堡" color="#ff8a3d" position={[-3.2, 0, 3.4]} />
    </group>
  );
}

/** 浮在樹冠旁、會上下飄的字塊 */
function FloatingGlyphs() {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.children.forEach((c, i) => {
      c.position.y = 4.4 + Math.sin(state.clock.elapsedTime * 1.4 + i * 1.7) * 0.3 + (i % 2) * 0.8;
      c.rotation.y = Math.sin(state.clock.elapsedTime * 0.6 + i) * 0.5;
    });
  });
  const glyphs = [
    { t: '山', c: '#3fbf7f', p: [-2.7, 1.2] },
    { t: '水', c: '#2f6fde', p: [2.6, 1.0] },
    { t: '日', c: '#ff8a3d', p: [-1.6, 2.2] },
    { t: 'ㄅ', c: '#e8457c', p: [1.9, 2.1] },
  ] as const;
  return (
    <group ref={group} userData={{ dynamic: true }}>
      {glyphs.map((g) => (
        <LetterBlock key={g.t} text={g.t} color={g.c} size={0.75} font={KAI_FONT} position={[g.p[0], 4.4, g.p[1]]} />
      ))}
    </group>
  );
}

/** 文字森林：大樹屋 */
export function WordForest() {
  const leaves = ['#59c25b', '#4aa84d', '#7ad36a'];
  return (
    <group>
      <mesh material={toon('#a0693c')} position={[0, 1.8, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.95, 3.6, 14]} />
      </mesh>
      {/* 樹根 */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        return (
          <mesh key={i} material={toon('#8a5a32')} position={[Math.sin(a) * 1.9, 0.25, Math.cos(a) * 1.9]} rotation={[0, a, 0.9]}>
            <capsuleGeometry args={[0.28, 0.7, 4, 8]} />
          </mesh>
        );
      })}
      {/* 樹冠 */}
      {[
        [0, 5.0, 0, 2.7],
        [-1.6, 4.4, 0.4, 1.9],
        [1.7, 4.5, 0.2, 2.0],
        [0.3, 6.3, -0.3, 1.9],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} material={toon(leaves[i % 3])} position={[x, y, z]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
        </mesh>
      ))}
      <Door z={1.62} w={1.2} h={1.9} color="#4a2e22" />
      {/* 圓窗 */}
      <mesh material={toon('#ffe9a8')} position={[0.75, 2.6, 1.42]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.1, 16]} />
      </mesh>
      {/* 大毛筆 */}
      <group position={[-2.3, 0, 1.6]} rotation={[0, 0, 0.35]}>
        <mesh material={toon('#d9a066')} position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 2, 8]} />
        </mesh>
        <mesh material={toon('#2b2a4c')} position={[0, 0.0, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.18, 0.5, 10]} />
        </mesh>
      </group>
      <FloatingGlyphs />
      <Signboard text="文字森林" color="#3fbf7f" position={[2.6, 0, 3.0]} />
    </group>
  );
}

/** ABC 海灘：高腳小屋、字母方塊、海灘傘、衝浪板 */
export function AbcBeach() {
  return (
    <group>
      <mesh material={toon('#d9a066')} position={[0, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.2, 0.3, 3.8]} />
      </mesh>
      {[
        [-1.8, -1.6],
        [1.8, -1.6],
        [-1.8, 1.6],
        [1.8, 1.6],
      ].map(([x, z], i) => (
        <mesh key={i} material={toon('#a0693c')} position={[x, 0.45, z]}>
          <cylinderGeometry args={[0.13, 0.13, 1, 8]} />
        </mesh>
      ))}
      <mesh material={toon('#7fd6e0')} position={[0, 2.3, -0.2]} castShadow>
        <boxGeometry args={[3.2, 2.3, 2.8]} />
      </mesh>
      <mesh material={toon('#ffc93c')} position={[0, 4.3, -0.2]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.9, 1.7, 4]} />
      </mesh>
      {/* 樓梯 */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={toon('#d9a066')} position={[0, 0.15 + i * 0.28, 2.6 - i * 0.35]}>
          <boxGeometry args={[1.3, 0.12, 0.4]} />
        </mesh>
      ))}
      <group position={[0, 1.15, 0]}>
        <Door z={1.22} w={1.1} h={1.6} color="#2b6f7a" />
      </group>
      <LetterBlock text="A" color="#ff6b4a" position={[-2.4, 0.4, 2.4]} rotation={[0, 0.4, 0]} />
      <LetterBlock text="B" color="#2f6fde" position={[-1.6, 0.4, 2.9]} rotation={[0, -0.2, 0]} />
      <LetterBlock text="C" color="#3fbf7f" position={[-2.05, 1.2, 2.6]} rotation={[0, 0.1, 0]} />
      {/* 海灘傘 */}
      <group position={[2.6, 0, 2.2]}>
        <mesh material={toon('#ffffff')} position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
        </mesh>
        <mesh material={toon('#e8457c')} position={[0, 2.4, 0]} castShadow>
          <coneGeometry args={[1.3, 0.6, 8]} />
        </mesh>
      </group>
      <mesh material={toon('#ff8a3d')} position={[2.1, 1.0, -1.9]} rotation={[0.25, 0.2, 0.15]} scale={[0.35, 1, 0.12]}>
        <capsuleGeometry args={[0.6, 1.5, 4, 12]} />
      </mesh>
      <Signboard text="ABC 海灘" color="#2bb5c8" position={[-2.6, 0, 3.4]} />
    </group>
  );
}

/** 紅綠燈：綠燈會閃，提醒孩子過馬路要注意 */
function TrafficLight({ position }: { position: [number, number, number] }) {
  const green = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (green.current) (green.current.material as THREE.MeshBasicMaterial).color.set(Math.sin(state.clock.elapsedTime * 3) > 0 ? '#3cff8a' : '#1d6b3c');
  });
  return (
    <group position={position}>
      <mesh material={toon('#5b5b6b')} position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 2.4, 8]} />
      </mesh>
      <mesh material={toon('#2b2a4c')} position={[0, 2.6, 0]}>
        <boxGeometry args={[0.45, 1.1, 0.35]} />
      </mesh>
      <mesh position={[0, 2.95, 0.19]}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshBasicMaterial color="#ff4d4d" />
      </mesh>
      <mesh position={[0, 2.62, 0.19]}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshBasicMaterial color="#7a6a1a" />
      </mesh>
      <mesh ref={green} position={[0, 2.29, 0.19]}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshBasicMaterial color="#3cff8a" />
      </mesh>
    </group>
  );
}

/** 有三角屋頂的小房子 */
function House({ w, h, d, wall, roof, position, rotation = 0 }: { w: number; h: number; d: number; wall: string; roof: string; position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh material={toon(wall)} position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh material={toon(roof)} position={[0, h + h * 0.32, 0]} rotation={[0, 0, Math.PI / 2]} scale={[h * 0.55, w * 0.62, d * 0.62]} castShadow>
        <cylinderGeometry args={[1, 1, 1.75, 3]} />
      </mesh>
      <mesh material={toon('#ffe9a8')} position={[w * 0.28, h * 0.62, d / 2 + 0.01]}>
        <boxGeometry args={[w * 0.22, h * 0.25, 0.05]} />
      </mesh>
    </group>
  );
}

/** 生活村：兩間小屋、紅綠燈、資源回收桶、小菜園 */
export function LifeVillage() {
  return (
    <group>
      <House w={3.2} h={2.4} d={2.8} wall="#ffd6a5" roof="#e8457c" position={[0, 0, 0]} />
      <Door z={1.42} w={1.0} h={1.6} />
      <House w={2.1} h={1.8} d={2.0} wall="#cdeac0" roof="#2f6fde" position={[-2.6, 0, -1.8]} rotation={0.4} />
      <TrafficLight position={[2.4, 0, 2.2]} />
      {/* 資源回收、廚餘、一般垃圾 */}
      {[
        { c: '#2f6fde', x: -2.6 },
        { c: '#3fbf7f', x: -1.95 },
        { c: '#8a8aa0', x: -1.3 },
      ].map((b) => (
        <group key={b.c} position={[b.x, 0, 2.3]}>
          <mesh material={toon(b.c)} position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[0.55, 0.8, 0.55]} />
          </mesh>
          <mesh material={toon('#ffffff')} position={[0, 0.84, 0]}>
            <boxGeometry args={[0.6, 0.08, 0.6]} />
          </mesh>
        </group>
      ))}
      {/* 小菜園 */}
      <mesh material={toon('#8a5a32')} position={[2.6, 0.12, -1.2]}>
        <boxGeometry args={[1.6, 0.25, 1.6]} />
      </mesh>
      {[-0.5, 0, 0.5].map((x) =>
        [-0.5, 0, 0.5].map((z) => (
          <mesh key={`${x}${z}`} material={toon('#59c25b')} position={[2.6 + x, 0.38, -1.2 + z]}>
            <sphereGeometry args={[0.16, 8, 6]} />
          </mesh>
        )),
      )}
      <Signboard text="生活村" color="#f2b705" position={[1.0, 0, 3.4]} />
    </group>
  );
}

/** 星星形狀（挑戰塔頂端） */
function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

const STAR = starShape(0.9, 0.4);

/** 挑戰塔：層層往上的高塔，頂端有旋轉的金色星星 */
export function ChallengeTower() {
  const star = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (star.current) star.current.rotation.y = state.clock.elapsedTime * 1.2;
  });
  const tiers = [
    { r: 2.4, h: 2.6, c: '#c9b8ff' },
    { r: 2.0, h: 2.4, c: '#8b5cf6' },
    { r: 1.6, h: 2.2, c: '#c9b8ff' },
    { r: 1.25, h: 2.0, c: '#8b5cf6' },
  ];
  let y = 0;
  return (
    <group>
      <mesh material={toon('#e7e1f7')} position={[0, 0.3, 0]} receiveShadow>
        <cylinderGeometry args={[2.9, 3.1, 0.6, 24]} />
      </mesh>
      {tiers.map((t, i) => {
        const cy = 0.6 + y + t.h / 2;
        y += t.h;
        return (
          <group key={i}>
            <mesh material={toon(t.c)} position={[0, cy, 0]} castShadow>
              <cylinderGeometry args={[t.r * 0.92, t.r, t.h, 20]} />
            </mesh>
            {[0, 1, 2, 3].map((k) => {
              const a = (k / 4) * Math.PI * 2 + i * 0.4;
              return (
                <mesh key={k} material={toon('#fff6df')} position={[Math.sin(a) * t.r * 0.95, cy + 0.2, Math.cos(a) * t.r * 0.95]} rotation={[0, a, 0]}>
                  <boxGeometry args={[0.35, 0.55, 0.08]} />
                </mesh>
              );
            })}
          </group>
        );
      })}
      <mesh material={toon('#ffc93c')} position={[0, 0.6 + y + 0.8, 0]}>
        <coneGeometry args={[1.35, 1.6, 20]} />
      </mesh>
      <mesh ref={star} material={toon('#ffd23f')} position={[0, 0.6 + y + 2.6, 0]} castShadow userData={{ dynamic: true }}>
        <extrudeGeometry args={[STAR, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 }]} />
      </mesh>
      <group position={[0, 0.6, 0]}>
        <Door z={2.42} w={1.3} h={1.8} color="#4b2c86" />
      </group>
      <Signboard text="挑戰塔" color="#8b5cf6" position={[2.6, 0, 2.6]} />
    </group>
  );
}

/** 百寶屋：條紋雨棚的小商店與大禮物盒 */
export function TreasureShop() {
  return (
    <group>
      <mesh material={toon('#ffe3ef')} position={[0, 1.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 2.3, 2.6]} />
      </mesh>
      <mesh material={toon('#e8457c')} position={[0, 2.55, 0]} castShadow>
        <boxGeometry args={[3.5, 0.5, 2.9]} />
      </mesh>
      {/* 條紋雨棚 */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} material={toon(i % 2 ? '#ffffff' : '#e8457c')} position={[-1.5 + i * 0.5, 2.05, 1.6]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[0.5, 0.06, 0.9]} />
        </mesh>
      ))}
      <Door z={1.32} w={1.0} h={1.5} color="#8a2c52" />
      {/* 禮物盒 */}
      <group position={[2.2, 0, 1.4]} rotation={[0, 0.4, 0]}>
        <mesh material={toon('#2f6fde')} position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.9, 0.9, 0.9]} />
        </mesh>
        <mesh material={toon('#ffc93c')} position={[0, 0.45, 0]}>
          <boxGeometry args={[0.2, 0.92, 0.92]} />
        </mesh>
        <mesh material={toon('#ffc93c')} position={[0, 0.45, 0]}>
          <boxGeometry args={[0.92, 0.92, 0.2]} />
        </mesh>
        <mesh material={toon('#ffc93c')} position={[0, 0.98, 0]}>
          <torusKnotGeometry args={[0.13, 0.05, 32, 6]} />
        </mesh>
      </group>
      <Signboard text="百寶屋" color="#e8457c" position={[-2.3, 0, 2.2]} />
    </group>
  );
}

/** 依區域 id 取得建築元件 */
export const BUILDINGS: Record<ZoneId, () => React.JSX.Element> = {
  math: MathCastle,
  zh: WordForest,
  en: AbcBeach,
  life: LifeVillage,
  tower: ChallengeTower,
  shop: TreasureShop,
};
