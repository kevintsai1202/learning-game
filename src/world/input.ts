/**
 * 島上移動的輸入與角色即時狀態（模組層級，不走 React 狀態，避免每幀重新渲染）。
 * 三種操作方式：點地面走過去、方向鍵／WASD、觸控搖桿。
 */
import type { ZoneId } from '../store/useUi';
import { SPAWN } from './layout';
import type { Vec2 } from './movement';
import type { YardItem } from '../store/yard';
import type { UseKind } from '../store/furnitureUse';
import type { RideKind } from '../store/rideKinds';

/**
 * 正在用的家具（第 9 節優化）：哪一種用法、哪一件、在島上還是屋裡、開始的時間（performance.now 秒）。
 * 坐、躺、盪、溜滑梯時有值；角色的位置與姿勢照 actFrame 算
 */
export interface FurnitureAct {
  kind: UseKind;
  item: YardItem;
  place: 'yard' | 'home';
  t0: number;
}

/** 正在玩的班級島遊樂器材（docs/plans/playground.md）：哪一種、第幾個位置、第幾個座位、開始的時間 */
export interface RideAct {
  kind: 'ride';
  ride: RideKind;
  slot: number;
  seat: number;
  t0: number;
}

/** 正在用的家具或遊樂器材（角色的樣子都照 src/store/actFrame.ts 的 frameOf 算） */
export type PlayerAct = FurnitureAct | RideAct;

/** 角色即時狀態 */
export const player = {
  pos: { x: SPAWN.x, z: SPAWN.z } as Vec2,
  /** 朝向（弧度，0 = 面向 +z） */
  heading: Math.PI,
  /** 點地面設定的目標點 */
  target: null as Vec2 | null,
  /** 走到目標後要自動進入的建築（點建築時設定）；home 是島主的小屋（自己的家第二期） */
  autoEnter: null as ZoneId | 'home' | null,
  /** 下一格畫面鏡頭直接跳到定位（進屋、出屋換場景時；不然鏡頭會從另一個場景飛過來） */
  snapCamera: false,
  /** 正在用的家具（單一來源；傳送時清掉：集合、老師「過去」、進出屋、換島都會起來） */
  act: null as PlayerAct | null,
};

/** 鍵盤與搖桿輸入 */
export const input = {
  keys: new Set<string>(),
  /** 觸控搖桿向量（x 右、z 下），長度 0～1 */
  joy: { x: 0, z: 0 },
};

const KEY_DIRS: Record<string, Vec2> = {
  ArrowUp: { x: 0, z: -1 },
  KeyW: { x: 0, z: -1 },
  ArrowDown: { x: 0, z: 1 },
  KeyS: { x: 0, z: 1 },
  ArrowLeft: { x: -1, z: 0 },
  KeyA: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
  KeyD: { x: 1, z: 0 },
};

/** 合併鍵盤與搖桿，回傳移動方向（未正規化） */
export function inputDirection(): Vec2 {
  let x = input.joy.x;
  let z = input.joy.z;
  for (const k of input.keys) {
    const d = KEY_DIRS[k];
    if (d) {
      x += d.x;
      z += d.z;
    }
  }
  return { x, z };
}

/** 註冊鍵盤監聽；回傳取消註冊的函式 */
export function attachKeyboard(): () => void {
  const down = (e: KeyboardEvent) => {
    // 輸入框裡打字時不要移動角色
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (KEY_DIRS[e.code]) {
      input.keys.add(e.code);
      player.target = null;
      e.preventDefault();
    }
  };
  const up = (e: KeyboardEvent) => input.keys.delete(e.code);
  const blur = () => input.keys.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}

/** 傳送角色到指定位置（離開建築回到門口、e2e 測試用） */
export function teleport(pos: Vec2): void {
  player.pos = { x: pos.x, z: pos.z };
  player.target = null;
  player.autoEnter = null;
  player.act = null;
}
