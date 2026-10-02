/**
 * 雲端角色的加入、登入、登出與同步（依賴都由呼叫端注入，單元測試可以接上真正的伺服器 app）。
 * 排程（什麼時候同步）與畫面狀態在 useCloud.ts。
 */
import { ApiFailure, type ApiOptions } from './api';
import { ackBatch, emptyOutbox, rebase, takeBatch, type Outbox } from './sync';
import type { OpsResponse, SessionResponse } from './protocol';
import type { AvatarConfig, CloudLink, Profile } from '../store/save';

/** 同步需要的外部功能 */
export interface CloudDeps {
  /** 呼叫伺服器 API（正式環境是 api()） */
  call: <T>(method: string, path: string, opts: ApiOptions) => Promise<T>;
  /** 讀本機角色 */
  getProfile: (profileId: string) => Profile | null;
  /** 寫入本機角色（同 id 取代，沒有就新增） */
  putProfile: (profile: Profile) => void;
  loadOutbox: (accountId: string) => Outbox;
  saveOutbox: (accountId: string, box: Outbox) => void;
  getToken: (accountId: string) => string | null;
  setToken: (accountId: string, token: string | null) => void;
  now: () => Date;
}

/** 一次同步的結果 */
export type SyncOutcome =
  | { status: 'synced'; rev: number; rejected: OpsResponse['rejected'] }
  | { status: 'offline'; message: string }
  | { status: 'needLogin' }
  | { status: 'error'; message: string }
  | { status: 'skipped' };

/** 加入班級的輸入：avatar（建新角色）與 profile（帶本機角色）擇一 */
export interface JoinInput {
  code: string;
  nickname: string;
  pin: string;
  avatar?: AvatarConfig;
  profile?: Profile;
}

/** 登入的輸入 */
export interface LoginInput {
  code: string;
  nickname: string;
  pin: string;
}

/** 由加入／登入的回應組出本機的雲端標記 */
function cloudOf(server: string, res: SessionResponse): CloudLink {
  return { server, room: res.room.code, roomName: res.room.name, accountId: res.account.id };
}

/** 加入班級：成功後本機多一個（或轉換成）雲端角色，回傳該角色 */
export async function joinClass(deps: CloudDeps, server: string, input: JoinInput): Promise<Profile> {
  const body = input.profile ? { code: input.code, nickname: input.nickname, pin: input.pin, profile: input.profile } : { code: input.code, nickname: input.nickname, pin: input.pin, avatar: input.avatar };
  const res = await deps.call<SessionResponse>('POST', '/api/join', { base: server, body });
  const cloud = cloudOf(server, res);
  deps.setToken(cloud.accountId, res.token);
  deps.saveOutbox(cloud.accountId, emptyOutbox());
  const profile: Profile = { ...res.profile, cloud };
  deps.putProfile(profile);
  return profile;
}

/**
 * 登入：本機顯示「伺服器版本＋這台裝置還沒送出的進度」（例如權杖失效前離線玩的部分），回傳該角色。
 * 呼叫端接著要同步一次，把待送的進度送出。
 */
export async function loginClass(deps: CloudDeps, server: string, input: LoginInput): Promise<Profile> {
  const res = await deps.call<SessionResponse>('POST', '/api/login', { base: server, body: input });
  const cloud = cloudOf(server, res);
  deps.setToken(cloud.accountId, res.token);
  const profile = rebase(res.profile, deps.loadOutbox(cloud.accountId), cloud, deps.now());
  deps.putProfile(profile);
  return profile;
}

/** 登出這台裝置：伺服器端的權杖失效（連不上就算了），清掉本機權杖與佇列。移除本機角色由呼叫端處理 */
export async function logoutClass(deps: CloudDeps, profileId: string): Promise<void> {
  const cloud = deps.getProfile(profileId)?.cloud;
  if (!cloud) return;
  const token = deps.getToken(cloud.accountId);
  if (token) await deps.call('POST', '/api/logout', { base: cloud.server, token, body: {} }).catch(() => undefined);
  deps.setToken(cloud.accountId, null);
  deps.saveOutbox(cloud.accountId, emptyOutbox());
}

/**
 * 同步一位雲端角色：一批一批送出待送操作（沒有操作時送空批次，向伺服器拿最新存檔），
 * 每批回來就用伺服器版本＋剩下的操作重算本機存檔，直到佇列清空。
 */
export async function syncProfile(deps: CloudDeps, profileId: string): Promise<SyncOutcome> {
  for (;;) {
    const cloud = deps.getProfile(profileId)?.cloud;
    if (!cloud) return { status: 'skipped' };
    const token = deps.getToken(cloud.accountId);
    if (!token) return { status: 'needLogin' };

    // 送出前先把「送出中」存起來：途中關掉分頁，下次也會用同樣的 id 重送
    const { box, batch } = takeBatch(deps.loadOutbox(cloud.accountId));
    deps.saveOutbox(cloud.accountId, box);
    let res: OpsResponse;
    try {
      res = await deps.call<OpsResponse>('POST', '/api/ops', { base: cloud.server, token, body: { ops: batch } });
    } catch (err) {
      const e = err instanceof ApiFailure ? err : new ApiFailure(0, 'network', '連不上班級伺服器');
      if (e.status === 0) return { status: 'offline', message: e.message };
      if (e.status === 401) {
        // 權杖失效（過期、老師重設密碼或移除）：清掉，畫面才會帶入代碼與暱稱請孩子重新登入
        deps.setToken(cloud.accountId, null);
        return { status: 'needLogin' };
      }
      // 整批格式有問題（理論上不會發生）：丟掉這批，避免一直重送卡住後面的進度
      if (e.status === 400 || e.status === 413) deps.saveOutbox(cloud.accountId, ackBatch(deps.loadOutbox(cloud.accountId)));
      return { status: 'error', message: e.message };
    }
    // 送出期間可能又有新的操作進到待送段，所以重新讀佇列再清掉送出中
    const rest = ackBatch(deps.loadOutbox(cloud.accountId));
    deps.saveOutbox(cloud.accountId, rest);
    // 角色可能在送出期間被登出移除了
    const current = deps.getProfile(profileId);
    if (!current?.cloud) return { status: 'skipped' };
    deps.putProfile(rebase(res.profile, rest, current.cloud, deps.now()));
    if (!rest.pending.length) return { status: 'synced', rev: res.rev, rejected: res.rejected };
  }
}
