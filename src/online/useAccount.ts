/**
 * 大人帳號（家長、老師）的登入狀態：權杖記在 storage（getUserSession），帳號資料（身分、email）登入後從伺服器讀。
 * 老師的班級管理頁用；家長的雲端角色（docs/plans/accounts.md 的 A2）也會用。
 */
import { create } from 'zustand';
import { api, ApiFailure } from './api';
import { serverUrl } from './config';
import { getUserSession, setUserSession, type UserSession } from './storage';
import type { UserInfo, UserSessionResponse } from './protocol';

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
  /** 修改身分或 email */
  update: (patch: { parent?: boolean; teacher?: boolean; email?: string }) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  /** 呼叫需要大人權杖的 API；權杖失效（401）時自動登出再丟出錯誤 */
  call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
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

    register: async ({ remember, ...body }) => {
      const base = server();
      signedIn(base, await api<UserSessionResponse>('POST', '/api/users', { base, body }), remember);
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
      const r = await get().call<{ user: UserInfo }>('PATCH', '/api/users/me', patch);
      set({ user: r.user });
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
  };
});
