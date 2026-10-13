/**
 * 課綱指標勾選（老師 AI 出題與題目編輯器共用，docs/plans/ai-questions.md）：
 * 依科目分組、可以搜尋代碼或條文、可以多選；選好的列在上面，按 × 拿掉。
 */
import { useMemo, useState } from 'react';
import { indicatorGroups } from '../../../store/packEditor';

export function IndicatorPicker({
  value,
  onChange,
  max,
  testId,
}: {
  /** 選好的指標鍵（「科目:代碼」） */
  value: string[];
  onChange: (keys: string[]) => void;
  /** 最多選幾個（沒給就不限） */
  max?: number;
  testId: string;
}) {
  const groups = useMemo(indicatorGroups, []);
  /** 搜尋文字（比對代碼與條文） */
  const [query, setQuery] = useState('');
  /** 指標鍵 → 條文（選好的清單顯示用） */
  const textOf = useMemo(() => new Map(groups.flatMap((g) => g.items.map((i) => [i.key, `${i.code} ${i.text}`] as const))), [groups]);
  const full = max !== undefined && value.length >= max;
  const q = query.trim();
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  return (
    <div className="indicator-picker" data-testid={testId}>
      {value.length > 0 && (
        <div className="indicator-chips">
          {value.map((k) => (
            <button key={k} type="button" className="indicator-chip" onClick={() => toggle(k)} title="拿掉" data-testid={`${testId}-chip-${k}`}>
              {textOf.get(k) ?? k} ✕
            </button>
          ))}
        </div>
      )}
      <input
        className="indicator-search"
        placeholder="搜尋課綱代碼或內容，例如 N-2-7、乘法、安全"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid={`${testId}-search`}
      />
      {max !== undefined && <p className="plain small-note">已選 {value.length}／{max} 個</p>}
      <div className="indicator-groups">
        {groups.map((g) => {
          const items = q ? g.items.filter((i) => i.code.includes(q) || i.text.includes(q)) : g.items;
          if (!items.length) return null;
          const picked = items.filter((i) => value.includes(i.key)).length;
          return (
            <details key={g.subject} open={!!q} data-testid={`${testId}-group-${g.subject}`}>
              <summary>
                {g.label}
                {picked > 0 && `（已選 ${picked}）`}
              </summary>
              {items.map((i) => {
                const checked = value.includes(i.key);
                return (
                  <label key={i.key} className="indicator-item">
                    <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => toggle(i.key)} data-testid={`${testId}-${i.key}`} />
                    <span>
                      <strong>{i.code}</strong> {i.text}
                    </span>
                  </label>
                );
              })}
            </details>
          );
        })}
      </div>
    </div>
  );
}
