/**
 * 班級島大型設施的 3D 模型與每一格的偵測（docs/plans/grand-rides.md）：
 * - 雲霄飛車：軌道（兩條鋼軌＋中間的管子，照 src/store/coasterTrack.ts 的取樣做成管子）、枕木與柱子（InstancedMesh）、
 *   南邊的車站（月台、屋頂）、6 節列車（照牆上的時間查班次，InstancedMesh 每一格更新）。
 * - 巨大摩天輪：腳與輪軸（不動）、輪子（整個轉）、12 個車廂（一直保持直立，InstancedMesh，彩虹色）。
 * - 環島飛船：繫留塔（不動）、飛船（照班次飛，甲板可以點：在船上時點了走過去）；自己在船上時氣囊變半透明。
 * - 海裡的動物：海豚（繞島游、跳出水面）、鯨魚（遠一點、背浮出水面噴水）、熱帶魚群（島邊淺水區）。
 * 全部原創低多邊形、程式畫。尺寸與動法都照 src/store/grandRides.ts，坐在上面的角色才會和設施一起動。
 * 不會動的部分用 StaticMerge 合併（材質用 toon 共用快取）；會動的標 userData.dynamic。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { StaticMerge } from './StaticMerge';
import { toon } from './materials';
import { fadeGroup } from './fadeGroup';
import { player } from './input';
import { isTap } from './cameraOrbit';
import { occluders, type Occluder } from './occlusion';
import { ISLAND_RADIUS } from './layout';
import { quatFromBasis, type Track, type V3 } from '../store/coasterTrack';
import {
  MAST,
  SHIP,
  STATION,
  TRAIN,
  WHEEL,
  cabinFloor,
  carPose,
  coaster,
  coasterRun,
  grandFrame,
  grandNear,
  resolveGrandSeat,
  shipState,
  wheelAngle,
  worldToDeck,
} from '../store/grandRides';
import { wallSec } from '../store/clockSync';
import { stopUse, syncActMirror } from '../store/useFurnitureUse';
import { grandTaken, setGrandNear, useGrand } from '../store/useGrand';
import { ridePlan } from '../store/rideSound';
import { applyRidePlan, logRidePlan, startRideAudio, stopRideAudio } from '../audio/rideAudio';
import { usePresence } from '../online/usePresence';

/** 共用的暫存物件（每一格更新 InstancedMesh 用，不要每格 new） */
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3(1, 1, 1);

/** 由軌道的取樣做一條管子：每 stride 個取樣點一圈（sides 邊），offset 是在車廂座標（左、上）的偏移 */
function tubeAlong(track: Track, ox: number, oy: number, radius: number, sides = 6, stride = 2): THREE.BufferGeometry {
  const n = Math.floor(track.pos.length / stride);
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r < n; r++) {
    const i = r * stride;
    const p = track.pos[i];
    const f = track.fwd[i];
    const u = track.up[i];
    const l = { x: u.y * f.z - u.z * f.y, y: u.z * f.x - u.x * f.z, z: u.x * f.y - u.y * f.x };
    const c = { x: p.x + l.x * ox + u.x * oy, y: p.y + l.y * ox + u.y * oy, z: p.z + l.z * ox + u.z * oy };
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides;
      const nx = l.x * Math.cos(a) + u.x * Math.sin(a);
      const ny = l.y * Math.cos(a) + u.y * Math.sin(a);
      const nz = l.z * Math.cos(a) + u.z * Math.sin(a);
      pos.push(c.x + nx * radius, c.y + ny * radius, c.z + nz * radius);
      nor.push(nx, ny, nz);
    }
  }
  for (let r = 0; r < n; r++) {
    const r1 = (r + 1) % n;
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      const a = r * sides + k;
      const b = r1 * sides + k;
      const c = r1 * sides + k1;
      const d = r * sides + k1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** 世界的某一點底下的地面高度（沙灘外是海面） */
function groundAt(x: number, z: number): number {
  return Math.hypot(x, z) < ISLAND_RADIUS - 0.5 ? 0 : -0.7;
}

/** 把一組（位置、四元數、縮放）寫進 InstancedMesh 的第 i 個 */
function setInstance(mesh: THREE.InstancedMesh, i: number, p: V3, q: THREE.Quaternion, s: THREE.Vector3 = tmpS): void {
  tmpP.set(p.x, p.y, p.z);
  tmpM.compose(tmpP, q, s);
  mesh.setMatrixAt(i, tmpM);
}

// ---------- 雲霄飛車 ----------

/** 軌道、枕木、柱子（不會動；第一次畫才算） */
function CoasterTrack() {
  const { track } = coaster();
  const rails = useMemo(() => {
    const g = mergeGeometries([tubeAlong(track, 0.42, 0, 0.07), tubeAlong(track, -0.42, 0, 0.07)], false)!;
    return g;
  }, [track]);
  const spine = useMemo(() => tubeAlong(track, 0, -0.3, 0.13, 6, 2), [track]);
  /** 枕木：每 1 公尺一根 */
  const ties = useMemo(() => {
    const step = Math.round(1 / (track.length / track.pos.length));
    const list: number[] = [];
    for (let i = 0; i < track.pos.length; i += step) list.push(i);
    return list;
  }, [track]);
  /** 柱子：每 4 公尺一根（軌道大致朝上、離地夠高的地方；迴圈與車站不放） */
  const posts = useMemo(() => {
    const step = Math.round(4 / (track.length / track.pos.length));
    const out: { x: number; z: number; y0: number; y1: number }[] = [];
    for (let i = 0; i < track.pos.length; i += step) {
      const p = track.pos[i];
      const u = track.up[i];
      if (u.y < 0.85 || p.y < 0.9 || track.tag[i] === 'station') continue;
      const y0 = groundAt(p.x, p.z);
      out.push({ x: p.x, z: p.z, y0, y1: p.y - 0.35 });
    }
    return out;
  }, [track]);
  const tieRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const tm = tieRef.current;
    if (tm) {
      ties.forEach((i, k) => {
        const f = track.fwd[i];
        const u = track.up[i];
        const l = { x: u.y * f.z - u.z * f.y, y: u.z * f.x - u.x * f.z, z: u.x * f.y - u.y * f.x };
        const q = quatFromBasis(l, u, f);
        tmpQ.set(q[0], q[1], q[2], q[3]);
        const p = track.pos[i];
        setInstance(tm, k, { x: p.x - u.x * 0.12, y: p.y - u.y * 0.12, z: p.z - u.z * 0.12 }, tmpQ);
      });
      tm.instanceMatrix.needsUpdate = true;
      tm.computeBoundingSphere();
    }
    const pm = postRef.current;
    if (pm) {
      tmpQ.identity();
      posts.forEach((p, k) => {
        const h = Math.max(0.1, p.y1 - p.y0);
        setInstance(pm, k, { x: p.x, y: p.y0 + h / 2, z: p.z }, tmpQ, new THREE.Vector3(1, h, 1));
      });
      pm.instanceMatrix.needsUpdate = true;
      pm.computeBoundingSphere();
    }
  }, [ties, posts, track]);
  return (
    <group>
      <mesh geometry={rails} material={toon('#e8453c')} />
      <mesh geometry={spine} material={toon('#b8322b')} />
      <instancedMesh ref={tieRef} args={[undefined, undefined, ties.length]} material={toon('#5b5b66')}>
        <boxGeometry args={[1.0, 0.06, 0.16]} />
      </instancedMesh>
      <instancedMesh ref={postRef} args={[undefined, undefined, posts.length]} material={toon('#f2f2f2')}>
        <cylinderGeometry args={[0.13, 0.17, 1, 6]} />
      </instancedMesh>
    </group>
  );
}

/** 車站屋頂的包圍球（沿著車站排一排；擋住角色時屋頂半透明） */
const ROOF_SPHERES: Occluder[] = Array.from({ length: 5 }, (_, i) => ({ id: `roof${i}`, x: STATION.x0 - 0.5 + i * 3.6, y: 3.6, z: STATION.z + 0.2, r: 2.6 }));

/**
 * 車站：月台（島這一側）、站下的木板、上月台的台階（不動）；紅白條紋的屋頂與柱子只蓋軌道那一段，
 * 擋住角色時變半透明（鏡頭從南邊看過來，角色站在月台上會被屋頂擋住）
 */
function Station() {
  const cx = (STATION.x0 + STATION.x1) / 2;
  const len = STATION.x1 - STATION.x0 + 2.4;
  const wood = toon('#d9a066');
  const post = toon('#ffffff');
  const stripes = Array.from({ length: 6 }, (_, i) => i);
  const roof = useRef<THREE.Group>(null);
  const faded = useRef(false);
  const { camera } = useThree();
  useFrame(() => {
    const hide = occluders(camera.position, { x: player.pos.x, y: 1.6, z: player.pos.z }, ROOF_SPHERES).length > 0;
    if (roof.current && hide !== faded.current) {
      faded.current = hide;
      fadeGroup(roof.current, hide);
    }
  });
  useEffect(
    () => () => {
      if (roof.current) fadeGroup(roof.current, false);
    },
    [],
  );
  return (
    <>
    <StaticMerge>
      <group>
        {/* 月台 */}
        <mesh material={wood} position={[cx, 0.1, STATION.platform.z - 0.1]}>
          <boxGeometry args={[len, 0.7, 1.4]} />
        </mesh>
        {/* 軌道底下的木板 */}
        <mesh material={toon('#b9824a')} position={[cx, -0.05, STATION.z + 0.35]}>
          <boxGeometry args={[len, 0.3, 2.0]} />
        </mesh>
        {/* 台階 */}
        <mesh material={wood} position={[-7, 0.1, STATION.platform.z - 1.15]}>
          <boxGeometry args={[3, 0.25, 0.7]} />
        </mesh>
      </group>
    </StaticMerge>
    {/* 屋頂與柱子（擋住角色時半透明，不合併） */}
    <group ref={roof}>
      {[STATION.x0 - 0.8, cx, STATION.x1 + 0.8].flatMap((x) =>
        [STATION.z - 0.95, STATION.z + 1.25].map((z) => (
          <mesh key={`${x},${z}`} material={post} position={[x, 1.75, z]}>
            <cylinderGeometry args={[0.12, 0.12, 3.5, 8]} />
          </mesh>
        )),
      )}
      {stripes.map((i) => (
        <mesh key={i} material={toon(i % 2 === 0 ? '#ff5a5f' : '#ffffff')} position={[STATION.x0 - 1.2 + (len / 6) * (i + 0.5), 3.55, STATION.z + 0.15]}>
          <boxGeometry args={[len / 6, 0.18, 2.8]} />
        </mesh>
      ))}
    </group>
    </>
  );
}

/** 列車：6 節車廂（車身、座椅靠背、車頭），照牆上的時間查班次每一格擺好 */
function CoasterTrain() {
  const body = useRef<THREE.InstancedMesh>(null);
  const backs = useRef<THREE.InstancedMesh>(null);
  const nose = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const b = body.current;
    if (!b) return;
    // 車頭橘色、其他黃色
    for (let k = 0; k < TRAIN.cars; k++) b.setColorAt(k, new THREE.Color(k === 0 ? '#ff8c42' : '#ffd23f'));
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  }, []);
  useFrame(() => {
    const b = body.current;
    const bk = backs.current;
    const ns = nose.current;
    if (!b || !bk || !ns) return;
    const s = coasterRun(wallSec()).s;
    for (let k = 0; k < TRAIN.cars; k++) {
      const c = carPose(s, k);
      const q = quatFromBasis(c.left, c.u, c.f);
      tmpQ.set(q[0], q[1], q[2], q[3]);
      const at = (along: number, up: number) => ({ x: c.p.x + c.f.x * along + c.u.x * up, y: c.p.y + c.f.y * along + c.u.y * up, z: c.p.z + c.f.z * along + c.u.z * up });
      setInstance(b, k, at(0, 0.48), tmpQ);
      setInstance(bk, k * 2, at(TRAIN.rowFront - 0.36, 0.95), tmpQ);
      setInstance(bk, k * 2 + 1, at(TRAIN.rowBack - 0.36, 0.95), tmpQ);
      if (k === 0) setInstance(ns, 0, at(1.15, 0.45), tmpQ);
    }
    b.instanceMatrix.needsUpdate = true;
    bk.instanceMatrix.needsUpdate = true;
    ns.instanceMatrix.needsUpdate = true;
  });
  return (
    <group userData={{ dynamic: true }}>
      <instancedMesh ref={body} args={[undefined, undefined, TRAIN.cars]} material={toon('#ffffff')} frustumCulled={false}>
        <boxGeometry args={[1.3, 0.42, 1.95]} />
      </instancedMesh>
      <instancedMesh ref={backs} args={[undefined, undefined, TRAIN.cars * 2]} material={toon('#3b4cca')} frustumCulled={false}>
        <boxGeometry args={[1.2, 0.6, 0.12]} />
      </instancedMesh>
      <instancedMesh ref={nose} args={[undefined, undefined, 1]} material={toon('#ff8c42')} frustumCulled={false}>
        <boxGeometry args={[1.2, 0.36, 0.5]} />
      </instancedMesh>
    </group>
  );
}

// ---------- 巨大摩天輪 ----------

/** 車廂的骨架（地板、屋頂、四根柱子、吊桿）與座位（長椅、矮牆），地板中心為原點 */
function cabinGeometries(): { frame: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const frame = mergeGeometries([
    box(1.9, 0.1, 1.6, 0, 0, 0),
    box(2.1, 0.12, 1.8, 0, 2.1, 0),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.05, 2.05, 0.05, sx * 0.92, 1.05, sz * 0.77))),
    box(0.1, 0.3, 0.1, 0, 2.3, 0),
  ])!;
  const inner = mergeGeometries([
    box(1.6, 0.08, 0.4, 0, 0.45, -0.42),
    box(1.6, 0.08, 0.4, 0, 0.45, 0.42),
    box(1.9, 0.5, 0.05, 0, 0.3, -0.78),
    box(1.9, 0.5, 0.05, 0, 0.3, 0.78),
    box(0.05, 0.5, 1.6, -0.93, 0.3, 0),
    box(0.05, 0.5, 1.6, 0.93, 0.3, 0),
  ])!;
  return { frame, inner };
}

/** 巨大摩天輪：A 字形的腳、輪軸、月台（不動）；輪子（雙圈、輻條、掛車廂的橫桿）整個轉；12 個車廂保持直立 */
function GiantWheel() {
  const wheel = useRef<THREE.Group>(null);
  const frames = useRef<THREE.InstancedMesh>(null);
  const inners = useRef<THREE.InstancedMesh>(null);
  const geos = useMemo(cabinGeometries, []);
  useEffect(() => {
    const f = frames.current;
    if (!f) return;
    const colors = ['#ff5a5f', '#ff9f1c', '#ffd23f', '#3ec300', '#2ec4b6', '#3b8bea', '#8f5bd6', '#f15bb5'];
    for (let i = 0; i < WHEEL.cabins; i++) f.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  }, []);
  useFrame(() => {
    const w = wallSec();
    if (wheel.current) wheel.current.rotation.z = wheelAngle(w, 0);
    const f = frames.current;
    const n = inners.current;
    if (!f || !n) return;
    tmpQ.identity();
    for (let i = 0; i < WHEEL.cabins; i++) {
      const p = cabinFloor(w, i);
      setInstance(f, i, p, tmpQ);
      setInstance(n, i, p, tmpQ);
    }
    f.instanceMatrix.needsUpdate = true;
    n.instanceMatrix.needsUpdate = true;
  });
  const steel = toon('#f2f2f2');
  const legs: [number, number][] = [
    [-5.5, 2],
    [5.5, 2],
    [-5.5, -2],
    [5.5, -2],
  ];
  return (
    <group position={[WHEEL.x, 0, WHEEL.z]}>
      <StaticMerge>
        <group>
          {/* A 字形的腳：從地面斜到輪軸 */}
          {legs.map(([x, z]) => {
            const top = new THREE.Vector3(0, WHEEL.hubH, z > 0 ? 1.0 : -1.0);
            const foot = new THREE.Vector3(x, 0, z);
            const mid = top.clone().add(foot).multiplyScalar(0.5);
            const dir = top.clone().sub(foot);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
            return (
              <mesh key={`${x},${z}`} material={steel} position={mid} quaternion={q}>
                <cylinderGeometry args={[0.22, 0.3, dir.length(), 8]} />
              </mesh>
            );
          })}
          {/* 輪軸 */}
          <mesh material={toon('#9aa4b2')} position={[0, WHEEL.hubH, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 2.6, 12]} />
          </mesh>
          {/* 月台（貼地的木板，車廂經過的地方往南） */}
          <mesh material={toon('#d9a066')} position={[0, 0.03, WHEEL.cabinZ + 0.9]}>
            <boxGeometry args={[5, 0.06, 3.2]} />
          </mesh>
        </group>
      </StaticMerge>
      {/* 輪子：整個繞輪軸轉 */}
      <group ref={wheel} position={[0, WHEEL.hubH, 0]} userData={{ dynamic: true }}>
        <StaticMerge>
          <group>
            {[-0.75, 0.75].map((z) => (
              <mesh key={z} material={toon('#ff5a5f')} position={[0, 0, z]}>
                <torusGeometry args={[WHEEL.r, 0.14, 6, 64]} />
              </mesh>
            ))}
            {[-0.75, 0.75].map((z) => (
              <mesh key={`in${z}`} material={steel} position={[0, 0, z]}>
                <torusGeometry args={[WHEEL.r * 0.55, 0.08, 6, 48]} />
              </mesh>
            ))}
            {Array.from({ length: WHEEL.cabins }, (_, i) => {
              const a = (i * 2 * Math.PI) / WHEEL.cabins;
              return [-0.75, 0.75].map((z) => (
                <mesh key={`${i}${z}`} material={steel} position={[(Math.sin(a) * WHEEL.r) / 2, (-Math.cos(a) * WHEEL.r) / 2, z]} rotation={[0, 0, a]}>
                  <boxGeometry args={[0.1, WHEEL.r, 0.1]} />
                </mesh>
              ));
            })}
            {/* 掛車廂的橫桿：從後面的輪框伸到前面掛車廂的地方 */}
            {Array.from({ length: WHEEL.cabins }, (_, i) => {
              const a = (i * 2 * Math.PI) / WHEEL.cabins;
              const z0 = -0.85;
              const z1 = WHEEL.cabinZ + 0.15;
              return (
                <mesh key={`bar${i}`} material={toon('#9aa4b2')} position={[Math.sin(a) * WHEEL.r, -Math.cos(a) * WHEEL.r, (z0 + z1) / 2]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.08, 0.08, z1 - z0, 6]} />
                </mesh>
              );
            })}
          </group>
        </StaticMerge>
      </group>
      {/* 車廂：世界座標（群組在摩天輪的位置，所以減回來） */}
      <group position={[-WHEEL.x, 0, -WHEEL.z]} userData={{ dynamic: true }}>
        <instancedMesh ref={frames} args={[geos.frame, toon('#ffffff'), WHEEL.cabins]} frustumCulled={false} />
        <instancedMesh ref={inners} args={[geos.inner, toon('#fff4d6'), WHEEL.cabins]} frustumCulled={false} />
      </group>
    </group>
  );
}

// ---------- 環島飛船 ----------

/** 繫留塔：四根腳、橫撐、塔頂平台與欄杆、靠島那一面的梯子、接到飛船的跳板 */
function Mast() {
  const white = toon('#ffffff');
  const red = toon('#ff5a5f');
  const h = MAST.h;
  /** 跳板：從塔頂往停著的飛船的甲板邊 */
  const dock = shipState(0);
  const edge = { x: dock.x + SHIP.halfW * Math.cos(dock.heading), z: dock.z - SHIP.halfW * Math.sin(dock.heading) };
  const gx = (MAST.x + edge.x) / 2;
  const gz = (MAST.z + edge.z) / 2;
  const glen = Math.hypot(edge.x - MAST.x, edge.z - MAST.z);
  const gyaw = Math.atan2(edge.x - MAST.x, edge.z - MAST.z);
  return (
    <StaticMerge>
      <group>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} material={white} position={[MAST.x + sx * 0.8, h / 2, MAST.z + sz * 0.8]}>
              <boxGeometry args={[0.2, h, 0.2]} />
            </mesh>
          )),
        )}
        {[1.5, 3.5, 5.5].map((y) => (
          <mesh key={y} material={red} position={[MAST.x, y, MAST.z]}>
            <boxGeometry args={[1.8, 0.15, 1.8]} />
          </mesh>
        ))}
        <mesh material={toon('#d9a066')} position={[MAST.x, h - 0.08, MAST.z]}>
          <boxGeometry args={[2.6, 0.16, 2.6]} />
        </mesh>
        {/* 梯子（靠島那一面） */}
        {[-0.3, 0.3].map((dz) => (
          <mesh key={dz} material={white} position={[MAST.x + 0.95, h / 2, MAST.z + dz]}>
            <boxGeometry args={[0.08, h, 0.08]} />
          </mesh>
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <mesh key={`r${i}`} material={white} position={[MAST.x + 0.95, 0.4 + i * 0.52, MAST.z]}>
            <boxGeometry args={[0.06, 0.06, 0.6]} />
          </mesh>
        ))}
        {/* 跳板 */}
        <mesh material={toon('#b9824a')} position={[gx, h - 0.05, gz]} rotation={[0, gyaw, 0]}>
          <boxGeometry args={[1.0, 0.1, glen]} />
        </mesh>
        {/* 塔頂的旗子 */}
        <mesh material={white} position={[MAST.x, h + 1.2, MAST.z]}>
          <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
        </mesh>
        <mesh material={red} position={[MAST.x + 0.45, h + 2.05, MAST.z]}>
          <boxGeometry args={[0.9, 0.5, 0.04]} />
        </mesh>
      </group>
    </StaticMerge>
  );
}

/** 飛船：照班次飛；甲板（可以點）、船身、欄杆、舵輪、繩子、氣囊（自己在船上時半透明）、尾翼、螺旋槳 */
function Airship() {
  const ship = useRef<THREE.Group>(null);
  const envelope = useRef<THREE.Group>(null);
  const props = useRef<THREE.Group>(null);
  const faded = useRef(false);
  useFrame((_, dt) => {
    const s = shipState(wallSec());
    if (ship.current) {
      ship.current.position.set(s.x, s.y, s.z);
      ship.current.rotation.y = s.heading;
    }
    // 螺旋槳：飛的時候轉
    props.current?.children.forEach((c) => (c.rotation.z += dt * (s.docked ? 1 : 14)));
    // 自己在船上：氣囊變半透明（跟拍的鏡頭在角色上方，會被氣囊擋住）
    const aboard = player.act?.kind === 'grand' && player.act.ride === 'ship';
    if (envelope.current && aboard !== faded.current) {
      faded.current = aboard;
      fadeGroup(envelope.current, aboard);
    }
  });
  useEffect(
    () => () => {
      if (envelope.current) fadeGroup(envelope.current, false);
    },
    [],
  );
  /** 點甲板：在船上時走過去（局部座標） */
  const onDeck = (e: ThreeEvent<MouseEvent>) => {
    const act = player.act;
    if (act?.kind !== 'grand' || act.ride !== 'ship') return;
    e.stopPropagation();
    if (!isTap(e.delta)) return;
    const l = worldToDeck(shipState(wallSec()), e.point.x, e.point.z);
    act.target = { x: l.x, z: l.z };
  };
  const wood = toon('#c8955c');
  const rail = toon('#8b5a2b');
  const W = SHIP.halfW;
  const L = SHIP.halfL;
  return (
    <group ref={ship} userData={{ dynamic: true }}>
      <mesh material={wood} position={[0, -0.1, 0]} onClick={onDeck}>
        <boxGeometry args={[W * 2 + 0.2, 0.2, L * 2 + 0.4]} />
      </mesh>
      <StaticMerge>
        <group>
          {/* 船身（下半球拉長） */}
          <mesh material={toon('#7a4a24')} position={[0, -0.2, 0]} scale={[W + 0.1, 1.2, L + 0.6]}>
            <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          </mesh>
          {/* 欄杆：左右兩條（靠島那一側中間留跳板的缺口）、前後兩條 */}
          <mesh material={rail} position={[-W - 0.05, 0.9, 0]}>
            <boxGeometry args={[0.08, 0.08, L * 2 + 0.3]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={rail} position={[W + 0.05, 0.9, s * (L + 0.85) / 2]}>
              <boxGeometry args={[0.08, 0.08, L - 0.55]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={`fb${s}`} material={rail} position={[0, 0.9, s * (L + 0.15)]}>
              <boxGeometry args={[W * 2 + 0.2, 0.08, 0.08]} />
            </mesh>
          ))}
          {[-1, 1].flatMap((sx) =>
            Array.from({ length: 8 }, (_, i) => {
              const z = -L + (i * 2 * L) / 7;
              if (sx > 0 && Math.abs(z) < 0.8) return null;
              return (
                <mesh key={`${sx}${i}`} material={rail} position={[sx * (W + 0.05), 0.45, z]}>
                  <boxGeometry args={[0.07, 0.9, 0.07]} />
                </mesh>
              );
            }),
          )}
          {/* 舵輪 */}
          <mesh material={rail} position={[SHIP.wheel.x, 0.5, SHIP.wheel.z]}>
            <cylinderGeometry args={[0.07, 0.1, 1.0, 6]} />
          </mesh>
          <mesh material={toon('#d9a066')} position={[SHIP.wheel.x, 1.05, SHIP.wheel.z - 0.1]}>
            <torusGeometry args={[0.36, 0.05, 6, 16]} />
          </mesh>
          {/* 吊著氣囊的繩子 */}
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => {
              const from = new THREE.Vector3(sx * (W - 0.2), 0.9, sz * (L - 0.6));
              const to = new THREE.Vector3(sx * 1.6, 4.6, sz * 3.6);
              const mid = from.clone().add(to).multiplyScalar(0.5);
              const dir = to.clone().sub(from);
              const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
              return (
                <mesh key={`rope${sx}${sz}`} material={toon('#5b4636')} position={mid} quaternion={q}>
                  <cylinderGeometry args={[0.03, 0.03, dir.length(), 4]} />
                </mesh>
              );
            }),
          )}
        </group>
      </StaticMerge>
      {/* 氣囊與尾翼（自己在船上時半透明） */}
      <group ref={envelope}>
        <mesh material={toon('#7ec8e3')} position={[0, 6.8, 0]} scale={[3.0, 2.5, 7.4]}>
          <sphereGeometry args={[1, 24, 14]} />
        </mesh>
        <mesh material={toon('#ffffff')} position={[0, 6.8, 0]} scale={[3.05, 2.55, 1.2]}>
          <sphereGeometry args={[1, 24, 8]} />
        </mesh>
        <mesh material={toon('#ff5a5f')} position={[0, 6.8, -6.9]}>
          <boxGeometry args={[0.12, 3.2, 1.6]} />
        </mesh>
        <mesh material={toon('#ff5a5f')} position={[0, 6.8, -6.9]}>
          <boxGeometry args={[3.2, 0.12, 1.6]} />
        </mesh>
      </group>
      {/* 螺旋槳（船尾兩側） */}
      <group ref={props}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * (W + 0.4), 0.8, -L]} userData={{ dynamic: true }}>
            <mesh material={toon('#5b5b66')}>
              <boxGeometry args={[1.4, 0.16, 0.06]} />
            </mesh>
            <mesh material={toon('#5b5b66')}>
              <boxGeometry args={[0.16, 1.4, 0.06]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ---------- 海裡的動物 ----------

/** 海豚的形狀（身體、嘴、背鰭、尾巴；面向 +z） */
function dolphinGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    new THREE.SphereGeometry(1, 12, 8).scale(0.32, 0.34, 1.05),
    new THREE.ConeGeometry(0.12, 0.45, 6).rotateX(Math.PI / 2).translate(0, -0.05, 1.15),
    new THREE.ConeGeometry(0.16, 0.45, 4).scale(0.35, 1, 1).translate(0, 0.45, -0.1),
    new THREE.BoxGeometry(0.8, 0.06, 0.3).translate(0, 0, -1.15),
  ])!;
}

/** 鯨魚的形狀（身體、尾鰭；面向 +z） */
function whaleGeometry(): THREE.BufferGeometry {
  return mergeGeometries([new THREE.SphereGeometry(1, 16, 10).scale(1.6, 1.15, 4.3), new THREE.BoxGeometry(3.2, 0.15, 1.0).translate(0, 0.1, -4.4)])!;
}

/** 熱帶魚的形狀（身體、尾巴；面向 +z，壓扁的，放在淺水的那一層底下） */
function fishGeometry(): THREE.BufferGeometry {
  return mergeGeometries([new THREE.SphereGeometry(1, 8, 6).scale(0.2, 0.12, 0.42), new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.5)])!;
}

/** 海豚：3 隻 */
const DOLPHINS = [0, 1, 2].map((i) => ({ a0: i * 2.1, r: 31 + i * 1.5, w: 0.12 - i * 0.015, period: 5.5 + i * 1.3, off: i * 1.7 }));
/** 鯨魚：2 隻（遠一點、慢慢游） */
const WHALES = [
  { a0: 1, r: 50, w: 0.025, period: 16, off: 0 },
  { a0: 4, r: 62, w: -0.02, period: 19, off: 7 },
];
/** 熱帶魚群：3 群、每群 12 條（有一群反方向游） */
const SCHOOLS = [
  { a0: 0.5, r: 26.8, w: 0.07 },
  { a0: 2.6, r: 29.2, w: -0.055 },
  { a0: 4.5, r: 31.5, w: 0.06 },
];
const FISH_PER_SCHOOL = 12;
const FISH_COLORS = ['#ffd23f', '#ff8c42', '#3b8bea', '#f15bb5', '#2ec4b6'];

/** 海豚、鯨魚、熱帶魚群：照本機的時間繞島游 */
function SeaLife() {
  const dolphins = useRef<THREE.Group>(null);
  const whales = useRef<THREE.Group>(null);
  const fish = useRef<THREE.InstancedMesh>(null);
  const geos = useMemo(() => ({ dolphin: dolphinGeometry(), whale: whaleGeometry(), fish: fishGeometry() }), []);
  /** 每條魚在魚群裡的位置（固定亂數） */
  const offsets = useMemo(
    () =>
      Array.from({ length: SCHOOLS.length * FISH_PER_SCHOOL }, (_, i) => ({
        dx: Math.sin(i * 12.9898) * 1.4,
        dz: Math.cos(i * 78.233) * 1.8,
        ph: i * 0.7,
      })),
    [],
  );
  useEffect(() => {
    const f = fish.current;
    if (!f) return;
    for (let i = 0; i < SCHOOLS.length * FISH_PER_SCHOOL; i++) f.setColorAt(i, new THREE.Color(FISH_COLORS[i % FISH_COLORS.length]));
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  }, []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // 海豚：繞島游，每隔一陣子跳出水面畫一道弧
    dolphins.current?.children.forEach((g, i) => {
      const d = DOLPHINS[i];
      const a = d.a0 + d.w * t;
      const r = d.r + Math.sin(t * 0.3 + i) * 1.5;
      const ph = (t + d.off) % d.period;
      const leap = 1.4;
      let y = -0.62;
      let pitch = 0;
      if (ph < leap) {
        const u = ph / leap;
        y = -0.75 + 1.9 * Math.sin(Math.PI * u);
        const v = Math.abs(d.w) * r;
        pitch = -Math.atan2(((1.9 * Math.PI) / leap) * Math.cos(Math.PI * u), v);
      }
      g.position.set(r * Math.sin(a), y, r * Math.cos(a));
      g.rotation.set(pitch, a + (d.w > 0 ? Math.PI / 2 : -Math.PI / 2), 0, 'YXZ');
    });
    // 鯨魚：慢慢游，背浮出水面、噴水
    whales.current?.children.forEach((g, i) => {
      const w = WHALES[i];
      const a = w.a0 + w.w * t;
      const ph = ((t + w.off) % w.period) / w.period;
      const up = Math.max(0, Math.sin(ph * Math.PI * 2));
      g.position.set(w.r * Math.sin(a), -1.9 + 1.4 * up, w.r * Math.cos(a));
      g.rotation.y = a + (w.w > 0 ? Math.PI / 2 : -Math.PI / 2);
      // 噴水柱（第二個子物件）：浮上來的時候
      const spout = g.children[1];
      if (spout) {
        const k = up > 0.85 ? (up - 0.85) / 0.15 : 0;
        spout.visible = k > 0.05;
        spout.scale.set(1, 0.3 + k, 1);
      }
    });
    // 熱帶魚群：在淺水區繞島游，每條魚在魚群裡擺動
    const f = fish.current;
    if (f) {
      let n = 0;
      SCHOOLS.forEach((s, si) => {
        const a = s.a0 + s.w * t;
        const heading = a + (s.w > 0 ? Math.PI / 2 : -Math.PI / 2);
        const c = Math.cos(heading);
        const sn = Math.sin(heading);
        for (let k = 0; k < FISH_PER_SCHOOL; k++) {
          const o = offsets[si * FISH_PER_SCHOOL + k];
          const wig = Math.sin(t * 3 + o.ph) * 0.25;
          const cx = s.r * Math.sin(a);
          const cz = s.r * Math.cos(a);
          // 魚群裡的位置轉到前進方向
          const lx = o.dx + wig;
          const lz = o.dz;
          tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading + wig * 0.6);
          setInstance(f, n++, { x: cx + lx * c + lz * sn, y: -0.665, z: cz - lx * sn + lz * c }, tmpQ);
        }
      });
      f.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group userData={{ dynamic: true }}>
      <group ref={dolphins}>
        {DOLPHINS.map((_, i) => (
          <group key={i}>
            <mesh geometry={geos.dolphin} material={toon('#6f8fb3')} />
          </group>
        ))}
      </group>
      <group ref={whales}>
        {WHALES.map((_, i) => (
          <group key={i}>
            <mesh geometry={geos.whale} material={toon('#3d5a80')} />
            <mesh material={toon('#ffffff')} position={[0, 1.6, 2.2]} visible={false}>
              <coneGeometry args={[0.5, 2.2, 8]} />
            </mesh>
          </group>
        ))}
      </group>
      <instancedMesh ref={fish} args={[geos.fish, toon('#ffffff'), SCHOOLS.length * FISH_PER_SCHOOL]} frustumCulled={false} />
    </group>
  );
}

// ---------- 每一格的偵測 ----------

/**
 * 每一格：同步「正在玩」的鏡像；正在玩時看座位有沒有被搶（id 小的留著，被擠掉換空位，沒空位就下來）；
 * 沒在玩時找旁邊的設施（上車的範圍內）
 */
function GrandProbe({ active }: { active: boolean }) {
  useFrame(() => {
    syncActMirror();
    const act = player.act;
    if (act?.kind === 'grand') {
      setGrandNear(null);
      const selfId = usePresence.getState().selfId;
      if (!selfId || act.ride === 'ship') return;
      const others = Object.entries(useGrand.getState().riders).map(([id, r]) => ({ id, ...r }));
      const seat = resolveGrandSeat(act.ride, { id: selfId, seat: act.seat }, others, wallSec());
      if (seat === null) stopUse(true);
      else if (seat !== act.seat) player.act = { ...act, seat };
      return;
    }
    setGrandNear(active && !act ? grandNear(player.pos) : null);
  });
  useEffect(() => () => setGrandNear(null), []);
  return null;
}

/**
 * 大型設施的音效（docs/plans/grand-rides.md 第 11 節）：每一格照自己的位置、正在玩的設施、牆上時間算排程（rideSound.ts）再播
 * （rideAudio.ts）。聽的位置是自己的角色（在設施上用座位、甲板的高度）；雲霄飛車上有沒有人看自己與別人的座位
 */
function RideAudioProbe() {
  const prev = useRef<number | null>(null);
  useEffect(() => {
    startRideAudio();
    return () => stopRideAudio();
  }, []);
  useFrame(() => {
    const wall = wallSec();
    const act = player.act;
    const own = act?.kind === 'grand' ? { ride: act.ride, run: act.run, w0: act.w0 } : null;
    const y = act?.kind === 'grand' ? grandFrame(act, wall).y : 0;
    const plan = ridePlan({ listener: { x: player.pos.x, y, z: player.pos.z }, prevWall: prev.current ?? wall, wall, own, coasterRiders: grandTaken('coaster').size > 0 });
    prev.current = wall;
    applyRidePlan(plan);
    logRidePlan(wall, plan);
  });
  return null;
}

/** 班級島的大型設施：雲霄飛車、巨大摩天輪、飛船與繫留塔、海裡的動物，加上每一格的偵測與音效 */
export function GrandRidesLayer({ active }: { active: boolean }) {
  return (
    <>
      <CoasterTrack />
      <Station />
      <CoasterTrain />
      <GiantWheel />
      <Mast />
      <Airship />
      <SeaLife />
      <GrandProbe active={active} />
      <RideAudioProbe />
    </>
  );
}
