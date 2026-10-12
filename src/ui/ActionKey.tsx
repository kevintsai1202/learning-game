/**
 * 手機的大動作鍵（自己的家第 10.2 節，docs/plans/home.md）：右下一顆大鍵（像手機遊戲的 A 鍵），左手搖桿、右手按。
 * 看情況顯示一個主要動作與旁邊的小圓鈕，上面一行小字寫是什麼；順序與規則在 src/ui/actionKeyRules.ts。
 * 按鈕的 data-testid 和電腦版的泡泡、卡片一樣（enter-zone、enter-home、leave-home、use-furniture、use-stop、
 * decor-place、decor-ghost-rotate、decor-near-rotate、decor-near-pickup），外框是 door-bubble、home-door-bubble、
 * home-mat-bubble、decor-near、use-card，佈置中是 decor-place-key（只有手機有）。
 */
import { useGame } from '../store/useGame';
import { useUi } from '../store/useUi';
import { useDecor, frontProblem, pickUpNear, placeFront, rotateGhost, rotateNear } from '../store/useDecor';
import { actingLook, cellKey, stopUse, useFurnitureUse, type Place } from '../store/useFurnitureUse';
import { rideFull, startRide, useRides } from '../store/useRides';
import { grandBlock, grandWait, startGrand, useGrand } from '../store/useGrand';
import { GRAND_LOOK } from '../store/grandRides';
import { useSecondTick } from './useSecondTick';
import { RIDES } from '../store/playground';
import { enterHome, isInsideHome, leaveHome, useHome } from '../store/useHome';
import { useSpecOf } from '../store/furnitureUse';
import { findItem } from '../store/catalog';
import { zoneById } from '../world/layout';
import { pickAction, type MainAction, type SecondaryAction } from './actionKeyRules';
import { operateFurniture } from './DecorBag';
import { nextCamView } from './CamButtons';
import { sfx } from '../audio/sfx';

/** 主要動作的 data-testid */
const MAIN_TESTID: Record<MainAction, string> = {
  place: 'decor-place',
  stop: 'use-stop',
  enterZone: 'enter-zone',
  enterHome: 'enter-home',
  leaveHome: 'leave-home',
  use: 'use-furniture',
  rotate: 'decor-near-rotate',
  view: 'cam-view',
  ride: 'ride-start',
  grand: 'grand-start',
};

/** 小圓鈕：圖示、說明、data-testid */
const SECONDARY: Record<SecondaryAction, { icon: string; label: string; testid: string }> = {
  ghostRotate: { icon: '🔄', label: '轉方向', testid: 'decor-ghost-rotate' },
  rotate: { icon: '🔄', label: '轉方向', testid: 'decor-near-rotate' },
  pickup: { icon: '👜', label: '收起來', testid: 'decor-near-pickup' },
  view: { icon: '🎥', label: '換視角', testid: 'cam-view' },
};

/** 旁邊的家具轉方向：轉了「喀」一聲；轉不過去（旁邊太擠）是「喔喔」，提示顯示在大鍵上面 */
function turnNear(): void {
  if (rotateNear()) sfx.rotate();
  else sfx.oops();
}

export function ActionKey() {
  const picking = useDecor((s) => s.picking);
  const decorNear = useDecor((s) => s.near);
  const notice = useDecor((s) => s.notice);
  // 面前的格子、擺設變了要重算能不能放
  useDecor((s) => s.front);
  useGame((s) => s.profile());
  const acting = useFurnitureUse((s) => s.acting);
  const useNear = useFurnitureUse((s) => s.near);
  const toggles = useFurnitureUse((s) => s.toggles);
  const nearZone = useUi((s) => s.nearZone);
  const nearDoor = useHome((s) => s.nearDoor);
  const onMat = useHome((s) => s.onMat);
  const inside = useHome((s) => s.inside !== null && s.inside === s.houseKey);
  const houseName = useHome((s) => s.houseName);
  /** 旁邊的班級島遊樂器材（docs/plans/playground.md） */
  const rideSlot = useRides((s) => s.near);
  const rideKind = useRides((s) => (s.near === null ? null : s.playground[s.near]));
  // 別人上下車時重算坐滿了沒
  useRides((s) => s.riders);
  /** 旁邊的班級島大型設施（docs/plans/grand-rides.md）；別人上下車時重算坐滿了沒 */
  const grandNear = useGrand((s) => s.near);
  useGrand((s) => s.riders);
  // 班次的倒數每半秒重畫（旁邊有大型設施、正在等出發時）
  useSecondTick(grandNear !== null || acting?.kind === 'grand');

  // 旁邊的家具：自己能佈置的地方的家具優先（可以轉方向、收起來），不然是旁邊可以用的家具
  const place: Place = isInsideHome() ? 'home' : 'yard';
  const nearTarget = decorNear ? { item: decorNear, place } : useNear;
  const nearItem = nearTarget ? findItem(nearTarget.item.id) : undefined;
  const nearSpec = nearTarget ? useSpecOf(nearTarget.item.id) : undefined;
  const nearOn = nearTarget ? !!toggles[cellKey(nearTarget.place, nearTarget.item)] : false;
  const actingLooks = acting ? actingLook(acting) : null;
  const zone = nearZone ? zoneById(nearZone) : null;

  const view = pickAction({
    picking: picking ? { name: findItem(picking)?.name ?? '', problem: frontProblem() } : null,
    acting: acting && actingLooks ? { kind: acting.kind, name: actingLooks.name, emoji: actingLooks.emoji, locked: actingLooks.locked, wait: grandWait() } : null,
    ride: rideSlot !== null && rideKind ? { name: RIDES[rideKind].name, emoji: RIDES[rideKind].emoji, label: RIDES[rideKind].label, full: rideFull(rideSlot) } : null,
    grand: grandNear ? { ...GRAND_LOOK[grandNear], blocked: grandBlock(grandNear, { free: false }) } : null,
    zone: zone ? { name: zone.name, icon: zone.icon } : null,
    houseDoor: nearDoor && !inside ? { name: houseName ?? '' } : null,
    onMat: inside && onMat,
    near:
      nearTarget && nearItem
        ? {
            name: nearItem.name,
            emoji: nearItem.emoji,
            use: nearSpec ? (nearOn && nearSpec.offLabel ? nearSpec.offLabel : nearSpec.label) : null,
            decor: !!decorNear,
            notice: decorNear ? notice : null,
          }
        : null,
  });
  if (!view) return null;

  /** 按主要動作 */
  const doMain = () => {
    switch (view.main) {
      case 'place':
        if (placeFront()) sfx.place();
        return;
      case 'stop':
        sfx.tap();
        stopUse();
        return;
      case 'enterZone':
        if (!nearZone) return;
        sfx.door();
        useUi.getState().enterZone(nearZone);
        return;
      case 'enterHome':
        sfx.door();
        enterHome();
        return;
      case 'leaveHome':
        sfx.door();
        leaveHome();
        return;
      case 'use':
        if (nearTarget) operateFurniture(nearTarget.item, nearTarget.place);
        return;
      case 'rotate':
        turnNear();
        return;
      case 'view':
        nextCamView();
        return;
      case 'ride':
        if (rideSlot !== null && startRide(rideSlot)) sfx.tap();
        return;
      case 'grand':
        if (grandNear && startGrand(grandNear, { free: false })) sfx.tap();
        return;
    }
  };
  /** 按小圓鈕 */
  const doSecondary = (a: SecondaryAction) => {
    if (a === 'ghostRotate') {
      sfx.rotate();
      rotateGhost();
    } else if (a === 'rotate') {
      turnNear();
    } else if (a === 'view') {
      nextCamView();
    } else {
      sfx.pickup();
      pickUpNear();
    }
  };

  return (
    <div className="action-key-wrap" role="group" aria-label={view.caption} data-testid={view.container}>
      {/* 上面一行小字只有警告時才顯示（不能放的原因）；鍵上已經寫了是什麼 */}
      {view.showCaption && (
        <span className="action-caption bad" role="status">
          {view.caption}
        </span>
      )}
      <div className="action-row">
        {/* 小圓鈕：直式手機在大鍵上面、橫式在大鍵左邊（大鍵的字長時往左變寬，直式才不會壓到搖桿） */}
        {view.secondary.length > 0 && (
          <div className="action-subs">
            {view.secondary.map((a) => (
              <button key={a} className="btn white action-sub" onClick={() => doSecondary(a)} aria-label={SECONDARY[a].label} title={SECONDARY[a].label} data-testid={SECONDARY[a].testid}>
                {SECONDARY[a].icon}
              </button>
            ))}
          </div>
        )}
        <button className="btn green action-key" disabled={view.disabled} onClick={doMain} data-testid={MAIN_TESTID[view.main]}>
          {view.label}
        </button>
      </div>
    </div>
  );
}
