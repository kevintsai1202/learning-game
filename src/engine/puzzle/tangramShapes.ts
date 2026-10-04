/**
 * 七巧板的剪影題庫（純資料＋小工具）：每個剪影就是七塊板子擺出來的樣子，
 * 存的擺法同時是解答（提示、簡單模式的分割線都用它），所以一定拼得出來。
 * 孩子用別的擺法蓋滿剪影也算拼好（判定在 tangram.ts 的 isComplete）。
 *
 * 新增剪影：用 scripts/puzzle/tangram-design.test.ts 預覽擺法、檢查不重疊與相連，
 * 或給一個外框讓解題器找擺法（說明在那個檔案的開頭）。
 */
import { createRng } from '../../core/rng';
import type { BotLevel } from './common';
import { cellsOf, pieceType, piecePolygon, type Placed } from './tangram';

/** 一個剪影 */
export interface TangramShape {
  id: string;
  name: string;
  /** 選單與結算顯示的圖示 */
  icon: string;
  /** 建議的難度（各難度從自己這一組抽題） */
  level: BotLevel;
  /** 七塊板子的擺法（座標可以是負的，用 normalizedShape 移到左上角） */
  solution: Placed[];
}

/** 簡寫：板子、轉幾次、翻面、平移 */
const p = (piece: string, rot: number, flip: 0 | 1, dx: number, dy: number): Placed => ({ piece, pose: { rot, flip: flip === 1 }, dx, dy });

/** 12 個剪影：簡單、普通、厲害各 4 個 */
export const TANGRAM_SHAPES: TangramShape[] = [
  // ---------- 簡單：外形單純 ----------
  {
    id: 'tent',
    name: '帳篷',
    icon: '⛺',
    level: 1,
    solution: [p('big1', 1, 0, 4, 0), p('small1', 3, 0, 4, 2), p('square', 0, 0, 4, 1), p('big2', 2, 0, 4, 4), p('medium', 3, 0, 4, 4), p('small2', 2, 0, 7, 3), p('para', 0, 0, 5, 3)],
  },
  {
    id: 'gem',
    name: '寶石',
    icon: '💎',
    level: 1,
    solution: [p('big1', 1, 0, 2, 0), p('big2', 3, 0, 2, 4), p('medium', 3, 0, 0, 4), p('small1', 1, 0, 4, 2), p('square', 0, 0, 2, 3), p('para', 0, 0, 0, 4), p('small2', 0, 0, 1, 5)],
  },
  {
    id: 'heart',
    name: '愛心',
    icon: '💗',
    level: 1,
    solution: [p('big1', 1, 0, 2, 0), p('big2', 3, 0, 2, 4), p('small1', 1, 0, 4, 0), p('medium', 3, 0, 4, 2), p('para', 0, 1, 6, 2), p('square', 0, 0, 2, 3), p('small2', 0, 0, 3, 3)],
  },
  {
    id: 'boat',
    name: '帆船',
    icon: '⛵',
    level: 1,
    solution: [p('medium', 2, 0, 4, 4), p('small1', 3, 0, 4, 4), p('square', 0, 0, 4, 3), p('big1', 0, 0, 0, 4), p('big2', 2, 0, 6, 6), p('para', 0, 1, 8, 4), p('small2', 0, 0, 5, 5)],
  },
  // ---------- 普通 ----------
  {
    id: 'square',
    name: '正方形',
    icon: '🟧',
    level: 2,
    solution: [p('big1', 3, 0, 0, 4), p('big2', 0, 0, 0, 0), p('medium', 2, 0, 4, 4), p('small1', 2, 0, 2, 4), p('square', 0, 0, 1, 2), p('small2', 1, 0, 3, 1), p('para', 1, 0, 4, 0)],
  },
  {
    id: 'slide',
    name: '溜滑梯',
    icon: '🛝',
    level: 2,
    solution: [p('big1', 0, 0, 0, 0), p('big2', 1, 0, 4, 0), p('small1', 3, 0, 4, 2), p('square', 0, 0, 4, 1), p('medium', 3, 0, 4, 4), p('small2', 2, 0, 7, 3), p('para', 0, 0, 5, 3)],
  },
  {
    id: 'arrow',
    name: '箭頭',
    icon: '↗️',
    level: 2,
    solution: [p('big1', 0, 0, 4, 0), p('big2', 1, 0, 8, 0), p('medium', 2, 0, 5, 3), p('small1', 3, 0, 5, 3), p('para', 0, 1, 5, 3), p('square', 0, 0, 1, 4), p('small2', 0, 0, 2, 4)],
  },
  {
    // 屋頂、牆、煙囪與一團煙
    id: 'house',
    name: '房子',
    icon: '🏠',
    level: 2,
    solution: [p('big1', 2, 0, 4, 2), p('big2', 0, 0, 0, 2), p('medium', 3, 0, 0, 4), p('small1', 1, 0, 4, 2), p('small2', 2, 0, 4, 4), p('para', 3, 1, 3, -1), p('square', 0, 0, 3, -2)],
  },
  // ---------- 厲害：動物與人（有的地方只在一點相接） ----------
  {
    // 菱形身體、背鰭、正方形與兩片小三角形的尾巴、下鰭
    id: 'fish',
    name: '魚',
    icon: '🐟',
    level: 3,
    solution: [p('big1', 2, 0, 6, 2), p('big2', 0, 0, 2, 2), p('medium', 0, 0, 2, 0), p('square', 0, 0, 0, 1), p('small1', 3, 0, 0, 2), p('small2', 3, 1, 0, 2), p('para', 3, 1, 2, 2)],
  },
  {
    // 坐著、面向左：頭與兩隻耳朵、身體、前腳、尾巴
    id: 'cat',
    name: '貓',
    icon: '🐱',
    level: 3,
    solution: [p('big1', 1, 0, 4, 2), p('big2', 2, 0, 4, 6), p('square', 0, 0, 2, 1), p('small1', 3, 0, 2, 2), p('small2', 1, 0, 4, 0), p('medium', 0, 0, 0, 4), p('para', 3, 1, 4, 3)],
  },
  {
    // 長耳朵（平行四邊形）、短耳朵、圓尾巴
    id: 'rabbit',
    name: '兔子',
    icon: '🐰',
    level: 3,
    solution: [p('big1', 1, 0, 4, 2), p('big2', 2, 0, 4, 6), p('square', 0, 0, 2, 1), p('para', 1, 1, 4, 2), p('small1', 3, 0, 2, 2), p('small2', 3, 0, 4, 6), p('medium', 0, 0, 0, 4)],
  },
  {
    // 頭、上衣、裙子、兩隻手、兩隻腳（脖子和腰只在一點相接）
    id: 'girl',
    name: '小女孩',
    icon: '👧',
    level: 3,
    solution: [p('square', 0, 0, 1, 0), p('big1', 0, 0, 0, 2), p('big2', 2, 0, 4, 6), p('small1', 2, 0, 1, 3), p('small2', 2, 0, 5, 3), p('medium', 0, 0, 0, 6), p('para', 0, 0, 2, 6)],
  },
];

/** 某個難度的剪影 */
export function shapesForLevel(level: BotLevel): TangramShape[] {
  return TANGRAM_SHAPES.filter((s) => s.level === level);
}

/** 依種子從這個難度抽一個剪影 */
export function pickShape(seed: number, level: BotLevel): TangramShape {
  return createRng(seed ^ 0x7a9).pick(shapesForLevel(level));
}

/** 依 id 找剪影 */
export function shapeById(id: string): TangramShape | undefined {
  return TANGRAM_SHAPES.find((s) => s.id === id);
}

/** 把剪影移到左上角 (0, 0)（整數平移，格點對齊不變）：回傳移過的擺法與寬高 */
export function normalizedShape(shape: TangramShape): { solution: Placed[]; w: number; h: number } {
  const pts = shape.solution.flatMap((s) => piecePolygon(pieceType(s.piece), s.pose, s.dx, s.dy));
  const minX = Math.min(...pts.map((v) => v[0]));
  const minY = Math.min(...pts.map((v) => v[1]));
  return {
    solution: shape.solution.map((s) => ({ ...s, dx: s.dx - minX, dy: s.dy - minY })),
    w: Math.max(...pts.map((v) => v[0])) - minX,
    h: Math.max(...pts.map((v) => v[1])) - minY,
  };
}

/** 擺法蓋住的四分之一格（剪影的範圍） */
export function solutionCells(solution: Placed[], ox = 0, oy = 0): Set<string> {
  const out = new Set<string>();
  for (const s of solution) for (const c of cellsOf(pieceType(s.piece), s.pose, s.dx + ox, s.dy + oy)) out.add(c);
  return out;
}
