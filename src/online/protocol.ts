/**
 * 班級伺服器的 HTTP 格式（前端與伺服器共用的純模組）：請求用 zod 驗證，回應用 TypeScript 型別描述。
 */
import { z } from 'zod';
import type { AvatarConfig, Profile } from '../store/save';
import { avatarSchema } from './ops';

/** 房間代碼：6 位數字 */
export const roomCodeSchema = z.string().regex(/^\d{6}$/);
/** 孩子的密碼：4 位數字 */
export const pinSchema = z.string().regex(/^\d{4}$/);
/** 老師的管理密碼：6～64 字 */
export const teacherPasswordSchema = z.string().min(6).max(64);

export const createRoomRequest = z.object({ name: z.string().max(40), password: teacherPasswordSchema });
export const teacherLoginRequest = z.object({ code: roomCodeSchema, password: z.string().max(64) });
export const roomPatchRequest = z.object({ joinOpen: z.boolean().optional(), chatOpen: z.boolean().optional(), giftsOpen: z.boolean().optional() });
export const resetPinRequest = z.object({ pin: pinSchema });
/** 加入班級：avatar（建新角色）與 profile（帶本機進度）擇一 */
export const joinRequest = z
  .object({ code: roomCodeSchema, nickname: z.string().max(40), pin: pinSchema, avatar: avatarSchema.optional(), profile: z.unknown().optional() })
  .refine((v) => v.avatar !== undefined || v.profile !== undefined, { message: '要選外觀或帶入角色' });
export const loginRequest = z.object({ code: roomCodeSchema, nickname: z.string().max(40), pin: z.string().max(10) });
/** Google 快速登入與綁定：前端從 Google Identity Services 拿到的 ID token */
export const googleTokenRequest = z.object({ idToken: z.string().min(1).max(4096) });
/** 同步：每筆操作在伺服器端逐筆驗證，所以這裡只限制數量 */
export const opsRequest = z.object({ ops: z.array(z.unknown()).max(20) });
/** 送禮物：id 由裝置產生（重送同一個 id 不會扣兩次錢） */
export const sendGiftRequest = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), to: z.string().max(64), itemId: z.string().max(64) });
/** 送禮結果看過了 */
export const ackGiftNoticesRequest = z.object({ ids: z.array(z.string().max(64)).max(50) });

/** 房間的基本資訊 */
export interface RoomInfo {
  code: string;
  name: string;
}

/** 房間設定（老師可以切換） */
export interface RoomSettings extends RoomInfo {
  joinOpen: boolean;
  chatOpen: boolean;
  giftsOpen: boolean;
}

/** 老師看到的成員資料 */
export interface MemberSummary {
  id: string;
  nickname: string;
  coins: number;
  /** 各活動最佳星數加總 */
  stars: number;
  wrongCount: number;
  /** 完成的回合數 */
  sessions: number;
  createdAt: string;
  lastSeen: string;
  online: boolean;
}

/** 加入或登入成功的回應 */
export interface SessionResponse {
  token: string;
  account: { id: string; nickname: string };
  profile: Profile;
  rev: number;
  room: RoomInfo;
}

/** 家長用 Google 登入的回應：綁定的每位孩子各一張權杖 */
export interface GoogleKidsResponse {
  kids: SessionResponse[];
}

/** 老師用 Google 登入的回應：綁定的每個房間各一張管理頁權杖 */
export interface GoogleRoomsResponse {
  rooms: { code: string; name: string; token: string }[];
}

/** 已綁定的 Google 帳號（email 已遮罩） */
export interface GoogleLinksResponse {
  google: string[];
}

/** 伺服器設定（前端決定要不要顯示 Google 按鈕） */
export interface ServerConfig {
  googleClientId: string | null;
}

/** 同步的回應 */
export interface OpsResponse {
  profile: Profile;
  rev: number;
  rejected: { id: string; reason: string }[];
}

/** 同學名單的一位（選送禮對象用） */
export interface Classmate {
  id: string;
  nickname: string;
  /** 外觀（已經過 equippedOf） */
  avatar: AvatarConfig;
  online: boolean;
  /** 已經有的、能當禮物送的外觀（選禮物時標「已經有了」） */
  owned: string[];
}

/** 同學名單的回應 */
export interface ClassmatesResponse {
  classmates: Classmate[];
}

/** 待收下的禮物 */
export interface IncomingGift {
  id: string;
  /** 送禮人的暱稱 */
  from: string;
  itemId: string;
  createdAt: string;
}

/** 送出的禮物的結果：收下時有收禮人的暱稱；退回（不用了、過期、已經有了、對方被移出）不說是誰 */
export type GiftNotice = { id: string; kind: 'accepted'; to: string; itemId: string } | { id: string; kind: 'refunded'; price: number };

/** 禮物狀態的回應 */
export interface GiftsResponse {
  incoming: IncomingGift[];
  notices: GiftNotice[];
  /** 今天送了幾份 */
  sentToday: number;
  /** 每天最多送幾份 */
  dailyLimit: number;
}

/** 送禮物的回應：送禮人的最新存檔（金幣已扣） */
export interface SendGiftResponse {
  gift: { id: string; to: string; itemId: string; price: number };
  profile: Profile;
  rev: number;
}

/** 收下禮物的回應：returned 表示已經有了，自動退回給送禮人 */
export interface AcceptGiftResponse {
  status: 'accepted' | 'returned';
  profile: Profile;
  rev: number;
}

/** 錯誤回應 */
export interface ErrorResponse {
  error: string;
  code: string;
  /** 鎖定時還要等幾秒 */
  retryAfter?: number;
}
