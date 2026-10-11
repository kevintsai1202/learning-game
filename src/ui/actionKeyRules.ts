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
  /** 正在用的家具 */
  acting: { kind: UseKind; name: string; emoji: string } | null;
  /** 站在建築門口 */
  zone: { name: string; icon: string } | null;
  /** 站在島主的小屋門口（還沒進屋） */
  houseDoor: { name: string } | null;
  /** 站在屋裡的腳踏墊上 */
  onMat: boolean;
  /** 旁邊的家具：use 是用法的按鈕字（不能用是 null），decor 是自己能佈置（可以轉方向、收起來） */
  near: { name: string; emoji: string; use: string | null; decor: boolean } | null;
}

/** 主要動作 */
export type MainAction = 'place' | 'stop' | 'enterZone' | 'enterHome' | 'leaveHome' | 'use' | 'rotate';
/** 旁邊的小圓鈕 */
export type SecondaryAction = 'ghostRotate' | 'rotate' | 'pickup';

/** 動作鍵要顯示的東西 */
export interface ActionKeyView {
  main: MainAction;
  /** 大鍵上的字 */
  label: string;
  /** 上面一行小字（是什麼） */
  caption: string;
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
      container: 'decor-place-key',
      disabled: !!s.picking.problem,
      secondary: ['ghostRotate'],
    };
  if (s.acting) {
    // 溜滑梯途中不能起來（溜完自己站起來）
    if (s.acting.kind === 'slide') return null;
    return { main: 'stop', label: '起來', caption: `${s.acting.emoji} ${s.acting.name}`, container: 'use-card', disabled: false, secondary: [] };
  }
  if (s.zone) return { main: 'enterZone', label: '進去', caption: `${s.zone.icon} ${s.zone.name}`, container: 'door-bubble', disabled: false, secondary: [] };
  if (s.houseDoor) return { main: 'enterHome', label: '進去', caption: `🏠 ${s.houseDoor.name}的家`, container: 'home-door-bubble', disabled: false, secondary: [] };
  if (s.onMat) return { main: 'leaveHome', label: '出去', caption: '🚪 回到島上', container: 'home-mat-bubble', disabled: false, secondary: [] };
  if (s.near) {
    const caption = `${s.near.emoji} ${s.near.name}`;
    const container = s.near.decor ? 'decor-near' : 'use-card';
    if (s.near.use) return { main: 'use', label: s.near.use, caption, container, disabled: false, secondary: s.near.decor ? ['rotate', 'pickup'] : [] };
    if (s.near.decor) return { main: 'rotate', label: '🔄 轉方向', caption, container, disabled: false, secondary: ['pickup'] };
  }
  return null;
}
