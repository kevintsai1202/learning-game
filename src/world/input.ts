/**
 * 島上移動的輸入與角色即時狀態（模組層級，不走 React 狀態，避免每幀重新渲染）。
 * 三種操作方式：點地面走過去、方向鍵／WASD、觸控搖桿。
 */
import type { ZoneId } from '../store/useUi';
import { SPAWN } from './layout';
import type { Vec2 } from './movement';

/** 角色即時狀態 */
export const player = {
  pos: { x: SPAWN.x, z: SPAWN.z } as Vec2,
  /** 朝向（弧度，0 = 面向 +z） */
  heading: Math.PI,
  /** 點地面設定的目標點 */
  target: null as Vec2 | null,
  /** 走到目標後要自動進入的建築（點建築時設定） */
  autoEnter: null as ZoneId | null,
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
}
