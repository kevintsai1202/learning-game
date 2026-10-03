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

// ---------- 大人帳號（家長、老師；docs/plans/accounts.md） ----------
// 帳號名稱、密碼、email 的規則在 userRules.ts（伺服器逐項檢查，才能回報是哪一項不對）；這裡只限制型別與長度

/** 註冊：家長、老師至少勾一個 */
export const registerRequest = z.object({
  username: z.string().max(40),
  password: z.string().max(200),
  email: z.string().max(300),
  parent: z.boolean(),
  teacher: z.boolean(),
});
/** 用帳號密碼登入 */
export const userLoginRequest = z.object({ username: z.string().max(40), password: z.string().max(200) });
/** 修改自己的身分或 email（沒給的欄位不變） */
export const userPatchRequest = z.object({ parent: z.boolean().optional(), teacher: z.boolean().optional(), email: z.string().max(300).optional() });
/** 改密碼 */
export const passwordChangeRequest = z.object({ current: z.string().max(200), next: z.string().max(200) });
/** 老師建立班級 */
export const createClassRequest = z.object({ name: z.string().max(40) });
/** 刪除自己的帳號：要再輸入一次密碼 */
export const deleteAccountRequest = z.object({ password: z.string().max(200) });
/** 家長把裝置上的角色上傳成雲端角色（存檔格式在伺服器用 parseProfile 檢查） */
export const uploadKidRequest = z.object({ profile: z.unknown() });
/** 已有的雲端角色加入班級（帶孩子權杖） */
export const attachClassRequest = z.object({ code: roomCodeSchema, nickname: z.string().max(40), pin: pinSchema });

/** 家長名下的一個雲端角色 */
export interface KidSummary {
  id: string;
  name: string;
  avatar: AvatarConfig;
  /** 目前的班級；沒有班級是 null */
  room: RoomInfo | null;
  coins: number;
  /** 各活動最佳星數加總 */
  stars: number;
  lastSeen: string;
}

/** 家長名下的雲端角色清單 */
export interface ParentKidsResponse {
  kids: KidSummary[];
}

/** 老師的班級清單的一個班級（附成員數） */
export interface TeacherRoomSummary extends RoomSettings {
  members: number;
}

/** 老師的班級清單 */
export interface TeacherRoomsResponse {
  rooms: TeacherRoomSummary[];
}

/** 老師的班級管理頁：設定與成員 */
export interface TeacherRoomResponse {
  room: RoomSettings;
  members: MemberSummary[];
}

/** 大人帳號的資料（只回給本人） */
export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  parent: boolean;
  teacher: boolean;
}

/** 註冊或登入成功的回應 */
export interface UserSessionResponse {
  token: string;
  user: UserInfo;
}

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

/** 加入、登入、家長上傳或「在這台裝置玩」成功的回應 */
export interface SessionResponse {
  token: string;
  account: { id: string; nickname: string };
  profile: Profile;
  rev: number;
  /** 目前的班級；家長名下、還沒加入班級的雲端角色是 null */
  room: RoomInfo | null;
}

/** 已有的雲端角色帶著自己的權杖加入班級（裝置沿用原本的權杖，所以回應沒有權杖） */
export interface AttachResponse {
  account: { id: string; nickname: string };
  profile: Profile;
  rev: number;
  room: RoomInfo;
}

/** 家長用 Google 登入的回應：綁定的每位孩子各一張權杖 */
export interface GoogleKidsResponse {
  kids: SessionResponse[];
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
  /** 這個角色目前的班級（退出班級、被移出時裝置靠它更新本機的雲端標記）；沒有班級是 null */
  room: RoomInfo | null;
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
