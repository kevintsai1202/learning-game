/**
 * 更新通知的提示（docs/plans/update-notice.md）：有新版時畫面上方出現「🎉 遊戲更新了！」與「立即更新」。
 * - 孩子在安全的時候（島上、活動選單、獎章、百寶屋，沒在用家具或設施、沒在對戰、沒拿著家具在擺）倒數 10 秒自動重新整理。
 * - 答題、益智遊戲、坐在設施上時等：寫「做完回到島上就會更新」，回到安全的地方才倒數（倒數重新開始）。
 * - 大人的頁面只提示，按了才更新。
 * 規則在 src/update/updateRules.ts 的 updateMode。
 */
import { useEffect, useState } from 'react';
import { useUi } from '../store/useUi';
import { useFurnitureUse } from '../store/useFurnitureUse';
import { useDecor } from '../store/useDecor';
import { useFriendDuel } from '../online/useFriendDuel';
import { applyUpdate, useUpdate } from '../update/useUpdate';
import { updateMode } from '../update/updateRules';

/** 自動更新前倒數幾秒 */
const COUNTDOWN = 10;

export function UpdateBanner() {
  const available = useUpdate((s) => s.available);
  const screen = useUi((s) => s.screen);
  const acting = useFurnitureUse((s) => s.acting !== null);
  const duel = useFriendDuel((s) => !!(s.incoming || s.outgoing || s.joining || s.live));
  const picking = useDecor((s) => s.picking !== null);
  const mode = updateMode(screen, { acting, duel, picking });
  const [left, setLeft] = useState(COUNTDOWN);

  // 安全的時候每秒倒數；不安全或沒有新版時倒數重來
  useEffect(() => {
    setLeft(COUNTDOWN);
    if (!available || mode !== 'auto') return;
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, [available, mode]);

  // 倒數到了：更新（記下現在的畫面，重新整理後回來）
  useEffect(() => {
    if (available && mode === 'auto' && left <= 0) applyUpdate(useUi.getState().screen);
  }, [available, mode, left]);

  if (!available) return null;
  const note = mode === 'auto' ? `${Math.max(left, 0)} 秒後自動更新` : mode === 'wait' ? '做完回到島上就會更新' : '按「立即更新」換成新版';
  return (
    <div className="update-banner card" role="status" data-testid="update-banner">
      <span className="update-title">🎉 遊戲更新了！</span>
      <span className="update-note" data-testid="update-note">
        {note}
      </span>
      <button className="btn small green" onClick={() => applyUpdate(useUi.getState().screen)} data-testid="update-now">
        立即更新
      </button>
    </div>
  );
}
