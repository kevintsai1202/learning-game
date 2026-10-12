/**
 * 班級島大型設施的狀態與動作（docs/plans/grand-rides.md）：
 * - near：角色旁邊（上車的範圍內）的設施（場景每一格算）。
 * - riders：別人坐在哪個座位（別人的角色看到 coN、whN 時登記；飛船沒有座位不登記）。
 * - 自己正在玩的設施的單一來源是 player.act（kind 'grand'）。
 * - 上車（startGrand）：照班次、金幣、伺服器支援、空位；付 5 金幣（熊熊老師免費），坐到座位或站到甲板上。
 * 規則在 src/store/grandRides.ts。e2e 透過 window.__game.grand 讀。
 */
import { create } from 'zustand';
import { GRAND_PRICE, type GrandRide } from './grandKinds';
import {
  COASTER_BOARD,
  SHIP,
  boardingOf,
  coaster,
  coasterRun,
  freeCoasterSeat,
  freeWheelSeat,
  grandFrame,
  grandSeats,
  shipState,
  SHIP_CYCLE,
} from './grandRides';
import { wallSec, warpWall } from './clockSync';
import { nowSec, syncActMirror } from './useFurnitureUse';
import { useGame } from './useGame';
import { player } from '../world/input';
import { useRealtime } from '../online/realtimeClient';
import { useGm } from '../online/gmClient';

interface GrandStore {
  /** 角色旁邊的設施（沒有是 null） */
  near: GrandRide | null;
  /** 別人坐在哪裡：成員 id → 設施與座位 */
  riders: Record<string, { ride: GrandRide; seat: number }>;
}

export const useGrand = create<GrandStore>(() => ({ near: null, riders: {} }));

/** 旁邊的設施變了才更新 */
export function setGrandNear(ride: GrandRide | null): void {
  if (useGrand.getState().near !== ride) useGrand.setState({ near: ride });
}

/** 別人開始或不再坐某個座位（別人的角色呼叫；null 是下來了或離開） */
export function setRemoteGrand(id: string, r: { ride: GrandRide; seat: number } | null): void {
  const cur = useGrand.getState().riders[id];
  if (r && cur && cur.ride === r.ride && cur.seat === r.seat) return;
  if (!r && !cur) return;
  useGrand.setState((s) => {
    const riders = { ...s.riders };
    if (r) riders[id] = r;
    else delete riders[id];
    return { riders };
  });
}

/** 某樣設施有人的座位（別人＋自己） */
export function grandTaken(ride: GrandRide): Set<number> {
  const out = new Set<number>();
  for (const r of Object.values(useGrand.getState().riders)) if (r.ride === ride) out.add(r.seat);
  const act = player.act;
  if (act?.kind === 'grand' && act.ride === ride) out.add(act.seat);
  return out;
}

/** 伺服器支援大型設施（孩子的連線或熊熊老師的連線的 welcome 有 grand） */
export function grandServerOk(): boolean {
  return useRealtime.getState().grand || useGm.getState().grand;
}

/**
 * 現在不能上車的原因（按鈕上面寫的；可以上是 null）：伺服器不支援「稍後再來」、金幣不夠「要 5 金幣」、
 * 開走了「下一班 N 秒」、坐滿了。free 是熊熊老師（免費）
 */
export function grandBlock(ride: GrandRide, opts: { free: boolean }): string | null {
  if (!grandServerOk()) return '稍後再來';
  if (!opts.free && (useGame.getState().profile()?.coins ?? 0) < GRAND_PRICE) return `要 ${GRAND_PRICE} 金幣`;
  const b = boardingOf(ride, wallSec());
  if (!b.open) return `下一班 ${Math.ceil(b.wait)} 秒`;
  if (grandTaken(ride).size >= grandSeats(ride)) return '坐滿了';
  return null;
}

/**
 * 上車：檢查（grandBlock）→ 選座位 → 付錢（熊熊老師免費；付不了就不上）→ 坐到座位或站到甲板上
 * （下一則位置訊息和座位代碼一起送出時，別人看到的就是座位）。成功回傳 true
 */
export function startGrand(ride: GrandRide, opts: { free: boolean }): boolean {
  if (player.act || grandBlock(ride, opts)) return false;
  const wall = wallSec();
  const taken = grandTaken(ride);
  let seat = 0;
  if (ride === 'coaster') {
    const s = freeCoasterSeat(taken, player.pos);
    if (s === null) return false;
    seat = s;
  } else if (ride === 'wheel') {
    const s = freeWheelSeat(taken, wall);
    if (s === null) return false;
    seat = s;
  }
  if (!opts.free && !useGame.getState().payGrand(ride, grandServerOk())) return false;
  const run = ride === 'coaster' ? coasterRun(wall).run : ride === 'ship' ? shipState(wall).run : 0;
  const deck = ride === 'ship' ? { ...SHIP.boardAt } : null;
  player.act = { kind: 'grand', ride, seat, run, w0: wall, t0: nowSec(), deck, target: null };
  const f = grandFrame(player.act, wall);
  player.pos = { x: f.x, z: f.z };
  player.heading = f.heading;
  player.target = null;
  player.autoEnter = null;
  syncActMirror();
  return true;
}

/** 正在玩、等出發時大鍵上面寫的倒數（出發了或摩天輪是 null） */
export function grandWait(): string | null {
  const act = player.act;
  if (act?.kind !== 'grand' || act.ride === 'wheel') return null;
  const go = act.ride === 'coaster' ? act.run * coaster().cycle + COASTER_BOARD : act.run * SHIP_CYCLE + SHIP.board;
  const left = go - wallSec();
  return left > 0 ? `⏳ ${Math.ceil(left)} 秒後出發` : null;
}

/** e2e 用（window.__game.grand）：狀態、上車、能不能上、把牆上的時間往前撥、現在的班次 */
export const grandDebug = {
  store: useGrand,
  start: (ride: GrandRide, free = false) => startGrand(ride, { free }),
  block: (ride: GrandRide, free = false) => grandBlock(ride, { free }),
  warp: warpWall,
  wall: wallSec,
  coaster: () => ({ ...coasterRun(wallSec()), cycle: coaster().cycle }),
  ship: () => shipState(wallSec()),
};
