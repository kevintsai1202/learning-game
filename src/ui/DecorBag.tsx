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
import { isInsideHome, useHome } from '../store/useHome';
import { cellKey, startUse, stopUse, useFurnitureUse, type Place } from '../store/useFurnitureUse';
import { useSpecOf } from '../store/furnitureUse';
import { resetDecor } from '../store/useDecor';
import { DECOR_LINES } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';
import { CamViewButton } from './CamButtons';

/** 家具包；compact（手機）：「放下」「轉方向」在右下的大動作鍵，條上只放家具與關上 */
export function DecorBag({ compact = false }: { compact?: boolean }) {
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
  // 提示只有一行（加注音也不會折成好幾行）：選著家具時是「放下○○」或不能放的原因
  const hint = picking ? (problem ?? `放下${findItem(picking)?.name ?? ''}`) : hasAny ? '選一樣家具' : '到百寶屋買家具';

  return (
    <div className="decor-bag card" role="dialog" aria-label="家具包" data-testid="decor-bag">
      {/* 手機（compact）選著家具時，提示在右下大動作鍵上面，這裡不重複 */}
      {!(compact && picking) && (
        <span className={`decor-hint ${picking && problem ? 'bad' : ''}`} role="status" data-testid="decor-hint">
          🎒 {hint}
        </span>
      )}
      <div className="decor-bag-row">
        <div className="decor-bag-items">
          {FURNITURE.filter((f) => owned[f.id]).map((f) => {
            const n = left[f.id] ?? 0;
            const on = picking === f.id;
            return (
              <button
                key={f.id}
                className={`decor-bag-item ${on ? 'on' : ''}`}
                disabled={n <= 0}
                onClick={() => {
                  sfx.tap();
                  pickDecor(f.id);
                }}
                aria-label={`${f.name}，還有 ${n} 個`}
                title={f.name}
                data-testid={`decor-pick-${f.id}`}
              >
                <span className="icon">{f.emoji}</span>
                {/* 名字只有選著的那一個顯示（條才夠細） */}
                {on && <span className="name">{f.name}</span>}
                <span className="count">× {n}</span>
              </button>
            );
          })}
        </div>
        <div className="decor-bag-actions">
          {picking && !compact && (
            <>
              <button
                className="btn white decor-round"
                onClick={() => {
                  sfx.rotate();
                  rotateGhost();
                }}
                aria-label="轉方向"
                title="轉方向"
                data-testid="decor-ghost-rotate"
              >
                🔄
              </button>
              <button
                className="btn green decor-place-btn"
                disabled={!!problem}
                onClick={() => {
                  if (placeFront()) sfx.place();
                }}
                data-testid="decor-place"
              >
                ⬇️ 放下
              </button>
            </>
          )}
          <button
            className="btn white decor-round"
            onClick={() => {
              sfx.tap();
              toggleBag(false);
            }}
            aria-label="關上家具包"
            title="關上"
            data-testid="decor-close"
          >
            ✕
          </button>
        </div>
      </div>
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
          {now === it.id && <span className="name">{it.name}</span>}
        </button>
      ))}
    </>
  );
  return (
    <div className="decor-bag card surface-panel" role="dialog" aria-label="壁紙地板" data-testid="surface-panel">
      <span className="decor-hint">🎨 選壁紙和地板</span>
      <div className="decor-bag-row">
        <div className="decor-bag-items surface-row">
          {group('壁紙', c.walls, c.wall, 'wall')}
          {group('地板', c.floors, c.floor, 'floor')}
        </div>
        <div className="decor-bag-actions">
          <button
            className="btn white decor-round"
            onClick={() => {
              sfx.tap();
              toggleSurface(false);
            }}
            aria-label="關上壁紙地板"
            title="關上"
            data-testid="surface-close"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 用一件家具（坐、躺、盪、溜滑梯、開關、沙堡）：坐上去時關上家具包；鋼琴彈一段。
 * 開關與沙堡的音效照打開或關上換（坐、躺、溜滑梯、盪鞦韆的音效由角色的時間軸放，見 src/world/actSounds.ts）
 */
export function operateFurniture(item: { id: string; gx: number; gz: number; rot: 0 | 1 | 2 | 3 }, place: Place): void {
  const kind = startUse(item, place);
  if (kind === 'toggle' || kind === 'sandcastle') {
    const on = !!useFurnitureUse.getState().toggles[cellKey(place, item)];
    if (kind === 'sandcastle') sfx.sand(on);
    else if (item.id === 'decor.tv') sfx.tv(on);
    else sfx.toggle(on);
    return;
  }
  resetDecor();
  if (kind === 'piano') sfx.piano();
}

/**
 * 角色旁邊的家具卡片：
 * - 正在用（坐、躺、盪、溜滑梯）：「⬆️ 起來」（溜滑梯途中沒有，溜完自己起來）。
 * - 自己能佈置的地方、旁邊有擺好的家具（沒選家具時）：可以用的話「使用」，加「🔄 轉方向」「👜 收起來」。
 * - 其他地方（朋友的島、屋裡、熊熊老師）旁邊有可以用的家具：「使用」。
 */
export function DecorNear() {
  const near = useDecor((s) => s.near);
  /** 轉不過去的提示（第 10.3 節） */
  const notice = useDecor((s) => s.notice);
  const picking = useDecor((s) => s.picking);
  const bagOpen = useDecor((s) => s.bagOpen);
  const useNear = useFurnitureUse((s) => s.near);
  const acting = useFurnitureUse((s) => s.acting);
  const toggles = useFurnitureUse((s) => s.toggles);
  useHome((s) => s.inside);
  if (acting) {
    const it = findItem(acting.item.id);
    return (
      <div className="decor-near card" role="group" aria-label="正在用的家具" data-testid="use-card">
        <span className="decor-near-name">
          {it?.emoji} {it?.name}
        </span>
        {acting.kind !== 'slide' && (
          <button
            className="btn small"
            onClick={() => {
              sfx.tap();
              stopUse();
            }}
            data-testid="use-stop"
          >
            ⬆️ 起來
          </button>
        )}
        {/* 換視角（第 10.5 節；溜滑梯途中也可以） */}
        <CamViewButton />
      </div>
    );
  }
  if (picking) return null;
  // 自己能佈置的地方的家具（在屋裡就是房間）；不然是旁邊可以用的家具
  const target = near ? { item: near, place: (isInsideHome() ? 'home' : 'yard') as Place } : useNear;
  if (!target) return null;
  const item = findItem(target.item.id);
  const spec = useSpecOf(target.item.id);
  const on = toggles[cellKey(target.place, target.item)];
  const useButton = spec && (
    <button
      className="btn small green"
      onClick={() => operateFurniture(target.item, target.place)}
      data-testid="use-furniture"
    >
      {on && spec.offLabel ? spec.offLabel : spec.label}
    </button>
  );
  if (!near)
    return (
      <div className="decor-near card" role="group" aria-label="旁邊的家具" data-testid="use-card">
        <span className="decor-near-name">
          {item?.emoji} {item?.name}
        </span>
        {useButton}
      </div>
    );
  return (
    <div className={`decor-near card ${bagOpen ? 'over-bag' : ''}`} role="group" aria-label="旁邊的家具" data-testid="decor-near">
      <span className="decor-near-name">
        {item?.emoji} {item?.name}
      </span>
      {notice && (
        <span className="decor-near-notice" role="status" data-testid="decor-notice">
          {notice}
        </span>
      )}
      {useButton}
      <button
        className="btn small"
        onClick={() => {
          if (rotateNear()) sfx.rotate();
          else sfx.oops();
        }}
        aria-label="轉方向"
        title="轉方向"
        data-testid="decor-near-rotate"
      >
        🔄<span className="btn-label"> 轉方向</span>
      </button>
      <button
        className="btn small white"
        onClick={() => {
          sfx.pickup();
          pickUpNear();
        }}
        aria-label="收起來"
        title="收起來"
        data-testid="decor-near-pickup"
      >
        👜<span className="btn-label"> 收起來</span>
      </button>
    </div>
  );
}
