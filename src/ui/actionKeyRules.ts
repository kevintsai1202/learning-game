/**
 * 手機的大動作鍵（自己的家第 10.2 節；純函式）：看情況決定右下的主要動作與旁邊的小圓鈕。
 * 同時有好幾種時的順序：佈置 > 正在用 > 建築門口 > 小屋門口 > 腳踏墊 > 旁邊家具。
 * container 是外框的 data-testid（和電腦版的泡泡、卡片同一個，e2e 照用）。
 */
import type { UseKind } from '../store/furnitureUse';

/** 動作鍵要看的狀態 */
export interface ActionState {
  /** 佈置中選著的家具與面前不能放的原因（可以放是 null） */
  picking: { name: string; problem: string | null } | null;
  /**
   * 正在用的家具、班級島的遊樂器材（ride）或大型設施（grand）；locked 是途中不能起來（溜滑梯城堡、大型設施），
   * wait 是等出發的倒數（大型設施，例如「⏳ 12 秒後出發」）
   */
  acting: { kind: UseKind | 'ride' | 'grand'; name: string; emoji: string; locked?: boolean; wait?: string | null } | null;
  /** 站在建築門口 */
  zone: { name: string; icon: string } | null;
  /** 站在島主的小屋門口（還沒進屋） */
  houseDoor: { name: string } | null;
  /** 站在屋裡的腳踏墊上 */
  onMat: boolean;
  /** 旁邊的家具：use 是用法的按鈕字（不能用是 null），decor 是自己能佈置（可以轉方向、收起來），notice 是轉不過去的提示 */
  near: { name: string; emoji: string; use: string | null; decor: boolean; notice?: string | null } | null;
  /** 旁邊的班級島遊樂器材（docs/plans/playground.md）：按鈕的字、坐滿了沒 */
  ride: { name: string; emoji: string; label: string; full: boolean } | null;
  /** 旁邊的班級島大型設施（docs/plans/grand-rides.md）：按鈕的字（含價錢）、不能上的原因（可以上是 null） */
  grand: { name: string; emoji: string; label: string; blocked: string | null } | null;
}

/** 主要動作 */
export type MainAction = 'place' | 'stop' | 'enterZone' | 'enterHome' | 'leaveHome' | 'use' | 'rotate' | 'view' | 'ride' | 'grand';
/** 旁邊的小圓鈕（view 是用家具時換視角，第 10.5 節） */
export type SecondaryAction = 'ghostRotate' | 'rotate' | 'pickup' | 'view';

/** 動作鍵要顯示的東西 */
export interface ActionKeyView {
  main: MainAction;
  /** 大鍵上的字 */
  label: string;
  /** 是什麼（給朗讀器；警告時也顯示在大鍵上面） */
  caption: string;
  /** 上面一行小字要不要顯示：只有警告（不能放的原因）時；其他時候鍵上已經寫了（使用者 2026-10-11） */
  showCaption: boolean;
  /** 外框的 data-testid */
  container: string;
  disabled: boolean;
  secondary: SecondaryAction[];
}

/** 現在該顯示的動作（什麼都沒有是 null） */
export function pickAction(s: ActionState): ActionKeyView | null {
  if (s.picking)
    return {
      main: 'place',
      label: '放下',
      caption: s.picking.problem ?? `放下${s.picking.name}`,
      showCaption: !!s.picking.problem,
      container: 'decor-place-key',
      disabled: !!s.picking.problem,
      secondary: ['ghostRotate'],
    };
  if (s.acting) {
    const caption = `${s.acting.emoji} ${s.acting.name}`;
    // 溜滑梯（含溜滑梯城堡、大型設施）途中不能起來（溜完自己站起來）：大鍵是換視角（第 10.5 節）；
    // 大型設施等出發時上面寫倒數
    if (s.acting.kind === 'slide' || s.acting.locked) {
      const wait = s.acting.wait ?? null;
      return { main: 'view', label: '🎥 換視角', caption: wait ?? caption, showCaption: wait !== null, container: 'use-card', disabled: false, secondary: [] };
    }
    return { main: 'stop', label: '⬆️ 起來', caption, showCaption: false, container: 'use-card', disabled: false, secondary: ['view'] };
  }
  if (s.zone)
    return { main: 'enterZone', label: `${s.zone.icon} 進去`, caption: `${s.zone.icon} ${s.zone.name}`, showCaption: false, container: 'door-bubble', disabled: false, secondary: [] };
  if (s.houseDoor)
    return { main: 'enterHome', label: '🏠 進去', caption: `🏠 ${s.houseDoor.name}的家`, showCaption: false, container: 'home-door-bubble', disabled: false, secondary: [] };
  if (s.onMat) return { main: 'leaveHome', label: '🚪 出去', caption: '🚪 回到島上', showCaption: false, container: 'home-mat-bubble', disabled: false, secondary: [] };
  if (s.ride) {
    // 班級島的遊樂器材：坐滿了不能按，上面說坐滿了
    const caption = s.ride.full ? `${s.ride.emoji} ${s.ride.name}坐滿了` : `${s.ride.emoji} ${s.ride.name}`;
    return { main: 'ride', label: s.ride.label, caption, showCaption: s.ride.full, container: 'ride-card', disabled: s.ride.full, secondary: [] };
  }
  if (s.grand) {
    // 班級島的大型設施：不能上時（開走了、金幣不夠、坐滿了）上面寫原因、不能按
    const blocked = s.grand.blocked;
    const caption = `${s.grand.emoji} ${blocked ?? s.grand.name}`;
    return { main: 'grand', label: s.grand.label, caption, showCaption: blocked !== null, container: 'grand-card', disabled: blocked !== null, secondary: [] };
  }
  if (s.near) {
    // 轉不過去的提示（第 10.3 節）是警告：顯示在大鍵上面
    const notice = s.near.notice ?? null;
    const caption = notice ?? `${s.near.emoji} ${s.near.name}`;
    const showCaption = notice !== null;
    const container = s.near.decor ? 'decor-near' : 'use-card';
    if (s.near.use)
      return { main: 'use', label: s.near.use, caption, showCaption, container, disabled: false, secondary: s.near.decor ? ['rotate', 'pickup'] : [] };
    if (s.near.decor) return { main: 'rotate', label: '🔄 轉方向', caption, showCaption, container, disabled: false, secondary: ['pickup'] };
  }
  return null;
}
