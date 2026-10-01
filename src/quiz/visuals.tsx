/**
 * 題目附圖：依 Visual.kind 畫出對應的 SVG（時鐘、直式、錢幣、尺、分數、圖形、統計圖、月曆）。
 * 全部用 SVG 畫，縮放清楚、不需要圖檔。
 */
import type { ShapeId, Visual } from '../core/types';
import { ZhuyinText, isBopomofoOnly } from '../ui/KidText';

/** 依 kind 分派 */
export function VisualView({ v }: { v: Visual }) {
  switch (v.kind) {
    case 'emoji':
      return <EmojiGroups emoji={v.emoji} count={v.count} groups={v.groups} />;
    case 'clock':
      return <ClockFace hour={v.hour} minute={v.minute} size={220} />;
    case 'vertical':
      return <VerticalMath a={v.a} b={v.b} op={v.op} />;
    case 'money':
      return <MoneyRow items={v.items} />;
    case 'ruler':
      return <Ruler start={v.start} end={v.end} item={v.item} />;
    case 'fraction':
      return <FractionShape parts={v.parts} shaded={v.shaded} shape={v.shape} />;
    case 'shape':
      return <ShapeIcon shape={v.shape} size={170} />;
    case 'bigtext':
      return isBopomofoOnly(v.text) ? (
        <div className="bigtext bpmf-big">
          <ZhuyinText text={v.text} />
        </div>
      ) : (
        <div className={`bigtext ${/^[A-Za-z]/.test(v.text) ? 'latin' : ''}`}>{v.text}</div>
      );
    case 'chart':
      return <PictureChart rows={v.rows} />;
    case 'calendar':
      return <Calendar year={v.year} month={v.month} highlight={v.highlight} />;
    case 'passage':
      return (
        <div className="passage">
          {v.title && <div className="passage-title">{v.title}</div>}
          {v.text.split(/\n/).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      );
    case 'bins':
      return (
        <div className="bigtext" style={{ fontFamily: 'var(--font-kid)', fontSize: 64, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{v.item}</span>
          <span style={{ fontSize: 30 }}>{v.name}</span>
        </div>
      );
  }
}

/** 一組一組的 emoji（乘法：每盤 count 個、共 groups 盤） */
export function EmojiGroups({ emoji, count, groups }: { emoji: string; count: number; groups?: number }) {
  const g = groups ?? 1;
  return (
    <div className="visual" style={{ gap: 10, flexWrap: 'wrap' }}>
      {Array.from({ length: g }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            maxWidth: groups ? 150 : 420,
            justifyContent: 'center',
            padding: groups ? '8px 10px' : 0,
            borderRadius: 999,
            border: groups ? '3px solid #2b2a4c' : 'none',
            background: groups ? '#fff6df' : 'transparent',
            fontSize: count > 20 ? 26 : 34,
            lineHeight: 1.15,
          }}
        >
          {Array.from({ length: count }, (_, j) => (
            <span key={j}>{emoji}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 指針角度（度，0 = 12 點方向，順時針） */
export function handAngles(hour: number, minute: number): { hour: number; minute: number } {
  return { hour: ((hour % 12) + minute / 60) * 30, minute: minute * 6 };
}

/** 時鐘鐘面（children 可放額外的 SVG，例如可拖曳的指針） */
export function ClockFace({ hour, minute, size = 220, children }: { hour: number; minute: number; size?: number; children?: React.ReactNode }) {
  const a = handAngles(hour, minute);
  return (
    <svg viewBox="-110 -110 220 220" width={size} height={size} role="img" aria-label="時鐘">
      <circle r="104" fill="#fff" stroke="#2b2a4c" strokeWidth="6" />
      <circle r="96" fill="#fff6df" />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        const ang = (i * 6 * Math.PI) / 180;
        const r1 = big ? 80 : 86;
        return (
          <line
            key={i}
            x1={Math.sin(ang) * r1}
            y1={-Math.cos(ang) * r1}
            x2={Math.sin(ang) * 93}
            y2={-Math.cos(ang) * 93}
            stroke="#2b2a4c"
            strokeWidth={big ? 3.5 : 1.5}
            strokeLinecap="round"
          />
        );
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const ang = (n * 30 * Math.PI) / 180;
        return (
          <text key={n} x={Math.sin(ang) * 66} y={-Math.cos(ang) * 66 + 8} textAnchor="middle" fontSize="22" fontWeight="800" fill="#2b2a4c" fontFamily="'Microsoft JhengHei', sans-serif">
            {n}
          </text>
        );
      })}
      {children ?? (
        <>
          <line x1="0" y1="0" x2="0" y2="-46" stroke="#2b2a4c" strokeWidth="9" strokeLinecap="round" transform={`rotate(${a.hour})`} />
          <line x1="0" y1="0" x2="0" y2="-76" stroke="#ff6b4a" strokeWidth="6" strokeLinecap="round" transform={`rotate(${a.minute})`} />
        </>
      )}
      <circle r="7" fill="#2b2a4c" />
    </svg>
  );
}

/** 直式算式：數字依位值對齊 */
export function VerticalMath({ a, b, op }: { a: number; b: number; op: '+' | '-' | '×' }) {
  const width = Math.max(String(a).length, String(b).length);
  const cell = 46;
  const w = (width + 1) * cell + 20;
  const digits = (n: number) => String(n).padStart(width, ' ').split('');
  const opText = op === '-' ? '−' : op;
  return (
    <svg viewBox={`0 0 ${w} ${cell * 3 + 10}`} width={w} role="img" aria-label={`${a} ${opText} ${b} 的直式`}>
      <rect x="2" y="2" width={w - 4} height={cell * 3 + 6} rx="16" fill="#fff" stroke="#2b2a4c" strokeWidth="3" />
      {digits(a).map((d, i) => (
        <text key={`a${i}`} x={(i + 1) * cell + cell / 2 + 6} y={cell + 8} textAnchor="middle" fontSize="40" fontWeight="800" fill="#2b2a4c" fontFamily="'Microsoft JhengHei', sans-serif">
          {d}
        </text>
      ))}
      <text x={cell / 2 + 8} y={cell * 2 + 4} textAnchor="middle" fontSize="40" fontWeight="800" fill="#ff6b4a" fontFamily="'Microsoft JhengHei', sans-serif">
        {opText}
      </text>
      {digits(b).map((d, i) => (
        <text key={`b${i}`} x={(i + 1) * cell + cell / 2 + 6} y={cell * 2 + 4} textAnchor="middle" fontSize="40" fontWeight="800" fill="#2b2a4c" fontFamily="'Microsoft JhengHei', sans-serif">
          {d}
        </text>
      ))}
      <line x1="12" y1={cell * 2 + 18} x2={w - 12} y2={cell * 2 + 18} stroke="#2b2a4c" strokeWidth="4" strokeLinecap="round" />
      <text x={w / 2} y={cell * 3 - 2} textAnchor="middle" fontSize="28" fill="#c8c2b4" fontFamily="'Microsoft JhengHei', sans-serif">
        ？
      </text>
    </svg>
  );
}

/** 錢幣與鈔票的外觀（簡化示意圖，不是真實鈔券圖樣） */
const MONEY_STYLE: Record<number, { fill: string; text: string; bill?: boolean }> = {
  1: { fill: '#d9905a', text: '#3d2412' },
  5: { fill: '#d6d9df', text: '#2b2a4c' },
  10: { fill: '#c9cdd6', text: '#2b2a4c' },
  50: { fill: '#f2c94c', text: '#3d2c05' },
  100: { fill: '#ff8f8f', text: '#5a0f0f', bill: true },
  500: { fill: '#c49a6c', text: '#3d2412', bill: true },
  1000: { fill: '#8fb4ff', text: '#0f2a5a', bill: true },
};

/** 一個錢幣或一張鈔票 */
export function MoneyPiece({ value, scale = 1 }: { value: number; scale?: number }) {
  const s = MONEY_STYLE[value] ?? { fill: '#eee', text: '#333' };
  if (s.bill) {
    return (
      <svg viewBox="0 0 120 64" width={120 * scale} height={64 * scale} role="img" aria-label={`${value} 元鈔票`}>
        <rect x="2" y="2" width="116" height="60" rx="8" fill={s.fill} stroke="#2b2a4c" strokeWidth="3" />
        <rect x="9" y="9" width="102" height="46" rx="5" fill="none" stroke={s.text} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
        <text x="60" y="42" textAnchor="middle" fontSize="26" fontWeight="900" fill={s.text} fontFamily="'Microsoft JhengHei', sans-serif">
          {value}
        </text>
        <text x="100" y="22" textAnchor="middle" fontSize="12" fontWeight="700" fill={s.text} fontFamily="'Microsoft JhengHei', sans-serif">
          元
        </text>
      </svg>
    );
  }
  const r = value >= 50 ? 30 : value >= 10 ? 28 : value === 5 ? 25 : 22;
  return (
    <svg viewBox="-34 -34 68 68" width={68 * scale * (r / 30)} height={68 * scale * (r / 30)} role="img" aria-label={`${value} 元硬幣`}>
      <circle r={r} fill={s.fill} stroke="#2b2a4c" strokeWidth="3" />
      <circle r={r - 6} fill="none" stroke={s.text} strokeWidth="1.5" opacity="0.45" />
      <text y={value >= 10 ? 8 : 9} textAnchor="middle" fontSize={value >= 10 ? 22 : 24} fontWeight="900" fill={s.text} fontFamily="'Microsoft JhengHei', sans-serif">
        {value}
      </text>
    </svg>
  );
}

/** 一排錢 */
export function MoneyRow({ items }: { items: number[] }) {
  return (
    <div className="visual" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center', maxWidth: 560 }}>
      {items.map((v, i) => (
        <MoneyPiece key={i} value={v} />
      ))}
    </div>
  );
}

/** 尺：物品從 start 量到 end（公分） */
export function Ruler({ start, end, item }: { start: number; end: number; item: string }) {
  const max = Math.max(15, Math.ceil(end + 1));
  const unit = 34;
  const w = max * unit + 40;
  return (
    <svg viewBox={`0 0 ${w} 150`} width={Math.min(w, 600)} role="img" aria-label="尺">
      {/* 物品：彩色長條，emoji 放在中間 */}
      <rect x={20 + start * unit} y={22} width={(end - start) * unit} height={36} rx={14} fill="#ffd166" stroke="#2b2a4c" strokeWidth="3" />
      <text x={20 + ((start + end) / 2) * unit} y={50} textAnchor="middle" fontSize="28">
        {item}
      </text>
      <line x1={20 + start * unit} y1={58} x2={20 + start * unit} y2={78} stroke="#ff6b4a" strokeWidth="2.5" strokeDasharray="4 3" />
      <line x1={20 + end * unit} y1={58} x2={20 + end * unit} y2={78} stroke="#ff6b4a" strokeWidth="2.5" strokeDasharray="4 3" />
      <rect x={8} y={78} width={w - 16} height={64} rx={8} fill="#fff6df" stroke="#2b2a4c" strokeWidth="3" />
      {Array.from({ length: max * 10 + 1 }, (_, i) => {
        const x = 20 + (i / 10) * unit;
        const h = i % 10 === 0 ? 24 : i % 5 === 0 ? 16 : 9;
        return <line key={i} x1={x} y1={80} x2={x} y2={80 + h} stroke="#2b2a4c" strokeWidth={i % 10 === 0 ? 2.5 : 1} />;
      })}
      {Array.from({ length: max + 1 }, (_, i) => (
        <text key={i} x={20 + i * unit} y={128} textAnchor="middle" fontSize="18" fontWeight="700" fill="#2b2a4c" fontFamily="'Microsoft JhengHei', sans-serif">
          {i}
        </text>
      ))}
    </svg>
  );
}

/** 單位分數圖：披薩（圓形平分）或長條 */
export function FractionShape({ parts, shaded, shape }: { parts: number; shaded: number; shape: 'pizza' | 'bar' }) {
  if (shape === 'bar') {
    const w = 360;
    const seg = w / parts;
    return (
      <svg viewBox={`0 0 ${w + 8} 90`} width={w + 8} role="img" aria-label={`長條平分成 ${parts} 份`}>
        {Array.from({ length: parts }, (_, i) => (
          <rect key={i} x={4 + i * seg} y={10} width={seg} height={70} fill={i < shaded ? '#ff8a3d' : '#fff'} stroke="#2b2a4c" strokeWidth="3" />
        ))}
      </svg>
    );
  }
  const r = 90;
  return (
    <svg viewBox="-100 -100 200 200" width={200} role="img" aria-label={`披薩平分成 ${parts} 份`}>
      <circle r={r + 6} fill="#e8a65d" stroke="#2b2a4c" strokeWidth="3" />
      {Array.from({ length: parts }, (_, i) => {
        const a0 = (i / parts) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / parts) * Math.PI * 2 - Math.PI / 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const d = `M0 0 L${Math.cos(a0) * r} ${Math.sin(a0) * r} A${r} ${r} 0 ${large} 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r} Z`;
        return <path key={i} d={d} fill={i < shaded ? '#ff6b4a' : '#ffe08a'} stroke="#2b2a4c" strokeWidth="3" />;
      })}
    </svg>
  );
}

/** 平面圖形與立體形體的示意圖 */
export function ShapeIcon({ shape, size = 120 }: { shape: ShapeId; size?: number }) {
  const stroke = { stroke: '#2b2a4c', strokeWidth: 4, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (shape) {
      case 'triangle':
        return <polygon points="50,10 92,86 8,86" fill="#ffc93c" {...stroke} />;
      case 'square':
        return <rect x="14" y="14" width="72" height="72" fill="#2bb5c8" {...stroke} />;
      case 'rectangle':
        return <rect x="4" y="26" width="92" height="50" fill="#3fbf7f" {...stroke} />;
      case 'circle':
        return <circle cx="50" cy="50" r="40" fill="#ff8a3d" {...stroke} />;
      case 'cube':
        return (
          <g {...stroke}>
            <polygon points="22,34 60,34 60,84 22,84" fill="#2bb5c8" />
            <polygon points="22,34 40,18 78,18 60,34" fill="#7fd6e0" />
            <polygon points="60,34 78,18 78,68 60,84" fill="#1f8fa0" />
          </g>
        );
      case 'cuboid':
        return (
          <g {...stroke}>
            <polygon points="8,44 66,44 66,84 8,84" fill="#3fbf7f" />
            <polygon points="8,44 28,28 86,28 66,44" fill="#8fe0b3" />
            <polygon points="66,44 86,28 86,68 66,84" fill="#2a9663" />
          </g>
        );
      case 'cylinder':
        return (
          <g {...stroke}>
            <path d="M22 26 L22 76 A28 10 0 0 0 78 76 L78 26" fill="#ff8a3d" />
            <ellipse cx="50" cy="26" rx="28" ry="10" fill="#ffc28f" />
          </g>
        );
      case 'cone':
        return (
          <g {...stroke}>
            <path d="M50 10 L22 76 A28 10 0 0 0 78 76 Z" fill="#e8457c" />
          </g>
        );
      case 'sphere':
        return (
          <g>
            <circle cx="50" cy="50" r="38" fill="#8b5cf6" {...stroke} />
            <ellipse cx="50" cy="50" rx="38" ry="12" fill="none" stroke="#2b2a4c" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />
            <circle cx="36" cy="36" r="8" fill="#fff" opacity="0.6" />
          </g>
        );
    }
  })();
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={shape}>
      {body}
    </svg>
  );
}

/** 圖畫統計表：每一列是一種東西，用 emoji 排出數量 */
export function PictureChart({ rows }: { rows: { label: string; emoji: string; count: number }[] }) {
  return (
    <table style={{ borderCollapse: 'separate', borderSpacing: 0, background: '#fff', border: '3px solid #2b2a4c', borderRadius: 16, overflow: 'hidden' }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.label} style={{ background: i % 2 ? '#fff6df' : '#fff' }}>
            <td style={{ padding: '6px 12px', fontSize: 22, fontWeight: 800, borderRight: '2px solid #2b2a4c', whiteSpace: 'nowrap' }}>{r.label}</td>
            <td style={{ padding: '4px 10px', fontSize: 26, letterSpacing: 2 }}>
              {Array.from({ length: r.count }, () => r.emoji).join('')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 月曆 */
export function Calendar({ year, month, highlight }: { year: number; month: number; highlight?: number }) {
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const heads = ['日', '一', '二', '三', '四', '五', '六'];
  return (
    <div style={{ background: '#fff', border: '3px solid #2b2a4c', borderRadius: 16, padding: 8, fontFamily: 'var(--font-plain)' }}>
      <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 22, marginBottom: 4 }}>
        {year} 年 {month} 月
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 38px)', gap: 3, textAlign: 'center' }}>
        {heads.map((h, i) => (
          <div key={h} style={{ fontWeight: 800, fontSize: 16, color: i === 0 || i === 6 ? '#e8457c' : '#2b2a4c' }}>
            {h}
          </div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            style={{
              height: 32,
              lineHeight: '32px',
              fontSize: 17,
              fontWeight: 700,
              borderRadius: 8,
              background: d && d === highlight ? '#ffc93c' : d ? '#fff6df' : 'transparent',
              border: d && d === highlight ? '2px solid #2b2a4c' : 'none',
            }}
          >
            {d ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
}
