/**
 * 同島成員與公頻的狀態（純函式，有單元測試）：誰在線上、在哪裡、說了什麼、誰頭上有對話氣泡。
 * P2 接上 WebSocket 後由伺服器的訊息驅動；現在先給「多人上線模擬」使用（presenceDemo.ts）。
 */
import type { AvatarConfig } from '../store/save';
import type { ZoneId } from '../store/useUi';

/** 公頻保留幾則 */
export const CHAT_KEEP = 30;
/** 對話氣泡顯示多久（毫秒） */
export const BUBBLE_MS = 5000;

/** 同房間的另一位玩家 */
export interface RemoteMember {
  id: string;
  nickname: string;
  avatar: AvatarConfig;
  /** 島上的位置與朝向（最近一次收到的；畫面自己內插） */
  x: number;
  z: number;
  heading: number;
  /** 在哪棟建築裡；null 表示在島上 */
  zone: ZoneId | null;
}

/** 公頻的一則訊息 */
export interface ChatLine {
  id: number;
  /** 說話的成員 id */
  from: string;
  nickname: string;
  text: string;
  /** 時間（毫秒） */
  at: number;
}

/** 整體狀態 */
export interface PresenceState {
  members: Record<string, RemoteMember>;
  chat: ChatLine[];
  /** 頭上的對話氣泡：成員 id → 文字與消失時間 */
  bubbles: Record<string, { text: string; until: number }>;
  /** 下一則訊息的 id */
  nextId: number;
}

/** 空狀態 */
export function emptyPresence(): PresenceState {
  return { members: {}, chat: [], bubbles: {}, nextId: 1 };
}

/** 成員加入或更新（外觀、暱稱、位置） */
export function upsertMember(s: PresenceState, m: RemoteMember): PresenceState {
  return { ...s, members: { ...s.members, [m.id]: m } };
}

/** 成員離開：氣泡一起清掉，公頻紀錄保留 */
export function removeMember(s: PresenceState, id: string): PresenceState {
  const { [id]: _gone, ...members } = s.members;
  const { [id]: _bubble, ...bubbles } = s.bubbles;
  return { ...s, members, bubbles };
}

/** 更新位置與朝向；外觀物件沿用同一個，畫面才不必重畫角色。不認識的成員不做事 */
export function moveMember(s: PresenceState, id: string, x: number, z: number, heading: number): PresenceState {
  const m = s.members[id];
  if (!m) return s;
  return { ...s, members: { ...s.members, [id]: { ...m, x, z, heading } } };
}

/** 進出建築（null 表示回到島上） */
export function setZone(s: PresenceState, id: string, zone: ZoneId | null): PresenceState {
  const m = s.members[id];
  if (!m) return s;
  return { ...s, members: { ...s.members, [id]: { ...m, zone } } };
}

/** 說話：公頻多一則、說話的人頭上出現氣泡。不認識的成員不收 */
export function addChat(s: PresenceState, from: string, text: string, now: number): PresenceState {
  const m = s.members[from];
  if (!m) return s;
  const line: ChatLine = { id: s.nextId, from, nickname: m.nickname, text, at: now };
  return {
    ...s,
    nextId: s.nextId + 1,
    chat: [...s.chat, line].slice(-CHAT_KEEP),
    bubbles: { ...s.bubbles, [from]: { text, until: now + BUBBLE_MS } },
  };
}

/** 某位成員目前頭上的氣泡文字；沒有或過期回傳 null */
export function activeBubble(s: PresenceState, id: string, now: number): string | null {
  const b = s.bubbles[id];
  return b && now < b.until ? b.text : null;
}

/** 清掉過期的氣泡；沒有要清的就回傳原狀態（畫面定時呼叫，不會造成多餘的重畫） */
export function expireBubbles(s: PresenceState, now: number): PresenceState {
  const expired = Object.entries(s.bubbles).filter(([, b]) => now >= b.until);
  if (!expired.length) return s;
  const bubbles = { ...s.bubbles };
  for (const [id] of expired) delete bubbles[id];
  return { ...s, bubbles };
}

/** 在島上（不在建築裡）的成員 */
export function onIsland(s: PresenceState): RemoteMember[] {
  return Object.values(s.members).filter((m) => m.zone === null);
}
