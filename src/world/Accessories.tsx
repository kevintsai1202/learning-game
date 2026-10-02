/**
 * 角色的外觀道具：眼鏡（face）、背後（back）、手持（hand），全部用基本幾何體組成。
 * 眼鏡畫在頭部座標系（頭半徑約 0.5）；背後與手持畫在身體座標系（身體中心約 y 0.78）。
 * 每種動物的眼睛位置、背部表面、手的位置不同，錨點集中在下面三張表。
 * 道具 id 與價格、解鎖條件在 src/store/catalog.ts。
 */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toon } from './materials';
import type { Animal } from '../store/save';
import type { MotionState } from './Avatar';

/** 道具動畫需要的角色狀態：移動速度與走路相位（和手腳擺動同一個相位） */
export interface AccessoryMotion {
  motion?: RefObject<MotionState>;
  anim: RefObject<{ phase: number }>;
}

// ---------- 錨點表 ----------

/** 眼鏡錨點：x 兩眼間距的一半、y 眼睛高度、z 鏡片所在的前後位置（眼睛前緣）、r 鏡片半徑、hw 頭的半寬、box 頭是否為方塊 */
interface FaceAnchor {
  x: number;
  y: number;
  z: number;
  r: number;
  hw: number;
  box?: boolean;
}

const DEFAULT_FACE: FaceAnchor = { x: 0.18, y: 0.08, z: 0.5, r: 0.1, hw: 0.5 };

/** 各動物的眼鏡錨點（數值對應 Avatar.tsx 裡各動物的眼睛位置） */
const FACE_ANCHOR: Partial<Record<Animal, FaceAnchor>> = {
  koala: { x: 0.22, y: 0.1, z: 0.475, r: 0.1, hw: 0.56 },
  panda: { x: 0.19, y: 0.07, z: 0.5, r: 0.11, hw: 0.5 },
  penguin: { x: 0.17, y: 0.04, z: 0.57, r: 0.085, hw: 0.5 },
  eagle: { x: 0.2, y: 0.1, z: 0.51, r: 0.1, hw: 0.5 },
  elephant: { x: 0.2, y: 0.1, z: 0.49, r: 0.095, hw: 0.55 },
  capybara: { x: 0.3, y: 0.215, z: 0.445, r: 0.105, hw: 0.5, box: true },
  fox: { x: 0.2, y: 0.1, z: 0.49, r: 0.095, hw: 0.5 },
};

/** 背部錨點：z 身體背面（y 約 0.9 處）的前後位置、w 身體半寬 */
interface BackAnchor {
  z: number;
  w: number;
}

const DEFAULT_BACK: BackAnchor = { z: -0.4, w: 0.4 };

/** 各動物的背部錨點（身體被放大的動物背面更靠後） */
const BACK_ANCHOR: Partial<Record<Animal, BackAnchor>> = {
  capybara: { z: -0.52, w: 0.46 },
  penguin: { z: -0.45, w: 0.45 },
};

/** 手持錨點：握在「手掌」的位置（手臂向外上方伸出的那一端）；翅膀動物握在翅尖 */
const HAND_ANCHOR: Partial<Record<Animal, [number, number, number]>> = {
  penguin: [0.56, 0.68, 0.1],
  eagle: [0.64, 0.62, 0.12],
};
const DEFAULT_HAND: [number, number, number] = [0.58, 1.12, 0.12];

// ---------- 共用幾何體（依需要建立後快取） ----------

let heartGeo: THREE.ExtrudeGeometry | null = null;
let starGeo: THREE.ExtrudeGeometry | null = null;
let capeGeo: THREE.ExtrudeGeometry | null = null;

/** 愛心：寬約 1.7、高約 1.4 的單位大小，用時以 scale 縮放，中心在原點 */
function heartGeometry(): THREE.ExtrudeGeometry {
  if (!heartGeo) {
    const s = new THREE.Shape();
    s.moveTo(0, -0.7);
    s.bezierCurveTo(-1.3, 0.1, -0.7, 0.9, 0, 0.35);
    s.bezierCurveTo(0.7, 0.9, 1.3, 0.1, 0, -0.7);
    heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: false });
    heartGeo.translate(0, 0, -0.125);
  }
  return heartGeo;
}

/** 五角星：外半徑 1，中心在原點 */
function starGeometry(): THREE.ExtrudeGeometry {
  if (!starGeo) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 1 : 0.45;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    starGeo = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false });
    starGeo.translate(0, 0, -0.175);
  }
  return starGeo;
}

/** 披風：上窄下寬的梯形（上緣在原點、往 -y 垂下），下緣微微彎曲 */
function capeGeometry(): THREE.ExtrudeGeometry {
  if (!capeGeo) {
    const s = new THREE.Shape();
    s.moveTo(-0.27, 0);
    s.lineTo(0.27, 0);
    s.lineTo(0.5, -0.8);
    s.quadraticCurveTo(0, -0.9, -0.5, -0.8);
    s.lineTo(-0.27, 0);
    capeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  }
  return capeGeo;
}

// ---------- 眼鏡 ----------

/** 眼鏡鏡腳：從鏡框外側往後貼著頭側面伸到耳朵的位置 */
function Temples({ a, mat }: { a: FaceAnchor; mat: THREE.Material }) {
  const xs = a.x + a.r;
  const xe = a.box ? a.hw : a.hw * 0.93;
  const ze = a.box ? -0.02 : 0.5 * Math.sqrt(Math.max(1 - (xe / a.hw) ** 2 - (a.y / 0.5) ** 2, 0.03));
  const dx = xe - xs;
  const dz = ze - a.z;
  const len = Math.hypot(dx, dz);
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} material={mat} position={[s * (xs + xe) / 2, a.y, (a.z + ze) / 2]} rotation={[0, Math.atan2(s * dx, dz), 0]}>
          <boxGeometry args={[0.022, 0.022, len]} />
        </mesh>
      ))}
    </>
  );
}

/** 眼鏡：圓框、墨鏡、愛心三種，貼在眼睛前方 */
export function Glasses({ id, animal }: { id: string; animal: Animal }) {
  const a = FACE_ANCHOR[animal] ?? DEFAULT_FACE;
  if (id === 'face.round') {
    const frame = toon('#3a3a52');
    return (
      <group>
        {[-1, 1].map((s) => (
          <mesh key={s} material={frame} position={[s * a.x, a.y, a.z]}>
            <torusGeometry args={[a.r, 0.017, 8, 24]} />
          </mesh>
        ))}
        <mesh material={frame} position={[0, a.y + a.r * 0.35, a.z]}>
          <boxGeometry args={[a.x * 2 - a.r * 2 + 0.03, 0.022, 0.022]} />
        </mesh>
        <Temples a={a} mat={frame} />
      </group>
    );
  }
  if (id === 'face.sun') {
    const dark = toon('#1c1c2b');
    return (
      <group>
        {[-1, 1].map((s) => (
          <mesh key={s} material={dark} position={[s * a.x, a.y, a.z]} rotation={[Math.PI / 2, 0, 0]} scale={[1.08, 1, 0.9]}>
            <cylinderGeometry args={[a.r * 1.05, a.r * 1.05, 0.04, 20]} />
          </mesh>
        ))}
        <mesh material={dark} position={[0, a.y + a.r * 0.3, a.z]}>
          <boxGeometry args={[a.x * 2 - a.r * 2 + 0.05, 0.03, 0.03]} />
        </mesh>
        <Temples a={a} mat={dark} />
      </group>
    );
  }
  // face.heart：兩顆粉紅色愛心鏡框
  const pink = toon('#ff4f8b');
  const hs = a.r * 1.3;
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} material={pink} geometry={heartGeometry()} position={[s * a.x, a.y, a.z]} scale={[hs, hs, 0.28]} />
      ))}
      <mesh material={pink} position={[0, a.y + a.r * 0.2, a.z]}>
        <boxGeometry args={[a.x * 2 - a.r * 1.6, 0.025, 0.025]} />
      </mesh>
      <Temples a={a} mat={pink} />
    </group>
  );
}

// ---------- 背後 ----------

/** 背後道具：小書包、紅披風、天使翅膀、金色披風 */
export function BackItem({ id, animal, motion, anim }: { id: string; animal: Animal } & AccessoryMotion) {
  const a = BACK_ANCHOR[animal] ?? DEFAULT_BACK;
  if (id === 'back.bag') return <Bag a={a} />;
  if (id === 'back.wings') return <AngelWings a={a} motion={motion} anim={anim} />;
  return <Cape a={a} gold={id === 'back.gold-cape'} motion={motion} anim={anim} />;
}

/** 小書包：貼在背上的方塊，上面有掀蓋、前面有口袋 */
function Bag({ a }: { a: BackAnchor }) {
  const body = toon('#3f8ae0');
  const trim = toon('#ffc93c');
  const w = Math.min(0.52, a.w * 1.1);
  return (
    <group position={[0, 0.88, a.z - 0.09]}>
      <mesh material={body}>
        <boxGeometry args={[w, 0.5, 0.2]} />
      </mesh>
      <mesh material={body} position={[0, 0.2, -0.015]} scale={[1.04, 1, 1.1]}>
        <boxGeometry args={[w, 0.16, 0.2]} />
      </mesh>
      <mesh material={trim} position={[0, -0.08, -0.115]}>
        <boxGeometry args={[w * 0.7, 0.2, 0.03]} />
      </mesh>
      <mesh material={trim} position={[0, 0.14, -0.115]}>
        <boxGeometry args={[0.07, 0.06, 0.03]} />
      </mesh>
    </group>
  );
}

/** 披風：從肩膀垂下，往後微微飄；走路時下擺晃動 */
function Cape({ a, gold, motion, anim }: { a: BackAnchor; gold: boolean } & AccessoryMotion) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    const speed = motion?.current.speed ?? 0;
    const walking = speed > 0.1;
    const t = state.clock.elapsedTime;
    const sway = walking ? 0.12 + speed * 0.02 + Math.sin(anim.current.phase) * 0.05 : Math.sin(t * 1.5) * 0.015;
    g.current.rotation.x = -(0.2 + sway);
  });
  const main = toon(gold ? '#ffc93c' : '#e63946');
  const trim = toon(gold ? '#e89a00' : '#a4161a');
  const sx = a.w / 0.4;
  return (
    <group ref={g} position={[0, 1.2, a.z + 0.04]}>
      <mesh material={trim} geometry={capeGeometry()} position={[0, 0.0, -0.035]} scale={[sx * 1.04, 1.02, 1]} />
      <mesh material={main} geometry={capeGeometry()} position={[0, 0, -0.005]} scale={[sx, 1, 1]} />
      <mesh material={trim} position={[0, 0.0, 0.02]}>
        <boxGeometry args={[0.6 * sx, 0.07, 0.05]} />
      </mesh>
    </group>
  );
}

/** 天使翅膀：兩邊各四片白色羽毛呈扇形，從肩膀後方往外往上張開，輕輕拍動 */
function AngelWings({ a, motion, anim }: { a: BackAnchor } & AccessoryMotion) {
  const refs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  useFrame((state) => {
    const speed = motion?.current.speed ?? 0;
    const walking = speed > 0.1;
    const t = state.clock.elapsedTime;
    const flap = walking ? Math.sin(anim.current.phase * 0.9) * 0.22 : Math.sin(t * 2.5) * 0.09;
    refs.forEach((r, i) => {
      if (r.current) r.current.rotation.y = (i === 0 ? -1 : 1) * (0.55 + flap);
    });
  });
  const white = toon('#ffffff');
  const soft = toon('#dff1ff');
  const feathers = [
    { len: 0.85, ang: 0.75, mat: white },
    { len: 0.8, ang: 0.35, mat: soft },
    { len: 0.66, ang: -0.05, mat: white },
    { len: 0.52, ang: -0.45, mat: soft },
  ];
  return (
    <>
      {[-1, 1].map((s, i) => (
        <group key={s} ref={refs[i]} position={[s * 0.14, 1.08, a.z - 0.05]}>
          {/* 往 s 方向展開的羽毛，整組外傾 */}
          <group rotation={[0, 0, s * 0.35]}>
            {feathers.map((f, k) => (
              <group key={k} rotation={[0, 0, s * f.ang]}>
                <mesh material={f.mat} position={[s * f.len * 0.5, 0, 0]} scale={[f.len * 0.5, 0.095, 0.03]}>
                  <sphereGeometry args={[1, 10, 8]} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      ))}
    </>
  );
}

// ---------- 手持 ----------

/** 手持道具：小旗子、氣球、向日葵、星星魔法棒、毛筆。握在手掌位置，走路時跟著手臂擺動 */
export function HandItem({ id, animal, motion, anim }: { id: string; animal: Animal } & AccessoryMotion) {
  const p = HAND_ANCHOR[animal] ?? DEFAULT_HAND;
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const walking = (motion?.current.speed ?? 0) > 0.1;
    // 與右手臂相同的擺動（Avatar.tsx：armR.rotation.x = swing * 0.8）
    g.current.rotation.x = walking ? Math.sin(anim.current.phase) * 0.6 * 0.8 : 0;
  });
  return (
    <group ref={g} position={p}>
      <group rotation={[0, 0, -0.12]}>
        {id === 'hand.flag' && <Flag />}
        {id === 'hand.balloon' && <Balloon />}
        {id === 'hand.sunflower' && <Sunflower />}
        {id === 'hand.star-wand' && <StarWand />}
        {id === 'hand.brush' && <Brush />}
      </group>
    </group>
  );
}

/** 小旗子：木桿加紅色旗面，旗面左右擺動 */
function Flag() {
  const cloth = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(state.clock.elapsedTime * 5) * 0.28;
  });
  return (
    <group>
      <mesh material={toon('#b98a52')} position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.8, 8]} />
      </mesh>
      <mesh material={toon('#ffc93c')} position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.03, 8, 6]} />
      </mesh>
      <group ref={cloth} position={[0, 0.6, 0]}>
        <mesh material={toon('#e8457c')} position={[0.15, 0, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.018]} />
        </mesh>
        <mesh material={toon('#ffffff')} position={[0.1, 0, 0.012]}>
          <circleGeometry args={[0.05, 12]} />
        </mesh>
      </group>
    </group>
  );
}

/** 氣球：細線牽著紅氣球，整顆上下飄、左右輕晃 */
function Balloon() {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    const t = state.clock.elapsedTime;
    g.current.position.y = Math.sin(t * 2) * 0.04;
    g.current.rotation.z = Math.sin(t * 1.4) * 0.07;
  });
  return (
    <group ref={g}>
      <mesh material={toon('#ffffff')} position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.6, 5]} />
      </mesh>
      <mesh material={toon('#ff4d4d')} position={[0, 0.8, 0]} scale={[1, 1.18, 1]}>
        <sphereGeometry args={[0.2, 16, 12]} />
      </mesh>
      <mesh material={toon('#ff4d4d')} position={[0, 0.59, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.04, 0.06, 8]} />
      </mesh>
      <mesh material={toon('#ffffff')} position={[-0.07, 0.88, 0.14]} scale={[1, 1.4, 0.5]}>
        <sphereGeometry args={[0.035, 8, 6]} />
      </mesh>
    </group>
  );
}

/** 向日葵：綠色花莖與葉子，頂端一朵面向前方的花（八片花瓣加褐色花心） */
function Sunflower() {
  const petal = toon('#ffc91f');
  return (
    <group>
      <mesh material={toon('#3fae4a')} position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.02, 0.025, 0.6, 8]} />
      </mesh>
      <mesh material={toon('#3fae4a')} position={[0.07, 0.2, 0]} rotation={[0, 0, -0.7]} scale={[1.6, 0.35, 0.8]}>
        <sphereGeometry args={[0.07, 8, 6]} />
      </mesh>
      <group position={[0, 0.58, 0.02]}>
        {Array.from({ length: 8 }, (_, i) => {
          const ang = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} material={petal} position={[Math.cos(ang) * 0.12, Math.sin(ang) * 0.12, 0]} rotation={[0, 0, ang]} scale={[1.5, 0.75, 0.4]}>
              <sphereGeometry args={[0.065, 8, 6]} />
            </mesh>
          );
        })}
        <mesh material={toon('#6b3f1d')} position={[0, 0, 0.02]} scale={[1, 1, 0.55]}>
          <sphereGeometry args={[0.095, 12, 10]} />
        </mesh>
      </group>
    </group>
  );
}

/** 星星魔法棒：白色棒身加金色星星，星星慢慢旋轉，旁邊兩顆小亮點閃爍 */
function StarWand() {
  const star = useRef<THREE.Group>(null);
  const spark = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (star.current) star.current.rotation.y = t * 1.8;
    spark.forEach((s, i) => {
      if (s.current) s.current.scale.setScalar(0.6 + 0.4 * Math.abs(Math.sin(t * 3 + i * 1.7)));
    });
  });
  return (
    <group>
      <mesh material={toon('#fff6e0')} position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.02, 0.026, 0.55, 8]} />
      </mesh>
      <mesh material={toon('#ff9db0')} position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.08, 8]} />
      </mesh>
      <group ref={star} position={[0, 0.6, 0]}>
        <mesh material={toon('#ffd23c')} geometry={starGeometry()} scale={[0.16, 0.16, 0.16]} />
      </group>
      <mesh ref={spark[0]} material={toon('#ffffff')} position={[0.17, 0.7, 0.05]}>
        <octahedronGeometry args={[0.04]} />
      </mesh>
      <mesh ref={spark[1]} material={toon('#fff3a0')} position={[-0.15, 0.52, 0.06]}>
        <octahedronGeometry args={[0.03]} />
      </mesh>
    </group>
  );
}

/** 毛筆：竹色筆桿、黑色筆毛朝上，筆桿頂端有一圈紅繩 */
function Brush() {
  return (
    <group>
      <mesh material={toon('#d6b26a')} position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.022, 0.026, 0.55, 8]} />
      </mesh>
      <mesh material={toon('#c0392b')} position={[0, -0.04, 0]}>
        <sphereGeometry args={[0.035, 8, 6]} />
      </mesh>
      <mesh material={toon('#2b2a4c')} position={[0, 0.54, 0]}>
        <coneGeometry args={[0.04, 0.2, 10]} />
      </mesh>
      <mesh material={toon('#2b2a4c')} position={[0, 0.46, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.04, 8]} />
      </mesh>
    </group>
  );
}
