/**
 * 用家具在 3D 場景裡的部分（自己的家第 9 節優化；島嶼與屋子共用）：
 * - UseProbe：每一格畫面找角色旁邊可以用的家具（用的時候凍結），並把 player.act 同步給畫面。
 * - useLiveMap：這個地方正在用的家具（開關開著、沙堡、有人在盪的鞦韆），給 YardDecor 另外畫。
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { player } from './input';
import { nearestUsable } from '../store/furnitureUse';
import { setUseNear, spaceOf, syncActMirror, useFurnitureUse, type Place } from '../store/useFurnitureUse';
import type { YardItem } from '../store/yard';
import type { LiveState } from './Furniture';

/** 每一格畫面：同步 player.act、找旁邊可以用的家具（不能操作或正在用時不換）；卸下時清掉 */
export function UseProbe({ items, place, active }: { items: readonly YardItem[]; place: Place; active: boolean }) {
  const space = spaceOf(place);
  useFrame(() => {
    syncActMirror();
    if (player.act) return;
    const it = active ? nearestUsable(items, player.pos, space) : null;
    setUseNear(it ? { item: it, place } : null);
  });
  useEffect(() => () => setUseNear(null), []);
  return null;
}

/** 這個地方正在用的家具："gx,gz" → 開著（開關、沙堡）、在盪（鞦韆開始的時間） */
export function useLiveMap(place: Place): Record<string, LiveState> {
  const toggles = useFurnitureUse((s) => s.toggles);
  const swingers = useFurnitureUse((s) => s.swingers);
  return useMemo(() => {
    const out: Record<string, LiveState> = {};
    const prefix = `${place}:`;
    for (const [key, on] of Object.entries(toggles)) if (on && key.startsWith(prefix)) out[key.slice(prefix.length)] = { on: true };
    for (const s of Object.values(swingers)) if (s.cell.startsWith(prefix)) out[s.cell.slice(prefix.length)] = { ...out[s.cell.slice(prefix.length)], swingT0: s.t0 };
    return out;
  }, [toggles, swingers, place]);
}
