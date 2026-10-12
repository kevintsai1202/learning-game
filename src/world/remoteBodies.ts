/**
 * 同一個場景裡其他角色（別的小朋友、進島的熊熊老師）現在站的位置，給自己的角色走路時被擋住用。
 * 每一幀都會變，放在一般的物件裡（不走 zustand，不會讓畫面重畫）：RemotePlayers 每幀寫入，Player 每幀讀。
 * 坐在家具、遊樂器材、大型設施上的人不擋（從表裡拿掉）；離開畫面時也拿掉。
 */
import type { Obstacle } from './movement';

/** 其他角色的身體半徑：比自己（0.45）小一點，兩個人還是擠得過只容一人的縫 */
export const REMOTE_BODY_R = 0.4;

/** 玩家 id → 站的位置 */
const bodies = new Map<string, Obstacle>();

/** 記下（或更新）某個人站的位置 */
export function setRemoteBody(id: string, x: number, z: number): void {
  const b = bodies.get(id);
  if (b) {
    b.x = x;
    b.z = z;
  } else bodies.set(id, { x, z, r: REMOTE_BODY_R });
}

/** 拿掉某個人（坐上家具或設施、離開） */
export function clearRemoteBody(id: string): void {
  bodies.delete(id);
}

/** 現在會擋路的人（Player 每幀讀；回傳的陣列每次都是新的，可以放心用） */
export function remoteBodies(): Obstacle[] {
  return Array.from(bodies.values());
}
