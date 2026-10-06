/**
 * 班級伺服器的 HTTP 格式（前端與伺服器共用的純模組）：請求用 zod 驗證，回應用 TypeScript 型別描述。
 */
import { z } from 'zod';
import type { AvatarConfig, CurriculumChoice, Profile } from '../store/save';
import { avatarSchema, curriculumSchema } from './ops';

/** 房間代碼：6 位數字 */
export const roomCodeSchema = z.string().regex(/^\d{6}$/);
/** 孩子的密碼：4 位數字 */
export const pinSchema = z.string().regex(/^\d{4}$/);
/** 老師改班級設定：開關、班級教材版本（null 是取消統一，班級島照各孩子自己的設定；老師 GM 的 G0）、班級名稱 */
/** 教室密碼（L3，docs/plans/login-ux-review.md 第 8 節第 2 點）：6 個字以上，避免被別人猜中 */
export const CLASS_PASSWORD_MIN = 6;
export const classPasswordSchema = z.string().min(CLASS_PASSWORD_MIN).max(64);
/** 教室權杖的效期（小時；第 8 節第 3 點：平板記住 8 小時） */
export const CLASSROOM_HOURS = 8;
export const roomPatchRequest = z.object({
  joinOpen: z.boolean().optional(),
  chatOpen: z.boolean().optional(),
  giftsOpen: z.boolean().optional(),
  curriculum: curriculumSchema.nullable().optional(),
  /** 班級名稱（升級換年級時改；規則和建立班級相同，伺服器檢查） */
  name: z.string().max(40).optional(),
  /** 設定或更換教室密碼（L3）：換了之後這一班的教室權杖與平板上孩子的權杖都失效 */
  classPassword: classPasswordSchema.optional(),
});
/** 學校平板用教室密碼解鎖（L3） */
export const classroomUnlockRequest = z.object({ password: z.string().min(1).max(64) });
/** 老師在平板上新增學生（L3）：暱稱與外觀，沒有密碼、沒有家長 */
export const classroomCreateRequest = z.object({ nickname: z.string().max(40), avatar: avatarSchema });
export const resetPinRequest = z.object({ pin: pinSchema });
/** 加入班級：avatar（建新角色）與 profile（帶本機進度）擇一 */
export const joinRequest = z
  .object({ code: roomCodeSchema, nickname: z.string().max(40), pin: pinSchema, avatar: avatarSchema.optional(), profile: z.unknown().optional() })
  .refine((v) => v.avatar !== undefined || v.profile !== undefined, { message: '要選外觀或帶入角色' });
export const loginRequest = z.object({ code: roomCodeSchema, nickname: z.string().max(40), pin: z.string().max(10) });
/** Google 快速登入與綁定（大人帳號，A4）：前端從 Google Identity Services 拿到的 ID token */
export const googleTokenRequest = z.object({ idToken: z.string().min(1).max(4096) });
/**
 * 用 Google 註冊（A4；L1 起不用設帳號名稱與密碼，docs/plans/login-ux-review.md 第 6 節第 1 點）：
 * 只要選身分；帳號名稱由伺服器從 email 產生，沒有密碼；email 用 Google 驗證過的 email。
 * 舊版網頁多送的 username、password 會被 zod 去掉（不會用到）
 */
export const googleRegisterRequest = z.object({
  idToken: z.string().min(1).max(4096),
  parent: z.boolean(),
  teacher: z.boolean(),
});
/** 同步：每筆操作在伺服器端逐筆驗證，所以這裡只限制數量 */
export const opsRequest = z.object({ ops: z.array(z.unknown()).max(20) });
/**
 * 送禮物：id 由裝置產生（重送同一個 id 不會扣兩次錢）。
 * room（多班級）：現在所在的班級島，只能送給那一班的同學、禮物記在那一班；沒給時（舊版網頁）記在兩人最早建立的共同班級
 */
export const sendGiftRequest = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  to: z.string().max(64),
  itemId: z.string().max(64),
  room: roomCodeSchema.optional(),
});
/** 送禮結果看過了 */
export const ackGiftNoticesRequest = z.object({ ids: z.array(z.string().max(64)).max(50) });

// ---------- 大人帳號（家長、老師；docs/plans/accounts.md） ----------
// 帳號名稱、密碼、email 的規則在 userRules.ts（伺服器逐項檢查，才能回報是哪一項不對）；這裡只限制型別與長度

/**
 * 前端目前的網址（A3）：信裡的驗證與重設連結指回這個網址；伺服器只在網域列在允許清單裡時才採用，
 * 不然用 GitHub Pages 的網址（server/email.ts 的 appBaseUrl）
 */
const appUrlSchema = z.string().max(500).optional();

/** 註冊：家長、老師至少勾一個 */
export const registerRequest = z.object({
  username: z.string().max(40),
  password: z.string().max(200),
  email: z.string().max(300),
  parent: z.boolean(),
  teacher: z.boolean(),
  appUrl: appUrlSchema,
});
/** 用帳號密碼登入 */
export const userLoginRequest = z.object({ username: z.string().max(40), password: z.string().max(200) });
/** 修改自己的身分或 email（沒給的欄位不變；換了 email 會寄驗證信到新的 email） */
export const userPatchRequest = z.object({ parent: z.boolean().optional(), teacher: z.boolean().optional(), email: z.string().max(300).optional(), appUrl: appUrlSchema });
/** 重寄驗證信（登入狀態） */
export const resendVerifyRequest = z.object({ appUrl: appUrlSchema });
/** 打開驗證連結：驗證 email（不用登入） */
export const verifyEmailRequest = z.object({ token: z.string().max(200) });
/** 忘記密碼：帳號名稱或 email */
export const forgotPasswordRequest = z.object({ login: z.string().max(300), appUrl: appUrlSchema });
/** 打開重設連結後設定新密碼（不用登入） */
export const resetPasswordRequest = z.object({ token: z.string().max(200), password: z.string().max(200) });
/**
 * 再確認一次身分（改密碼、刪除帳號）：密碼，或這個帳號綁定的 Google 給的 ID token（L1：用 Google 註冊、沒有密碼的帳號用這個）。
 * 至少要有一個
 */
const googleProof = z.string().min(1).max(4096).optional();
/** 改密碼（沒有密碼的帳號是「設定密碼」）：current 是目前的密碼，或用 idToken（綁定的 Google）確認身分 */
export const passwordChangeRequest = z
  .object({ current: z.string().max(200).optional(), idToken: googleProof, next: z.string().max(200) })
  .refine((v) => v.current !== undefined || v.idToken !== undefined, { message: '要有目前的密碼或 Google 確認' });
/** 老師建立班級 */
export const createClassRequest = z.object({ name: z.string().max(40) });
/** 刪除自己的帳號：要再輸入一次密碼，或用綁定的 Google 確認身分（沒有密碼的帳號） */
export const deleteAccountRequest = z
  .object({ password: z.string().max(200).optional(), idToken: googleProof })
  .refine((v) => v.password !== undefined || v.idToken !== undefined, { message: '要有密碼或 Google 確認' });
/** 家長把裝置上的角色上傳成雲端角色（存檔格式在伺服器用 parseProfile 檢查） */
export const uploadKidRequest = z.object({ profile: z.unknown() });
/** 已有的雲端角色加入班級（帶孩子權杖） */
export const attachClassRequest = z.object({ code: roomCodeSchema, nickname: z.string().max(40), pin: pinSchema });
/** 家長讓名下的雲端角色加入班級（掃 QR code 加入，不用密碼；docs/plans/class-join.md） */
export const parentJoinClassRequest = z.object({ code: roomCodeSchema, nickname: z.string().max(40) });
/** 家長讓孩子退出班級：code 是要退出哪一班（多班級）；舊版網頁不給，只有一個班級時退出那一班 */
export const parentLeaveClassRequest = z.object({ code: roomCodeSchema.optional() });

/** 家長名下的一個雲端角色 */
export interface KidSummary {
  id: string;
  /** 角色 id（Profile.id）：裝置用來認出本機有沒有同一個角色（例如以前用備份匯入的） */
  profileId: string;
  name: string;
  avatar: AvatarConfig;
  /** 第一個班級（最早加入的；給部署途中的舊版網頁）；沒有班級是 null */
  room: RoomInfo | null;
  /** 所有班級與各班的暱稱（多班級，docs/plans/multi-class.md），第一個班級在前面；多班級之前的伺服器沒有（用 kidRooms 讀） */
  rooms?: ClassInfo[];
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
  /** 有沒有密碼：用 Google 註冊的帳號沒有（L1），改密碼與刪除帳號要用 Google 確認身分 */
  hasPassword: boolean;
  parent: boolean;
  teacher: boolean;
}

/** 註冊或登入成功的回應 */
export interface UserSessionResponse {
  token: string;
  user: UserInfo;
  /** 註冊時的驗證信寄出了沒（只有註冊的回應有；登入沒有） */
  verifyMail?: MailStatus;
}

/**
 * 驗證信的寄送結果：sent 寄出了；failed 寄信失敗（可以到帳號設定重寄）；
 * disabled 伺服器沒有設定寄信；limited 寄太多次了（每分鐘 1 封、每天 10 封）
 */
export type MailStatus = 'sent' | 'failed' | 'disabled' | 'limited';

/** 修改自己的資料的回應（換了 email 時多一個驗證信的寄送結果） */
export interface UserPatchResponse {
  user: UserInfo;
  verifyMail?: MailStatus;
}

/** 房間的基本資訊 */
export interface RoomInfo {
  code: string;
  name: string;
  /** 老師設定的班級教材版本（班級島用）；null 是沒有統一，班級島照各孩子自己的設定（老師 GM 的 G0） */
  curriculum: CurriculumChoice | null;
}

/** 孩子所在的一個班級：班級資訊＋他在那一班的暱稱（多班級，每一班各自的暱稱） */
export interface ClassInfo extends RoomInfo {
  nickname: string;
}

/** 一個孩子最多加入幾個班級（使用者決定，docs/plans/multi-class.md 第 8 節第 2 點；伺服器與畫面共用） */
export const MAX_CLASSES = 5;

/** 家長清單上一個孩子所在的班級，第一個班級在前面（多班級之前的伺服器只有 room：當作只有那一班） */
export function kidRooms(k: Pick<KidSummary, 'room' | 'rooms'>): (RoomInfo & { nickname?: string })[] {
  return k.rooms ?? (k.room ? [k.room] : []);
}

/** 房間設定（老師可以切換） */
export interface RoomSettings extends RoomInfo {
  joinOpen: boolean;
  chatOpen: boolean;
  giftsOpen: boolean;
  /** 有沒有設定教室密碼（L3；只存雜湊，看不到密碼本身）；舊版伺服器沒有 */
  hasClassPassword?: boolean;
}

/** 平板解鎖成功（L3）：教室權杖、班級、權杖到期時間 */
export interface ClassroomUnlockResponse {
  token: string;
  room: { code: string; name: string };
  expiresAt: string;
}

/** 平板名單上的一位孩子（L3）：這一班的暱稱與外觀，不含學習資料 */
export interface ClassroomMember {
  id: string;
  nickname: string;
  avatar: AvatarConfig;
}

/** 平板名單（L3） */
export interface ClassroomMembersResponse {
  room: { code: string; name: string };
  /** 老師有沒有開放加入（關掉時平板不能新增學生） */
  joinOpen: boolean;
  members: ClassroomMember[];
}

/** 老師在平板上新增學生的回應（L3）：進島要再用名單的 device API 拿孩子的權杖 */
export interface ClassroomCreateResponse {
  member: ClassroomMember;
}

/** 家長連結卡的有效天數（L4） */
export const CLAIM_DAYS = 7;

/** 老師產生家長連結（L4）：代碼只在這次回應出現（伺服器只存雜湊），卡片上的孩子資料 */
export interface ClaimIssueResponse {
  code: string;
  expiresAt: string;
  kid: { nickname: string; avatar: AvatarConfig };
}

/** 家長查詢連結（L4）：要接手的孩子（這一班的暱稱與外觀）與班級；不含帳號 id */
export interface ClaimLookupResponse {
  kid: { nickname: string; avatar: AvatarConfig };
  room: { code: string; name: string };
  expiresAt: string;
}

/** 家長接手的回應（L4）：孩子現在在家長名下 */
export interface ClaimAcceptResponse {
  kid: KidSummary;
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
  /**
   * 在哪裡（島嶼互訪 I1）：這一班的班級島、自己的島、別的班級島（多班級；不寫是哪一班）＋建築；離線是 null。
   * 舊版伺服器只有 class、own
   */
  where: { island: 'class' | 'own' | 'otherClass'; zone: string | null } | null;
  /** 有沒有班級密碼（家長掃 QR code 加入的孩子沒有，老師要設了孩子才能用班級代碼登入） */
  hasPin: boolean;
  /** 有沒有家長帳號（L4：沒有的才能產生家長連結卡）；舊版伺服器沒有 */
  hasParent?: boolean;
}

/** 查班級（加入連結打開時顯示班級名稱） */
export interface ClassLookupResponse {
  room: { code: string; name: string };
  joinOpen: boolean;
}

/** 家長讓雲端角色加入班級的回應 */
export interface ParentJoinClassResponse {
  kid: KidSummary;
}

/** 加入、登入、家長上傳或「在這台裝置玩」成功的回應 */
export interface SessionResponse {
  token: string;
  account: { id: string; nickname: string };
  profile: Profile;
  rev: number;
  /** 第一個班級（最早加入的；給部署途中的舊版網頁）；家長名下、還沒加入班級的雲端角色是 null */
  room: RoomInfo | null;
  /** 所有班級與各班的暱稱（多班級），第一個班級在前面；舊版伺服器沒有 */
  rooms?: ClassInfo[];
}

/** 已有的雲端角色帶著自己的權杖加入班級（裝置沿用原本的權杖，所以回應沒有權杖） */
export interface AttachResponse {
  account: { id: string; nickname: string };
  profile: Profile;
  rev: number;
  /** 剛加入的班級 */
  room: RoomInfo;
  /** 加入後的所有班級（多班級）；舊版伺服器沒有 */
  rooms?: ClassInfo[];
}

/** 大人帳號綁定的一個 Google（id 是 Google 帳號的識別碼，只回給帳號本人，解除綁定時用；email 已遮罩） */
export interface UserGoogleLink {
  id: string;
  email: string;
}

/** 大人帳號綁定的 Google 清單 */
export interface UserGoogleLinksResponse {
  google: UserGoogleLink[];
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
  /** 第一個班級（給部署途中的舊版網頁；退出、被移出時舊版裝置靠它更新本機）；沒有班級是 null */
  room: RoomInfo | null;
  /** 所有班級與各班的暱稱（多班級；裝置靠它更新本機的班級清單），第一個班級在前面；舊版伺服器沒有 */
  rooms?: ClassInfo[];
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
