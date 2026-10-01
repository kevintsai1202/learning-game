/**
 * 各題型的作答元件：單選、數字鍵盤、排順序、撥時鐘、付錢。
 * 按鈕都做得夠大（至少 64px），平板上用手指點也不會點錯。
 */
import { useEffect, useRef, useState } from 'react';
import type { ChoiceOption, ChoiceQuestion } from '../core/types';
import { ClockFace, MoneyPiece, ShapeIcon, handAngles } from './visuals';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';
import { KidText } from '../ui/KidText';

/** 選項上的文字：「1/4」這類分數畫成上下排的分數 */
function OptionText({ text }: { text: string }) {
  const m = /^(\d+)\/(\d+)$/.exec(text);
  if (m) {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.05, fontFamily: 'var(--font-plain)' }}>
        <span>{m[1]}</span>
        <span style={{ borderTop: '3px solid currentColor', padding: '0 6px' }}>{m[2]}</span>
      </span>
    );
  }
  return (
    <span>
      <KidText text={text} />
    </span>
  );
}

/** 單選題 */
export function ChoiceInput({
  q,
  disabled,
  marks,
  onPick,
  compact = false,
}: {
  q: ChoiceQuestion;
  disabled: boolean;
  /** 每個選項的標記：答對、答錯 */
  marks: Record<number, 'correct' | 'wrong'>;
  onPick: (index: number) => void;
  /** 小籤樣式（射擊模式的替代操作） */
  compact?: boolean;
}) {
  const say = (o: ChoiceOption) => speak(o.speak ?? o.text ?? '', o.speakLang ?? q.speakLang ?? 'zh-TW');
  const three = q.options.length === 3;
  return (
    <div className={`choices ${three ? 'three' : ''} ${compact ? 'chips' : ''}`} role="group" aria-label="選項">
      {q.options.map((o, i) => (
        <button
          key={i}
          className={`choice ${marks[i] ?? ''}`}
          disabled={disabled || marks[i] === 'wrong'}
          onClick={() => {
            sfx.tap();
            onPick(i);
          }}
          data-testid={`choice-${i}`}
        >
          {o.shape && <ShapeIcon shape={o.shape} size={64} />}
          {o.emoji && <span className="emoji">{o.emoji}</span>}
          {o.text && <OptionText text={o.text} />}
          {(o.text || o.speak) && (
            <span
              className="say"
              role="button"
              aria-label="唸出這個選項"
              onClick={(e) => {
                e.stopPropagation();
                say(o);
              }}
            >
              🔊
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** 數字鍵盤作答 */
export function NumberInput({ unit, disabled, onSubmit }: { unit?: string; disabled: boolean; onSubmit: (value: number) => void }) {
  const [digits, setDigits] = useState('');
  const press = (k: string) => {
    if (disabled) return;
    sfx.tap();
    if (k === '⌫') setDigits((d) => d.slice(0, -1));
    else if (k === '✓') {
      if (digits) {
        onSubmit(Number(digits));
        setDigits('');
      }
    } else setDigits((d) => (d.length >= 4 ? d : d === '0' ? k : d + k));
  };
  // 實體鍵盤也能作答
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === 'Backspace') pressRef.current('⌫');
      else if (e.key === 'Enter') pressRef.current('✓');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div className="answer-box">
        <span className={`slot ${digits ? '' : 'empty'}`} data-testid="answer-slot">
          {digits || '?'}
        </span>
        {unit && <span>{unit}</span>}
      </div>
      <div className="keypad">
        {keys.map((k) => (
          <button key={k} className={`btn ${k === '✓' ? 'ok' : ''}`} disabled={disabled || (k === '✓' && !digits)} onClick={() => press(k)} data-testid={`key-${k}`}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 排順序：依序點詞卡放進答案列，點答案列的詞卡可以拿回來 */
export function OrderInput({ tokens, disabled, onSubmit }: { tokens: string[]; disabled: boolean; onSubmit: (tokens: string[]) => void }) {
  /** 已放進答案列的詞卡索引 */
  const [placed, setPlaced] = useState<number[]>([]);
  useEffect(() => setPlaced([]), [tokens]);
  const pool = tokens.map((t, i) => ({ t, i })).filter((x) => !placed.includes(x.i));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
      <div className="order-row" aria-label="答案">
        {placed.map((i) => (
          <button key={i} className="token placed" disabled={disabled} onClick={() => setPlaced((p) => p.filter((x) => x !== i))}>
            <KidText text={tokens[i]} />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {pool.map(({ t, i }) => (
          <button
            key={i}
            className="token"
            disabled={disabled}
            onClick={() => {
              sfx.tap();
              setPlaced((p) => [...p, i]);
            }}
          >
            <KidText text={t} />
          </button>
        ))}
      </div>
      <button className="btn green" disabled={disabled || placed.length !== tokens.length} onClick={() => onSubmit(placed.map((i) => tokens[i]))}>
        ✓ 完成
      </button>
    </div>
  );
}

/**
 * 撥時鐘：拖曳長針（分針），短針會跟著轉（像真的時鐘齒輪連動）。
 * 也可以用按鈕一次調整一小時或一格。
 */
export function ClockInput({ step, disabled, onSubmit }: { step: number; disabled: boolean; onSubmit: (hour: number, minute: number) => void }) {
  /** 從 12:00 起算的總分鐘數（0～719） */
  const [total, setTotal] = useState(0);
  const dragging = useRef(false);
  const lastMinute = useRef(0);
  const svgRef = useRef<HTMLDivElement>(null);
  const hour = Math.floor(total / 60) % 12 || 12;
  const minute = total % 60;
  const a = handAngles(hour, minute);
  const wrap = (v: number) => ((v % 720) + 720) % 720;

  /** 依指標位置換算分針刻度，跨過 12 時自動進退一小時 */
  const onMove = (clientX: number, clientY: number) => {
    const el = svgRef.current?.querySelector('svg');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const m = (Math.round(deg / 6 / step) * step) % 60;
    const prev = lastMinute.current;
    let delta = m - prev;
    if (delta > 30) delta -= 60;
    if (delta < -30) delta += 60;
    if (delta !== 0) {
      lastMinute.current = m;
      setTotal((t) => wrap(t + delta));
    }
  };
  useEffect(() => {
    lastMinute.current = minute;
  }, [minute]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div
        ref={svgRef}
        style={{ touchAction: 'none', cursor: 'grab' }}
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          onMove(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && onMove(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        data-testid="clock-input"
      >
        <ClockFace hour={hour} minute={minute} size={240}>
          <line x1="0" y1="0" x2="0" y2="-46" stroke="#2b2a4c" strokeWidth="9" strokeLinecap="round" transform={`rotate(${a.hour})`} />
          <g transform={`rotate(${a.minute})`}>
            <line x1="0" y1="0" x2="0" y2="-76" stroke="#ff6b4a" strokeWidth="7" strokeLinecap="round" />
            <circle cy="-76" r="11" fill="#ff6b4a" stroke="#2b2a4c" strokeWidth="3" />
          </g>
        </ClockFace>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn small white" disabled={disabled} onClick={() => setTotal((t) => wrap(t - 60))} data-testid="hour-minus">
          短針 ◀
        </button>
        <button className="btn small white" disabled={disabled} onClick={() => setTotal((t) => wrap(t + 60))} data-testid="hour-plus">
          短針 ▶
        </button>
        <button className="btn small white" disabled={disabled} onClick={() => setTotal((t) => wrap(t - step))} data-testid="minute-minus">
          長針 ◀
        </button>
        <button className="btn small white" disabled={disabled} onClick={() => setTotal((t) => wrap(t + step))} data-testid="minute-plus">
          長針 ▶
        </button>
      </div>
      <button className="btn green" disabled={disabled} onClick={() => onSubmit(hour, minute)} data-testid="clock-ok">
        ✓ 撥好了
      </button>
    </div>
  );
}

/** 付錢：點下方的錢放進盤子，點盤子裡的錢可以拿回來（不顯示總額，讓孩子自己數） */
export function MoneyInput({ denominations, disabled, onSubmit }: { denominations: number[]; disabled: boolean; onSubmit: (items: number[]) => void }) {
  const [tray, setTray] = useState<number[]>([]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
      <div className="order-row" style={{ minHeight: 86, alignItems: 'center' }} aria-label="盤子" data-testid="money-tray">
        {tray.length === 0 && <span style={{ color: '#9a96b0', fontSize: 20 }}>把錢放到這裡</span>}
        {tray.map((v, i) => (
          <button key={i} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} disabled={disabled} onClick={() => setTray((t) => t.filter((_, j) => j !== i))} aria-label={`拿回 ${v} 元`}>
            <MoneyPiece value={v} scale={0.8} />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
        {denominations.map((d) => (
          <button
            key={d}
            style={{ border: 'none', background: 'none', padding: 2, cursor: 'pointer' }}
            disabled={disabled}
            onClick={() => {
              sfx.coin();
              setTray((t) => [...t, d].sort((a, b) => b - a));
            }}
            aria-label={`放 ${d} 元`}
            data-testid={`money-${d}`}
          >
            <MoneyPiece value={d} />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn small white" disabled={disabled || !tray.length} onClick={() => setTray([])}>
          全部拿回
        </button>
        <button className="btn green" disabled={disabled || !tray.length} onClick={() => onSubmit(tray)} data-testid="money-ok">
          ✓ 付錢
        </button>
      </div>
    </div>
  );
}
