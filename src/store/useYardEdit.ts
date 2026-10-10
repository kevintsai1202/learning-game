/**
 * 佈置模式（自己的家第一期，docs/plans/home.md 第 3.4 節）的狀態：正在佈置時是 YardEdit，不在佈置是 null。
 * 規則在 src/store/yard.ts 的 editYard（純函式）；這裡只接上存檔（擁有的家具、完成時存院子）。
 * 畫面在佈置時：島上畫 edit.items、地上畫格子；點地面不走路，改成點格子。e2e 透過 window.__game.yard 操作。
 */
import { create } from 'zustand';
import { useGame } from './useGame';
import { cellToWorld, editYard, ownedDecor, startEdit, yardCells, type YardEdit, type YardEditAction } from './yard';
import { useHostYard } from '../online/useHostYard';

export const useYardEdit = create<{ edit: YardEdit | null }>(() => ({ edit: null }));

/** 開始佈置（從角色目前的院子） */
export function startDecorating(): void {
  const p = useGame.getState().profile();
  if (!p) return;
  useYardEdit.setState({ edit: startEdit(p.yard ?? []) });
}

/** 佈置模式的一個動作（選家具、點格子、轉方向、移動、收起來） */
export function decorAct(a: YardEditAction): void {
  const { edit } = useYardEdit.getState();
  const p = useGame.getState().profile();
  if (!edit || !p) return;
  useYardEdit.setState({ edit: editYard(edit, a, ownedDecor(p)) });
}

/** 完成：存院子（雲端角色送 yard 操作，一秒後同步，來玩的朋友就看到） */
export function finishDecorating(): void {
  const { edit } = useYardEdit.getState();
  if (!edit) return;
  useGame.getState().saveYard(edit.items);
  useYardEdit.setState({ edit: null });
}

/** 取消：放棄這次的改動 */
export function cancelDecorating(): void {
  useYardEdit.setState({ edit: null });
}

/** e2e 用（window.__game.yard）：院子的格子與世界座標、佈置模式的狀態與動作、別人的島的院子 */
export const yardDebug = {
  cells: yardCells,
  world: cellToWorld,
  host: useHostYard,
  store: useYardEdit,
  start: startDecorating,
  act: decorAct,
  finish: finishDecorating,
  cancel: cancelDecorating,
};
