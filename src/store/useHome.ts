/**
 * 自己的家第二期：進屋、出屋的狀態（docs/plans/home.md 第 8 節）。
 * - houseKey：這座島上的小屋是誰的（自己的島是 mine，朋友的島、熊熊老師去的孩子的島是島主的帳號 id；
 *   班級島沒有小屋是 null）。GameCanvas 依島的外觀與在誰的島上寫入。
 * - inside：在哪一間屋子裡（houseKey）；綁島主是誰，換島、回到標題時被迫出來。
 * - nearDoor：站在島上小屋的門口（「進去嗎？」）；onMat：站在屋裡門口的腳踏墊上（「回到島上」）。
 * 畫面不放在 useUi 的 nearZone：小屋不是建築（ZoneId），建築的介紹與選單查不到它。
 */
import { create } from 'zustand';
import { player, teleport } from '../world/input';
import { HOUSE, SPAWN } from '../world/layout';
import { DOOR_MAT, HOME_SPAWN, houseDoor } from '../world/room';
import { homeCellToWorld, homeCells } from './home';

interface HomeStore {
  /** 島上的小屋是誰的；沒有小屋是 null */
  houseKey: string | null;
  /** 島主的名字（門口的泡泡「○○的家」；只放在畫面上） */
  houseName: string | null;
  /** 在哪一間屋子裡；在島上是 null */
  inside: string | null;
  /** 站在小屋門口 */
  nearDoor: boolean;
  /** 站在屋裡的腳踏墊上 */
  onMat: boolean;
}

export const useHome = create<HomeStore>(() => ({ houseKey: null, houseName: null, inside: null, nearDoor: false, onMat: false }));

/** 島上的小屋是誰的：有小屋時，在別人的島上是島主的 id，自己的島是 mine；沒有小屋（班級島）是 null */
export function houseKeyOf(hasHouse: boolean, host: { id: string } | null): string | null {
  return hasHouse ? (host?.id ?? 'mine') : null;
}

/** e2e 用（window.__game.home）：狀態、進屋、出屋、小屋門口、屋裡的腳踏墊與出生點、房間的格子與座標 */
export const homeDebug = {
  store: useHome,
  enter: enterHome,
  leave: leaveHome,
  door: houseDoor,
  mat: DOOR_MAT,
  spawn: HOME_SPAWN,
  cells: homeCells,
  world: homeCellToWorld,
};

/** 現在在屋裡 */
export function isInsideHome(): boolean {
  const { inside, houseKey } = useHome.getState();
  return inside !== null && inside === houseKey;
}

/**
 * 進屋：島上有小屋才進得去；站到房間門口裡面、面向房間。
 * 家具包由場景的 DecorProbe 卸下時關上（島上與屋裡的格子不一樣；useDecor 會讀這裡，不能反過來 import）
 */
export function enterHome(): boolean {
  const { houseKey } = useHome.getState();
  if (houseKey === null) return false;
  teleport(HOME_SPAWN);
  player.heading = HOME_SPAWN.heading;
  player.snapCamera = true;
  useHome.setState({ inside: houseKey, nearDoor: false, onMat: false });
  return true;
}

/** 出屋：站到小屋門口、背對小屋（門口的泡泡會再出現，和建築一樣） */
export function leaveHome(): void {
  teleport(houseDoor());
  player.heading = HOUSE.rotY;
  player.snapCamera = true;
  useHome.setState({ inside: null, onMat: false });
}

/**
 * 換了島或畫面（島主變了、沒有小屋）：在屋裡的話被迫出來。孩子站到出生點（已經不是同一座島，不站小屋門口）；
 * 熊熊老師（teacher）換島時 gmClient 已經傳送好，位置不動
 */
export function setHouseKey(key: string | null, opts: { teacher?: boolean } = {}): void {
  const { inside, houseKey } = useHome.getState();
  if (key === houseKey && (inside === null || inside === key)) return;
  if (inside !== null && inside !== key) {
    if (!opts.teacher) {
      teleport(SPAWN);
      player.heading = Math.PI;
    }
    useHome.setState({ houseKey: key, inside: null, onMat: false, nearDoor: false });
    return;
  }
  useHome.setState({ houseKey: key });
}
