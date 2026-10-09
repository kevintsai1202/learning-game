/**
 * 裝置端的和朋友益智對戰（島嶼互訪 I4）：送出與收到的邀請、進行中的一局（伺服器排好順序的動作），
 * 以及送對戰訊息的函式。即時連線（realtimeClient.ts）收到對戰訊息時交給 handleDuelMessage，並提供送訊息的函式。
 * 各遊戲把 live.events 依序套進 src/engine/puzzle/friend.ts 的規則算出畫面。規格見 docs/plans/islands.md 第 12 節。
 */
import { create } from 'zustand';
import type { ServerMessage } from './realtime';
import type { Screen } from '../store/useUi';
import { useUi } from '../store/useUi';
import type { PuzzleGameId } from '../store/puzzle';
import type { BotLevel } from '../engine/puzzle/common';
import type { DuelEvent, DuelSide } from '../engine/puzzle/friend';
import type { DuelDeclineReason, DuelMoveKind } from '../engine/puzzle/duelMoves';
import { duelCheck } from '../puzzle/friendRound';
import { usePuzzleNow } from '../puzzle/now';
import type { RemoteMember } from './presence';
import { DUEL_LINES } from '../ui/lines';

/** 收到、還沒回覆的邀請：誰（他在這座島上的名字）、哪一局 */
export interface DuelInviteIn {
  from: string;
  name: string;
  game: PuzzleGameId;
  level: BotLevel;
  seed: number;
  check: string;
}

/** 自己送出、等對方回覆的邀請 */
export interface DuelInviteOut {
  to: string;
  name: string;
  game: PuzzleGameId;
  level: BotLevel;
  seed: number;
  check: string;
}

/** 進行中的一局：first 是誰先手（自己的視角）；events 是伺服器排好順序的動作；end 是對方離開（left、gone）或自己斷線（lost） */
export interface LiveDuel {
  id: string;
  game: PuzzleGameId;
  level: BotLevel;
  seed: number;
  first: DuelSide;
  opponent: { id: string; name: string };
  events: DuelEvent[];
  end: null | 'left' | 'gone' | 'lost';
}

/** 邀請的結果（畫面顯示一次）：被拒絕、沒有回應、按了接受之後邀請取消了 */
export type DuelNote =
  | { kind: 'declined'; name: string; reason: DuelDeclineReason | 'gone' }
  | { kind: 'noAnswer'; name: string }
  | { kind: 'cancelled'; name: string };

export interface FriendDuelState {
  incoming: DuelInviteIn | null;
  outgoing: DuelInviteOut | null;
  /** 按了接受、等伺服器開局 */
  joining: { from: string; name: string } | null;
  live: LiveDuel | null;
  note: DuelNote | null;
}

export const emptyDuel = (): FriendDuelState => ({ incoming: null, outgoing: null, joining: null, live: null, note: null });

export const useFriendDuel = create<FriendDuelState>(emptyDuel);

/** 邀請多久沒有回應就取消（毫秒） */
export const INVITE_TIMEOUT_MS = 30_000;

/** 伺服器的對戰訊息怎麼改狀態（純函式）；selfId 是自己的成員 id（判斷動作是誰做的） */
export function applyDuelMessage(s: FriendDuelState, msg: ServerMessage, selfId: string | null): FriendDuelState {
  switch (msg.t) {
    case 'duelInvite': {
      const { from, name, game, level, seed, check } = msg;
      return { ...s, incoming: { from, name, game, level, seed, check } };
    }
    case 'duelStart':
      return {
        ...s,
        incoming: null,
        outgoing: null,
        joining: null,
        live: { id: msg.id, game: msg.game, level: msg.level, seed: msg.seed, first: msg.first === selfId ? 'kid' : 'bot', opponent: msg.opponent, events: [], end: null },
      };
    case 'duelMove': {
      if (!s.live || s.live.end) return s;
      const e: DuelEvent = { by: msg.by === selfId ? 'kid' : 'bot', k: msg.k, ...(msg.i !== undefined ? { i: msg.i } : {}), ...(msg.n !== undefined ? { n: msg.n } : {}) };
      return { ...s, live: { ...s.live, events: [...s.live.events, e] } };
    }
    case 'duelEnd':
      return s.live && !s.live.end ? { ...s, live: { ...s.live, end: msg.reason } } : s;
    case 'duelDeclined':
      if (s.outgoing?.to !== msg.to) return s;
      return { ...s, outgoing: null, note: { kind: 'declined', name: s.outgoing.name, reason: msg.reason } };
    case 'duelCancelled':
      if (s.joining?.from === msg.from) return { ...s, joining: null, note: { kind: 'cancelled', name: s.joining.name } };
      if (s.incoming?.from === msg.from) return { ...s, incoming: null };
      return s;
    default:
      return s;
  }
}

/**
 * 收到邀請時要不要自動回「正在忙」：只有在島上、或在益智遊戲館的選單（沒在玩）時才給孩子看；
 * 已經有一則邀請在等回覆、正在加入或正在對戰時也是忙
 */
export function inviteBusy(screen: Screen, playingPuzzle: boolean, s: FriendDuelState): boolean {
  if (s.incoming || s.joining || (s.live && !s.live.end)) return true;
  if (screen === 'island') return false;
  return screen !== 'puzzle' || playingPuzzle;
}

/** 可以邀請的人：這座島上的孩子（不含自己與熊熊老師；在建築裡的也算），依名字排 */
export function duelCandidates(members: Record<string, RemoteMember>, selfId: string | null): RemoteMember[] {
  return Object.values(members)
    .filter((m) => m.id !== selfId && m.role !== 'teacher')
    .sort((a, b) => a.nickname.localeCompare(b.nickname, 'zh-Hant'));
}

/** 邀請結果的文字（畫面上寫名字）與要唸的固定句子（預錄語音，見 DUEL_LINES） */
export function duelNoteText(note: DuelNote): { text: string; speech: string } {
  if (note.kind === 'noAnswer') return { text: `${note.name}沒有回應，等一下再邀請吧！`, speech: DUEL_LINES.noAnswer };
  if (note.kind === 'cancelled') return { text: `${note.name}的邀請取消了。`, speech: DUEL_LINES.cancelled };
  if (note.reason === 'tired') return { text: `${note.name}今天的益智遊戲時間用完了，明天再一起玩吧！`, speech: DUEL_LINES.tired };
  if (note.reason === 'version') return { text: DUEL_LINES.version, speech: DUEL_LINES.version };
  return { text: `${note.name}現在不能玩，等一下再邀請吧！`, speech: DUEL_LINES.declined };
}

// ---------- 送訊息與計時（即時連線提供送訊息的函式） ----------

/** 即時連線送訊息的函式（startRealtime 綁上，停止時清掉） */
let sender: ((msg: object) => void) | null = null;
/** 送出的邀請多久沒回應就取消 */
let inviteTimer: ReturnType<typeof setTimeout> | null = null;
/** 收到的邀請多久沒處理就收起來（邀請的人那邊會先取消，這是保險） */
let incomingTimer: ReturnType<typeof setTimeout> | null = null;

/** 即時連線綁上送訊息的函式（null 是連線停止） */
export function bindDuelSender(fn: ((msg: object) => void) | null): void {
  sender = fn;
}

const clearInviteTimer = () => {
  if (inviteTimer) clearTimeout(inviteTimer);
  inviteTimer = null;
};
const clearIncomingTimer = () => {
  if (incomingTimer) clearTimeout(incomingTimer);
  incomingTimer = null;
};

/** 邀請同一座島上的朋友：種子由自己決定，帶這一局的指紋；30 秒沒回應自動取消 */
export function inviteFriend(to: string, name: string, game: PuzzleGameId, level: BotLevel): void {
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const check = duelCheck(game, seed, level);
  clearInviteTimer();
  useFriendDuel.setState({ outgoing: { to, name, game, level, seed, check }, note: null });
  sender?.({ t: 'duelInvite', to, game, level, seed, check });
  inviteTimer = setTimeout(() => {
    inviteTimer = null;
    const out = useFriendDuel.getState().outgoing;
    if (!out || out.to !== to) return;
    sender?.({ t: 'duelCancel' });
    useFriendDuel.setState({ outgoing: null, note: { kind: 'noAnswer', name } });
  }, INVITE_TIMEOUT_MS);
}

/** 取消自己送出的邀請 */
export function cancelInvite(): void {
  clearInviteTimer();
  if (!useFriendDuel.getState().outgoing) return;
  sender?.({ t: 'duelCancel' });
  useFriendDuel.setState({ outgoing: null });
}

/** 回覆收到的邀請：接受時先進益智遊戲館等開局；不接受時帶原因（不要、時間用完……） */
export function answerInvite(accept: boolean, reason?: DuelDeclineReason): void {
  const inv = useFriendDuel.getState().incoming;
  if (!inv) return;
  clearIncomingTimer();
  sender?.({ t: 'duelReply', from: inv.from, accept, ...(reason && !accept ? { reason } : {}) });
  useFriendDuel.setState({ incoming: null, joining: accept ? { from: inv.from, name: inv.name } : null });
  if (accept && useUi.getState().screen !== 'puzzle') useUi.getState().enterZone('puzzle');
}

/** 送一則對戰動作（伺服器排好順序轉回兩個人，自己的也要等回來才算） */
export function sendDuelMove(k: DuelMoveKind, i?: number, n?: number): void {
  if (!useFriendDuel.getState().live) return;
  sender?.({ t: 'duelMove', k, ...(i !== undefined ? { i } : {}), ...(n !== undefined ? { n } : {}) });
}

/** 結束這一局：中途離開（按 ✕、休息鎖定，對方直接贏）或玩完了（讓伺服器收掉這一局） */
export function leaveDuel(): void {
  if (!useFriendDuel.getState().live) return;
  sender?.({ t: 'duelLeave' });
  useFriendDuel.setState({ live: null });
}

/** 看過邀請的結果 */
export function clearDuelNote(): void {
  useFriendDuel.setState({ note: null });
}

/** 即時連線收到對戰訊息：更新狀態；收到邀請時忙就自動回「正在忙」、指紋不同回「版本不同」 */
export function handleDuelMessage(msg: ServerMessage, selfId: string | null): void {
  if (msg.t === 'duelInvite') {
    const s = useFriendDuel.getState();
    if (inviteBusy(useUi.getState().screen, usePuzzleNow.getState().title !== null, s)) {
      sender?.({ t: 'duelReply', from: msg.from, accept: false, reason: 'busy' });
      return;
    }
    if (duelCheck(msg.game, msg.seed, msg.level) !== msg.check) {
      sender?.({ t: 'duelReply', from: msg.from, accept: false, reason: 'version' });
      return;
    }
    clearIncomingTimer();
    incomingTimer = setTimeout(() => {
      incomingTimer = null;
      if (useFriendDuel.getState().incoming?.from === msg.from) useFriendDuel.setState({ incoming: null });
    }, INVITE_TIMEOUT_MS + 5000);
  }
  if (msg.t === 'duelStart' || msg.t === 'duelDeclined') clearInviteTimer();
  if (msg.t === 'duelStart' || msg.t === 'duelCancelled') clearIncomingTimer();
  useFriendDuel.setState((s) => applyDuelMessage(s, msg, selfId));
}

/** 即時連線斷了：邀請都作廢，進行中的一局記成自己斷線（這一局不算） */
export function duelConnectionLost(): void {
  clearInviteTimer();
  clearIncomingTimer();
  useFriendDuel.setState((s) => ({ ...emptyDuel(), note: s.note, live: s.live && !s.live.end ? { ...s.live, end: 'lost' } : s.live }));
}
