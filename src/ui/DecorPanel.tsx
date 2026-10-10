/**
 * 佈置院子的面板（自己的家第一期，docs/plans/home.md 第 3.4 節）：佈置時取代島上的 HUD。
 * - 上方：「✕ 取消」「✅ 完成」與一句說明（現在該點哪裡）。
 * - 選起擺好的家具時：「🔄 轉方向」「↔️ 移動」「📦 收起來」。
 * - 下方家具包：擁有的家具與還能擺幾個，點一樣再點院子裡亮起來的格子放下。
 * 規則在 src/store/yard.ts（editYard），狀態在 src/store/useYardEdit.ts。格子在 3D 畫面（src/world/Furniture.tsx 的 YardGrid）。
 */
import { useEffect } from 'react';
import { useGame } from '../store/useGame';
import { FURNITURE, findItem } from '../store/catalog';
import { ownedDecor, remainingDecor } from '../store/yard';
import { cancelDecorating, decorAct, finishDecorating, useYardEdit } from '../store/useYardEdit';
import { DECOR_LINES } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';

export function DecorPanel() {
  const edit = useYardEdit((s) => s.edit);
  const profile = useGame((s) => s.profile());
  const owned = profile ? ownedDecor(profile) : {};
  const hasAny = Object.keys(owned).length > 0;

  // 開始佈置時唸一次說明（沒有家具時提醒去百寶屋）
  useEffect(() => {
    speak(hasAny ? DECOR_LINES.start : DECOR_LINES.empty);
    // 只在打開時唸
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!edit) return null;
  const left = remainingDecor(edit, owned);
  const selected = edit.selected !== null ? edit.items[edit.selected] : null;
  const hint = edit.moving
    ? '點一個空格子，把它搬過去'
    : edit.picking
      ? `點院子裡亮起來的格子，放下「${findItem(edit.picking)?.name ?? ''}」`
      : selected
        ? `選了「${findItem(selected.id)?.name ?? ''}」`
        : hasAny
          ? '點下面的家具，再點院子裡的格子'
          : DECOR_LINES.empty;

  return (
    <div className="decor-panel" data-testid="decor-panel">
      <div className="decor-top card">
        <button
          className="btn small white"
          onClick={() => {
            sfx.tap();
            cancelDecorating();
          }}
          data-testid="decor-cancel"
        >
          ✕ 取消
        </button>
        <span className="decor-hint" role="status" data-testid="decor-hint">
          🏡 {hint}
        </span>
        <button
          className="btn small green"
          onClick={() => {
            sfx.coin();
            finishDecorating();
            speak(DECOR_LINES.saved);
          }}
          data-testid="decor-done"
        >
          ✅ 完成
        </button>
      </div>
      {selected && !edit.moving && (
        <div className="decor-actions card">
          <button className="btn small" onClick={() => decorAct({ t: 'rotate' })} data-testid="decor-rotate">
            🔄 轉方向
          </button>
          <button className="btn small" onClick={() => decorAct({ t: 'move' })} data-testid="decor-move">
            ↔️ 移動
          </button>
          <button
            className="btn small white"
            onClick={() => {
              sfx.tap();
              decorAct({ t: 'putAway' });
            }}
            data-testid="decor-putaway"
          >
            📦 收起來
          </button>
        </div>
      )}
      <div className="decor-bag card" role="group" aria-label="家具包">
        {hasAny ? (
          FURNITURE.filter((f) => owned[f.id]).map((f) => {
            const n = left[f.id] ?? 0;
            return (
              <button
                key={f.id}
                className={`decor-bag-item ${edit.picking === f.id ? 'on' : ''}`}
                disabled={n <= 0}
                onClick={() => {
                  sfx.tap();
                  decorAct({ t: 'pick', id: edit.picking === f.id ? null : f.id });
                }}
                aria-label={`${f.name}，還有 ${n} 個`}
                data-testid={`decor-pick-${f.id}`}
              >
                <span className="icon">{f.emoji}</span>
                <span className="name">{f.name}</span>
                <span className="count">× {n}</span>
              </button>
            );
          })
        ) : (
          <p className="plain">還沒有家具。到百寶屋的「🏡 家具」買家具吧！</p>
        )}
      </div>
    </div>
  );
}
