/**
 * 找不同的風景（SVG）：依物件清單畫出天空、海、草地與各種物件（圖案都是程式畫的，沒有授權問題）。
 * 每個物件以中心為原點、約 r 的大小畫，再依位置、大小倍率與左右翻轉擺上去。
 * 點擊位置用 svgPoint（getScreenCTM）換回風景座標，畫面怎麼縮放都對得上。
 */
import type { PointerEvent, ReactNode } from 'react';
import { SCENE_H, SCENE_W, type SceneKind, type SceneObject, type SpotDiff } from '../../engine/puzzle/spotDiff';
import { svgPoint } from '../svgPoint';

/** 外框線的顏色與粗細（卡通風格） */
const INK = '#2b2a4c';
const LINE = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: 'round' as const };

/** 各種物件的圖（以中心為原點） */
function Thing({ kind, color }: { kind: SceneKind; color: string }): ReactNode {
  switch (kind) {
    case 'sun':
      return (
        <g>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <line key={i} x1={Math.cos(a) * 16} y1={Math.sin(a) * 16} x2={Math.cos(a) * 21} y2={Math.sin(a) * 21} stroke={color} strokeWidth={3} strokeLinecap="round" />;
          })}
          <circle r={13} fill={color} {...LINE} />
        </g>
      );
    case 'cloud':
      return (
        <g fill={color} {...LINE}>
          <circle cx={-11} cy={3} r={9} />
          <circle cx={13} cy={4} r={8} />
          <circle cx={1} cy={-4} r={13} />
          <rect x={-15} y={3} width={28} height={9} rx={4} stroke="none" />
        </g>
      );
    case 'bird':
      return (
        <g {...LINE}>
          <ellipse rx={9} ry={6} fill={color} />
          <circle cx={7} cy={-4} r={4.5} fill={color} />
          <path d="M11 -5 L16 -3.5 L11 -2 Z" fill="#ffc93c" />
          <path d="M-4 -2 Q-1 -12 4 -3" fill="#ffffff" />
          <circle cx={8} cy={-5} r={1} fill={INK} stroke="none" />
        </g>
      );
    case 'balloon':
      return (
        <g {...LINE}>
          <path d="M1 7 Q4 12 0 18" fill="none" />
          <ellipse cy={-3} rx={8} ry={10} fill={color} />
          <path d="M-2 7 L2 7 L0 9.5 Z" fill={color} />
          <ellipse cx={-3} cy={-7} rx={2} ry={3} fill="#ffffff" stroke="none" opacity={0.7} />
        </g>
      );
    case 'boat':
      return (
        <g {...LINE}>
          <line x1={0} y1={4} x2={0} y2={-19} />
          <path d="M1.5 -18 L1.5 1 L15 1 Z" fill={color} />
          <path d="M-18 3 L18 3 L13 12 L-13 12 Z" fill="#a0693c" />
        </g>
      );
    case 'fish':
      return (
        <g {...LINE}>
          <path d="M-8 0 L-16 -6 L-16 6 Z" fill={color} />
          <ellipse rx={10} ry={6} fill={color} />
          <circle cx={5} cy={-1.5} r={1.3} fill={INK} stroke="none" />
        </g>
      );
    case 'house':
      return (
        <g {...LINE}>
          <rect x={9} y={-25} width={5} height={10} fill="#a0693c" />
          <rect x={-18} y={-8} width={36} height={28} fill="#fff4d6" />
          <path d="M-22 -8 L0 -26 L22 -8 Z" fill={color} />
          <rect x={4} y={4} width={9} height={16} fill="#8a5a32" />
          <rect x={-13} y={-2} width={10} height={10} fill="#bfe7ff" />
        </g>
      );
    case 'tree':
      return (
        <g {...LINE}>
          <rect x={-3} y={5} width={6} height={15} fill="#8a5a32" />
          <circle cx={-8} cy={1} r={8} fill={color} />
          <circle cx={8} cy={1} r={8} fill={color} />
          <circle cy={-7} r={12} fill={color} />
        </g>
      );
    case 'pine':
      return (
        <g {...LINE}>
          <rect x={-2.5} y={9} width={5} height={9} fill="#8a5a32" />
          <path d="M-14 10 L0 -7 L14 10 Z" fill={color} />
          <path d="M-10 -1 L0 -19 L10 -1 Z" fill={color} />
        </g>
      );
    case 'flower':
      return (
        <g {...LINE}>
          <line x1={0} y1={2} x2={0} y2={12} stroke="#2f8f5b" strokeWidth={2} />
          {Array.from({ length: 5 }, (_, i) => {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            return <circle key={i} cx={Math.cos(a) * 4.5} cy={-3 + Math.sin(a) * 4.5} r={3.6} fill={color} />;
          })}
          <circle cy={-3} r={2.6} fill={color === '#ffc93c' ? '#ffffff' : '#ffc93c'} />
        </g>
      );
    case 'mushroom':
      return (
        <g {...LINE}>
          <rect x={-3.5} y={-1} width={7} height={10} rx={2} fill="#fff4d6" />
          <path d="M-11 0 A11 10 0 0 1 11 0 Z" fill={color} />
          <circle cx={-4} cy={-5} r={1.8} fill="#ffffff" stroke="none" />
          <circle cx={4} cy={-3} r={1.5} fill="#ffffff" stroke="none" />
        </g>
      );
    case 'butterfly':
      return (
        <g {...LINE}>
          <ellipse cx={-6} cy={-4} rx={6} ry={5} fill={color} />
          <ellipse cx={6} cy={-4} rx={6} ry={5} fill={color} />
          <ellipse cx={-5} cy={4} rx={4} ry={3.5} fill={color} />
          <ellipse cx={5} cy={4} rx={4} ry={3.5} fill={color} />
          <ellipse rx={1.6} ry={7} fill={INK} />
          <path d="M0 -6 L-3 -11 M0 -6 L3 -11" fill="none" />
        </g>
      );
    case 'rock':
      return <path d="M-12 7 L-9 -3 L-2 -8 L8 -5 L12 7 Z" fill={color} {...LINE} />;
  }
}

/** 天空、海與草地 */
function Background() {
  return (
    <g>
      <defs>
        <linearGradient id="spot-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fd3ff" />
          <stop offset="1" stopColor="#d8f3ff" />
        </linearGradient>
      </defs>
      <rect width={SCENE_W} height={SCENE_H} fill="url(#spot-sky)" />
      <rect y={118} width={SCENE_W} height={48} fill="#4fb6e8" />
      <path d={`M0 128 ${Array.from({ length: 21 }, (_, i) => `Q${i * 20 + 10} ${i % 2 ? 124 : 132} ${(i + 1) * 20} 128`).join(' ')}`} fill="none" stroke="#bfe9ff" strokeWidth={2} />
      <path d={`M0 166 Q100 156 200 166 T400 166 L400 ${SCENE_H} L0 ${SCENE_H} Z`} fill="#8fd16a" />
      <path d={`M0 172 Q100 162 200 172 T400 172`} fill="none" stroke="#f3dfa6" strokeWidth={6} />
    </g>
  );
}

/** 一張風景：物件、找到的圈圈（孩子綠色、機器人或朋友紫色，旁邊標 botIcon）、點錯的叉叉 */
export function SceneView({
  objects,
  diffs,
  found,
  misses,
  onTap,
  testId,
  label,
  botIcon = '🤖',
}: {
  objects: SceneObject[];
  diffs: SpotDiff[];
  found: ('kid' | 'bot' | null)[];
  misses: { x: number; y: number; id: number }[];
  onTap: (x: number, y: number) => void;
  testId: string;
  label: string;
  /** 對手找到的圈圈旁邊的圖示（機器人 🤖、朋友 👫） */
  botIcon?: string;
}) {
  const tap = (e: PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    onTap(p.x, p.y);
  };
  return (
    <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="spot-scene" onPointerDown={tap} data-testid={testId} role="img" aria-label={label}>
      <Background />
      {objects.map((o) => (
        <g key={o.id} transform={`translate(${o.x} ${o.y}) scale(${o.flip ? -o.s : o.s} ${o.s})`}>
          <Thing kind={o.kind} color={o.color} />
        </g>
      ))}
      {diffs.map((d, i) =>
        found[i] ? (
          <g key={`f${i}`} className="spot-found">
            <circle cx={d.x} cy={d.y} r={d.r} fill="none" stroke={found[i] === 'kid' ? '#16a34a' : '#7c3aed'} strokeWidth={4} />
            {found[i] === 'bot' && (
              <text x={d.x + d.r * 0.7} y={d.y - d.r * 0.7} fontSize={14} textAnchor="middle">
                {botIcon}
              </text>
            )}
          </g>
        ) : null,
      )}
      {misses.map((m) => (
        <text key={m.id} x={m.x} y={m.y + 8} fontSize={26} textAnchor="middle" fill="#e11d48" className="spot-miss">
          ✗
        </text>
      ))}
    </svg>
  );
}
