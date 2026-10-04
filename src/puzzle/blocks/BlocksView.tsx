/**
 * 積木堆的等角投影圖（SVG）：每一層一種顏色，頂面亮、兩個側面暗，由遠到近畫，近的蓋住遠的。
 * 公布答案時在每一疊的頂面標出這一疊有幾個，下面列出加法。
 * 不另開 3D 畫布：整個遊戲只用一個 WebGL context（GameCanvas 的原則），課本的數積木題也是這種圖。
 */
import { countBlocks } from '../../engine/puzzle/blocks';

/** 方塊邊長（SVG 單位） */
const S = 30;
/** 等角投影的水平係數（cos 30°） */
const C = S * 0.866;

/** 各層的顏色：頂面、右前面、左前面 */
const LAYER_COLORS = [
  ['#ffb3a3', '#ff6b4a', '#d44a2c'],
  ['#9fc0ff', '#2f6fde', '#1f4fa8'],
  ['#ffe7a0', '#ffc93c', '#d9a20a'],
  ['#b6f0cf', '#3fbf7f', '#2a8f5c'],
];

/** 立體座標投影到畫面 */
function project(x: number, y: number, z: number): [number, number] {
  return [(x - z) * C, (x + z) * S * 0.5 - y * S];
}

/** 一個面的頂點字串 */
const face = (pts: [number, number, number][]) =>
  pts
    .map(([x, y, z]) => project(x, y, z))
    .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
    .join(' ');

export function BlocksView({ heights, reveal }: { heights: number[][]; reveal: boolean }) {
  // 所有方塊，依 x + y + z 由遠到近排序（畫家演算法）
  const cubes: [number, number, number][] = [];
  heights.forEach((col, x) => col.forEach((h, z) => Array.from({ length: h }, (_, y) => cubes.push([x, y, z]))));
  cubes.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]) || a[1] - b[1]);
  // 畫面範圍：所有方塊的八個角
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y, z] of cubes) {
    for (const [dx, dy, dz] of [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
    ]) {
      const [px, py] = project(x + dx, y + dy, z + dz);
      xs.push(px);
      ys.push(py);
    }
  }
  const pad = 8;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad;
  const h = Math.max(...ys) - minY + pad;
  const columns = heights.flatMap((col, x) => col.map((height, z) => ({ x, z, height }))).filter((c) => c.height > 0);
  return (
    <div className="blocks-view">
      <svg viewBox={`${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`} role="img" aria-label="積木堆" data-testid="blocks-svg">
        {cubes.map(([x, y, z]) => {
          const [top, right, left] = LAYER_COLORS[y % LAYER_COLORS.length];
          return (
            <g key={`${x}-${y}-${z}`} stroke="#2b2a4c" strokeWidth={1.6} strokeLinejoin="round">
              <polygon
                points={face([
                  [x, y + 1, z],
                  [x + 1, y + 1, z],
                  [x + 1, y + 1, z + 1],
                  [x, y + 1, z + 1],
                ])}
                fill={top}
              />
              <polygon
                points={face([
                  [x + 1, y, z],
                  [x + 1, y + 1, z],
                  [x + 1, y + 1, z + 1],
                  [x + 1, y, z + 1],
                ])}
                fill={right}
              />
              <polygon
                points={face([
                  [x, y, z + 1],
                  [x + 1, y, z + 1],
                  [x + 1, y + 1, z + 1],
                  [x, y + 1, z + 1],
                ])}
                fill={left}
              />
            </g>
          );
        })}
        {reveal &&
          columns.map(({ x, z, height }) => {
            const [px, py] = project(x + 0.5, height, z + 0.5);
            return (
              <g key={`n${x}-${z}`}>
                <circle cx={px} cy={py} r={10} fill="#ffffff" stroke="#2b2a4c" strokeWidth={1.6} />
                <text x={px} y={py + 5} textAnchor="middle" fontSize={14} fontWeight={800} fill="#2b2a4c">
                  {height}
                </text>
              </g>
            );
          })}
      </svg>
      {reveal && (
        <p className="blocks-sum" data-testid="blocks-sum">
          {columns.map((c) => c.height).join(' + ')} = {countBlocks(heights)}
        </p>
      )}
    </div>
  );
}
