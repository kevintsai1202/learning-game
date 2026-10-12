/**
 * 倒數用：active 時每半秒重畫一次元件（班級島大型設施的「下一班 N 秒」「N 秒後出發」，docs/plans/grand-rides.md）。
 */
import { useEffect, useState } from 'react';

export function useSecondTick(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [active]);
}
