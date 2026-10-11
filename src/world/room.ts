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

/** 房間的鏡頭看的點與方向（前上方往下看，仰角約 53 度；看的點偏前，門口的腳踏墊不會被底部的提示擋住） */
const CAM_TARGET = { x: 0, y: 0, z: 1.2 };
const CAM_DIR = { y: 0.8, z: 0.6 };
/** 鏡頭的垂直視角（度；和 GameCanvas 的 camera fov 一樣） */
const FOV = 45;

/**
 * 房間的鏡頭（aspect 是畫面寬 / 高）：離看的點夠遠，整間房（加一點邊）放得進畫面；
 * 直式螢幕的水平視角窄，要拉遠
 */
export function roomCamera(aspect: number): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } {
  const t = Math.tan(((FOV / 2) * Math.PI) / 180);
  const d = Math.max(13.5, (ROOM_RECT.halfX + 0.8) / (t * aspect));
  return {
    position: { x: CAM_TARGET.x, y: CAM_TARGET.y + CAM_DIR.y * d, z: CAM_TARGET.z + CAM_DIR.z * d },
    target: CAM_TARGET,
  };
}
