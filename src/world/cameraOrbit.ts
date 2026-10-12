/**
 * 轉視角（自己的家第 10.5 節，第 ③ 批；docs/plans/home.md）：
 * - 只轉水平方向（yaw，弧度；0 是原本從南邊看北方的方向）。手機在 3D 畫面的右半邊拖曳（左半邊是搖桿區）、
 *   電腦用滑鼠拖曳或按住 Q（左轉）、E（右轉）。往右拖＝視角往右轉（使用者 2026-10-12）。
 * - 島上的跟隨鏡頭（followCamera）與屋裡的鏡頭（room.ts 的 roomCamera）繞著角色轉；yaw 0 和以前一模一樣。
 * - 方向鍵、WASD、搖桿的「上」是鏡頭看的方向（moveInput）。
 * - 點擊改成放開、沒拖動才算（isTap）；兩指捏合只算 3D 畫面上的手指（指標事件，搖桿的手指不算）。
 * - 用家具時「🎥 換視角」：跟拍 → 近拍 → 第一人稱（actCamera），選的模式這次開著遊戲都記住。
 * - 轉過時畫面上有「🧭」回正；進屋、出屋、換島自動回正（角度不存檔）。
 * yaw 每一格都讀，放模組層級；畫面要知道的（轉過了沒、視角模式）放 useOrbit。
 */
import { create } from 'zustand';
import type { Vec2 } from './movement';
import { inputDirection, player } from './input';
import { camZoom, setZoom, zoomByPinch } from './cameraZoom';
import { actFrame, type ActFrame, type UseKind } from '../store/furnitureUse';
import { rotateByQuat } from '../store/coasterTrack';
import type { DecorSpace, YardItem } from '../store/yard';

/** 用家具時的視角：跟拍（平常的鏡頭）、近拍、第一人稱 */
export type CamView = 'follow' | 'close' | 'first';
/** 視角模式輪流的順序 */
const VIEWS: readonly CamView[] = ['follow', 'close', 'first'];
/** 拖曳一 px 轉幾弧度（手機橫著滑過半個畫面約轉 90 度） */
export const DRAG_RATE = 0.008;
/** 按住 Q、E 每秒轉幾弧度 */
export const KEY_TURN_RATE = 1.8;
/** 按下到放開移動幾 px 以內才算點一下 */
export const TAP_SLOP = 8;
/** 近拍：鏡頭在看的點後面與上面多遠（公尺，乘縮放倍率） */
const CLOSE_BACK = 3.2;
const CLOSE_UP = 1.4;
/** 角色的頭在身體原點上方多高（Avatar 的頭 group 在 y 1.55） */
const HEAD_Y = 1.55;

/** 一點（三維） */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
/** 鏡頭的位置與看的點 */
export interface CamPose {
  position: Vec3;
  target: Vec3;
}

/** 鏡頭轉的角度（每一格讀） */
export const orbit = { yaw: 0 };

/** 畫面要知道的：轉過了沒（顯示 🧭）、用家具時的視角模式 */
export const useOrbit = create<{ rotated: boolean; view: CamView }>(() => ({ rotated: false, view: 'follow' }));

/** 角度夾在 (−π, π]（-0 變成 0） */
export function normalizeYaw(a: number): number {
  let v = a % (2 * Math.PI);
  if (v <= -Math.PI) v += 2 * Math.PI;
  if (v > Math.PI) v -= 2 * Math.PI;
  return v + 0;
}

/** 轉過了沒（差一點點不算） */
export function isRotated(yaw: number): boolean {
  return Math.abs(normalizeYaw(yaw)) > 0.02;
}

/** 設定轉的角度（轉過了沒變了才通知畫面） */
export function setYaw(yaw: number): void {
  orbit.yaw = normalizeYaw(yaw);
  const rotated = isRotated(orbit.yaw);
  if (useOrbit.getState().rotated !== rotated) useOrbit.setState({ rotated });
}

/** 回到原本的方向（🧭、進出屋、換島） */
export function resetYaw(): void {
  setYaw(0);
}

/** 下一個視角模式 */
export function nextView(v: CamView): CamView {
  return VIEWS[(VIEWS.indexOf(v) + 1) % VIEWS.length];
}

/** 換到下一個視角模式（這次開著遊戲都記住） */
export function cycleView(): void {
  useOrbit.setState((s) => ({ view: nextView(s.view) }));
}

/** 水平向量繞 y 軸轉 yaw（和 three 的 rotation.y 一樣：x′ = x·cos + z·sin、z′ = −x·sin + z·cos） */
export function rotateXZ(v: Vec2, yaw: number): Vec2 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: v.x * c + v.z * s, z: -v.x * s + v.z * c };
}

/** 輸入的方向（畫面上的：x 右、z 下）換成世界方向：「上」是鏡頭看的方向 */
export function worldInput(dir: Vec2, yaw: number): Vec2 {
  return rotateXZ(dir, yaw);
}

/** 方向鍵、搖桿換成世界方向（跟著鏡頭；角色與屋裡走出去的判斷都用這個） */
export function moveInput(): Vec2 {
  return worldInput(inputDirection(), orbit.yaw);
}

/** 拖曳 dx px 後的角度：往右拖（dx > 0）視角往右轉，yaw 變小 */
export function yawByDrag(yaw: number, dx: number): number {
  return normalizeYaw(yaw - dx * DRAG_RATE);
}

/** 按住 Q（left）、E（right）dt 秒後的角度；兩個一起按不動 */
export function yawByKeys(yaw: number, left: boolean, right: boolean, dt: number): number {
  return normalizeYaw(yaw + ((left ? 1 : 0) - (right ? 1 : 0)) * KEY_TURN_RATE * dt);
}

/** 從畫面上的 x 開始拖曳能不能轉：有搖桿（觸控裝置）時只有右半邊，不然哪裡都可以 */
export function canOrbitFrom(x: number, width: number, touch: boolean): boolean {
  return !touch || x > width / 2;
}

/** 這台裝置有沒有觸控（和島上介面顯示搖桿的條件一樣） */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
}

/**
 * 島上的跟隨鏡頭：鏡頭在角色後上方、看角色前面 4 公尺，繞著角色轉 yaw。
 * yaw 0 和第 ③ 批以前一樣：鏡頭在 (0.85x, 高, z + 後)、看 (0.9x, 1, z − 4)（往島中間偏一點，看得到兩邊的建築）；
 * 直式螢幕拉遠；距離乘縮放倍率
 */
export function followCamera(pos: Vec2, yaw: number, zoom: number, portrait: boolean): CamPose {
  const back = (portrait ? 25 : 18.5) * zoom;
  const up = (portrait ? 22 : 15.5) * zoom;
  const cam = rotateXZ({ x: 0, z: back }, yaw);
  const look = rotateXZ({ x: 0, z: -4 }, yaw);
  return {
    position: { x: pos.x * 0.85 + cam.x, y: up, z: pos.z + cam.z },
    target: { x: pos.x * 0.9 + look.x, y: 1, z: pos.z + look.z },
  };
}

// ---------- 用家具時換視角 ----------

/** 角色的頭在世界的位置：照 PoseWrap 的轉法（樞軸在 pivotY、繞 x 轉 tiltX、內層在 y − pivotY 並縮放），再轉朝向 */
function headOf(f: ActFrame): Vec3 {
  // 雲霄飛車：角色跟著車廂翻轉，頭在角色的「上」那一側（docs/plans/grand-rides.md 第 5 節）
  if (f.quat) {
    const h = rotateByQuat(f.quat, { x: 0, y: HEAD_Y * f.scale, z: 0 });
    return { x: f.x + h.x, y: f.y + h.y, z: f.z + h.z };
  }
  const Y = f.y - f.pivotY + HEAD_Y * f.scale;
  const up = f.pivotY + Y * Math.cos(f.tiltX);
  const fwd = Y * Math.sin(f.tiltX);
  return { x: f.x + Math.sin(f.heading) * fwd, y: up, z: f.z + Math.cos(f.heading) * fwd };
}

/** 臉朝的方向（局部 +z 繞 x 轉 tiltX 再轉朝向） */
function faceOf(f: ActFrame): Vec3 {
  if (f.quat) return rotateByQuat(f.quat, { x: 0, y: 0, z: 1 });
  const c = Math.cos(f.tiltX);
  return { x: Math.sin(f.heading) * c, y: -Math.sin(f.tiltX), z: Math.cos(f.heading) * c };
}

/** 向量正規化（太短回傳 null） */
function unit(v: Vec3): Vec3 | null {
  const l = Math.hypot(v.x, v.y, v.z);
  return l < 1e-6 ? null : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * 第一人稱看哪裡：slide 看接下來要去的地方、lie 看床尾、swing 看臉朝的方向、sit 看臉朝的方向稍微往下；
 * 班級島大型設施（docs/plans/grand-rides.md）：coaster 看軌道前方、畫面跟著車廂翻轉（鏡頭的上是車廂的上）、
 * wheel 看南邊（整座島）、ship 看角色面向的方向（水平）
 */
export type CamStyle = 'slide' | 'lie' | 'swing' | 'sit' | 'coaster' | 'wheel' | 'ship';

/**
 * 用家具時的鏡頭（t 是開始用之後幾秒）：跟拍回傳 null（用平常的鏡頭）。家具的入口，算法在 camFor
 */
export function actCamera(item: YardItem, space: DecorSpace, kind: UseKind, t: number, view: CamView, yaw: number, zoom: number): (CamPose & { snap: boolean }) | null {
  const style: CamStyle = kind === 'slide' ? 'slide' : kind === 'lie' ? 'lie' : kind === 'swing' ? 'swing' : 'sit';
  return camFor((dt) => actFrame(item, space, kind, t + dt), style, view, yaw, zoom);
}

/**
 * 用家具或玩遊樂器材時的鏡頭（frameAt(dt) 是現在之後 dt 秒角色的樣子）：跟拍回傳 null（用平常的鏡頭）。
 * - 近拍：看角色身體的中間，鏡頭在後上方近一點、照 yaw 轉（可以拖曳）；慢慢跟上。
 * - 第一人稱：鏡頭在角色的頭（臉前面一點），直接跳到定位（snap，不然盪鞦韆時會晃）；
 *   溜滑梯看接下來要去的地方（沿著滑道往下看）、躺著看床尾、其他看臉朝的方向（坐著稍微往下）
 */
export function camFor(frameAt: (dt: number) => ActFrame, style: CamStyle, view: CamView, yaw: number, zoom: number): (CamPose & { snap: boolean; up?: Vec3 }) | null {
  if (view === 'follow') return null;
  const f = frameAt(0);
  const head = headOf(f);
  if (view === 'close') {
    const target = { x: (f.x + head.x) / 2, y: (f.y + head.y) / 2, z: (f.z + head.z) / 2 };
    const back = rotateXZ({ x: 0, z: CLOSE_BACK * zoom }, yaw);
    return { position: { x: target.x + back.x, y: target.y + CLOSE_UP * zoom, z: target.z + back.z }, target, snap: false };
  }
  const face = faceOf(f);
  const eye = { x: head.x + face.x * 0.25, y: head.y + face.y * 0.25, z: head.z + face.z * 0.25 };
  let dir: Vec3 | null = null;
  if (style === 'slide') {
    const h2 = headOf(frameAt(0.3));
    dir = unit({ x: h2.x - head.x, y: h2.y - head.y, z: h2.z - head.z });
  } else if (style === 'lie') dir = unit({ x: Math.sin(f.heading), y: -0.35, z: Math.cos(f.heading) });
  else if (style === 'wheel') dir = unit({ x: 0, y: -0.3, z: 1 });
  else if (style === 'ship') dir = unit({ x: Math.sin(f.heading), y: -0.12, z: Math.cos(f.heading) });
  else if (style === 'coaster') dir = face;
  else if (style !== 'swing') dir = unit({ x: face.x, y: face.y - 0.25, z: face.z });
  const d = dir ?? face;
  const up = style === 'coaster' && f.quat ? rotateByQuat(f.quat, { x: 0, y: 1, z: 0 }) : undefined;
  return { position: eye, target: { x: eye.x + d.x * 4, y: eye.y + d.y * 4, z: eye.z + d.z * 4 }, snap: true, ...(up ? { up } : {}) };
}

// ---------- 拖曳、捏合、點一下 ----------

/** 這一次按下（到全部放開）是不是已經拖曳或捏合過：是的話放開時不算點一下 */
export const gesture = { noTap: false };

/** R3F 的 onClick 用：按下到放開移動 delta px 以內、這一次沒有拖曳或捏合才算點一下 */
export function isTap(delta: number): boolean {
  return delta <= TAP_SLOP && !gesture.noTap;
}

/**
 * 在 3D 畫布上掛拖曳轉視角與兩指捏合（指標事件：只算按在畫布上的手指，搖桿的手指不算）；回傳取消的函式。
 * - 一根手指（或滑鼠左鍵）：能轉的地方（canOrbitFrom）拖超過 TAP_SLOP 就開始轉，這一次不算點一下。
 * - 第二根手指：改成捏合縮放，取消走過去的目標，這一次不算點一下。
 * touch：有沒有搖桿（觸控裝置只有右半邊能轉）
 */
export function attachGestures(el: HTMLElement, touch: boolean): () => void {
  /** 按著的指標：起點、上一點、能不能轉、轉了沒 */
  const pts = new Map<number, { x0: number; y0: number; x: number; y: number; orbit: boolean; dragging: boolean }>();
  /** 捏合開始時的兩指距離與倍率 */
  let pinch: { dist: number; zoom: number } | null = null;
  const twoDist = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onDown = (e: PointerEvent) => {
    if (pts.size === 0) gesture.noTap = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = el.getBoundingClientRect();
    pts.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, orbit: canOrbitFrom(e.clientX - r.left, r.width, touch), dragging: false });
    if (pts.size === 2) {
      pinch = { dist: twoDist(), zoom: camZoom.value };
      gesture.noTap = true;
      player.target = null;
      player.autoEnter = null;
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pinch && pts.size === 2) {
      setZoom(zoomByPinch(pinch.zoom, pinch.dist, twoDist()));
      return;
    }
    if (!p.orbit || pts.size > 1) return;
    if (!p.dragging && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > TAP_SLOP) {
      p.dragging = true;
      gesture.noTap = true;
      // 拖到介面上面也繼續轉
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // 有些環境不支援：照樣轉
      }
    }
    if (p.dragging) setYaw(yawByDrag(orbit.yaw, dx));
  };
  const onUp = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}

/** 按著的 Q、E（左轉、右轉） */
export const turnKeys = { left: false, right: false };

/** 註冊 Q、E 鍵（輸入框裡打字時不算；視窗失去焦點時放開）；回傳取消的函式 */
export function attachTurnKeys(): () => void {
  const set = (e: KeyboardEvent, on: boolean) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'KeyQ') turnKeys.left = on;
    else if (e.code === 'KeyE') turnKeys.right = on;
  };
  const down = (e: KeyboardEvent) => set(e, true);
  const up = (e: KeyboardEvent) => set(e, false);
  const blur = () => {
    turnKeys.left = false;
    turnKeys.right = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    blur();
  };
}

/** e2e 用（window.__game.orbit）：轉的角度、視角模式、設定與回正 */
export const orbitDebug = {
  get: () => ({ yaw: orbit.yaw, ...useOrbit.getState() }),
  setYaw,
  reset: resetYaw,
  setView: (view: CamView) => useOrbit.setState({ view }),
  cycleView,
};
