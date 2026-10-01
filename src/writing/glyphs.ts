/**
 * 注音符號與英文字母的筆順字形：以手繪中心線（1024 座標）描述每一筆，
 * 再用圓頭粗線偏移產生外框，交給 Hanzi Writer 顯示與判定。
 * 中心線資料在 zhuyinStrokes.ts 與 latinStrokes.ts（依教育部注音符號筆順與四線格書寫規範繪製）。
 */
import type { StrokeData } from './strokeData';

/**
 * Hanzi Writer 的字框：x 0～1024、y −124～900（y 向上）。
 * 手繪中心線都用這個座標系。
 */
export const CHAR_BOX = { left: 0, right: 1024, bottom: -124, top: 900 };

/**
 * 英文四線格的四條線（字框座標）：第 1 線 760、第 2 線 500（虛線）、第 3 線 240（基準線、紅色）、第 4 線 −20。
 * 大寫字母占第 1～3 線；小寫 x 高度在第 2～3 線之間，上伸部到第 1 線、下伸部到第 4 線。
 */
export const LATIN_LINES = { top: 760, mid: 500, base: 240, bottom: -20 };

/** 田字格中線（字框中心） */
export const GRID_CENTER = { x: 512, y: 388 };

/** 字框座標 → 寫字板像素座標（與 Hanzi Writer 的 Positioner 相同算法） */
export function charToPixel(x: number, y: number, size: number, padding: number): { px: number; py: number } {
  const scale = (size - 2 * padding) / 1024;
  return { px: padding + x * scale, py: size - padding - (y - CHAR_BOX.bottom) * scale };
}

/** 中心線：一筆是一串點（x 向右、y 向上，座標系見 CHAR_BOX） */
export type Centerline = [number, number][];

/** 中心線字形表：字元 → 每一筆的中心線 */
export type GlyphTable = Record<string, Centerline[]>;

/** 各書寫系統的字形表（由各自模組註冊） */
const tables: Partial<Record<'zhuyin' | 'latin', GlyphTable>> = {};

/** 註冊字形表 */
export function registerGlyphs(script: 'zhuyin' | 'latin', table: GlyphTable): void {
  tables[script] = { ...(tables[script] ?? {}), ...table };
}

/** 沿中心線每段等距補點，讓偏移外框平滑 */
export function resample(line: Centerline, spacing = 24): Centerline {
  const out: Centerline = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / spacing));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/**
 * 把中心線偏移成封閉外框（左側往前、繞過尾端半圓、右側往回、繞過起點半圓）。
 * width 為筆畫粗細（1024 單位）。
 */
export function outlineFromCenterline(line: Centerline, width = 90): string {
  const pts = resample(line);
  const r = width / 2;
  if (pts.length < 2) {
    const [x, y] = pts[0];
    return `M ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y} Z`;
  }
  /** 每一點的法向量（相鄰兩段方向的平均） */
  const normals = pts.map((_, i) => {
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len] as [number, number];
  });
  const left = pts.map(([x, y], i) => [x + normals[i][0] * r, y + normals[i][1] * r]);
  const right = pts.map(([x, y], i) => [x - normals[i][0] * r, y - normals[i][1] * r]).reverse();
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M ${f(left[0][0])} ${f(left[0][1])}`;
  for (const [x, y] of left.slice(1)) d += ` L ${f(x)} ${f(y)}`;
  // 尾端半圓
  d += ` A ${r} ${r} 0 0 0 ${f(right[0][0])} ${f(right[0][1])}`;
  for (const [x, y] of right.slice(1)) d += ` L ${f(x)} ${f(y)}`;
  // 起點半圓
  d += ` A ${r} ${r} 0 0 0 ${f(left[0][0])} ${f(left[0][1])} Z`;
  return d;
}

/** 取得字形資料（沒有時回傳 null） */
export function glyphData(script: 'zhuyin' | 'latin', ch: string): StrokeData | null {
  const lines = tables[script]?.[ch];
  if (!lines) return null;
  const width = script === 'latin' ? 70 : 84;
  return { strokes: lines.map((l) => outlineFromCenterline(l, width)), medians: lines.map((l) => resample(l, 40).map(([x, y]) => [Math.round(x), Math.round(y)])) };
}

/** 某個書寫系統有哪些字 */
export function glyphChars(script: 'zhuyin' | 'latin'): string[] {
  return Object.keys(tables[script] ?? {});
}
