/**
 * 正在用的家具或班級島遊樂器材（player.act、別人的動作）的樣子，同一個入口（docs/plans/playground.md）：
 * - 家具照開始後幾秒（src/store/furnitureUse.ts 的 actFrame）。
 * - 遊樂器材照牆上的時間（一直在動的器材）與坐上去之後幾秒（鞦韆組、溜滑梯城堡），
 *   翹翹板還要看這一座的座位有沒有人（occupied）（src/store/playground.ts 的 rideFrame）。
 * 純函式（時鐘由呼叫的一方給），本機的角色、別人的角色、鏡頭都用這個。
 */
import { actFrame, type ActFrame } from './furnitureUse';
import { PLAYGROUND_SPOTS, rideFrame } from './playground';
import { grandFrame } from './grandRides';
import { wallSec } from './clockSync';
import { HOME_SPACE } from './home';
import { YARD_SPACE } from './yard';
import type { PlayerAct } from '../world/input';

/** 兩個時鐘：now 是 performance.now 秒（開始的時間 t0 用同一個來源），wall 是牆上的時間（秒） */
export interface FrameClock {
  now: number;
  wall: number;
}

/** 牆上的時間（秒；校正過，一直在動的遊樂器材與大型設施用；src/store/clockSync.ts） */
export { wallSec };

/** 某一刻正在用的家具或遊樂器材的樣子；occupied(slot) 是那一座的每個座位有沒有人（翹翹板用） */
export function frameOf(act: PlayerAct, clock: FrameClock, occupied: (slot: number) => readonly boolean[]): ActFrame {
  const since = clock.now - act.t0;
  if (act.kind === 'grand') return grandFrame(act, clock.wall);
  if (act.kind === 'ride') return rideFrame(act.ride, act.seat, PLAYGROUND_SPOTS[act.slot], { wall: clock.wall, since }, occupied(act.slot));
  return actFrame(act.item, act.place === 'home' ? HOME_SPACE : YARD_SPACE, act.kind, since);
}
