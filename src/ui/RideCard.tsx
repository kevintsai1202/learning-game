/**
 * 電腦版：走到班級島的遊樂器材旁邊時的卡片（docs/plans/playground.md）：器材名字與「🎠 騎木馬」等按鈕，
 * 坐滿了不能按。手機上由右下的大動作鍵代替（src/ui/ActionKey.tsx）。玩的時候的「起來」「換視角」在家具卡片（DecorNear）。
 */
import { RIDES } from '../store/playground';
import { rideFull, startRide, useRides } from '../store/useRides';
import { useFurnitureUse } from '../store/useFurnitureUse';
import { sfx } from '../audio/sfx';

export function RideCard() {
  const slot = useRides((s) => s.near);
  const kind = useRides((s) => (s.near === null ? null : s.playground[s.near]));
  // 別人上下車時重算坐滿了沒
  useRides((s) => s.riders);
  const acting = useFurnitureUse((s) => s.acting);
  if (slot === null || !kind || acting) return null;
  const r = RIDES[kind];
  const full = rideFull(slot);
  return (
    <div className="decor-near card" role="group" aria-label="旁邊的遊樂器材" data-testid="ride-card">
      <span className="decor-near-name">
        {r.emoji} {r.name}
      </span>
      {full && (
        <span className="decor-near-notice" role="status">
          坐滿了
        </span>
      )}
      <button
        className="btn small green"
        disabled={full}
        onClick={() => {
          if (startRide(slot)) sfx.tap();
        }}
        data-testid="ride-start"
      >
        {r.label}
      </button>
    </div>
  );
}
