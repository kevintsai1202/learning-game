/**
 * 描寫題：用 Hanzi Writer 讓孩子照筆順一筆一筆寫。
 * 難度 1 有淡色字形可以描、難度 2 字形更淡、難度 3 不顯示字形（默寫）。
 * 寫錯兩次會提示下一筆的位置；寫完回報寫錯幾筆。
 */
import { useEffect, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import type { WriteQuestion } from '../core/types';
import { loadStrokeData } from './strokeData';
import { GRID_CENTER, LATIN_LINES, charToPixel } from './glyphs';
import { quizDebug } from '../quiz/debug';
import { sfx } from '../audio/sfx';

/** 田字格（國字、注音）或四線格（英文字母）的背景 */
function GuideGrid({ script, size, padding }: { script: WriteQuestion['script']; size: number; padding: number }) {
  if (script === 'latin') {
    // 四線格：第 1、4 線實線，第 2 線虛線、第 3 線（基準線）紅色；位置與字形座標一致
    const ys = [LATIN_LINES.top, LATIN_LINES.mid, LATIN_LINES.base, LATIN_LINES.bottom].map((y) => charToPixel(0, y, size, padding).py);
    return (
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <rect x="1" y="1" width={size - 2} height={size - 2} rx="18" fill="#fff" stroke="#2b2a4c" strokeWidth="3" />
        {ys.map((y, i) => (
          <line key={i} x1="8" x2={size - 8} y1={y} y2={y} stroke={i === 2 ? '#ff6b4a' : '#9a96b0'} strokeWidth={i === 2 ? 2.5 : 1.5} strokeDasharray={i === 1 ? '8 6' : undefined} />
        ))}
      </svg>
    );
  }
  // 田字格：中線通過字框中心
  const c = charToPixel(GRID_CENTER.x, GRID_CENTER.y, size, padding);
  return (
    <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }} aria-hidden>
      <rect x="1" y="1" width={size - 2} height={size - 2} rx="18" fill="#fff" stroke="#2b2a4c" strokeWidth="3" />
      <line x1={c.px} y1="6" x2={c.px} y2={size - 6} stroke="#f4b4a8" strokeWidth="1.5" strokeDasharray="8 6" />
      <line x1="6" y1={c.py} x2={size - 6} y2={c.py} stroke="#f4b4a8" strokeWidth="1.5" strokeDasharray="8 6" />
    </svg>
  );
}

interface WriteInputProps {
  q: WriteQuestion;
  disabled: boolean;
  onDone: (completed: boolean, mistakes: number) => void;
}

export default function WriteInput({ q, disabled, onDone }: WriteInputProps) {
  const host = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [mistakes, setMistakes] = useState(0);
  const size = Math.min(300, Math.floor(window.innerWidth * 0.7));
  const padding = q.script === 'latin' ? 8 : 18;
  const level = q.difficulty ?? 1;

  /** 開始（或重新開始）描寫 */
  const startQuiz = () => {
    const w = writer.current;
    if (!w) return;
    setMistakes(0);
    let miss = 0;
    if (level === 3) w.hideOutline();
    else w.showOutline();
    void w.quiz({
      leniency: 1.3,
      showHintAfterMisses: 2,
      highlightOnComplete: true,
      onMistake: () => {
        miss += 1;
        setMistakes(miss);
      },
      onCorrectStroke: () => sfx.stroke(),
      onComplete: (summary: { totalMistakes: number }) => onDone(true, summary.totalMistakes ?? miss),
    });
  };

  useEffect(() => {
    if (!host.current) return;
    host.current.replaceChildren();
    const w = HanziWriter.create(host.current, q.target, {
      width: size,
      height: size,
      padding,
      showCharacter: false,
      showOutline: level < 3,
      outlineColor: level === 1 ? '#d9d4c7' : '#ece8de',
      strokeColor: '#2b2a4c',
      radicalColor: '#2f6fde',
      highlightColor: '#3fbf7f',
      drawingColor: '#ff6b4a',
      drawingWidth: 26,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 280,
      renderer: 'svg',
      // 回傳 Promise 即可，載入失敗會觸發 onLoadCharDataError
      charDataLoader: () =>
        loadStrokeData(q.script, q.target).then((d) => {
          // 給 e2e 測試描寫用
          quizDebug.strokes = d.medians;
          quizDebug.pad = { size, padding };
          return d;
        }),
      onLoadCharDataSuccess: () => setStatus('ready'),
      onLoadCharDataError: () => setStatus('missing'),
    });
    writer.current = w;
    return () => {
      writer.current?.cancelQuiz();
      writer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  // 資料載好就開始描寫
  useEffect(() => {
    if (status === 'ready' && !disabled) startQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /** 示範筆順動畫，播完再讓孩子寫 */
  const demo = () => {
    const w = writer.current;
    if (!w) return;
    w.cancelQuiz();
    void w.animateCharacter({ onComplete: () => setTimeout(startQuiz, 400) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: size, height: size }} data-testid="write-pad">
        <GuideGrid script={q.script} size={size} padding={padding} />
        <div ref={host} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
        {status === 'loading' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 20 }}>載入中…</div>}
      </div>
      {status === 'missing' ? (
        <div className="explain">
          這個字的筆順資料還沒準備好。
          <button className="btn small" onClick={() => onDone(true, 99)}>
            先跳過
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn small white" disabled={disabled || status !== 'ready'} onClick={demo} data-testid="write-demo">
            👀 看筆順
          </button>
          <button className="btn small white" disabled={disabled || status !== 'ready'} onClick={startQuiz}>
            ↺ 重寫
          </button>
          <span style={{ fontSize: 18 }}>寫錯 {mistakes} 筆</span>
        </div>
      )}
    </div>
  );
}
