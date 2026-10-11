/**
 * 動森做法的佈置在 3D 場景裡的部分（自己的家，docs/plans/home.md 第 7、8 節；島嶼與屋子共用）：
 * - 每一格畫面算角色面前的那一格、面向的四個方向與旁邊最靠近的家具（有變才更新 useDecor）。
 * - 選著家具時，面前出現預覽（多格的家具從面前那一格往面向展開，第 10.3 節；能不能放和家具包的提示同一個判斷 frontProblem）。
 * 卸下時（離開自己的島、進出屋、換畫面）關上家具包。space 是島上（YARD_SPACE）或屋裡（HOME_SPACE）。
 */
import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { DecorGhost } from './Furniture';
import { player } from './input';
import { facingOf, frontCell, type DecorSpace } from '../store/yard';
import { frontAnchor, frontProblem, resetDecor, updateDecorSpot, useDecor } from '../store/useDecor';
import { useGame } from '../store/useGame';

export function DecorLayer({ space }: { space: DecorSpace }) {
  const picking = useDecor((s) => s.picking);
  const ghostRot = useDecor((s) => s.ghostRot);
  // 面前的格子或面向變了要重算預覽的位置
  useDecor((s) => s.front);
  useDecor((s) => s.facing);
  // 擺設變了（放下、收起來）要重算預覽能不能放
  useGame((s) => s.profile());
  useFrame(() => {
    updateDecorSpot(frontCell(player.pos, player.heading, space), player.pos, facingOf(player.heading));
  });
  useEffect(() => () => resetDecor(), []);
  const anchor = frontAnchor();
  if (!picking || !anchor) return null;
  return <DecorGhost id={picking} gx={anchor.gx} gz={anchor.gz} rot={ghostRot} ok={frontProblem() === null} space={space} />;
}
