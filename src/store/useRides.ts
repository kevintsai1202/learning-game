/**
 * 班級島遊樂場的狀態與動作（docs/plans/playground.md）：
 * - playground：這座島的遊樂場（班級島照伺服器給的；其他島全空），由島嶼場景放進來。
 * - near：角色旁邊的器材（位置編號；場景每一格算）。
 * - riders：別人坐在哪裡（別人的角色看到座位代碼 rideN 時登記；開始的時間是本機看到的那一刻）。
 * - 自己正在玩的器材的單一來源是 player.act（kind 'ride'）。
 * 規則在 src/store/playground.ts。e2e 透過 window.__game.rides 讀。
 */
import { create } from 'zustand';
import { emptyPlayground, type Playground } from './rideKinds';
import { PLAYGROUND_SPOTS, RIDES, freeSeat, rideFrame, type Rider } from './playground';
import { nowSec, syncActMirror } from './useFurnitureUse';
import { wallSec } from './actFrame';
import { player } from '../world/input';

interface RidesStore {
  /** 這座島的遊樂場（班級島才有器材） */
  playground: Playground;
  /** 角色旁邊的器材（位置編號；沒有是 null） */
  near: number | null;
  /** 別人坐在哪裡：成員 id → 位置、座位、開始的時間（performance.now 秒） */
  riders: Record<string, { slot: number; seat: number; t0: number }>;
}

export const useRides = create<RidesStore>(() => ({ playground: emptyPlayground(), near: null, riders: {} }));

/** 換了遊樂場（進島、老師換器材）：一樣就不動 */
export function setPlayground(pg: Playground): void {
  const cur = useRides.getState().playground;
  if (cur.length === pg.length && cur.every((k, i) => k === pg[i])) return;
  useRides.setState({ playground: [...pg] });
}

/** 旁邊的器材變了才更新 */
export function setRideNear(slot: number | null): void {
  if (useRides.getState().near !== slot) useRides.setState({ near: slot });
}

/** 別人開始或不再坐某個座位（別人的角色呼叫；null 是起來了或離開） */
export function setRemoteRider(id: string, r: { slot: number; seat: number; t0: number } | null): void {
  const cur = useRides.getState().riders[id];
  if (r && cur && cur.slot === r.slot && cur.seat === r.seat) return;
  if (!r && !cur) return;
  useRides.setState((s) => {
    const riders = { ...s.riders };
    if (r) riders[id] = r;
    else delete riders[id];
    return { riders };
  });
}

/** 別人坐的位子（Rider 清單） */
export function othersRiding(): Rider[] {
  return Object.entries(useRides.getState().riders).map(([id, r]) => ({ id, slot: r.slot, seat: r.seat }));
}

/** 某一座的每個座位有沒有人（自己＋別人；翹翹板怎麼動、坐滿了沒用） */
export function occupiedOf(slot: number): boolean[] {
  const out: boolean[] = Array(8).fill(false);
  for (const r of othersRiding()) if (r.slot === slot) out[r.seat] = true;
  const act = player.act;
  if (act?.kind === 'ride' && act.slot === slot) out[act.seat] = true;
  return out;
}

/** 某一座坐滿了沒 */
export function rideFull(slot: number): boolean {
  const kind = useRides.getState().playground[slot];
  if (!kind) return true;
  const occ = occupiedOf(slot);
  return occ.slice(0, RIDES[kind].seats).every(Boolean);
}

/**
 * 坐上第 slot 座器材：選離角色最近的空位、站到座位上（下一則位置訊息和座位代碼一起送出時，別人看到的就是座位）。
 * 坐滿了或沒有器材回傳 false
 */
export function startRide(slot: number): boolean {
  const kind = useRides.getState().playground[slot];
  if (!kind || player.act) return false;
  const taken = new Set(othersRiding().filter((r) => r.slot === slot).map((r) => r.seat));
  const c = PLAYGROUND_SPOTS[slot];
  const wall = wallSec();
  const seat = freeSeat(kind, taken, c, player.pos, { wall, since: 0 });
  if (seat === null) return false;
  player.act = { kind: 'ride', ride: kind, slot, seat, t0: nowSec() };
  const f = rideFrame(kind, seat, c, { wall, since: 0 }, occupiedOf(slot));
  player.pos = { x: f.x, z: f.z };
  player.heading = f.heading;
  player.target = null;
  player.autoEnter = null;
  syncActMirror();
  return true;
}

/** e2e 用（window.__game.rides）：遊樂場、旁邊的器材、別人坐在哪裡、坐上去 */
export const ridesDebug = {
  store: useRides,
  start: startRide,
  occupied: occupiedOf,
};
