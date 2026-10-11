/**
 * 用家具的狀態與動作（自己的家第 9 節優化，docs/plans/home.md）：坐、躺、溜滑梯、盪鞦韆、開關、沙堡。
 * - 正在用的家具的單一來源是 player.act（src/world/input.ts）；這裡的 acting 是給畫面用的鏡像（場景每一格同步）。
 * - near：角色旁邊可以用的家具（場景每一格算；用的時候凍結，不會跳到旁邊另一件）。
 * - toggles：開關類（電視、路燈、立燈）與沙堡的開著狀態，只在本機（換島、進出屋時清掉）。
 * - swingers：正在盪的鞦韆（自己的 'self' 與別人的帳號 id → 哪一格、開始時間），座椅照同一個時間擺。
 * 規則在 src/store/furnitureUse.ts。
 */
import { create } from 'zustand';
import { actFrame, exitPoint, useSpecOf, type UseKind } from './furnitureUse';
import { HOME_SPACE } from './home';
import { YARD_SPACE, type DecorSpace, type YardItem } from './yard';
import { useHome } from './useHome';
import { player } from '../world/input';

/** 家具在島上還是屋裡 */
export type Place = 'yard' | 'home';

/** 擺放的地方 */
export function spaceOf(place: Place): DecorSpace {
  return place === 'home' ? HOME_SPACE : YARD_SPACE;
}

/** 一件家具的鍵（地方＋格子；開關與鞦韆用） */
export function cellKey(place: Place, it: Pick<YardItem, 'gx' | 'gz'>): string {
  return `${place}:${it.gx},${it.gz}`;
}

/** 現在的時間（秒；動作的時間軸用，本機與別人的同一個來源） */
export function nowSec(): number {
  return performance.now() / 1000;
}

interface UseStore {
  /** 角色旁邊可以用的家具 */
  near: { item: YardItem; place: Place } | null;
  /** 正在用的家具（player.act 的鏡像） */
  acting: { kind: UseKind; item: YardItem; place: Place } | null;
  /** 開著的開關與堆好的沙堡（cellKey → true） */
  toggles: Record<string, boolean>;
  /** 正在盪的鞦韆：誰（self 或帳號 id）→ 哪一格（cellKey）、開始時間 */
  swingers: Record<string, { cell: string; t0: number }>;
}

export const useFurnitureUse = create<UseStore>(() => ({ near: null, acting: null, toggles: {}, swingers: {} }));

/** 換島、進出屋：開關與沙堡恢復原狀 */
useHome.subscribe((s, prev) => {
  if (s.houseKey !== prev.houseKey || s.inside !== prev.inside) useFurnitureUse.setState({ toggles: {} });
});

/**
 * 用一件家具：開關、沙堡切換（只在本機）；坐、躺、盪、溜滑梯讓角色上去（player.act）。
 * 回傳用法（畫面依它放音效，例如鋼琴彈一段）
 */
export function startUse(item: YardItem, place: Place): UseKind | null {
  const spec = useSpecOf(item.id);
  if (!spec) return null;
  if (spec.kind === 'toggle' || spec.kind === 'sandcastle') {
    const key = cellKey(place, item);
    useFurnitureUse.setState((s) => ({ toggles: { ...s.toggles, [key]: !s.toggles[key] } }));
    return spec.kind;
  }
  const t0 = nowSec();
  player.act = { kind: spec.kind, item, place, t0 };
  // 一坐下就站到座位上：下一則位置訊息和動作代碼一起送出時，別人看到的就是座位（不用等下一格畫面）
  const f = actFrame(item, spaceOf(place), spec.kind, 0);
  player.pos = { x: f.x, z: f.z };
  player.heading = f.heading;
  player.target = null;
  player.autoEnter = null;
  syncActMirror();
  return spec.kind;
}

/** 起來（溜滑梯途中不行，done 是溜完了）：站到起身點；之後的碰撞照常把人推出家具 */
export function stopUse(done = false): void {
  const act = player.act;
  if (!act || (act.kind === 'slide' && !done)) return;
  player.pos = exitPoint(act.item, spaceOf(act.place));
  player.act = null;
  syncActMirror();
}

/** 把 player.act 同步到畫面用的鏡像與自己的鞦韆（場景每一格呼叫；傳送清掉 act 時也會跟上） */
export function syncActMirror(): void {
  const act = player.act;
  const s = useFurnitureUse.getState();
  const same = s.acting === null ? act === null : act !== null && s.acting.item === act.item && s.acting.kind === act.kind && s.acting.place === act.place;
  if (same) return;
  const swingers = { ...s.swingers };
  if (act?.kind === 'swing') swingers.self = { cell: cellKey(act.place, act.item), t0: act.t0 };
  else delete swingers.self;
  useFurnitureUse.setState({ acting: act ? { kind: act.kind, item: act.item, place: act.place } : null, swingers });
}

/** 別人開始或不再盪鞦韆（遠端的角色呼叫） */
export function setRemoteSwing(id: string, swing: { cell: string; t0: number } | null): void {
  useFurnitureUse.setState((s) => {
    const swingers = { ...s.swingers };
    if (swing) swingers[id] = swing;
    else delete swingers[id];
    return { swingers };
  });
}

/** 旁邊可以用的家具變了才更新 */
export function setUseNear(near: { item: YardItem; place: Place } | null): void {
  const cur = useFurnitureUse.getState().near;
  const same = cur === near || (cur && near && cur.place === near.place && cur.item.gx === near.item.gx && cur.item.gz === near.item.gz && cur.item.id === near.item.id);
  if (!same) useFurnitureUse.setState({ near });
}
