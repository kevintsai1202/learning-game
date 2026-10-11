/**
 * 在島上直接佈置（自己的家改版，docs/plans/home.md 第 7 節）：動森做法的家具包與旁邊家具的按鈕。
 * - DecorBag：「🎒 家具」打開的家具包（底部，留出左下的搖桿）。選一樣家具，角色面前那一格出現預覽，
 *   按「⬇️ 放下」擺好（可以先「🔄」轉方向）；不能放時說原因。
 * - DecorNear：沒選家具時，角色旁邊有擺好的家具就出現「🔄 轉方向」「👜 收起來」。
 * 規則在 src/store/yard.ts，狀態與動作在 src/store/useDecor.ts。
 */
import { useEffect } from 'react';
import { useGame } from '../store/useGame';
import { FURNITURE, findItem } from '../store/catalog';
import { ownedDecor, remainingDecor } from '../store/yard';
import { frontProblem, pickDecor, pickUpNear, placeFront, rotateGhost, rotateNear, toggleBag, useDecor } from '../store/useDecor';
import { DECOR_LINES } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';

export function DecorBag() {
  const bagOpen = useDecor((s) => s.bagOpen);
  const picking = useDecor((s) => s.picking);
  // 面前的格子變了、擺設變了，都要重算能不能放
  useDecor((s) => s.front);
  const profile = useGame((s) => s.profile());
  const owned = profile ? ownedDecor(profile) : {};
  const hasAny = Object.keys(owned).length > 0;

  // 打開時唸一次說明（沒有家具時提醒去百寶屋）
  useEffect(() => {
    if (bagOpen) speak(hasAny ? DECOR_LINES.open : DECOR_LINES.empty);
    // 只在打開時唸
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bagOpen]);

  if (!bagOpen) return null;
  const left = remainingDecor({ items: profile?.yard ?? [] }, owned);
  const problem = frontProblem();
  const hint = picking ? (problem ?? `按「放下」，把${findItem(picking)?.name ?? ''}擺在面前`) : hasAny ? '選一樣家具，再走到想放的地方' : '還沒有家具，到百寶屋的「🏡 家具」買吧！';

  return (
    <div className="decor-bag card" role="dialog" aria-label="家具包" data-testid="decor-bag">
      <div className="decor-bag-head">
        <span className={`decor-hint ${picking && problem ? 'bad' : ''}`} role="status" data-testid="decor-hint">
          🎒 {hint}
        </span>
        {picking && (
          <>
            <button className="btn small white" onClick={() => rotateGhost()} aria-label="轉方向" data-testid="decor-ghost-rotate">
              🔄
            </button>
            <button
              className="btn small green"
              disabled={!!problem}
              onClick={() => {
                if (placeFront()) sfx.coin();
              }}
              data-testid="decor-place"
            >
              ⬇️ 放下
            </button>
          </>
        )}
        <button
          className="btn small white"
          onClick={() => {
            sfx.tap();
            toggleBag(false);
          }}
          aria-label="關上家具包"
          data-testid="decor-close"
        >
          ✕
        </button>
      </div>
      {hasAny && (
        <div className="decor-bag-items">
          {FURNITURE.filter((f) => owned[f.id]).map((f) => {
            const n = left[f.id] ?? 0;
            return (
              <button
                key={f.id}
                className={`decor-bag-item ${picking === f.id ? 'on' : ''}`}
                disabled={n <= 0}
                onClick={() => {
                  sfx.tap();
                  pickDecor(f.id);
                }}
                aria-label={`${f.name}，還有 ${n} 個`}
                data-testid={`decor-pick-${f.id}`}
              >
                <span className="icon">{f.emoji}</span>
                <span className="name">{f.name}</span>
                <span className="count">× {n}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 角色旁邊有擺好的家具（沒選家具時）：轉方向、收起來 */
export function DecorNear() {
  const near = useDecor((s) => s.near);
  const picking = useDecor((s) => s.picking);
  const bagOpen = useDecor((s) => s.bagOpen);
  if (!near || picking) return null;
  const item = findItem(near.id);
  return (
    <div className={`decor-near card ${bagOpen ? 'over-bag' : ''}`} role="group" aria-label="旁邊的家具" data-testid="decor-near">
      <span className="decor-near-name">
        {item?.emoji} {item?.name}
      </span>
      <button
        className="btn small"
        onClick={() => {
          sfx.tap();
          rotateNear();
        }}
        data-testid="decor-near-rotate"
      >
        🔄 轉方向
      </button>
      <button
        className="btn small white"
        onClick={() => {
          sfx.tap();
          pickUpNear();
        }}
        data-testid="decor-near-pickup"
      >
        👜 收起來
      </button>
    </div>
  );
}
