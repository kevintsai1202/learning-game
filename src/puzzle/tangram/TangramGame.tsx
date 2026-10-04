/**
 * 七巧板（規則在 src/engine/puzzle/tangram.ts，剪影在 tangramShapes.ts）：把七塊板子拖進剪影裡拼出圖案。
 * - 拖曳移動；點一下轉 90 度；選一塊再按「翻面」左右翻（平行四邊形要翻面才拼得出鏡像）。
 * - 放開時靠近格點、整塊都在剪影裡、不和別塊重疊就吸附固定；不合就留在放開的地方。蓋滿剪影就完成（擺法不必和題庫一樣）。
 * - 簡單：剪影畫出分割線；普通：只有外框；厲害：只有外框、沒有提示。
 * - 自己玩：沒用提示 3 星；和機器人：機器人依難度每隔幾秒拼好一塊，比誰先拼完。
 *
 * 板子的位置放在 ref（拖曳時每次移動都要讀到最新的位置），改完再觸發重繪。
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createRng } from '../../core/rng';
import {
  TANGRAM_PIECES,
  botPieceDelay,
  cellsOf,
  isComplete,
  pieceType,
  piecePolygon,
  placeAt,
  polygonCentroid,
  tangramStars,
  type Placed,
  type Pose,
} from '../../engine/puzzle/tangram';
import { normalizedShape, pickShape, solutionCells } from '../../engine/puzzle/tangramShapes';
import { PUZZLE_LINES } from '../../ui/lines';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { puzzleDebug } from '../debug';
import { svgPoint } from '../svgPoint';
import type { PuzzleGameProps } from '../types';

/** 剪影框的大小（格）：題庫的剪影最大 8×8 */
const FRAME = 9;

/** 板子在盤面上的狀態：姿勢、平移量（盤面座標）、是否已經吸附在剪影裡 */
interface PieceState extends Pose {
  x: number;
  y: number;
  placed: boolean;
}

/** 盤面的配置：寬高、剪影框、每塊板子在收納區的格子（左上角與寬高） */
interface Layout {
  w: number;
  h: number;
  tray: Record<string, [number, number, number, number]>;
}

/** 橫向：左邊剪影框、右邊收納區 */
const LANDSCAPE: Layout = {
  w: 17.5,
  h: 9.2,
  tray: {
    big1: [9.5, 0, 4, 4],
    big2: [13.5, 0, 4, 4],
    para: [9.5, 4.5, 3, 3],
    medium: [12.8, 4.5, 2.2, 2.2],
    square: [15.3, 4.5, 2.2, 2.2],
    small1: [12.8, 7, 2.2, 2.2],
    small2: [15.3, 7, 2.2, 2.2],
  },
};

/** 直向：上面剪影框、下面收納區 */
const PORTRAIT: Layout = {
  w: 9,
  h: 18.6,
  tray: {
    big1: [0, 9.4, 4, 4],
    big2: [4.6, 9.4, 4, 4],
    para: [0, 13.8, 3, 3],
    medium: [3.3, 13.8, 2.2, 2.2],
    square: [6.1, 13.8, 2.2, 2.2],
    small1: [3.3, 16.4, 2.2, 2.2],
    small2: [6.1, 16.4, 2.2, 2.2],
  },
};

/** 多邊形轉成 SVG 的 points 字串 */
const pointsOf = (poly: [number, number][]) => poly.map(([x, y]) => `${x},${y}`).join(' ');

/** 依 id 找板子的顏色 */
const colorOf = (id: string) => TANGRAM_PIECES.find((p) => p.id === id)!.color;

export default function TangramGame({ run, onFinish, onExit }: PuzzleGameProps) {
  const vs = run.mode === 'vs';
  const shape = useMemo(() => pickShape(run.seed, run.level), [run.seed, run.level]);
  const norm = useMemo(() => normalizedShape(shape), [shape]);
  const [layout] = useState<Layout>(() => (typeof window !== 'undefined' && window.matchMedia?.('(orientation: portrait)').matches ? PORTRAIT : LANDSCAPE));
  /** 剪影放在剪影框的中間（整數平移，格點對齊） */
  const ox = Math.floor((FRAME - norm.w) / 2);
  const oy = Math.floor((FRAME - norm.h) / 2);
  const solution = useMemo<Placed[]>(() => norm.solution.map((s) => ({ ...s, dx: s.dx + ox, dy: s.dy + oy })), [norm, ox, oy]);
  const target = useMemo(() => solutionCells(solution), [solution]);
  const rng = useMemo(() => createRng(run.seed ^ 0x7a7), [run.seed]);

  /** 板子一開始放在收納區自己的格子中間，方向隨機（厲害的平行四邊形也可能翻過來）；只在開局算一次 */
  const [initial] = useState<Record<string, PieceState>>(() =>
    Object.fromEntries(
      TANGRAM_PIECES.map((p) => {
        const pose: Pose = { rot: rng.int(0, 3), flip: run.level === 3 && p.type === 'para' && rng.chance(0.5) };
        const poly = piecePolygon(p.type, pose, 0, 0);
        const [bx, by, bw, bh] = layout.tray[p.id];
        const xs = poly.map((v) => v[0]);
        const ys = poly.map((v) => v[1]);
        const x = bx + bw / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
        const y = by + bh / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
        return [p.id, { ...pose, x, y, placed: false }];
      }),
    ),
  );
  const pieces = useRef(initial);
  const [, setTick] = useState(0);
  const redraw = () => setTick((t) => t + 1);
  /** 疊放順序（後面的畫在上面）：最後碰到的板子在最上面 */
  const [order, setOrder] = useState(() => TANGRAM_PIECES.map((p) => p.id));
  const [selected, setSelected] = useState<string | null>(null);
  const [hints, setHints] = useState(0);
  /** 正在亮出提示的那一塊（擺法） */
  const [hint, setHint] = useState<Placed | null>(null);
  /** 機器人拼好了幾塊 */
  const [botDone, setBotDone] = useState(0);
  const [over, setOver] = useState(false);
  /** 已經結算（機器人的計時器和放好最後一塊可能在同一瞬間發生，只結算一次） */
  const finished = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  /** 正在拖的板子：哪一塊、哪一根手指（別的手指或手掌不算）、起點與原本的位置 */
  const drag = useRef<{ id: string; pointerId: number; start: [number, number]; origin: [number, number]; moved: boolean } | null>(null);

  const placedList = (except?: string): Placed[] =>
    Object.entries(pieces.current)
      .filter(([id, p]) => p.placed && id !== except)
      .map(([id, p]) => ({ piece: id, pose: { rot: p.rot, flip: p.flip }, dx: p.x, dy: p.y }));
  const placedCount = Object.values(pieces.current).filter((p) => p.placed).length;

  /** 結束這一局（只結算一次） */
  const end = (outcome: Parameters<PuzzleGameProps['onFinish']>[0]) => {
    if (finished.current) return;
    finished.current = true;
    setOver(true);
    onFinish(outcome);
  };

  // 開始時說明玩法
  useEffect(() => {
    speak(PUZZLE_LINES.tangramStart);
  }, []);

  // e2e 讀的狀態：每塊板子的位置與重心、題庫的擺法（盤面座標）與重心
  useEffect(() => {
    puzzleDebug.state = {
      game: 'tangram',
      mode: run.mode,
      shape: shape.id,
      done: over,
      botDone,
      pieces: Object.fromEntries(
        Object.entries(pieces.current).map(([id, p]) => {
          const [cx, cy] = polygonCentroid(piecePolygon(pieceType(id), p, p.x, p.y));
          return [id, { ...p, cx, cy }];
        }),
      ),
      targets: solution.map((s) => {
        const [cx, cy] = polygonCentroid(piecePolygon(pieceType(s.piece), s.pose, s.dx, s.dy));
        return { piece: s.piece, rot: s.pose.rot, flip: s.pose.flip, cx, cy };
      }),
    };
  });
  useEffect(
    () => () => {
      puzzleDebug.state = null;
    },
    [],
  );

  // 機器人：每隔幾秒拼好一塊，拼完七塊就贏了（e2e 可以用 botDelayFactor 調速度）
  useEffect(() => {
    if (!vs || over) return;
    if (botDone >= TANGRAM_PIECES.length) {
      sfx.oops();
      end({ stars: 1, vs: 'lose', summary: `機器人先拼好了「${shape.name}」，你放好 ${placedCount}／7 塊` });
      return;
    }
    const t = setTimeout(() => setBotDone((n) => n + 1), botPieceDelay(run.level, rng) * puzzleDebug.botDelayFactor);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vs, over, botDone]);

  /** 轉動或翻面：重心留在原地；吸附中的板子會鬆開 */
  const turn = (id: string, change: (p: PieceState) => Pose) => {
    const p = pieces.current[id];
    const type = pieceType(id);
    const [cx, cy] = polygonCentroid(piecePolygon(type, p, p.x, p.y));
    const next = change(p);
    const [nx, ny] = polygonCentroid(piecePolygon(type, next, 0, 0));
    pieces.current = { ...pieces.current, [id]: { ...p, ...next, x: cx - nx, y: cy - ny, placed: false } };
    redraw();
  };

  /** 放開時試著吸附：附近四個格點裡，整塊都在剪影裡、不和別塊重疊的就固定在那裡 */
  const snap = (id: string) => {
    const p = pieces.current[id];
    const others = placedList(id);
    const candidates: [number, number][] = [];
    for (const tx of [Math.floor(p.x), Math.ceil(p.x)]) for (const ty of [Math.floor(p.y), Math.ceil(p.y)]) candidates.push([tx, ty]);
    candidates.sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.y) - Math.hypot(b[0] - p.x, b[1] - p.y));
    for (const [tx, ty] of candidates) {
      if (Math.hypot(tx - p.x, ty - p.y) > 0.8 || !placeAt(target, others, id, p, tx, ty)) continue;
      pieces.current = { ...pieces.current, [id]: { ...p, x: tx, y: ty, placed: true } };
      sfx.correct();
      redraw();
      if (isComplete(target, placedList())) {
        if (vs) end({ stars: 3, vs: 'win', summary: `你先拼好了「${shape.name}」！` });
        else end({ stars: tangramStars(hints), summary: hints === 0 ? `拼好了「${shape.name}」！沒有用提示` : `拼好了「${shape.name}」！用了 ${hints} 次提示` });
      }
      return;
    }
    redraw();
  };

  const down = (e: PointerEvent<SVGElement>, id: string) => {
    if (over || !svgRef.current || drag.current) return;
    e.stopPropagation();
    svgRef.current.setPointerCapture(e.pointerId);
    const pt = svgPoint(svgRef.current, e.clientX, e.clientY);
    const p = pieces.current[id];
    drag.current = { id, pointerId: e.pointerId, start: [pt.x, pt.y], origin: [p.x, p.y], moved: false };
    setSelected(id);
    setOrder((o) => [...o.filter((v) => v !== id), id]);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !svgRef.current) return;
    const pt = svgPoint(svgRef.current, e.clientX, e.clientY);
    const dx = pt.x - d.start[0];
    const dy = pt.y - d.start[1];
    if (!d.moved && Math.hypot(dx, dy) < 0.2) return;
    d.moved = true;
    const p = pieces.current[d.id];
    // 不能拖出盤面：板子的重心留在盤面裡（轉過方向的板子會往負的方向延伸，只看平移量會整塊拖出去、抓不回來）
    const [ocx, ocy] = polygonCentroid(piecePolygon(pieceType(d.id), p, 0, 0));
    const x = Math.min(layout.w - 0.3, Math.max(0.3, d.origin[0] + dx + ocx)) - ocx;
    const y = Math.min(layout.h - 0.3, Math.max(0.3, d.origin[1] + dy + ocy)) - ocy;
    pieces.current = { ...pieces.current, [d.id]: { ...p, x, y, placed: false } };
    redraw();
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (over) return;
    if (d.moved) snap(d.id);
    // 點一下：轉 90 度（已經吸附的板子不轉，免得不小心碰到就鬆開）
    else if (!pieces.current[d.id].placed) {
      sfx.tap();
      turn(d.id, (p) => ({ rot: (p.rot + 1) % 4, flip: p.flip }));
    }
  };

  /** 提示：亮出一塊還沒放對的位置（同種類的板子都放得進去） */
  const showHint = () => {
    const placed = placedList();
    const key = (cells: Set<string>) => [...cells].sort().join('|');
    const slot = solution.find((s) => {
      const want = key(cellsOf(pieceType(s.piece), s.pose, s.dx, s.dy));
      return !placed.some((q) => pieceType(q.piece) === pieceType(s.piece) && key(cellsOf(pieceType(q.piece), q.pose, q.dx, q.dy)) === want);
    });
    if (!slot) return;
    sfx.tap();
    setHints((h) => h + 1);
    setHint(slot);
  };
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3500);
    return () => clearTimeout(t);
  }, [hint]);

  const canFlip = !!selected && !pieces.current[selected]?.placed && !over;
  return (
    <div className="card puzzle-play" data-testid="tangram-game" data-mode={run.mode} data-shape={shape.id}>
      <div className="puzzle-head">
        <button className="btn round white" onClick={onExit} aria-label="離開">
          ✕
        </button>
        <div className="grow">
          <span className="hud-chip" data-testid="tangram-title">
            {shape.icon} 拼出「{shape.name}」
          </span>
          <span className="hud-chip" data-testid="tangram-placed">
            🧩 {placedCount}／7
          </span>
          {vs && (
            <span className="hud-chip" data-testid="tangram-bot">
              🤖 機器人 {botDone}／7
            </span>
          )}
        </div>
      </div>
      <div className="tangram-tools">
        <button className="btn small white" disabled={!canFlip} onClick={() => selected && turn(selected, (p) => ({ rot: p.rot, flip: !p.flip }))} data-testid="tangram-flip">
          ↔️ 翻面
        </button>
        {!vs && run.level < 3 && (
          <button className="btn small white" disabled={over} onClick={showHint} data-testid="tangram-hint">
            💡 提示{hints > 0 ? `（${hints}）` : ''}
          </button>
        )}
        <span className="tangram-tip">拖曳板子・點一下轉方向</span>
      </div>
      <svg
        ref={svgRef}
        className="tangram-board"
        viewBox={`-0.3 -0.3 ${layout.w + 0.6} ${layout.h + 0.6}`}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        data-testid="tangram-board"
        role="application"
        aria-label={`七巧板：拼出${shape.name}`}
      >
        <rect x={-0.1} y={-0.1} width={FRAME + 0.2} height={FRAME + 0.2} rx={0.4} className="tangram-frame" />
        {/* 剪影：七塊合起來的形狀（同色描邊蓋掉接縫） */}
        <g className="tangram-silhouette">
          {solution.map((s) => (
            <polygon key={s.piece} points={pointsOf(piecePolygon(pieceType(s.piece), s.pose, s.dx, s.dy))} />
          ))}
        </g>
        {run.level === 1 && (
          <g className="tangram-lines">
            {solution.map((s) => (
              <polygon key={s.piece} points={pointsOf(piecePolygon(pieceType(s.piece), s.pose, s.dx, s.dy))} />
            ))}
          </g>
        )}
        {hint && <polygon className="tangram-hint" points={pointsOf(piecePolygon(pieceType(hint.piece), hint.pose, hint.dx, hint.dy))} stroke={colorOf(hint.piece)} data-testid="tangram-hint-slot" />}
        {order.map((id) => {
          const p = pieces.current[id];
          return (
            <polygon
              key={id}
              points={pointsOf(piecePolygon(pieceType(id), p, p.x, p.y))}
              fill={colorOf(id)}
              className={`tangram-piece ${p.placed ? 'placed' : ''} ${selected === id ? 'selected' : ''}`}
              onPointerDown={(e) => down(e, id)}
              data-testid={`tangram-piece-${id}`}
            />
          );
        })}
      </svg>
      {vs && <BotBoard solution={solution} done={botDone} />}
    </div>
  );
}

/** 機器人的小盤面：剪影上依序填上機器人拼好的板子 */
function BotBoard({ solution, done }: { solution: Placed[]; done: number }) {
  return (
    <div className="tangram-bot" aria-label={`機器人拼好 ${done} 塊`}>
      <span>🤖</span>
      <svg viewBox={`-0.3 -0.3 ${FRAME + 0.6} ${FRAME + 0.6}`}>
        {solution.map((s, i) => (
          <polygon
            key={s.piece}
            points={pointsOf(piecePolygon(pieceType(s.piece), s.pose, s.dx, s.dy))}
            fill={i < done ? colorOf(s.piece) : '#3b3a5e'}
            stroke={i < done ? '#ffffff' : '#3b3a5e'}
            strokeWidth={0.08}
          />
        ))}
      </svg>
    </div>
  );
}
