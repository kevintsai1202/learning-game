/**
 * 別人的島的院子與房間（自己的家，docs/plans/home.md 第 3.6、8 節）：孩子去朋友的島、熊熊老師去孩子的島時，
 * 伺服器在 welcome 給島主的院子與房間，島主改了再送 yard、home。孩子的連線（realtimeClient.ts）與熊熊老師的連線（gmClient.ts）都寫這裡。
 * 畫面的單一來源：自己的島讀本機存檔，別人的島讀這裡（shownYard、shownHome）。
 */
import { create } from 'zustand';
import type { ServerMessage } from './realtime';
import type { YardItem } from '../store/yard';
import { homeOf, type HomeState } from '../store/home';

/** 伺服器給的島主院子與房間（班級島、沒連線是 null；舊版伺服器沒有房間也是 null） */
export const useHostYard = create<{ items: YardItem[] | null; home: HomeState | null }>(() => ({ items: null, home: null }));

/** 即時連線收到的訊息：welcome 換成這座島的島主院子與房間（班級島沒有，變成 null）；yard、home 是島主改了 */
export function applyHostYard(msg: ServerMessage): void {
  if (msg.t === 'welcome') useHostYard.setState({ items: msg.yard ?? null, home: msg.home ?? null });
  else if (msg.t === 'yard') useHostYard.setState({ items: msg.items });
  else if (msg.t === 'home') useHostYard.setState({ home: msg.home });
}

/** 斷線、離開：清掉 */
export function clearHostYard(): void {
  useHostYard.setState({ items: null, home: null });
}

/** 屋裡要畫哪一份房間：在別人的島上畫伺服器給的（舊版伺服器沒給是空房間）；在自己的島上畫本機存檔的 */
export function shownHome(where: { visiting: boolean; local: HomeState | undefined; host: HomeState | null }): HomeState {
  return where.visiting ? (where.host ?? homeOf({})) : homeOf({ home: where.local });
}

/**
 * 島上要畫哪一份院子：在別人的島上（拜訪朋友、熊熊老師去孩子的島）畫伺服器給的；在自己的島上畫本機存檔的；
 * 班級島沒有院子（null）
 */
export function shownYard(where: { ownIsland: boolean; visiting: boolean; local: YardItem[] | undefined; host: YardItem[] | null }): YardItem[] | null {
  if (where.visiting) return where.host;
  return where.ownIsland ? (where.local ?? []) : null;
}
