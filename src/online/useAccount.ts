/**
 * 大人帳號（家長、老師）的登入狀態：權杖記在 storage（getUserSession），帳號資料（身分、email）登入後從伺服器讀。
 * 老師的班級管理頁用；家長的雲端角色（docs/plans/accounts.md 的 A2）也會用。
 * A3：驗證 email、忘記密碼與重設密碼；信裡的連結指回目前的網址（伺服器會檢查網域在允許清單裡）。
 */
import { create } from 'zustand';
import { api, ApiFailure } from './api';
import { serverUrl } from './config';
import { appUrlOf, type EmailLink } from './emailLinks';
import { getUserSession, setUserSession, type UserSession } from './storage';
import type { MailStatus, UserGoogleLink, UserGoogleLinksResponse, UserInfo, UserPatchResponse, UserSessionResponse } from './protocol';

/** 目前網頁的前端網址（信裡的連結指回這裡）；不在瀏覽器裡時沒有 */
const currentAppUrl = (): string | undefined => (typeof location === 'undefined' ? undefined : appUrlOf(location.href));

/** 註冊需要的資料 */
export interface RegisterInput {
  username: string;
  password: string;
  email: string;
  parent: boolean;
  teacher: boolean;
  /** 在這台裝置保持登入 */
  remember: boolean;
}

/** 正在加入的班級：班級代碼與預先選好的角色（雲端角色的帳號 id） */
export interface JoiningClass {
  code: string;
  kidId?: string;
}

/** sessionStorage 的鍵：正在加入的班級 */
const JOINING_KEY = 'learning-island-joining';

/** 讀回這個分頁正在加入的班級（讀不到或格式不對就是沒有） */
function readJoining(): JoiningClass | null {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(JOINING_KEY);
    const v = raw ? (JSON.parse(raw) as JoiningClass) : null;
    return v && /^\d{6}$/.test(v.code) ? v : null;
  } catch {
    return null;
  }
}

interface AccountStore {
  /** 登入狀態（權杖）；沒登入是 null */
  session: UserSession | null;
  /** 帳號資料；登入後才有（重新整理頁面時由 refresh 讀回來） */
  user: UserInfo | null;
  register: (input: RegisterInput) => Promise<void>;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  /** 用記住的權杖讀帳號資料（進畫面時呼叫）；權杖失效就登出 */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** 修改身分或 email（換了 email 會寄驗證信到新的 email） */
  update: (patch: { parent?: boolean; teacher?: boolean; email?: string }) => Promise<void>;
  /**
   * 改密碼，或幫沒有密碼的帳號（用 Google 註冊的）設定密碼：用目前的密碼或綁定的 Google 確認身分。
   * 成功後讀回帳號資料（「有沒有密碼」會變）；其他裝置的登入由伺服器登出
   */
  changePassword: (proof: { current: string } | { idToken: string }, next: string) => Promise<void>;
  /** 呼叫需要大人權杖的 API；權杖失效（401）時自動登出再丟出錯誤 */
  call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
  /** 最近一次驗證信的寄送結果（註冊、換 email、重寄之後畫面顯示提示；按「知道了」或驗證後清掉） */
  verifyMail: MailStatus | null;
  clearVerifyMail: () => void;
  /** 重寄驗證信到目前的 email */
  resendVerify: () => Promise<void>;
  /** 網址帶來的信件連結（驗證 email、重設密碼）：帳號頁處理，處理完清掉 */
  emailLink: EmailLink | null;
  setEmailLink: (link: EmailLink | null) => void;
  /**
   * 正在加入的班級（掃 QR code 打開的加入連結，或家長在孩子清單按「加入班級」；docs/plans/class-join.md）：
   * 帳號頁顯示加入班級面板，完成或取消時清掉。kidId 是預先選好的角色。存在 sessionStorage，註冊途中重新整理也還在
   */
  joining: JoiningClass | null;
  setJoining: (joining: JoiningClass | null) => void;
  /** 打開驗證連結：驗證 email（不用登入；這台有登入時順便更新帳號資料） */
  verifyEmail: (token: string) => Promise<void>;
  /** 忘記密碼：帳號名稱或 email；伺服器一律回同一句話 */
  forgotPassword: (login: string) => Promise<void>;
  /** 用重設連結設定新密碼；成功後那個帳號在所有裝置都登出（這台若登入的是同一個帳號也會登出） */
  resetPassword: (token: string, password: string) => Promise<void>;
  /** 用 Google 登入（A4）：只能登入已經綁定這個 Google 的大人帳號 */
  googleLogin: (idToken: string, remember: boolean) => Promise<void>;
  /**
   * 用 Google 註冊（A4；L1 起只要選身分）：帳號名稱由伺服器從 email 產生、沒有密碼；
   * email 用 Google 的（算驗證過），同時綁好這個 Google
   */
  googleRegister: (input: GoogleRegisterInput) => Promise<void>;
  /** 這個帳號綁定的 Google（email 已遮罩） */
  googleLinks: () => Promise<UserGoogleLink[]>;
  /** 綁定一個 Google；回傳綁定後的清單 */
  linkGoogle: (idToken: string) => Promise<UserGoogleLink[]>;
  /** 解除一個 Google（id 是清單裡的 id）；回傳解除後的清單 */
  unlinkGoogle: (id: string) => Promise<UserGoogleLink[]>;
}

/** 用 Google 註冊需要的資料（L1：不用帳號名稱、密碼、email，只要身分） */
export interface GoogleRegisterInput {
  idToken: string;
  parent: boolean;
  teacher: boolean;
  /** 在這台裝置保持登入 */
  remember: boolean;
}

export const useAccount = create<AccountStore>((set, get) => {
  /** 登入或註冊成功：記住權杖與帳號資料 */
  const signedIn = (server: string, r: UserSessionResponse, remember: boolean) => {
    const session = { server, token: r.token, remember };
    setUserSession(session);
    set({ session, user: r.user });
  };
  /** 清掉登入狀態（不呼叫伺服器） */
  const clear = () => {
    setUserSession(null);
    set({ session: null, user: null });
  };
  /** 目前的伺服器網址；沒有設定時丟出錯誤 */
  const server = () => {
    const url = serverUrl();
    if (!url) throw new ApiFailure(0, 'no_server', '還沒有設定班級伺服器');
    return url;
  };

  return {
    session: getUserSession(),
    user: null,
    verifyMail: null,
    emailLink: null,
    joining: readJoining(),

    register: async ({ remember, ...body }) => {
      const base = server();
      const r = await api<UserSessionResponse>('POST', '/api/users', { base, body: { ...body, appUrl: currentAppUrl() } });
      signedIn(base, r, remember);
      set({ verifyMail: r.verifyMail ?? null });
    },

    login: async (username, password, remember) => {
      const base = server();
      signedIn(base, await api<UserSessionResponse>('POST', '/api/users/login', { base, body: { username, password } }), remember);
    },

    refresh: async () => {
      if (!get().session) return;
      const r = await get().call<{ user: UserInfo }>('GET', '/api/users/me');
      set({ user: r.user });
    },

    logout: async () => {
      const s = get().session;
      clear();
      // 伺服器那邊刪掉權杖；連不上也沒關係，這台裝置已經登出
      if (s) await api('POST', '/api/logout', { base: s.server, token: s.token, body: {} }).catch(() => undefined);
    },

    update: async (patch) => {
      const r = await get().call<UserPatchResponse>('PATCH', '/api/users/me', { ...patch, ...(patch.email !== undefined ? { appUrl: currentAppUrl() } : {}) });
      set({ user: r.user, ...(r.verifyMail ? { verifyMail: r.verifyMail } : {}) });
    },

    changePassword: async (proof, next) => {
      await get().call('POST', '/api/users/me/password', { ...proof, next });
      await get().refresh();
    },

    call: async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      const s = get().session;
      if (!s) throw new ApiFailure(401, 'unauthorized', '請重新登入');
      try {
        return await api<T>(method, path, { base: s.server, token: s.token, body });
      } catch (err) {
        if (err instanceof ApiFailure && err.status === 401) clear();
        throw err;
      }
    },

    clearVerifyMail: () => set({ verifyMail: null }),

    resendVerify: async () => {
      await get().call('POST', '/api/users/me/verify/resend', { appUrl: currentAppUrl() });
      set({ verifyMail: 'sent' });
    },

    setEmailLink: (link) => set({ emailLink: link }),

    setJoining: (joining) => {
      try {
        if (joining) sessionStorage.setItem(JOINING_KEY, JSON.stringify(joining));
        else sessionStorage.removeItem(JOINING_KEY);
      } catch {
        // 無痕模式等不能存：只在這次開著的頁面裡有效
      }
      set({ joining });
    },

    verifyEmail: async (token) => {
      await api('POST', '/api/users/email/verify', { base: server(), body: { token } });
      set({ verifyMail: null });
      if (get().session) await get().refresh().catch(() => undefined);
    },

    forgotPassword: async (login) => {
      await api('POST', '/api/users/password/forgot', { base: server(), body: { login, appUrl: currentAppUrl() } });
    },

    resetPassword: async (token, password) => {
      await api('POST', '/api/users/password/reset', { base: server(), body: { token, password } });
      // 這台登入的如果是同一個帳號，權杖已經失效：讀一次帳號資料，401 時 call 會自動登出（登入的是別的帳號就不受影響）
      if (get().session) await get().refresh().catch(() => undefined);
    },

    googleLogin: async (idToken, remember) => {
      const base = server();
      signedIn(base, await api<UserSessionResponse>('POST', '/api/users/google/login', { base, body: { idToken } }), remember);
    },

    googleRegister: async ({ remember, ...body }) => {
      const base = server();
      signedIn(base, await api<UserSessionResponse>('POST', '/api/users/google/register', { base, body }), remember);
      // Google 的 email 已經驗證過，不用寄驗證信
      set({ verifyMail: null });
    },

    googleLinks: async () => (await get().call<UserGoogleLinksResponse>('GET', '/api/users/me/google')).google,

    linkGoogle: async (idToken) => (await get().call<UserGoogleLinksResponse>('POST', '/api/users/me/google', { idToken })).google,

    unlinkGoogle: async (id) => (await get().call<UserGoogleLinksResponse>('DELETE', `/api/users/me/google/${encodeURIComponent(id)}`)).google,
  };
});
