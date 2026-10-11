/**
 * 自己的家第二期：房間的幾何（純函式，不依賴 three；規格見 docs/plans/home.md 第 8 節）。
 * 房間的座標以房間中心為原點：後牆在 -z，前緣（+z）中間是門口的腳踏墊，鏡頭在前上方。
 * 也放島上小屋的門口位置（走到這裡出現「進去嗎？」）。
 */
import { HOUSE } from './layout';
import { HOME_DOOR_CELLS, HOME_SIZE, homeCellToWorld } from '../store/home';
import type { RoomRect, Vec2 } from './movement';

/** 房間的範圍（公尺；一格 1 公尺） */
export const ROOM_RECT: RoomRect = { halfX: HOME_SIZE / 2, halfZ: HOME_SIZE / 2 };
/** 角色的身體半徑（和島上一樣） */
export const BODY_R = 0.45;
/** 腳踏墊：門口兩格的中心與半寬、半深 */
const MAT = (() => {
  const xs = HOME_DOOR_CELLS.map((c) => homeCellToWorld(c.gx, c.gz).x);
  const z = homeCellToWorld(HOME_DOOR_CELLS[0].gx, HOME_DOOR_CELLS[0].gz).z;
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z, halfX: (Math.max(...xs) - Math.min(...xs)) / 2 + 0.5, halfZ: 0.5 };
})();
export const DOOR_MAT = MAT;
/** 進屋站的位置：腳踏墊前面一點，面向房間裡面（-z） */
export const HOME_SPAWN = { x: MAT.x, z: MAT.z - 1.3, heading: Math.PI };
/** 小屋門口多近算「在門口」（公尺；和建築一樣） */
export const HOUSE_DOOR_RANGE = 1.9;

/** 站在腳踏墊上（出現「回到島上」） */
export function onDoorMat(pos: Vec2): boolean {
  return Math.abs(pos.x - MAT.x) <= MAT.halfX && Math.abs(pos.z - MAT.z) <= MAT.halfZ + 0.1;
}

/**
 * 直接走出去：站在前緣的門口範圍、而且往前（+z）推。位置永遠在房間裡，送出去的座標不會超出房間；
 * 進屋的出生點離前緣還有一段，不會一進來就出去
 */
export function atRoomExit(pos: Vec2, dir: Vec2): boolean {
  const atEdge = pos.z >= ROOM_RECT.halfZ - BODY_R - 0.05;
  return atEdge && Math.abs(pos.x - MAT.x) <= MAT.halfX && dir.z > 0.5;
}

/** 島上小屋的門口：小屋正面（朝出生點）外面一點，和建築的門口一樣是 radius + 1.2 */
export function houseDoor(): Vec2 {
  const d = HOUSE.radius + 1.2;
  return { x: HOUSE.x + Math.sin(HOUSE.rotY) * d, z: HOUSE.z + Math.cos(HOUSE.rotY) * d };
}

/** 房間的鏡頭方向（前上方往下看，仰角約 53 度） */
const CAM_DIR = { y: 0.8, z: 0.6 };
/** 鏡頭的垂直視角（度；和 GameCanvas 的 camera fov 一樣） */
const FOV = 45;
/** 橫式螢幕時鏡頭離看的點多遠（公尺；島上約 24） */
const ROOM_CAM_DIST = 9.5;
/** 直式螢幕時角色左右至少看得到幾公尺 */
const ROOM_VIEW_HALF = 3.4;

/**
 * 房間的鏡頭（第 9 節優化：跟著角色、拉近一點）：aspect 是畫面寬 / 高，pos 是角色的位置，zoom 是縮放倍率，
 * yaw 是轉視角的角度（第 10.5 節；0 是原本從前面看的方向，鏡頭繞看的點轉）。
 * 看的點跟著角色、夾在房間裡（yaw 0 時鏡頭不會跑到側牆外）；直式螢幕的水平視角窄，要拉遠
 */
export function roomCamera(
  aspect: number,
  pos: Vec2,
  zoom = 1,
  yaw = 0,
): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } {
  const t = Math.tan(((FOV / 2) * Math.PI) / 180);
  const d = Math.max(ROOM_CAM_DIST, ROOM_VIEW_HALF / (t * Math.max(aspect, 0.1))) * zoom;
  const target = {
    x: Math.max(-(ROOM_RECT.halfX - 1.5), Math.min(ROOM_RECT.halfX - 1.5, pos.x * 0.85)),
    y: 0.6,
    z: Math.max(-(ROOM_RECT.halfZ - 1), Math.min(ROOM_RECT.halfZ - 0.5, pos.z)),
  };
  // 水平的那一段照 yaw 轉（x′ = x·cos + z·sin、z′ = −x·sin + z·cos，和 three 的 rotation.y 一樣）
  const back = CAM_DIR.z * d;
  return { position: { x: target.x + back * Math.sin(yaw), y: target.y + CAM_DIR.y * d, z: target.z + back * Math.cos(yaw) }, target };
}

/** 房間的三面牆 */
export type RoomWall = 'back' | 'left' | 'right';

/**
 * 擋在鏡頭和角色之間的牆（第 10.5 節：轉到側面或後面時變半透明）：角色永遠在房間裡，
 * 鏡頭在哪一面牆的外面，那一面就擋住。前面只有矮牆，不算
 */
export function blockingWalls(cam: { x: number; z: number }): RoomWall[] {
  const out: RoomWall[] = [];
  if (cam.z < -ROOM_RECT.halfZ) out.push('back');
  if (cam.x < -ROOM_RECT.halfX) out.push('left');
  if (cam.x > ROOM_RECT.halfX) out.push('right');
  return out;
}
