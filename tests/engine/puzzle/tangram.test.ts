/**
 * 七巧板的規則（純函式）：板子的形狀與姿勢、四分之一格、放置判定、剪影題庫、星數、機器人。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/core/rng';
import {
  TANGRAM_PIECES,
  botPieceDelay,
  cellsOf,
  isComplete,
  outlineCells,
  pieceType,
  piecePolygon,
  placeAt,
  polygonArea,
  polygonCentroid,
  tangramStars,
  type Placed,
  type Pt,
} from '../../../src/engine/puzzle/tangram';
import { TANGRAM_SHAPES, normalizedShape, pickShape, shapesForLevel, solutionCells } from '../../../src/engine/puzzle/tangramShapes';

const SQUARE_OUTLINE: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];

describe('七巧板：板子', () => {
  it('七塊：兩個大三角形、一個中三角形、兩個小三角形、一個正方形、一個平行四邊形；面積合計 16', () => {
    expect(TANGRAM_PIECES.map((p) => p.type).sort()).toEqual(['big', 'big', 'medium', 'para', 'small', 'small', 'square']);
    const total = TANGRAM_PIECES.reduce((s, p) => s + polygonArea(piecePolygon(p.type, { rot: 0, flip: false }, 0, 0)), 0);
    expect(total).toBe(16);
  });

  it('每塊板子由四分之一格組成（面積 × 4 格）；旋轉、翻面、平移都不改變格數', () => {
    for (const p of TANGRAM_PIECES) {
      const area = polygonArea(piecePolygon(p.type, { rot: 0, flip: false }, 0, 0));
      for (let rot = 0; rot < 4; rot++) {
        for (const flip of [false, true]) expect(cellsOf(p.type, { rot, flip }, 3, -2).size).toBe(area * 4);
      }
    }
  });

  it('平行四邊形翻面後和轉幾次都不一樣（要用「翻面」才拼得出鏡像）；正方形怎麼轉都一樣', () => {
    const key = (s: Set<string>) => [...s].sort().join('|');
    const flipped = key(cellsOf('para', { rot: 0, flip: true }, 0, 0));
    for (let rot = 0; rot < 4; rot++) {
      // 平移到同一個角落再比
      const turned = cellsOf('para', { rot, flip: false }, 0, 0);
      expect(normalize(turned)).not.toBe(normalize(new Set(flipped.split('|'))));
    }
    expect(normalize(cellsOf('square', { rot: 1, flip: false }, 0, 0))).toBe(normalize(cellsOf('square', { rot: 0, flip: false }, 0, 0)));
  });
});

/** 把格子集合平移到左上角，方便比較形狀 */
function normalize(cells: Set<string>): string {
  const list = [...cells].map((c) => c.split(',')).map(([i, j, q]) => [Number(i), Number(j), q] as const);
  const mi = Math.min(...list.map((c) => c[0]));
  const mj = Math.min(...list.map((c) => c[1]));
  return list
    .map(([i, j, q]) => `${i - mi},${j - mj},${q}`)
    .sort()
    .join('|');
}

describe('七巧板：放置與完成', () => {
  const target = outlineCells(SQUARE_OUTLINE);

  it('正方形剪影是 64 個四分之一格', () => {
    expect(target.size).toBe(64);
  });

  it('放在剪影裡、而且不和別的板子重疊才算放好；超出剪影或重疊都不行', () => {
    const placed: Placed[] = [];
    expect(placeAt(target, placed, 'big1', { rot: 0, flip: false }, 0, 0)).toBe(true);
    placed.push({ piece: 'big1', pose: { rot: 0, flip: false }, dx: 0, dy: 0 });
    expect(placeAt(target, placed, 'big2', { rot: 0, flip: false }, 0, 0)).toBe(false);
    expect(placeAt(target, placed, 'big2', { rot: 0, flip: false }, 3, 0)).toBe(false);
  });

  it('七塊剛好蓋滿才算拼好；換一種擺法蓋滿也算', () => {
    const square = TANGRAM_SHAPES.find((s) => s.id === 'square')!.solution;
    expect(isComplete(target, square)).toBe(true);
    expect(isComplete(target, square.slice(0, 6))).toBe(false);
    // 兩個大三角形互換、兩個小三角形互換：一樣蓋滿
    const swapped = square.map((s) => ({ ...s, piece: ({ big1: 'big2', big2: 'big1', small1: 'small2', small2: 'small1' } as Record<string, string>)[s.piece] ?? s.piece }));
    expect(isComplete(target, swapped)).toBe(true);
  });

  it('重心：轉動與翻面時板子留在原地用', () => {
    expect(polygonCentroid(piecePolygon('square', { rot: 0, flip: false }, 3, 5))).toEqual([4, 6]);
    expect(polygonCentroid(piecePolygon('big', { rot: 0, flip: false }, 0, 0))).toEqual([2, 2 / 3]);
  });
});

/** 兩塊板子有沒有碰在一起（共用一段邊或一個點）：任一頂點落在另一塊的邊上 */
function touches(a: Pt[], b: Pt[]): boolean {
  const onEdge = ([x, y]: Pt, [x1, y1]: Pt, [x2, y2]: Pt) =>
    (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) === 0 && Math.min(x1, x2) <= x && x <= Math.max(x1, x2) && Math.min(y1, y2) <= y && y <= Math.max(y1, y2);
  const hit = (p: Pt[], q: Pt[]) => p.some((v) => q.some((_, i) => onEdge(v, q[i], q[(i + 1) % q.length])));
  return hit(a, b) || hit(b, a);
}

describe('七巧板：剪影題庫', () => {
  it('至少 12 個剪影，名稱與 id 不重複，三種難度都有', () => {
    expect(TANGRAM_SHAPES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(TANGRAM_SHAPES.map((s) => s.id)).size).toBe(TANGRAM_SHAPES.length);
    expect(new Set(TANGRAM_SHAPES.map((s) => s.name)).size).toBe(TANGRAM_SHAPES.length);
    for (const level of [1, 2, 3] as const) expect(shapesForLevel(level).length).toBeGreaterThanOrEqual(3);
  });

  it('每個剪影：七塊各用一次、不重疊（剛好 64 格），而且七塊連在一起（共用邊或在一點相接）', () => {
    for (const shape of TANGRAM_SHAPES) {
      expect(shape.solution.map((s) => s.piece).sort(), shape.name).toEqual(TANGRAM_PIECES.map((p) => p.id).sort());
      expect(solutionCells(shape.solution).size, shape.name).toBe(64);
      const polys = shape.solution.map((s) => piecePolygon(pieceType(s.piece), s.pose, s.dx, s.dy));
      const reached = new Set([0]);
      const queue = [0];
      while (queue.length) {
        const i = queue.pop()!;
        polys.forEach((poly, j) => {
          if (!reached.has(j) && touches(polys[i], poly)) {
            reached.add(j);
            queue.push(j);
          }
        });
      }
      expect(reached.size, `${shape.name} 連在一起`).toBe(7);
    }
  });

  it('移到左上角之後座標從 0 開始，格點對齊不變；畫面放得下（不超過 8×8）', () => {
    for (const shape of TANGRAM_SHAPES) {
      const n = normalizedShape(shape);
      const pts = n.solution.flatMap((s) => piecePolygon(pieceType(s.piece), s.pose, s.dx, s.dy));
      expect(Math.min(...pts.map((v) => v[0])), shape.name).toBe(0);
      expect(Math.min(...pts.map((v) => v[1])), shape.name).toBe(0);
      expect(n.w, shape.name).toBeLessThanOrEqual(8);
      expect(n.h, shape.name).toBeLessThanOrEqual(8);
      expect(solutionCells(n.solution).size).toBe(64);
    }
  });

  it('同一個種子抽同一個剪影；抽到的是這個難度的', () => {
    for (const level of [1, 2, 3] as const) {
      expect(pickShape(77, level)).toBe(pickShape(77, level));
      for (let seed = 0; seed < 20; seed++) expect(pickShape(seed, level).level).toBe(level);
    }
  });
});

describe('七巧板：星數與機器人', () => {
  it('沒用提示 3 星、用一次 2 星、兩次以上 1 星', () => {
    expect(tangramStars(0)).toBe(3);
    expect(tangramStars(1)).toBe(2);
    expect(tangramStars(2)).toBe(1);
  });

  it('機器人每隔幾秒放好一塊，越厲害越快', () => {
    const avg = (level: 1 | 2 | 3) => {
      const rng = createRng(4);
      let sum = 0;
      for (let i = 0; i < 300; i++) sum += botPieceDelay(level, rng);
      return sum / 300;
    };
    expect(avg(3)).toBeLessThan(avg(2));
    expect(avg(2)).toBeLessThan(avg(1));
    expect(avg(3)).toBeGreaterThan(3000);
  });
});
