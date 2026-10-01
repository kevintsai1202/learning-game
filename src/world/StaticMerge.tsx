/**
 * 靜態幾何合併：把子樹裡「不會動」的網格依材質合併成少數幾個網格，降低 draw call，
 * 讓平板跑得更順。原本的網格只是隱藏（不刪除），點擊建築的射線偵測仍然有效。
 *
 * 會動的零件（用 useFrame 改位置、旋轉的）要在 group 或 mesh 上加 userData={{ dynamic: true }}，
 * 整個子樹就不會被合併。InstancedMesh 與多重材質的網格也會略過。
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 只保留合併需要的頂點屬性（不同幾何體的屬性要一致才能合併） */
const KEEP = ['position', 'normal', 'uv'];

/** 把網格的幾何轉成「相對於 root 座標」的非索引幾何 */
function bakedGeometry(mesh: THREE.Mesh, toRoot: THREE.Matrix4): THREE.BufferGeometry | null {
  const src = mesh.geometry as THREE.BufferGeometry;
  if (!src.attributes.position || !src.attributes.normal || !src.attributes.uv) return null;
  let g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
  g.clearGroups();
  const m = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
  g.applyMatrix4(m);
  // 鏡像縮放（行列式為負）會讓面朝向相反，翻轉三角形頂點順序修正
  if (m.determinant() < 0) {
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i += 3) {
      for (const attr of [pos, nor, uv]) {
        const size = attr.itemSize;
        for (let k = 0; k < size; k++) {
          const a = attr.array[(i + 1) * size + k];
          (attr.array as Float32Array)[(i + 1) * size + k] = attr.array[(i + 2) * size + k];
          (attr.array as Float32Array)[(i + 2) * size + k] = a;
        }
      }
    }
  }
  return g;
}

export function StaticMerge({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    /** 依材質分組：材質 → 要合併的幾何與原始網格 */
    const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[]; cast: boolean; receive: boolean }>();
    const visit = (o: THREE.Object3D) => {
      if (o.userData.dynamic) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material)) {
        const g = bakedGeometry(mesh, toRoot);
        if (g) {
          const mat = mesh.material as THREE.Material;
          const b = buckets.get(mat) ?? { geos: [], meshes: [], cast: false, receive: false };
          b.geos.push(g);
          b.meshes.push(mesh);
          b.cast ||= mesh.castShadow;
          b.receive ||= mesh.receiveShadow;
          buckets.set(mat, b);
        }
      }
      o.children.forEach(visit);
    };
    root.children.forEach(visit);

    const added: THREE.Mesh[] = [];
    const hidden: THREE.Mesh[] = [];
    for (const [mat, b] of buckets) {
      // 只有一個網格的材質不必合併
      if (b.meshes.length < 2) {
        b.geos.forEach((g) => g.dispose());
        continue;
      }
      const merged = mergeGeometries(b.geos, false);
      b.geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = b.cast;
      m.receiveShadow = b.receive;
      // 合併後的網格不參與點擊判定（原網格仍在，負責點擊）
      m.raycast = () => {};
      root.add(m);
      added.push(m);
      for (const mesh of b.meshes) {
        mesh.visible = false;
        hidden.push(mesh);
      }
    }
    return () => {
      for (const m of added) {
        root.remove(m);
        m.geometry.dispose();
      }
      for (const mesh of hidden) mesh.visible = true;
    };
  }, []);
  return <group ref={ref}>{children}</group>;
}
