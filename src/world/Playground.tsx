/**
 * 班級島遊樂場的 3D（docs/plans/playground.md）：八種大型遊樂器材的模型（原創低多邊形，程式畫），
 * 以及每一格畫面的偵測（旁邊的器材、搶位子換座位、器材被老師換掉時起來、同步正在玩的鏡像）。
 * - 不會動的部分（底座、塔、軌道、支架）用 StaticMerge 合併網格（材質用 toon 共用快取才合併得到），會動的部分
 *   （轉盤、板子、座椅、車廂、杯子、火車）標 userData.dynamic 不合併；平板才跑得動（4 座時 draw call 從約 +170 降下來）。
 * - 角度、尺寸都用 src/store/playground.ts 的同一組函式，坐在上面的角色和器材一起動。
 * - 一直在動的器材照牆上的時間（wallSec）；鞦韆組照坐上去的人開始的時間；翹翹板看兩邊有沒有人。
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import {
  CAROUSEL,
  CASTLE,
  FERRIS,
  PLAYGROUND_SPOTS,
  SEESAW,
  SWINGSET,
  TEACUPS,
  TRAIN,
  TRAMPOLINE,
  carouselAngle,
  ferrisHang,
  horseBob,
  resolveSeat,
  seesawTilt,
  slotNear,
  spiralPoint,
  teacupPose,
  trainAngle,
} from '../store/playground';
import { SWING_PIVOT, swingAngle } from '../store/furnitureUse';
import type { Playground as PlaygroundSlots, RideKind } from '../store/rideKinds';
import { wallSec } from '../store/actFrame';
import { nowSec, stopUse, syncActMirror } from '../store/useFurnitureUse';
import { occupiedOf, othersRiding, setRideNear, useRides } from '../store/useRides';
import { usePresence } from '../online/usePresence';
import { player } from './input';
import { StaticMerge } from './StaticMerge';
import { toon } from './materials';

/** 器材的顏色 */
const RED = '#e8455a';
const YELLOW = '#f5c518';
const BLUE = '#4a86e8';
const GREEN = '#4aa84d';
const WOOD = '#b0773f';
const WHITE = '#fffaf0';
const DARK = '#3b3a5e';
/** 木馬、杯子、車廂輪流用的顏色 */
const PALETTE = ['#ff8a3d', '#8b5cf6', '#2bb5c8', '#e8457c', '#3fbf7f', '#f2b705'];

/** 一個方塊 */
function Box({ p, s, c, r }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: [number, number, number] }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <boxGeometry args={s} />
      <primitive object={toon(c)} attach="material" />
    </mesh>
  );
}

/** 一根圓柱（rt 上半徑、rb 下半徑、h 高；n 是邊數） */
function Cyl({ p, rt, rb, h, c, n = 16 }: { p: [number, number, number]; rt: number; rb: number; h: number; c: string; n?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, n]} />
      <primitive object={toon(c)} attach="material" />
    </mesh>
  );
}

/** 某個座位的人開始盪的時間（自己或別人；沒人是 null；鞦韆組的座椅照這個時間擺） */
function riderT0(slot: number, seat: number): number | null {
  const act = player.act;
  if (act?.kind === 'ride' && act.slot === slot && act.seat === seat) return act.t0;
  for (const r of Object.values(useRides.getState().riders)) if (r.slot === slot && r.seat === seat) return r.t0;
  return null;
}

// ---------- 八種器材 ----------

/** 旋轉木馬：平台、中間的柱子、屋頂、6 匹木馬（跟著平台轉、上下起伏） */
function Carousel() {
  const spin = useRef<THREE.Group>(null);
  const horses = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const w = wallSec();
    if (spin.current) spin.current.rotation.y = carouselAngle(w, 0);
    horses.current.forEach((h, i) => {
      if (h) h.position.y = CAROUSEL.platformTop + CAROUSEL.saddle - 0.15 + horseBob(w, i);
    });
  });
  return (
    <>
      <Cyl p={[0, 0.08, 0]} rt={CAROUSEL.platformR + 0.1} rb={CAROUSEL.platformR + 0.15} h={0.16} c={DARK} n={24} />
      <group ref={spin} userData={{ dynamic: true }}>
        <Cyl p={[0, CAROUSEL.platformTop / 2 + 0.08, 0]} rt={CAROUSEL.platformR} rb={CAROUSEL.platformR} h={CAROUSEL.platformTop - 0.08} c={WHITE} n={24} />
        <Cyl p={[0, 1.9, 0]} rt={0.18} rb={0.22} h={3.2} c={YELLOW} />
        <mesh position={[0, 3.75, 0]} castShadow>
          <coneGeometry args={[CAROUSEL.platformR + 0.25, 0.9, 12]} />
          <primitive object={toon(RED)} attach="material" />
        </mesh>
        <Box p={[0, 3.6, 0]} s={[0.4, 0.4, 0.4]} c={YELLOW} />
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i * Math.PI) / 3;
          const x = CAROUSEL.horseR * Math.sin(a);
          const z = CAROUSEL.horseR * Math.cos(a);
          return (
            <group key={i}>
              {/* 木馬的柱子 */}
              <Cyl p={[x, 1.9, z]} rt={0.04} rb={0.04} h={3.2} c={YELLOW} n={6} />
              <group
                ref={(g) => {
                  horses.current[i] = g;
                }}
                position={[x, CAROUSEL.platformTop + CAROUSEL.saddle - 0.15, z]}
                rotation={[0, a + Math.PI / 2, 0]}
              >
                <Box p={[0, 0, 0]} s={[0.3, 0.3, 0.85]} c={PALETTE[i]} />
                <Box p={[0, 0.25, 0.45]} s={[0.24, 0.4, 0.22]} c={PALETTE[i]} />
                <Box p={[0, 0.3, 0.6]} s={[0.18, 0.18, 0.2]} c={PALETTE[i]} />
                <Box p={[0, 0.17, 0]} s={[0.32, 0.04, 0.4]} c={RED} />
                {[-0.3, 0.3].map((lz) => (
                  <Box key={lz} p={[0, -0.25, lz]} s={[0.22, 0.25, 0.08]} c={PALETTE[i]} />
                ))}
              </group>
            </group>
          );
        })}
      </group>
    </>
  );
}

/** 翹翹板：兩座並排，每座一個支點、一塊板子、兩端的座位與把手；兩邊都有人才上下 */
function Seesaw({ slot }: { slot: number }) {
  const boards = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const occ = occupiedOf(slot);
    const w = wallSec();
    boards.current.forEach((b, i) => {
      if (b) b.rotation.z = seesawTilt(i, occ, w);
    });
  });
  return (
    <>
      {SEESAW.boardZ.map((z, i) => (
        <group key={z}>
          <Box p={[0, SEESAW.pivotH / 2, z]} s={[0.35, SEESAW.pivotH, 0.35]} c={DARK} />
          <group
            ref={(g) => {
              boards.current[i] = g;
            }}
            position={[0, SEESAW.pivotH, z]}
            userData={{ dynamic: true }}
          >
            <Box p={[0, 0, 0]} s={[SEESAW.half * 2, 0.08, 0.35]} c={i === 0 ? RED : BLUE} />
            {[-1, 1].map((s) => (
              <group key={s}>
                <Box p={[s * SEESAW.seatX, 0.06, 0]} s={[0.42, 0.06, 0.42]} c={YELLOW} />
                <Box p={[s * (SEESAW.seatX - 0.32), 0.2, 0]} s={[0.05, 0.3, 0.3]} c={WHITE} />
              </group>
            ))}
          </group>
        </group>
      ))}
    </>
  );
}

/** 大鞦韆組的一個座椅：掛在橫桿下，有人在盪就照他開始的時間擺 */
function SwingsetSeat({ slot, seat }: { slot: number; seat: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const t0 = riderT0(slot, seat);
    if (g.current) g.current.rotation.x = t0 === null ? 0 : swingAngle(nowSec() - t0);
  });
  const seatY = 0.42;
  const rope = SWING_PIVOT - seatY;
  return (
    <group ref={g} position={[SWINGSET.seatX[seat], SWING_PIVOT, 0]} userData={{ dynamic: true }}>
      {[-0.46, 0.46].map((x) => (
        <Box key={x} p={[x, -rope / 2, 0]} s={[0.025, rope, 0.025]} c="#555" />
      ))}
      <Box p={[0, seatY - SWING_PIVOT, 0]} s={[0.98, 0.05, 0.28]} c={PALETTE[seat]} />
    </group>
  );
}

/** 大鞦韆組：兩邊 A 字形的柱子、長橫桿、4 個鞦韆 */
function Swingset({ slot }: { slot: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s}>
          {[-1, 1].map((d) => (
            <Box key={d} p={[s * SWINGSET.postX, SWING_PIVOT / 2, d * SWINGSET.postZ * 0.5]} s={[0.1, SWING_PIVOT + 0.1, 0.1]} r={[d * 0.18, 0, 0]} c={RED} />
          ))}
        </group>
      ))}
      <Box p={[0, SWING_PIVOT + 0.03, 0]} s={[SWINGSET.postX * 2 + 0.2, 0.1, 0.1]} c={RED} />
      {SWINGSET.seatX.map((_, i) => (
        <SwingsetSeat key={i} slot={slot} seat={i} />
      ))}
    </>
  );
}

/** 彈跳床：圓框、床面、一圈軟墊、腳 */
function Trampoline() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        return <Cyl key={i} p={[Math.sin(a) * 1.9, 0.27, Math.cos(a) * 1.9]} rt={0.06} rb={0.06} h={0.54} c={DARK} n={6} />;
      })}
      <mesh position={[0, TRAMPOLINE.bedH - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[TRAMPOLINE.bedR - 0.05, 0.14, 8, 32]} />
        <primitive object={toon(BLUE)} attach="material" />
      </mesh>
      {/* 床面：藍色加一圈黃色的圓（太暗會看起來像一個洞） */}
      <Cyl p={[0, TRAMPOLINE.bedH - 0.04, 0]} rt={TRAMPOLINE.bedR - 0.15} rb={TRAMPOLINE.bedR - 0.15} h={0.04} c="#5aa0f0" n={32} />
      <mesh position={[0, TRAMPOLINE.bedH - 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 0.75, 32]} />
        <primitive object={toon(YELLOW)} attach="material" />
      </mesh>
    </>
  );
}

/** 溜滑梯城堡：城堡塔（平台上有城垛、旗子）、前面兩把梯子、+x 的直滑道、−x 的螺旋滑道 */
function SlideCastle() {
  const { towerZ, towerHalf, top, ladderX, straightEnd, bottom, spiral } = CASTLE;
  const ladderZ = towerZ + towerHalf + 0.03;
  /** 直滑道：從塔的 +x 邊到終點 */
  const x0 = towerHalf;
  const len = Math.hypot(straightEnd - x0, top - bottom);
  const tilt = -Math.atan2(top - bottom, straightEnd - x0);
  /** 螺旋滑道：沿著 spiralPoint 放一段一段的板子 */
  const parts = Array.from({ length: 18 }, (_, i) => {
    const a = spiralPoint(i / 18);
    const b = spiralPoint((i + 1) / 18);
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.h + b.h) / 2 - 0.05, heading: a.heading, len: Math.hypot(b.x - a.x, b.z - a.z) + 0.05 };
  });
  return (
    <>
      <Box p={[0, top / 2, towerZ]} s={[towerHalf * 2, top, towerHalf * 2]} c="#c9c3b5" />
      <Box p={[0, top + 0.03, towerZ]} s={[towerHalf * 2 + 0.1, 0.06, towerHalf * 2 + 0.1]} c="#9a948a" />
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <Box key={`${sx},${sz}`} p={[sx * (towerHalf - 0.12), top + 0.25, towerZ + sz * (towerHalf - 0.12)]} s={[0.24, 0.4, 0.24]} c="#c9c3b5" />),
      )}
      <Cyl p={[0, top + 0.9, towerZ]} rt={0.03} rb={0.03} h={1.3} c={DARK} n={6} />
      <Box p={[0.25, top + 1.35, towerZ]} s={[0.45, 0.28, 0.02]} c={RED} />
      {ladderX.map((x) => (
        <group key={x}>
          {[-0.18, 0.18].map((dx) => (
            <Box key={dx} p={[x + dx, top / 2, ladderZ]} s={[0.04, top, 0.04]} c={WHITE} />
          ))}
          {Array.from({ length: 7 }, (_, i) => (
            <Box key={i} p={[x, 0.25 + i * 0.28, ladderZ]} s={[0.36, 0.04, 0.05]} c={WHITE} />
          ))}
        </group>
      ))}
      <group position={[(x0 + straightEnd) / 2, (top + bottom) / 2, towerZ]} rotation={[0, 0, tilt]}>
        <Box p={[0, 0, 0]} s={[len, 0.05, 0.55]} c={YELLOW} />
        {[-0.28, 0.28].map((dz) => (
          <Box key={dz} p={[0, 0.07, dz]} s={[len, 0.12, 0.04]} c="#e8a518" />
        ))}
      </group>
      <Cyl p={[spiral.x, top / 2, spiral.z]} rt={0.12} rb={0.12} h={top} c={DARK} n={8} />
      {parts.map((p, i) => (
        <Box key={i} p={[p.x, p.y, p.z]} s={[0.55, 0.05, p.len]} r={[0, p.heading, 0]} c={BLUE} />
      ))}
    </>
  );
}

/** 摩天輪：兩邊的支架、轉的輪子（輪框、輻條）、6 個保持直立的車廂（坐著的角色在車廂裡） */
function Ferris() {
  const wheel = useRef<THREE.Group>(null);
  const cabins = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const w = wallSec();
    if (wheel.current) wheel.current.rotation.z = ferrisAngle0(w);
    cabins.current.forEach((c, i) => {
      if (!c) return;
      const h = ferrisHang(w, i);
      c.position.set(h.x, h.y, 0);
    });
  });
  const { hubZ, hubH, wheelR, cabinDrop } = FERRIS;
  return (
    <>
      {[-1, 1].map((sz) =>
        [-1, 1].map((sx) => {
          const bx = sx * 1.4;
          const len = Math.hypot(bx, hubH);
          return <Box key={`${sx},${sz}`} p={[bx / 2, hubH / 2, hubZ + sz * 0.45]} s={[0.12, len, 0.12]} r={[0, 0, Math.atan2(bx, hubH)]} c={DARK} />;
        }),
      )}
      <group ref={wheel} position={[0, hubH, hubZ]} userData={{ dynamic: true }}>
        <mesh>
          <torusGeometry args={[wheelR, 0.07, 6, 36]} />
          <primitive object={toon(WHITE)} attach="material" />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i} p={[0, 0, 0]} s={[0.06, wheelR * 2, 0.06]} r={[0, 0, (i * Math.PI) / 6]} c={WHITE} />
        ))}
        <Cyl p={[0, 0, 0]} rt={0.25} rb={0.25} h={1.0} c={RED} />
      </group>
      <group position={[0, 0, hubZ]} userData={{ dynamic: true }}>
        {Array.from({ length: 6 }, (_, i) => (
          <group
            key={i}
            ref={(g) => {
              cabins.current[i] = g;
            }}
          >
            {/* 吊點在車廂頂上：吊桿、屋頂、地板、四根柱子（前面空著看得到裡面的人） */}
            <Box p={[0, -0.1, 0.35]} s={[0.06, 0.2, 0.06]} c="#555" />
            <Box p={[0, -0.25, 0.35]} s={[1.1, 0.1, 1.0]} c={PALETTE[i]} />
            <Box p={[0, -cabinDrop + 0.04, 0.35]} s={[1.1, 0.08, 1.0]} c={PALETTE[i]} />
            <Box p={[0, -cabinDrop + 0.3, -0.1]} s={[1.1, 0.5, 0.06]} c={PALETTE[i]} />
            <Box p={[0, -cabinDrop + 0.3, 0.15]} s={[0.9, 0.08, 0.45]} c={WHITE} />
            {[-0.5, 0.5].map((x) =>
              [-0.1, 0.8].map((z) => <Box key={`${x},${z}`} p={[x, -cabinDrop / 2 - 0.1, z]} s={[0.05, cabinDrop - 0.3, 0.05]} c={WHITE} />),
            )}
          </group>
        ))}
      </group>
    </>
  );
}

/** 摩天輪輪子轉到的角度（第 0 個車廂的吊點角度） */
function ferrisAngle0(wall: number): number {
  return FERRIS.spin * wall;
}

/** 咖啡杯：轉盤、中間的大茶壺、3 個杯子（繞中心轉、自己也轉） */
function Teacups() {
  const cups = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const w = wallSec();
    cups.current.forEach((c, i) => {
      if (!c) return;
      const p = teacupPose(w, i);
      c.position.set(p.x, TEACUPS.floor, p.z);
      c.rotation.y = p.spin;
    });
  });
  return (
    <>
      <Cyl p={[0, TEACUPS.floor / 2, 0]} rt={TEACUPS.platformR} rb={TEACUPS.platformR + 0.05} h={TEACUPS.floor} c="#f2d9a0" n={28} />
      <Cyl p={[0, TEACUPS.floor + 0.4, 0]} rt={0.35} rb={0.45} h={0.8} c={WHITE} />
      <mesh position={[0, TEACUPS.floor + 0.95, 0]} castShadow>
        <sphereGeometry args={[0.32, 12, 8]} />
        <primitive object={toon(RED)} attach="material" />
      </mesh>
      {Array.from({ length: 3 }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            cups.current[i] = g;
          }}
          userData={{ dynamic: true }}
        >
          <Cyl p={[0, 0.3, 0]} rt={TEACUPS.cupR} rb={TEACUPS.cupR - 0.2} h={0.6} c={PALETTE[i * 2]} />
          <Cyl p={[0, 0.62, 0]} rt={TEACUPS.cupR + 0.04} rb={TEACUPS.cupR + 0.04} h={0.05} c={WHITE} />
          <mesh position={[TEACUPS.cupR + 0.12, 0.35, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.15, 0.04, 6, 12]} />
            <primitive object={toon(PALETTE[i * 2])} attach="material" />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** 小火車：一圈軌道（枕木）、中間的小山丘、火車頭與 3 節車廂（每節 2 個座位） */
function Train() {
  const cars = useRef<(THREE.Group | null)[]>([]);
  const engine = useRef<THREE.Group>(null);
  useFrame(() => {
    const w = wallSec();
    cars.current.forEach((c, k) => {
      if (!c) return;
      const a = (trainAngle(w, k * 2) + trainAngle(w, k * 2 + 1)) / 2;
      c.position.set(TRAIN.trackR * Math.sin(a), 0, TRAIN.trackR * Math.cos(a));
      c.rotation.y = a + Math.PI / 2;
    });
    if (engine.current) {
      const a = trainAngle(w, 0) + 0.7;
      engine.current.position.set(TRAIN.trackR * Math.sin(a), 0, TRAIN.trackR * Math.cos(a));
      engine.current.rotation.y = a + Math.PI / 2;
    }
  });
  return (
    <>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[TRAIN.trackR - 0.35, TRAIN.trackR + 0.35, 40]} />
        <primitive object={toon('#9a7b5a')} attach="material" />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <Box key={i} p={[TRAIN.trackR * Math.sin(a), 0.07, TRAIN.trackR * Math.cos(a)]} s={[0.7, 0.04, 0.12]} r={[0, a + Math.PI / 2, 0]} c={WOOD} />;
      })}
      <mesh position={[0, 0.3, 0]} castShadow>
        <sphereGeometry args={[0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <primitive object={toon(GREEN)} attach="material" />
      </mesh>
      <group ref={engine} userData={{ dynamic: true }}>
        <Box p={[0, 0.5, 0]} s={[0.7, 0.6, 1.0]} c={RED} />
        <Cyl p={[0, 1.0, 0.25]} rt={0.12} rb={0.1} h={0.4} c={DARK} n={8} />
        <Box p={[0, 0.95, -0.25]} s={[0.6, 0.5, 0.45]} c={RED} />
      </group>
      {Array.from({ length: 3 }, (_, k) => (
        <group
          key={k}
          ref={(g) => {
            cars.current[k] = g;
          }}
          userData={{ dynamic: true }}
        >
          <Box p={[0, 0.3, 0]} s={[0.75, 0.3, 1.0]} c={PALETTE[k * 2 + 1]} />
          {[-0.36, 0.36].map((x) => (
            <Box key={x} p={[x, 0.55, 0]} s={[0.05, 0.25, 1.0]} c={PALETTE[k * 2 + 1]} />
          ))}
          {[-0.3, 0.3].map((z) =>
            [-0.3, 0.3].map((x) => <Cyl key={`${x},${z}`} p={[x, 0.15, z]} rt={0.12} rb={0.12} h={0.06} c={DARK} n={8} />),
          )}
        </group>
      ))}
    </>
  );
}

/** 一種器材的模型 */
function RideModel({ kind, slot }: { kind: RideKind; slot: number }): ReactNode {
  switch (kind) {
    case 'carousel':
      return <Carousel />;
    case 'seesaw':
      return <Seesaw slot={slot} />;
    case 'swingset':
      return <Swingset slot={slot} />;
    case 'trampoline':
      return <Trampoline />;
    case 'slidecastle':
      return <SlideCastle />;
    case 'ferris':
      return <Ferris />;
    case 'teacups':
      return <Teacups />;
    case 'train':
      return <Train />;
  }
}

/**
 * 每一格畫面：同步正在玩的鏡像；正在玩的器材被老師換掉就起來；別人也坐同一個位子時 id 小的留著，
 * 自己被擠掉就換到空位（沒有空位就起來）；沒在玩時找旁邊的器材（給「上去玩」的按鈕）。卸下時清掉
 */
function RideProbe({ active }: { active: boolean }) {
  useFrame(() => {
    syncActMirror();
    const pg = useRides.getState().playground;
    const act = player.act;
    if (act?.kind === 'ride') {
      setRideNear(null);
      if (pg[act.slot] !== act.ride) {
        stopUse(true);
        return;
      }
      const selfId = usePresence.getState().selfId;
      if (!selfId) return;
      const r = resolveSeat(act.ride, { id: selfId, slot: act.slot, seat: act.seat }, othersRiding());
      if (r.seat === null) stopUse(true);
      else if (r.seat !== act.seat) player.act = { ...act, seat: r.seat };
      return;
    }
    setRideNear(active && !act ? slotNear(pg, player.pos) : null);
  });
  useEffect(() => () => setRideNear(null), []);
  return null;
}

/** 班級島的遊樂場：每個位置的器材（空的不畫）與每一格畫面的偵測 */
export function PlaygroundLayer({ playground, active }: { playground: PlaygroundSlots; active: boolean }) {
  return (
    <>
      {playground.map((kind, i) =>
        kind ? (
          <group key={`${i}:${kind}`} position={[PLAYGROUND_SPOTS[i].x, 0, PLAYGROUND_SPOTS[i].z]}>
            <StaticMerge>
              <RideModel kind={kind} slot={i} />
            </StaticMerge>
          </group>
        ) : null,
      )}
      <RideProbe active={active} />
    </>
  );
}
