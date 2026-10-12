/**
 * 電腦版（與熊熊老師）：走到班級島大型設施的上車處時的卡片（docs/plans/grand-rides.md）：設施名字與「🎢 雲霄飛車 5🪙」等按鈕；
 * 不能上時（開走了「下一班 N 秒」、金幣不夠、坐滿了、伺服器還不支援）寫原因、不能按。熊熊老師免費（free，按鈕不寫價錢）。
 * 手機上由右下的大動作鍵代替（src/ui/ActionKey.tsx）。玩的時候的「換視角」與等出發的倒數在家具卡片（DecorNear）。
 */
import { GRAND_LOOK } from '../store/grandRides';
import { grandBlock, startGrand, useGrand } from '../store/useGrand';
import { useFurnitureUse } from '../store/useFurnitureUse';
import { useGame } from '../store/useGame';
import { useSecondTick } from './useSecondTick';
import { sfx } from '../audio/sfx';

export function GrandCard({ free = false }: { free?: boolean }) {
  const ride = useGrand((s) => s.near);
  // 別人上下車時重算坐滿了沒；金幣變了重算
  useGrand((s) => s.riders);
  useGame((s) => s.profile()?.coins);
  const acting = useFurnitureUse((s) => s.acting);
  // 倒數每半秒重畫
  useSecondTick(ride !== null);
  if (!ride || acting) return null;
  const look = GRAND_LOOK[ride];
  const blocked = grandBlock(ride, { free });
  return (
    <div className="decor-near card" role="group" aria-label="旁邊的大型設施" data-testid="grand-card">
      <span className="decor-near-name">
        {look.emoji} {look.name}
      </span>
      {blocked && (
        <span className="decor-near-notice" role="status" data-testid="grand-block">
          {blocked}
        </span>
      )}
      <button
        className="btn small green"
        disabled={blocked !== null}
        onClick={() => {
          if (startGrand(ride, { free })) sfx.tap();
        }}
        data-testid="grand-start"
      >
        {free ? `${look.emoji} 上去` : look.label}
      </button>
    </div>
  );
}
