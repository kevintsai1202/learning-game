/**
 * 七巧板剪影的設計工具（不是單元測試，不放進 npm test）：
 * 1. 印出題庫（src/engine/puzzle/tangramShapes.ts）每個剪影的文字預覽，確認不重疊、七塊連在一起。
 * 2. 試新的外框：在下面的 TRY_OUTLINES 填外框頂點（整數座標、y 往下，邊只能是水平、垂直或 45 度斜線，面積要是 16），
 *    解題器會找出一組擺法，印成可以貼進題庫的 p(...) 格式。拼不出來的外框會印「拼不出來」。
 * 3. 試新的擺法：在 TRY_PLACEMENTS 填擺法，印出預覽與檢查結果。
 *
 * 用法（PowerShell 7，專案根目錄；--silent=false 才會印出預覽）：npx vitest run --config vitest.puzzle.config.ts --silent=false
 *
 * 文字預覽：每個字母是一塊板子（A、B 大三角形，M 中三角形，s、t 小三角形，Q 正方形，P 平行四邊形），一格寬 4 個字、高 2 行。
 */
import { test } from 'vitest';
import { TANGRAM_PIECES, cellsOf, outlineCells, pieceType, piecePolygon, polygonArea, type PieceType, type Placed, type Pose, type Pt } from '../../src/engine/puzzle/tangram';
import { TANGRAM_SHAPES } from '../../src/engine/puzzle/tangramShapes';

/** 要試的外框（名稱 → 頂點） */
const TRY_OUTLINES: Record<string, Pt[]> = {
  // 例：帳篷
  tent: [
    [0, 4],
    [4, 0],
    [8, 4],
  ],
};

/** 要試的擺法（名稱 → [板子, 轉幾次, 翻面, dx, dy]） */
const TRY_PLACEMENTS: Record<string, [string, number, 0 | 1, number, number][]> = {};

const LETTER: Record<string, string> = { big1: 'A', big2: 'B', medium: 'M', small1: 's', small2: 't', square: 'Q', para: 'P' };

/** 點是否在多邊形裡（射線法） */
function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** 印出擺法的文字預覽與檢查結果（格數、重疊、四分之一格是否相連） */
function preview(name: string, placed: Placed[]): void {
  const all = new Map<string, string>();
  let overlap = 0;
  for (const p of placed) {
    for (const c of cellsOf(pieceType(p.piece), p.pose, p.dx, p.dy)) {
      if (all.has(c)) overlap++;
      all.set(c, p.piece);
    }
  }
  const polys = placed.map((p) => ({ l: LETTER[p.piece], poly: piecePolygon(pieceType(p.piece), p.pose, p.dx, p.dy) }));
  const xs = polys.flatMap((p) => p.poly.map((v) => v[0]));
  const ys = polys.flatMap((p) => p.poly.map((v) => v[1]));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const rows: string[] = [];
  for (let y = y0 + 0.25; y < y1; y += 0.5) {
    let r = '';
    for (let x = x0 + 0.125; x < x1; x += 0.25) r += polys.find((p) => inside(p.poly, x, y))?.l ?? '.';
    rows.push(r);
  }
  console.log(`== ${name}：格數 ${all.size}（要 64）、重疊 ${overlap}、範圍 ${x1 - x0}×${y1 - y0}\n${rows.join('\n')}`);
}

// ---------- 解題器（精確覆蓋、回溯） ----------

/** 每種板子的所有不同姿勢（轉了或翻了形狀一樣的只留一個），格子以 (0, 0) 為基準 */
function orientations(type: PieceType): { pose: Pose; cells: [number, number, string][] }[] {
  const seen = new Set<string>();
  const out: { pose: Pose; cells: [number, number, string][] }[] = [];
  for (const flip of [false, true]) {
    for (let rot = 0; rot < 4; rot++) {
      const cells = [...cellsOf(type, { rot, flip }, 0, 0)].map((c) => {
        const [i, j, q] = c.split(',');
        return [Number(i), Number(j), q] as [number, number, string];
      });
      const mi = Math.min(...cells.map((c) => c[0]));
      const mj = Math.min(...cells.map((c) => c[1]));
      const key = cells
        .map(([i, j, q]) => `${i - mi},${j - mj},${q}`)
        .sort()
        .join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ pose: { rot, flip }, cells });
    }
  }
  return out;
}

/** 找一組七塊剛好蓋滿 target 的擺法；拼不出來回傳 null。每一步填第一個還沒蓋的格子 */
function solve(target: Set<string>): Placed[] | null {
  if (target.size !== 64) return null;
  const qOrder: Record<string, number> = { T: 0, L: 1, R: 2, B: 3 };
  const order = [...target].sort((a, b) => {
    const [ai, aj, aq] = a.split(',');
    const [bi, bj, bq] = b.split(',');
    return Number(aj) - Number(bj) || Number(ai) - Number(bi) || qOrder[aq] - qOrder[bq];
  });
  const orient = Object.fromEntries((['big', 'medium', 'small', 'square', 'para'] as PieceType[]).map((t) => [t, orientations(t)]));
  const used = new Set<string>();
  const result: Placed[] = [];
  const left = TANGRAM_PIECES.map((p) => p.id);
  const search = (): boolean => {
    const first = order.find((c) => !used.has(c));
    if (!first) return true;
    const [fi, fj, fq] = first.split(',');
    const tried = new Set<PieceType>();
    for (let k = 0; k < left.length; k++) {
      const id = left[k];
      const type = pieceType(id);
      if (tried.has(type)) continue;
      tried.add(type);
      for (const o of orient[type]) {
        for (const [ci, cj, cq] of o.cells) {
          if (cq !== fq) continue;
          const dx = Number(fi) - ci;
          const dy = Number(fj) - cj;
          const cells = o.cells.map(([i, j, q]) => `${i + dx},${j + dy},${q}`);
          if (cells.some((c) => !target.has(c) || used.has(c))) continue;
          cells.forEach((c) => used.add(c));
          left.splice(k, 1);
          result.push({ piece: id, pose: o.pose, dx, dy });
          if (search()) return true;
          result.pop();
          left.splice(k, 0, id);
          cells.forEach((c) => used.delete(c));
        }
      }
    }
    return false;
  };
  return search() ? result : null;
}

const asCode = (placed: Placed[]) => placed.map((s) => `p('${s.piece}', ${s.pose.rot}, ${s.pose.flip ? 1 : 0}, ${s.dx}, ${s.dy})`).join(', ');

test('七巧板剪影設計工具', () => {
  for (const shape of TANGRAM_SHAPES) preview(`${shape.icon} ${shape.name}（難度 ${shape.level}）`, shape.solution);
  for (const [name, outline] of Object.entries(TRY_OUTLINES)) {
    const started = Date.now();
    const solution = solve(outlineCells(outline));
    console.log(`\n外框「${name}」：面積 ${polygonArea(outline)}，${solution ? `拼得出來（${Date.now() - started} 毫秒）\n${asCode(solution)}` : '拼不出來'}`);
    if (solution) preview(name, solution);
  }
  for (const [name, specs] of Object.entries(TRY_PLACEMENTS)) preview(name, specs.map(([piece, rot, flip, dx, dy]) => ({ piece, pose: { rot, flip: flip === 1 }, dx, dy })));
});
