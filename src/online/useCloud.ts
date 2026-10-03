/**
 * 雲端同步的畫面狀態與排程（zustand）。同步邏輯本身在 cloudSync.ts（有單元測試）。
 *
 * 什麼時候同步：
 * - 雲端角色做了動作：一般操作約 1 秒後送；遊玩時間每 30 秒才會來一筆，不急，等 30 秒
 * - 換成雲端角色、分頁回到前景、瀏覽器回報連上網路：馬上同步
 * - 每 2 分鐘拉一次（看其他裝置或老師的變更）
 * - 連不上：2、4、8…秒後重試，最多 60 秒一次；需要重新登入時停止重試
 */
import { create } from 'zustand';
import { api } from './api';
import { serverUrl } from './config';
import {
  attachToClass,
  fetchGoogleLinks,
  googleLogin,
  joinClass,
  linkGoogle,
  loginClass,
  logoutClass,
  playOnThisDevice,
  syncProfile,
  unlinkGoogle,
  uploadToCloud,
  type CloudDeps,
  type JoinInput,
  type LoginInput,
  type SyncOutcome,
} from './cloudSync';
import type { ServerConfig } from './protocol';
import { getToken, loadOutbox, onRecorded, saveOutbox, setToken } from './storage';
import { emptyOutbox, outboxSize } from './sync';
import { useGame } from '../store/useGame';
import type { Profile } from '../store/save';

/** 同步狀態 */
export type CloudStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'needLogin' | 'error';

interface CloudStore {
  /** 目前角色的同步狀態（本機角色是 idle） */
  status: CloudStatus;
  /** 最近一次失敗的訊息 */
  message: string | null;
  /** 目前角色還沒送出的操作筆數 */
  pending: number;
  /** 最近一次同步成功的時間（毫秒） */
  lastSyncAt: number | null;
  /** 加入班級（用目前設定的伺服器）；成功後該角色成為目前角色 */
  join: (input: JoinInput) => Promise<Profile>;
  /** 登入班級；成功後該角色成為目前角色，並把這台裝置待送的進度送出 */
  login: (input: LoginInput) => Promise<Profile>;
  /** 登出這台裝置並移除本機的這個角色 */
  logout: (profileId: string) => Promise<void>;
  /** 馬上同步 */
  syncNow: () => Promise<void>;
  /** 重新計算目前角色的待送筆數 */
  refresh: () => void;
  /** 伺服器的 Google 登入 Client ID（沒開 Google 登入或還沒讀到時是 null） */
  googleClientId: string | null;
  /** 向伺服器讀設定（決定要不要顯示 Google 按鈕）；讀不到就當作沒開 */
  loadConfig: () => Promise<void>;
  /**
   * 用 Google 快速登入：綁定的孩子全部登入到這台裝置。只有一位時直接成為目前角色；
   * 多位時不切換（由畫面帶孩子回選角畫面挑）。回傳登入的角色。
   */
  googleLogin: (idToken: string) => Promise<Profile[]>;
  /** 把 Google 帳號綁到這位孩子；回傳已綁定的帳號（email 已遮罩） */
  linkGoogle: (profileId: string, idToken: string) => Promise<string[]>;
  /** 解除這位孩子的 Google 綁定 */
  unlinkGoogle: (profileId: string) => Promise<string[]>;
  /** 讀出這位孩子已綁定的 Google 帳號 */
  fetchGoogleLinks: (profileId: string) => Promise<string[]>;
  /** 家長把這台裝置上的角色存到雲端（server、userToken 是家長帳號的登入狀態；docs/plans/accounts.md 第 6 節） */
  uploadToCloud: (profileId: string, server: string, userToken: string) => Promise<Profile>;
  /**
   * 家長選孩子「在這台裝置玩」：角色下載到這台裝置，並切換成目前的角色。
   * 這台裝置已經有同一個角色、但不是這個雲端角色時丟出 LocalConflictError；家長確認後帶 replaceLocal 再呼叫一次
   */
  playOnThisDevice: (kidId: string, server: string, userToken: string, opts?: { replaceLocal?: boolean }) => Promise<Profile>;
  /** 家長名下、還沒加入班級的雲端角色加入班級（同一個角色，不另開新角色） */
  attachToClass: (profileId: string, input: LoginInput) => Promise<Profile>;
  /** 把一個雲端角色從這台裝置拿掉（伺服器上已經刪除，或家長刪除帳號後）：本機角色、權杖、佇列都清掉 */
  forget: (accountId: string) => void;
}

/** 正式環境的依賴（送禮物的 useGifts 也用這一份） */
export const cloudDeps: CloudDeps = {
  call: (method, path, opts) => api(method, path, opts),
  getProfile: (id) => useGame.getState().save.profiles.find((p) => p.id === id) ?? null,
  putProfile: (p) => useGame.getState().putProfile(p),
  loadOutbox,
  saveOutbox,
  getToken,
  setToken,
  now: () => new Date(),
};

/** 目前角色（雲端角色才回傳） */
const activeCloudProfile = (): Profile | null => {
  const p = useGame.getState().profile();
  return p?.cloud ? p : null;
};

/** 排程用的狀態（不需要觸發畫面更新） */
const timer = { handle: null as ReturnType<typeof setTimeout> | null, at: 0, running: false, again: false, failures: 0 };

export const useCloud = create<CloudStore>((set, get) => ({
  status: 'idle',
  message: null,
  pending: 0,
  lastSyncAt: null,

  join: async (input) => {
    const server = serverUrl();
    if (!server) throw new Error('還沒有設定班級伺服器');
    const p = await joinClass(cloudDeps, server, input);
    useGame.getState().selectProfile(p.id);
    set({ status: 'synced', message: null, lastSyncAt: Date.now() });
    get().refresh();
    return p;
  },

  login: async (input) => {
    const server = serverUrl();
    if (!server) throw new Error('還沒有設定班級伺服器');
    const p = await loginClass(cloudDeps, server, input);
    useGame.getState().selectProfile(p.id);
    timer.failures = 0;
    void get().syncNow();
    return p;
  },

  logout: async (profileId) => {
    await logoutClass(cloudDeps, profileId);
    useGame.getState().deleteProfile(profileId);
    set({ status: 'idle', message: null, pending: 0 });
  },

  syncNow: async () => {
    if (timer.running) {
      timer.again = true;
      return;
    }
    timer.running = true;
    try {
      do {
        timer.again = false;
        await runSync(set);
      } while (timer.again);
    } finally {
      timer.running = false;
    }
  },

  refresh: () => {
    const p = activeCloudProfile();
    set({ pending: p ? outboxSize(loadOutbox(p.cloud!.accountId)) : 0, ...(p ? {} : { status: 'idle' as const }) });
  },

  googleClientId: null,

  loadConfig: async () => {
    if (!serverUrl()) return set({ googleClientId: null });
    try {
      const config = await api<ServerConfig>('GET', '/api/config');
      set({ googleClientId: config.googleClientId });
    } catch {
      set({ googleClientId: null });
    }
  },

  googleLogin: async (idToken) => {
    const server = serverUrl();
    if (!server) throw new Error('還沒有設定班級伺服器');
    const kids = await googleLogin(cloudDeps, server, idToken);
    if (kids.length === 1) useGame.getState().selectProfile(kids[0].id);
    timer.failures = 0;
    void get().syncNow();
    return kids;
  },

  linkGoogle: (profileId, idToken) => linkGoogle(cloudDeps, profileId, idToken),
  unlinkGoogle: (profileId) => unlinkGoogle(cloudDeps, profileId),
  fetchGoogleLinks: (profileId) => fetchGoogleLinks(cloudDeps, profileId),

  uploadToCloud: async (profileId, server, userToken) => {
    const p = await uploadToCloud(cloudDeps, server, userToken, profileId);
    get().refresh();
    void get().syncNow();
    return p;
  },

  playOnThisDevice: async (kidId, server, userToken, opts) => {
    const p = await playOnThisDevice(cloudDeps, server, userToken, kidId, opts);
    useGame.getState().selectProfile(p.id);
    timer.failures = 0;
    void get().syncNow();
    return p;
  },

  attachToClass: async (profileId, input) => {
    const p = await attachToClass(cloudDeps, profileId, input);
    useGame.getState().selectProfile(p.id);
    void get().syncNow();
    return p;
  },

  forget: (accountId) => {
    const p = useGame.getState().save.profiles.find((x) => x.cloud?.accountId === accountId);
    setToken(accountId, null);
    saveOutbox(accountId, emptyOutbox());
    if (p) useGame.getState().deleteProfile(p.id);
    get().refresh();
  },
}));

/** 同步目前角色，以及其他還有待送進度的雲端角色；依結果決定下次什麼時候再試 */
async function runSync(set: (s: Partial<CloudStore>) => void): Promise<void> {
  const active = activeCloudProfile();
  const others = useGame
    .getState()
    .save.profiles.filter((p) => p.cloud && p.id !== active?.id && getToken(p.cloud.accountId) && outboxSize(loadOutbox(p.cloud.accountId)) > 0);
  if (active) set({ status: 'syncing' });
  let outcome: SyncOutcome = { status: 'skipped' };
  if (active) outcome = await syncProfile(cloudDeps, active.id);
  for (const p of others) await syncProfile(cloudDeps, p.id);

  if (!active) {
    set({ status: 'idle', pending: 0 });
    return;
  }
  const pending = outboxSize(loadOutbox(active.cloud!.accountId));
  switch (outcome.status) {
    case 'synced':
      timer.failures = 0;
      set({ status: 'synced', message: null, pending, lastSyncAt: Date.now() });
      schedule(PULL_EVERY_MS);
      return;
    case 'offline':
    case 'error':
      timer.failures += 1;
      set({ status: outcome.status, message: outcome.message, pending });
      schedule(Math.min(60_000, 2000 * 2 ** (timer.failures - 1)));
      return;
    case 'needLogin':
      set({ status: 'needLogin', message: '請重新登入班級', pending });
      return;
    case 'skipped':
      set({ status: 'idle', pending: 0 });
  }
}

/** 定時拉一次的間隔 */
const PULL_EVERY_MS = 120_000;

/** 安排下次同步；已經有更早的排程就不動 */
function schedule(delayMs: number): void {
  const at = Date.now() + delayMs;
  if (timer.handle && timer.at <= at) return;
  if (timer.handle) clearTimeout(timer.handle);
  timer.at = at;
  timer.handle = setTimeout(() => {
    timer.handle = null;
    void useCloud.getState().syncNow();
  }, delayMs);
}

/**
 * 啟動同步排程（App 掛載時呼叫一次）；回傳停止的函式。
 */
export function startCloudSync(): () => void {
  const offRecorded = onRecorded((_accountId, op) => {
    useCloud.getState().refresh();
    schedule(op.kind === 'playTime' ? 30_000 : 1000);
  });
  // 換角色：雲端角色馬上同步一次
  const offProfile = useGame.subscribe((s, prev) => {
    if (s.save.activeProfileId !== prev.save.activeProfileId) {
      useCloud.getState().refresh();
      if (activeCloudProfile()) schedule(0);
    }
  });
  const onOnline = () => {
    timer.failures = 0;
    schedule(0);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') schedule(0);
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  // 讀伺服器設定（決定要不要顯示 Google 按鈕）
  void useCloud.getState().loadConfig();
  useCloud.getState().refresh();
  if (activeCloudProfile()) schedule(0);
  return () => {
    offRecorded();
    offProfile();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    if (timer.handle) clearTimeout(timer.handle);
    timer.handle = null;
  };
}
