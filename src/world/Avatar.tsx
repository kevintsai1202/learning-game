/**
 * 小動物角色（熊、兔、貓、狗、卡皮巴拉、熊貓、企鵝、狐狸、無尾熊、小豬、老鷹、大象）：
 * 全部用基本幾何體組成，不需要外部模型檔。
 * 走路時腳與手會擺動、身體上下晃；mood 改變時會跳一下或歪頭。
 * 每隻動物的網格數量控制在 45 個以內（多人連線時會同時顯示很多角色）。
 */
import { useRef, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toon } from './materials';
import type { Animal, AvatarConfig } from '../store/save';
import type { StageMood } from '../store/useUi';
import { Hat } from './Hats';

/** 角色的即時移動狀態（由控制器每幀寫入，避免 React 重新渲染） */
export interface MotionState {
  /** 目前速度（公尺／秒） */
  speed: number;
}

interface AvatarProps {
  config: AvatarConfig;
  motion?: RefObject<MotionState>;
  mood?: StageMood;
  moodTick?: number;
}

/** 依底色算出肚子、口鼻部的淺色 */
function lighter(color: string, amount = 0.45): string {
  const c = new THREE.Color(color);
  c.lerp(new THREE.Color('#fff8ec'), amount);
  return `#${c.getHexString()}`;
}

/** 把底色往另一個顏色混（用來做口鼻、耳內側等比身體深一點的色塊） */
function mix(color: string, to: string, amount: number): string {
  const c = new THREE.Color(color);
  c.lerp(new THREE.Color(to), amount);
  return `#${c.getHexString()}`;
}

/** 圓角方塊幾何體的快取（依尺寸共用，避免每次渲染重新擠出） */
const roundedBoxCache = new Map<string, THREE.ExtrudeGeometry>();

/**
 * 圓角方塊：先畫圓角矩形（寬 w、高 h、轉角半徑 r）再沿 z 擠出深度 d，前後邊緣加倒角，
 * 中心在原點。卡皮巴拉方方的吐司頭與長口鼻用它做。
 */
function roundedBox(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  const key = [w, h, d, r].join(',');
  let g = roundedBoxCache.get(key);
  if (!g) {
    const bev = Math.min(r * 0.6, d * 0.25);
    const iw = w - 2 * bev;
    const ih = h - 2 * bev;
    const ir = Math.max(r - bev, 0.01);
    const sh = new THREE.Shape();
    sh.moveTo(-iw / 2 + ir, -ih / 2);
    sh.lineTo(iw / 2 - ir, -ih / 2);
    sh.quadraticCurveTo(iw / 2, -ih / 2, iw / 2, -ih / 2 + ir);
    sh.lineTo(iw / 2, ih / 2 - ir);
    sh.quadraticCurveTo(iw / 2, ih / 2, iw / 2 - ir, ih / 2);
    sh.lineTo(-iw / 2 + ir, ih / 2);
    sh.quadraticCurveTo(-iw / 2, ih / 2, -iw / 2, ih / 2 - ir);
    sh.lineTo(-iw / 2, -ih / 2 + ir);
    sh.quadraticCurveTo(-iw / 2, -ih / 2, -iw / 2 + ir, -ih / 2);
    g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -(d - 2 * bev) / 2);
    roundedBoxCache.set(key, g);
  }
  return g;
}

/** 一隻角色會用到的材質組 */
interface Palette {
  /** 孩子選的身體顏色 */
  accent: THREE.Material;
  /** 頭與身體的主色（熊貓是白色、其餘就是孩子選的顏色） */
  fur: THREE.Material;
  /** 底色變淺（肚子、口鼻） */
  pale: THREE.Material;
  dark: THREE.Material;
  pink: THREE.Material;
  white: THREE.Material;
}

/** 各動物戴帽子時，帽子相對於預設位置的上下位移（頭比較扁的動物要壓低一點） */
const HAT_LIFT: Partial<Record<Animal, number>> = { capybara: -0.2, penguin: 0.02 };

/** 帽子前後位移：卡皮巴拉的頭是往前長的方塊，頭中心比球形頭靠前 */
const HAT_SHIFT_Z: Partial<Record<Animal, number>> = { capybara: 0 };

/** 走路時以「翅膀」取代手的動物 */
const WINGED: Animal[] = ['penguin', 'eagle'];

export function Avatar({ config, motion, mood = 'idle', moodTick = 0 }: AvatarProps) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const tail = useRef<THREE.Group>(null);
  /** 走路相位與 mood 動畫起點 */
  const anim = useRef({ phase: 0, moodStart: -1, lastTick: -1 });
  const animal = config.animal;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const a = anim.current;
    if (moodTick !== a.lastTick) {
      a.lastTick = moodTick;
      a.moodStart = t;
    }
    const speed = motion?.current.speed ?? 0;
    const walking = speed > 0.1;
    a.phase += dt * (walking ? 9 + speed : 2);
    const swing = walking ? Math.sin(a.phase) * 0.6 : 0;
    if (legL.current && legR.current) {
      legL.current.rotation.x = swing;
      legR.current.rotation.x = -swing;
    }
    if (armL.current && armR.current) {
      armL.current.rotation.x = -swing * 0.8;
      armR.current.rotation.x = swing * 0.8;
    }
    if (tail.current) tail.current.rotation.z = Math.sin(t * (animal === 'dog' ? 14 : 3)) * 0.35;
    if (!body.current || !root.current) return;
    // 走路時上下晃，站著時輕輕呼吸
    body.current.position.y = walking ? Math.abs(Math.sin(a.phase)) * 0.12 : Math.sin(t * 2) * 0.02;
    // mood 動畫：答對跳一下、答錯歪頭、慶祝連跳
    const since = t - a.moodStart;
    let jump = 0;
    let tilt = 0;
    if (a.moodStart >= 0) {
      if (mood === 'happy' && since < 0.6) jump = Math.sin((since / 0.6) * Math.PI) * 0.8;
      if (mood === 'cheer' && since < 2.4) jump = Math.abs(Math.sin(since * Math.PI * 2.5)) * 0.6;
      if (mood === 'oops' && since < 1.2) tilt = Math.sin((since / 1.2) * Math.PI) * 0.35;
    }
    root.current.position.y = jump;
    body.current.rotation.z = tilt;
  });

  const accent = toon(config.color);
  const white = toon('#ffffff');
  const pal: Palette = {
    accent,
    // 熊貓的身體與臉是白色，孩子選的顏色改用在耳朵、眼圈、手腳
    fur: animal === 'panda' ? white : accent,
    pale: toon(lighter(config.color)),
    dark: toon('#2b2a4c'),
    pink: toon('#ff9db0'),
    white,
  };
  /** 頭的材質（老鷹的頭是白色） */
  const headMat = animal === 'eagle' ? white : pal.fur;
  /** 肚子的材質（企鵝、熊貓、狐狸的肚子／胸口是白色） */
  const bellyMat = animal === 'penguin' || animal === 'panda' || animal === 'fox' ? white : animal === 'elephant' || animal === 'capybara' ? pal.fur : pal.pale;
  /** 身體、頭的縮放：卡皮巴拉身體圓桶、無尾熊頭寬扁 */
  const bodyScale: [number, number, number] = animal === 'capybara' ? [1.15, 0.9, 1.3] : animal === 'penguin' ? [1.12, 1.06, 1.12] : [1, 1, 1];
  const headScale: [number, number, number] = animal === 'koala' ? [1.12, 1, 1.02] : animal === 'elephant' ? [1.1, 1.04, 1] : [1, 1, 1];
  const winged = WINGED.includes(animal);

  return (
    <group ref={root}>
      <group ref={body}>
        {/* 身體與肚子 */}
        <mesh material={animal === 'panda' ? white : accent} position={[0, 0.78, 0]} scale={bodyScale} castShadow>
          <capsuleGeometry args={[0.4, 0.42, 6, 16]} />
        </mesh>
        <mesh
          material={bellyMat}
          position={[0, animal === 'penguin' ? 0.76 : 0.74, animal === 'penguin' ? 0.32 : 0.27]}
          scale={animal === 'penguin' ? [1.0, 1.2, 0.55] : [0.75, 0.85, 0.45]}
        >
          <sphereGeometry args={[0.36, 16, 12]} />
        </mesh>
        {/* 頭 */}
        <group position={[0, 1.55, 0]}>
          {animal === 'capybara' ? (
            // 卡皮巴拉：方方的吐司頭（前後比左右長）
            <mesh key="capy-head" material={headMat} geometry={roundedBox(1.0, 0.64, 0.66, 0.18)} position={[0, -0.02, 0]} castShadow />
          ) : (
            <mesh key="round-head" material={headMat} scale={headScale} castShadow>
              <sphereGeometry args={[0.5, 24, 18]} />
            </mesh>
          )}
          <Face animal={animal} pal={pal} color={config.color} />
          <Ears animal={animal} pal={pal} color={config.color} />
          {config.hat ? (
            <group position={[0, HAT_LIFT[animal] ?? 0, HAT_SHIFT_Z[animal] ?? 0]}>
              <Hat id={config.hat} />
            </group>
          ) : (
            animal === 'capybara' && <OrangeOnHead />
          )}
        </group>
        {/* 手（企鵝、老鷹是翅膀） */}
        {winged ? <Wings animal={animal} pal={pal} armL={armL} armR={armR} /> : <Arms animal={animal} pal={pal} armL={armL} armR={armR} />}
        {/* 尾巴 */}
        <group ref={tail} position={[0, 0.55, -0.38]}>
          <Tail animal={animal} pal={pal} />
        </group>
      </group>
      {/* 腳 */}
      <Legs animal={animal} pal={pal} legL={legL} legR={legR} />
    </group>
  );
}

/** 一對眼睛（含反光），位置與大小可調 */
function Eyes({ pal, x = 0.18, y = 0.08, z = 0.43, r = 0.065 }: { pal: Palette; x?: number; y?: number; z?: number; r?: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * x, y, z]}>
          <mesh material={pal.dark}>
            <sphereGeometry args={[r, 12, 10]} />
          </mesh>
          <mesh material={pal.white} position={[r * 0.3, r * 0.4, r * 0.75]}>
            <sphereGeometry args={[r * 0.31, 8, 6]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** 腮紅 */
function Blush({ pal, x = 0.3, y = -0.1, z = 0.36 }: { pal: Palette; x?: number; y?: number; z?: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} material={pal.pink} position={[s * x, y, z]} scale={[1, 0.6, 0.4]}>
          <sphereGeometry args={[0.07, 10, 8]} />
        </mesh>
      ))}
    </>
  );
}

/** 臉部五官（口鼻、鼻子、眼睛、腮紅），座標是頭部座標系（頭半徑約 0.5） */
function Face({ animal, pal, color }: { animal: Animal; pal: Palette; color: string }) {
  const { dark, white, pale } = pal;
  switch (animal) {
    case 'panda':
      return (
        <>
          {/* 眼圈（孩子選的顏色）與白色眼睛 */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.19, 0.07, 0.4]}>
              <mesh material={pal.accent} rotation={[0, 0, s * 0.45]} scale={[0.8, 1.2, 0.45]}>
                <sphereGeometry args={[0.13, 14, 10]} />
              </mesh>
              <mesh material={white} position={[0, 0, 0.045]}>
                <sphereGeometry args={[0.05, 10, 8]} />
              </mesh>
              <mesh material={dark} position={[0, 0, 0.075]}>
                <sphereGeometry args={[0.028, 8, 6]} />
              </mesh>
            </group>
          ))}
          <mesh material={white} position={[0, -0.1, 0.42]} scale={[1.1, 0.8, 0.7]}>
            <sphereGeometry args={[0.17, 16, 12]} />
          </mesh>
          <mesh material={dark} position={[0, -0.04, 0.55]} scale={[1.3, 0.9, 1]}>
            <sphereGeometry args={[0.055, 10, 8]} />
          </mesh>
          <Blush pal={pal} x={0.32} y={-0.12} z={0.33} />
        </>
      );
    case 'penguin':
      return (
        <>
          {/* 白色臉（上面留一頂深色頭髮） */}
          <mesh material={white} position={[0, -0.12, 0.13]} scale={[1, 0.92, 0.92]}>
            <sphereGeometry args={[0.43, 20, 14]} />
          </mesh>
          <Eyes pal={pal} x={0.17} y={0.04} z={0.5} r={0.06} />
          {/* 橘色扁嘴喙 */}
          <mesh material={toon('#ff9d2e')} position={[0, -0.08, 0.56]} rotation={[Math.PI / 2, 0, 0]} scale={[1.4, 1, 0.6]}>
            <coneGeometry args={[0.11, 0.3, 12]} />
          </mesh>
          <Blush pal={pal} x={0.31} y={-0.1} z={0.4} />
        </>
      );
    case 'eagle':
      return (
        <>
          {/* 黃色帶鉤嘴喙 */}
          <mesh material={toon('#ffc21f')} position={[0, -0.05, 0.46]} scale={[0.78, 0.8, 1.25]}>
            <sphereGeometry args={[0.15, 14, 10]} />
          </mesh>
          <mesh material={toon('#ffc21f')} position={[0, -0.18, 0.62]} rotation={[Math.PI + 0.35, 0, 0]}>
            <coneGeometry args={[0.075, 0.24, 10]} />
          </mesh>
          {/* 銳利的黃眼睛與眉毛 */}
          {[-1, 1].map((s) => (
            <group key={s}>
              <group position={[s * 0.2, 0.1, 0.42]}>
                <mesh material={toon('#ffd23c')}>
                  <sphereGeometry args={[0.075, 12, 10]} />
                </mesh>
                <mesh material={dark} position={[0, 0, 0.05]}>
                  <sphereGeometry args={[0.04, 8, 6]} />
                </mesh>
              </group>
              <mesh material={pal.accent} position={[s * 0.2, 0.2, 0.42]} rotation={[0, 0, s * 0.4]} scale={[1, 0.3, 0.4]}>
                <boxGeometry args={[0.2, 0.15, 0.15]} />
              </mesh>
            </group>
          ))}
        </>
      );
    case 'elephant':
      return (
        <>
          <Eyes pal={pal} x={0.2} y={0.1} z={0.42} r={0.06} />
          <Blush pal={pal} x={0.32} y={-0.08} z={0.33} />
          <Trunk pal={pal} />
          {/* 小象牙 */}
          {[-1, 1].map((s) => (
            <mesh key={s} material={toon('#fff6e0')} position={[s * 0.16, -0.2, 0.42]} rotation={[Math.PI / 2 + 0.55, 0, s * -0.12]}>
              <coneGeometry args={[0.045, 0.22, 8]} />
            </mesh>
          ))}
        </>
      );
    case 'capybara': {
      // 口鼻和頭同一個毛色（略深一點），鼻墊更深
      const snout = toon(mix(color, '#3a2418', 0.1));
      const padMat = toon(mix(color, '#24150c', 0.55));
      return (
        <>
          {/* 口鼻：頭的前段往前延伸，寬高只比頭前端小一點、底部齊平、邊緣圓，前端鈍圓 */}
          <mesh material={snout} geometry={roundedBox(0.88, 0.44, 0.52, 0.2)} position={[0, -0.13, 0.5]} />
          {/* 鼻墊：口鼻前端上緣一塊寬寬的深色橢圓，上面兩個深色橢圓鼻孔 */}
          <mesh material={padMat} position={[0, 0.0, 0.725]} scale={[3.1, 1.05, 0.6]}>
            <sphereGeometry args={[0.1, 16, 12]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={toon('#1d120a')} position={[s * 0.15, 0.01, 0.775]} scale={[0.8, 1.4, 0.5]}>
              <sphereGeometry args={[0.04, 10, 8]} />
            </mesh>
          ))}
          {/* 嘴巴：鼻墊下面一條淺淺的人字形短線 */}
          {[-1, 1].map((s) => (
            <mesh key={s} material={dark} position={[s * 0.05, -0.2, 0.745]} rotation={[0, 0, -s * 0.4]}>
              <boxGeometry args={[0.1, 0.022, 0.03]} />
            </mesh>
          ))}
          {/* 小眼睛，位置高，上半部被毛色眼皮蓋住（放空的半閉眼），加一點反光讓正面看得到 */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.3, 0.215, 0.335]}>
              <mesh material={dark}>
                <sphereGeometry args={[0.072, 12, 10]} />
              </mesh>
              <mesh material={pal.white} position={[0.02 * s, -0.012, 0.062]}>
                <sphereGeometry args={[0.016, 8, 6]} />
              </mesh>
              <mesh material={pal.fur} position={[0, 0.036, 0.018]} scale={[1.05, 0.52, 1]}>
                <sphereGeometry args={[0.084, 12, 10]} />
              </mesh>
            </group>
          ))}
        </>
      );
    }
    case 'fox':
      return (
        <>
          {/* 兩頰的白毛 */}
          {[-1, 1].map((s) => (
            <mesh key={s} material={white} position={[s * 0.28, -0.14, 0.27]} rotation={[0, 0, s * -0.5]} scale={[1.3, 0.8, 1]}>
              <sphereGeometry args={[0.2, 12, 10]} />
            </mesh>
          ))}
          {/* 白色尖口鼻與黑鼻子 */}
          <mesh material={white} position={[0, -0.1, 0.55]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.8]}>
            <coneGeometry args={[0.23, 0.46, 14]} />
          </mesh>
          <mesh material={dark} position={[0, -0.06, 0.79]}>
            <sphereGeometry args={[0.055, 10, 8]} />
          </mesh>
          <Eyes pal={pal} x={0.2} y={0.1} z={0.42} r={0.055} />
        </>
      );
    case 'koala':
      return (
        <>
          {/* 大大的深色橢圓鼻子 */}
          <mesh material={dark} position={[0, -0.02, 0.5]} scale={[1, 1.5, 0.8]}>
            <sphereGeometry args={[0.1, 14, 10]} />
          </mesh>
          <Eyes pal={pal} x={0.22} y={0.1} z={0.41} r={0.055} />
          <Blush pal={pal} x={0.34} y={-0.1} z={0.3} />
        </>
      );
    case 'pig': {
      const snout = toon(mix(color, '#e8607f', 0.55));
      return (
        <>
          {/* 扁圓柱的豬鼻子與兩個鼻孔 */}
          <mesh material={snout} position={[0, -0.09, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.14, 20]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={dark} position={[s * 0.065, -0.09, 0.572]} scale={[0.7, 1.15, 0.5]}>
              <sphereGeometry args={[0.032, 8, 6]} />
            </mesh>
          ))}
          <Eyes pal={pal} />
          <Blush pal={pal} />
        </>
      );
    }
    default:
      // 熊、兔、貓、狗：原本的臉
      return (
        <>
          <mesh material={pale} position={[0, -0.1, 0.42]} scale={[1.1, 0.8, 0.7]}>
            <sphereGeometry args={[0.17, 16, 12]} />
          </mesh>
          <mesh material={dark} position={[0, -0.04, 0.55]}>
            <sphereGeometry args={[0.055, 10, 8]} />
          </mesh>
          <Eyes pal={pal} />
          <Blush pal={pal} />
        </>
      );
  }
}

/** 卡皮巴拉頭頂的橘子（橘色球加一片綠色小葉子）；戴帽子時由帽子取代 */
function OrangeOnHead() {
  return (
    <group position={[0, 0.45, -0.02]}>
      <mesh material={toon('#ff8c1a')} scale={[1, 0.92, 1]}>
        <sphereGeometry args={[0.2, 16, 12]} />
      </mesh>
      <mesh material={toon('#3fae4a')} position={[0.05, 0.19, 0]} rotation={[0, 0.5, -0.45]} scale={[1.3, 0.25, 0.7]}>
        <sphereGeometry args={[0.07, 8, 6]} />
      </mesh>
    </group>
  );
}

/** 大象的長鼻子：四段圓柱逐段變細、往前微微彎曲 */
function Trunk({ pal }: { pal: Palette }) {
  const radii = [0.15, 0.128, 0.108, 0.09];
  const segLen = 0.19;
  /** 由內往外遞迴組出巢狀的 group，每一段多轉一點角度 */
  const seg = (i: number): ReactNode => (
    <group key={i} position={[0, i === 0 ? 0 : -segLen, 0]} rotation={[i === 0 ? -0.1 : -0.22, 0, 0]}>
      <mesh material={pal.fur} position={[0, -segLen / 2, 0]}>
        <cylinderGeometry args={[radii[i], i + 1 < radii.length ? radii[i + 1] : radii[i] * 0.95, segLen + 0.02, 14]} />
      </mesh>
      {i + 1 < radii.length ? seg(i + 1) : null}
    </group>
  );
  return <group position={[0, -0.04, 0.45]}>{seg(0)}</group>;
}

/** 手（一般動物的圓柱手臂；熊貓的手是孩子選的顏色，大象的手同身體色） */
function Arms({ animal, pal, armL, armR }: { animal: Animal; pal: Palette; armL: RefObject<THREE.Mesh | null>; armR: RefObject<THREE.Mesh | null> }) {
  const mat = animal === 'panda' ? pal.accent : pal.fur;
  return (
    <>
      <mesh ref={armL} material={mat} position={[-0.45, 0.95, 0]} rotation={[0, 0, 0.5]} castShadow>
        <capsuleGeometry args={[0.1, 0.3, 4, 8]} />
      </mesh>
      <mesh ref={armR} material={mat} position={[0.45, 0.95, 0]} rotation={[0, 0, -0.5]} castShadow>
        <capsuleGeometry args={[0.1, 0.3, 4, 8]} />
      </mesh>
    </>
  );
}

/** 翅膀：企鵝是扁平的鰭狀翅膀，老鷹是長翅膀（翅尾有三根深色飛羽） */
function Wings({ animal, pal, armL, armR }: { animal: Animal; pal: Palette; armL: RefObject<THREE.Mesh | null>; armR: RefObject<THREE.Mesh | null> }) {
  const eagle = animal === 'eagle';
  return (
    <>
      {([-1, 1] as const).map((s) => (
        <mesh
          key={s}
          ref={s === -1 ? armL : armR}
          material={pal.accent}
          position={[s * (eagle ? 0.5 : 0.46), 0.93, -0.02]}
          rotation={[0, 0, s * (eagle ? 0.3 : 0.22)]}
          scale={eagle ? [0.3, 1.9, 0.95] : [0.22, 1.55, 0.8]}
          castShadow
        >
          <sphereGeometry args={[0.2, 14, 12]} />
          {eagle &&
            [-1, 0, 1].map((k) => (
              <mesh key={k} material={pal.dark} position={[k * 0.1, -0.2, 0]} rotation={[0, 0, k * 0.25]} scale={[0.5, 1.1, 0.8]}>
                <sphereGeometry args={[0.09, 8, 6]} />
              </mesh>
            ))}
        </mesh>
      ))}
    </>
  );
}

/** 腳（企鵝橘色扁腳、老鷹黃色細腳加爪、狐狸黑襪子、熊貓用孩子選的顏色、大象粗腿） */
function Legs({ animal, pal, legL, legR }: { animal: Animal; pal: Palette; legL: RefObject<THREE.Mesh | null>; legR: RefObject<THREE.Mesh | null> }) {
  if (animal === 'penguin') {
    return (
      <>
        {([-1, 1] as const).map((s) => (
          <mesh key={s} ref={s === -1 ? legL : legR} material={toon('#ff9d2e')} position={[s * 0.18, 0.08, 0.14]} scale={[1, 0.38, 1.6]} castShadow>
            <sphereGeometry args={[0.13, 12, 8]} />
          </mesh>
        ))}
      </>
    );
  }
  if (animal === 'eagle') {
    const yellow = toon('#ffc21f');
    return (
      <>
        {([-1, 1] as const).map((s) => (
          <mesh key={s} ref={s === -1 ? legL : legR} material={yellow} position={[s * 0.18, 0.2, 0.02]} castShadow>
            <capsuleGeometry args={[0.07, 0.2, 4, 8]} />
            {/* 腳爪 */}
            <mesh material={yellow} position={[0, -0.16, 0.1]} scale={[1.5, 0.5, 2.1]}>
              <sphereGeometry args={[0.09, 8, 6]} />
            </mesh>
          </mesh>
        ))}
      </>
    );
  }
  const mat = animal === 'panda' ? pal.accent : pal.fur;
  const thick = animal === 'elephant' ? 1.12 : 1;
  /** 卡皮巴拉腿短 */
  const legY = animal === 'capybara' ? 0.8 : 1;
  return (
    <>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} ref={s === -1 ? legL : legR} material={mat} position={[s * 0.18, animal === 'capybara' ? 0.15 : 0.18, 0.02]} scale={[thick, legY, thick]} castShadow>
          <capsuleGeometry args={[0.13, 0.16, 4, 8]} />
          {animal === 'fox' && (
            <mesh material={pal.dark} position={[0, -0.13, 0.01]} scale={[1, 0.7, 1.1]}>
              <sphereGeometry args={[0.135, 10, 8]} />
            </mesh>
          )}
        </mesh>
      ))}
    </>
  );
}

/** 各種動物的耳朵（沒有耳朵的企鵝、老鷹回傳 null） */
function Ears({ animal, pal, color }: { animal: Animal; pal: Palette; color: string }) {
  const { fur, pink: inner } = pal;
  if (animal === 'penguin' || animal === 'eagle') return null;
  if (animal === 'rabbit') {
    return (
      <>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.18, 0.55, -0.02]} rotation={[0, 0, -s * 0.15]}>
            <mesh material={fur}>
              <capsuleGeometry args={[0.1, 0.5, 4, 10]} />
            </mesh>
            <mesh material={inner} position={[0, 0, 0.06]} scale={[0.55, 0.85, 0.4]}>
              <capsuleGeometry args={[0.1, 0.5, 4, 10]} />
            </mesh>
          </group>
        ))}
      </>
    );
  }
  if (animal === 'cat') {
    return (
      <>
        {[-1, 1].map((s) => (
          <mesh key={s} material={fur} position={[s * 0.3, 0.42, 0]} rotation={[0, 0, -s * 0.35]}>
            <coneGeometry args={[0.17, 0.32, 4]} />
          </mesh>
        ))}
      </>
    );
  }
  if (animal === 'dog') {
    return (
      <>
        {[-1, 1].map((s) => (
          <mesh key={s} material={fur} position={[s * 0.47, 0.05, 0]} rotation={[0, 0, s * 0.25]} scale={[0.55, 1.25, 0.45]}>
            <sphereGeometry args={[0.22, 12, 10]} />
          </mesh>
        ))}
      </>
    );
  }
  if (animal === 'panda') {
    // 熊貓：圓耳朵用孩子選的顏色
    return (
      <>
        {[-1, 1].map((s) => (
          <mesh key={s} material={pal.accent} position={[s * 0.35, 0.38, -0.02]}>
            <sphereGeometry args={[0.17, 12, 10]} />
          </mesh>
        ))}
      </>
    );
  }
  if (animal === 'fox') {
    // 狐狸：尖長的大耳朵，內側米白、耳尖深色
    return (
      <>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.28, 0.5, -0.02]} rotation={[0, 0, -s * 0.22]}>
            <mesh material={fur}>
              <coneGeometry args={[0.25, 0.64, 4]} />
            </mesh>
            <mesh material={toon('#fff1dc')} position={[0, -0.06, 0.07]} scale={[0.6, 0.8, 0.4]}>
              <coneGeometry args={[0.25, 0.64, 4]} />
            </mesh>
            <mesh material={pal.dark} position={[0, 0.23, 0.0]}>
              <coneGeometry args={[0.09, 0.18, 4]} />
            </mesh>
          </group>
        ))}
      </>
    );
  }
  if (animal === 'koala') {
    // 無尾熊：很大的圓耳朵，內側淺色蓬鬆（邊緣一圈小毛球）
    const fluff = toon(lighter(color, 0.75));
    return (
      <>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.46, 0.27, -0.04]}>
            <mesh material={fur}>
              <sphereGeometry args={[0.27, 16, 12]} />
            </mesh>
            <mesh material={fluff} position={[0, 0, 0.1]} scale={[0.78, 0.78, 0.5]}>
              <sphereGeometry args={[0.24, 14, 10]} />
            </mesh>
            {Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * Math.PI * 2;
              return (
                <mesh key={i} material={fluff} position={[Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.16]}>
                  <sphereGeometry args={[0.07, 8, 6]} />
                </mesh>
              );
            })}
          </group>
        ))}
      </>
    );
  }
  if (animal === 'elephant') {
    // 大象：大片扁平的耳朵，微微向外張開，內側粉色
    return (
      <>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.52, 0.08, -0.08]} rotation={[0, s * 0.6, 0]}>
            <mesh material={fur} scale={[0.13, 1.2, 1.1]}>
              <sphereGeometry args={[0.4, 18, 14]} />
            </mesh>
            <mesh material={inner} position={[s * 0.035, -0.02, 0.02]} scale={[0.1, 0.94, 0.86]}>
              <sphereGeometry args={[0.4, 14, 10]} />
            </mesh>
          </group>
        ))}
      </>
    );
  }
  if (animal === 'capybara') {
    // 卡皮巴拉：很小的圓耳朵，貼在頭頂後方的兩角
    return (
      <>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.38, 0.27, -0.2]}>
            <mesh material={fur}>
              <sphereGeometry args={[0.1, 12, 10]} />
            </mesh>
            <mesh material={toon(mix(color, '#3a2418', 0.35))} position={[0, 0.01, 0.05]} scale={[0.6, 0.6, 0.4]}>
              <sphereGeometry args={[0.1, 8, 6]} />
            </mesh>
          </group>
        ))}
      </>
    );
  }
  if (animal === 'pig') {
    // 小豬：小三角形垂耳
    return (
      <>
        {[-1, 1].map((s) => (
          <mesh key={s} material={fur} position={[s * 0.3, 0.45, 0.04]} rotation={[0.45, 0, -s * 0.85]}>
            <coneGeometry args={[0.22, 0.38, 3]} />
          </mesh>
        ))}
      </>
    );
  }
  // 熊：圓耳朵
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.34, 0.38, -0.02]}>
          <mesh material={fur}>
            <sphereGeometry args={[0.16, 12, 10]} />
          </mesh>
          <mesh material={inner} position={[0, 0, 0.08]} scale={[0.6, 0.6, 0.4]}>
            <sphereGeometry args={[0.16, 10, 8]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** 各種動物的尾巴（卡皮巴拉幾乎沒有、無尾熊沒有） */
function Tail({ animal, pal }: { animal: Animal; pal: Palette }) {
  const { fur, pale } = pal;
  if (animal === 'koala' || animal === 'capybara') return null;
  if (animal === 'cat') {
    return (
      <mesh material={fur} position={[0, 0.25, -0.1]} rotation={[-0.5, 0, 0]}>
        <capsuleGeometry args={[0.06, 0.5, 4, 8]} />
      </mesh>
    );
  }
  if (animal === 'dog') {
    return (
      <mesh material={fur} position={[0, 0.15, -0.05]} rotation={[-0.9, 0, 0]}>
        <capsuleGeometry args={[0.07, 0.25, 4, 8]} />
      </mesh>
    );
  }
  if (animal === 'fox') {
    // 蓬鬆的大尾巴，尾巴尖白色
    return (
      <>
        <mesh material={fur} position={[0, 0.2, -0.32]} rotation={[-1.0, 0, 0]} scale={[1, 1.9, 1]}>
          <sphereGeometry args={[0.2, 14, 12]} />
        </mesh>
        <mesh material={pal.white} position={[0, 0.4, -0.6]} rotation={[-1.0, 0, 0]} scale={[0.95, 1.2, 0.95]}>
          <sphereGeometry args={[0.15, 12, 10]} />
        </mesh>
      </>
    );
  }
  if (animal === 'penguin') {
    return (
      <mesh material={fur} position={[0, 0.02, -0.12]} rotation={[-Math.PI / 2 - 0.5, 0, 0]} scale={[1.2, 1, 0.5]}>
        <coneGeometry args={[0.1, 0.26, 8]} />
      </mesh>
    );
  }
  if (animal === 'eagle') {
    // 扇形尾羽：五根往後往下展開的羽毛
    return (
      <group rotation={[1.1, 0, 0]}>
        {[-2, -1, 0, 1, 2].map((i) => (
          <group key={i} rotation={[0, 0, i * 0.24]}>
            <mesh material={i % 2 === 0 ? pal.accent : pal.dark} position={[0, -0.2, 0]} scale={[0.5, 1.7, 0.22]}>
              <sphereGeometry args={[0.12, 10, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
  if (animal === 'elephant') {
    return (
      <>
        <mesh material={fur} position={[0, -0.1, -0.06]} rotation={[0.25, 0, 0]}>
          <capsuleGeometry args={[0.04, 0.3, 4, 8]} />
        </mesh>
        <mesh material={pal.dark} position={[0, -0.32, -0.1]}>
          <sphereGeometry args={[0.06, 8, 6]} />
        </mesh>
      </>
    );
  }
  if (animal === 'pig') {
    // 捲捲的小尾巴：兩圈接起來的半圓環
    return (
      <>
        <mesh material={pale} position={[0, 0.04, -0.02]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.07, 0.028, 6, 14, Math.PI * 1.7]} />
        </mesh>
        <mesh material={pale} position={[0, 0.04, -0.08]} rotation={[0, Math.PI / 2, 1.2]}>
          <torusGeometry args={[0.045, 0.026, 6, 12, Math.PI * 1.6]} />
        </mesh>
      </>
    );
  }
  return (
    <mesh material={animal === 'rabbit' ? pale : fur}>
      <sphereGeometry args={[animal === 'rabbit' ? 0.15 : animal === 'panda' ? 0.14 : 0.11, 10, 8]} />
    </mesh>
  );
}
