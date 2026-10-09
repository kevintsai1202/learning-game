/**
 * 和朋友益智對戰的規則（純函式，島嶼互訪 I4）。
 * 伺服器不懂遊戲規則，只把兩邊的動作排好先後、依同一個順序送給兩個人；兩台裝置用同一個種子出同一局，
 * 依序把動作套進這裡的函式，算出的狀態一樣。自己是 kid、對方是 bot（沿用和機器人比賽的狀態與畫面），
 * 所以同一串動作在兩邊的視角互為鏡像。規格見 docs/plans/islands.md 第 12 節「I4 實作設計」。
 */
import { TANGRAM_PIECES } from './tangram';
import { duelAnswer, duelNext, startDuel, type DuelState } from './quizBattle';
import { flipCard, settle, startMemory, type MemoryDeck, type MemoryState } from './memory';

/** 動作是誰做的：自己（kid）或朋友（bot） */
export type DuelSide = 'kid' | 'bot';

/**
 * 動作的種類：pick 作答（i 第幾題、n 選項）、ready 看完這一題的結果（i 第幾題）、flip 翻牌（i 第幾張）、
 * claim 找到一處（i 第幾處）、time 時間到、progress 放好幾塊（n）、done 拼完
 */
export const DUEL_MOVE_KINDS = ['pick', 'ready', 'flip', 'claim', 'time', 'progress', 'done'] as const;
export type DuelMoveKind = (typeof DUEL_MOVE_KINDS)[number];

/** 伺服器排好順序的一則動作（by 已經換成這台裝置的視角） */
export interface DuelEvent {
  by: DuelSide;
  k: DuelMoveKind;
  i?: number;
  n?: number;
}

/** 依序套用一串動作 */
export function foldDuel<S>(events: readonly DuelEvent[], init: S, step: (s: S, e: DuelEvent) => S): S {
  return events.reduce(step, init);
}

// ---------- 搶答（益智搶答、積木大師） ----------

/** 搶答的狀態：比賽進度，加上這一題兩邊選了哪一個（和機器人比賽的畫面狀態同樣的形狀） */
export interface FriendDuelView {
  duel: DuelState;
  kidPick: number | null;
  botPick: number | null;
}

export function startFriendDuel(): FriendDuelView {
  return { duel: startDuel(), kidPick: null, botPick: null };
}

/**
 * 搶答的一則動作：pick 先收到的答對得分、答錯的人這一題不能再答（同和機器人比賽）；
 * 這一題有結果後第一個 ready 就換下一題（等兩個都到的話，一邊切到背景就會卡住對方）。不是這一題的動作不算。
 */
export function friendDuelStep(s: FriendDuelView, e: DuelEvent, answerOf: (index: number) => number, total: number): FriendDuelView {
  if (e.i !== s.duel.index) return s;
  if (e.k === 'pick') {
    if (e.n === undefined) return s;
    const duel = duelAnswer(s.duel, e.by, e.n === answerOf(e.i));
    if (duel === s.duel) return s;
    return e.by === 'kid' ? { ...s, duel, kidPick: e.n } : { ...s, duel, botPick: e.n };
  }
  if (e.k === 'ready') {
    const duel = duelNext(s.duel, total);
    return duel === s.duel ? s : { duel, kidPick: null, botPick: null };
  }
  return s;
}

// ---------- 記憶翻牌 ----------

/** 開局：邀請的人先翻（被邀請的人那一邊是 bot 先翻） */
export function startFriendMemory(deck: MemoryDeck, first: DuelSide): MemoryState {
  return { ...startMemory(deck, 'vs'), turn: first };
}

/**
 * 翻一張牌：桌上還開著兩張不同對的牌時，先蓋回去、換人（兩邊在同一則動作蓋回，不靠各自的計時器），
 * 再照和機器人比賽的規則翻（沒輪到、已經配對、已經翻開的不算）
 */
export function friendMemoryStep(s: MemoryState, e: DuelEvent): MemoryState {
  if (e.k !== 'flip' || e.i === undefined) return s;
  const ready = s.open.length >= 2 ? settle(s) : s;
  return flipCard(ready, e.i, e.by);
}

// ---------- 找不同 ----------

/** 找不同的狀態：每一處被誰找到、結束了沒（全部找到或有一邊時間到） */
export interface FriendSpotState {
  found: (DuelSide | null)[];
  done: boolean;
}

export function startFriendSpot(total: number): FriendSpotState {
  return { found: Array.from({ length: total }, () => null), done: false };
}

/** claim 先收到的算他的；第一個 time 就結束（之後的 claim 不算，兩邊的結果才一樣） */
export function friendSpotStep(s: FriendSpotState, e: DuelEvent): FriendSpotState {
  if (s.done) return s;
  if (e.k === 'time') return { ...s, done: true };
  if (e.k !== 'claim' || e.i === undefined || e.i < 0 || e.i >= s.found.length || s.found[e.i]) return s;
  const found = s.found.slice();
  found[e.i] = e.by;
  return { found, done: found.every((f) => f !== null) };
}

// ---------- 七巧板 ----------

/** 七巧板的狀態：朋友放好幾塊（自己的在畫面上）、誰先拼完 */
export interface FriendTangramState {
  botPlaced: number;
  winner: DuelSide | null;
}

export function startFriendTangram(): FriendTangramState {
  return { botPlaced: 0, winner: null };
}

/** progress 更新朋友的進度（自己的不記）；第一個 done 的人贏，之後的動作不算 */
export function friendTangramStep(s: FriendTangramState, e: DuelEvent): FriendTangramState {
  if (s.winner) return s;
  if (e.k === 'done') return { botPlaced: e.by === 'bot' ? TANGRAM_PIECES.length : s.botPlaced, winner: e.by };
  if (e.k !== 'progress' || e.by !== 'bot' || e.n === undefined) return s;
  return { ...s, botPlaced: Math.max(0, Math.min(TANGRAM_PIECES.length, Math.floor(e.n))) };
}
