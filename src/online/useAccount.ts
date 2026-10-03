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
import type { MailStatus, UserInfo, UserPatchResponse, UserSessionResponse } from './protocol';

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
  changePassword: (current: string, next: string) => Promise<void>;
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
  /** 打開驗證連結：驗證 email（不用登入；這台有登入時順便更新帳號資料） */
  verifyEmail: (token: string) => Promise<void>;
  /** 忘記密碼：帳號名稱或 email；伺服器一律回同一句話 */
  forgotPassword: (login: string) => Promise<void>;
  /** 用重設連結設定新密碼；成功後那個帳號在所有裝置都登出（這台若登入的是同一個帳號也會登出） */
  resetPassword: (token: string, password: string) => Promise<void>;
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

    changePassword: async (current, next) => {
      await get().call('POST', '/api/users/me/password', { current, next });
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
  };
});
