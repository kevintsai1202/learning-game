/**
 * 在島上與屋裡直接佈置（自己的家，docs/plans/home.md 第 7、8 節）：動森做法的家具包與旁邊家具的按鈕。
 * - DecorBag：「🎒 家具」打開的家具包（底部，留出左下的搖桿）。選一樣家具，角色面前那一格出現預覽，
 *   按「⬇️ 放下」擺好（可以先「🔄」轉方向）；不能放時說原因。
 * - DecorNear：沒選家具時，角色旁邊有擺好的家具就出現「🔄 轉方向」「👜 收起來」。
 * - SurfacePanel：在自己的屋裡按「🎨 壁紙地板」打開，選擁有的壁紙與地板（第二期）。
 * 每種家具剩幾個是島上加屋裡一起算。規則在 src/store/yard.ts、home.ts，狀態與動作在 src/store/useDecor.ts。
 */
import { useEffect } from 'react';
import { useGame } from '../store/useGame';
import { FURNITURE, findItem } from '../store/catalog';
import { ownedDecor } from '../store/yard';
import {
  chooseSurface,
  frontProblem,
  pickDecor,
  pickUpNear,
  placeFront,
  remainingAll,
  rotateGhost,
  rotateNear,
  surfaceChoices,
  toggleBag,
  toggleSurface,
  useDecor,
} from '../store/useDecor';
import { useHome } from '../store/useHome';
import { DECOR_LINES } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';

export function DecorBag() {
  const bagOpen = useDecor((s) => s.bagOpen);
  const picking = useDecor((s) => s.picking);
  // 面前的格子變了、擺設變了、進出屋，都要重算能不能放與剩幾個
  useDecor((s) => s.front);
  useHome((s) => s.inside);
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
  const left = remainingAll();
  const problem = frontProblem();
  const hint = picking
    ? (problem ?? `按「放下」，把${findItem(picking)?.name ?? ''}擺在面前`)
    : hasAny
      ? '選一樣家具，再走到想放的地方'
      : '還沒有家具，到百寶屋的「🏡 家具」或「🛋️ 室內」買吧！';

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

/**
 * 壁紙地板面板（只在自己的屋裡）：擁有的壁紙與地板排成一排（和家具包一樣高，不會蓋到右邊的公頻），
 * 點了就換；現在用的標 on
 */
export function SurfacePanel() {
  const open = useDecor((s) => s.surfaceOpen);
  // 換了壁紙地板、買了新的都要重畫
  useGame((s) => s.profile());
  if (!open) return null;
  const c = surfaceChoices();
  /** 一組選項（前面寫是壁紙還是地板） */
  const group = (label: string, list: typeof c.walls, now: string, kind: 'wall' | 'floor') => (
    <>
      <span className="surface-row-label">{label}</span>
      {list.map((it) => (
        <button
          key={it.id}
          className={`decor-bag-item ${now === it.id ? 'on' : ''}`}
          onClick={() => {
            sfx.tap();
            chooseSurface(it.id);
          }}
          aria-label={`${label}：${it.name}`}
          aria-pressed={now === it.id}
          data-testid={`surface-${kind}-${it.id}`}
        >
          <span className="icon">{it.emoji}</span>
          <span className="name">{it.name}</span>
        </button>
      ))}
    </>
  );
  return (
    <div className="decor-bag card surface-panel" role="dialog" aria-label="壁紙地板" data-testid="surface-panel">
      <div className="decor-bag-head">
        <span className="decor-hint">🎨 選壁紙和地板（百寶屋的「🛋️ 室內」可以買更多）</span>
        <button
          className="btn small white"
          onClick={() => {
            sfx.tap();
            toggleSurface(false);
          }}
          aria-label="關上壁紙地板"
          data-testid="surface-close"
        >
          ✕
        </button>
      </div>
      <div className="decor-bag-items surface-row">
        {group('壁紙', c.walls, c.wall, 'wall')}
        {group('地板', c.floors, c.floor, 'floor')}
      </div>
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
