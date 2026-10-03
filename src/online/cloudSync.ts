/**
 * 雲端角色的加入、登入、登出與同步（依賴都由呼叫端注入，單元測試可以接上真正的伺服器 app）。
 * 排程（什麼時候同步）與畫面狀態在 useCloud.ts。
 */
import { ApiFailure, type ApiOptions } from './api';
import { ackBatch, emptyOutbox, rebase, takeBatch, type Outbox } from './sync';
import type {
  AcceptGiftResponse,
  AttachResponse,
  Classmate,
  ClassmatesResponse,
  GiftsResponse,
  GoogleKidsResponse,
  GoogleLinksResponse,
  OpsResponse,
  RoomInfo,
  SendGiftResponse,
  SessionResponse,
} from './protocol';
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

/** 由加入／登入的回應組出本機的雲端標記；沒有班級（家長名下的雲端角色）就不帶班級 */
function cloudOf(server: string, res: SessionResponse): CloudLink {
  return withRoom({ server, accountId: res.account.id }, res.room);
}

/** 雲端標記換成伺服器說的目前班級（加入、退出、被移出班級都靠這裡更新本機） */
function withRoom(cloud: CloudLink, room: RoomInfo | null): CloudLink {
  const { room: _code, roomName: _name, ...rest } = cloud;
  return room ? { ...rest, room: room.code, roomName: room.name } : rest;
}

/**
 * 家長把這台裝置上的角色存到雲端（docs/plans/accounts.md 第 6 節）：同一個角色就地變成雲端角色（沒有班級），
 * 權杖記在這台裝置，之後照常同步。userToken 是家長的大人權杖。
 */
export async function uploadToCloud(deps: CloudDeps, server: string, userToken: string, profileId: string): Promise<Profile> {
  const local = deps.getProfile(profileId);
  if (!local) throw new Error('找不到這個角色');
  if (local.cloud) throw new Error('這個角色已經是雲端角色了');
  const res = await deps.call<SessionResponse>('POST', '/api/parent/kids', { base: server, token: userToken, body: { profile: local } });
  const cloud = cloudOf(server, res);
  deps.setToken(cloud.accountId, res.token);
  deps.saveOutbox(cloud.accountId, emptyOutbox());
  const profile: Profile = { ...res.profile, cloud };
  deps.putProfile(profile);
  return profile;
}

/**
 * 家長在這台裝置登入後選孩子「在這台裝置玩」：拿一張這個角色的權杖，本機存檔＝伺服器版本＋這台裝置還沒送出的進度
 * （和代碼登入同一條路）。kidId 是伺服器上的帳號 id。
 */
export async function playOnThisDevice(deps: CloudDeps, server: string, userToken: string, kidId: string): Promise<Profile> {
  const res = await deps.call<SessionResponse>('POST', `/api/parent/kids/${encodeURIComponent(kidId)}/device`, { base: server, token: userToken, body: {} });
  const cloud = cloudOf(server, res);
  deps.setToken(cloud.accountId, res.token);
  const profile = rebase(res.profile, deps.loadOutbox(cloud.accountId), cloud, deps.now());
  deps.putProfile(profile);
  return profile;
}

/** 已有的雲端角色加入班級（帶自己的權杖，不另開新角色）：本機的雲端標記多了班級，名字改成班上的暱稱 */
export async function attachToClass(deps: CloudDeps, profileId: string, input: LoginInput): Promise<Profile> {
  const { cloud, token } = credentials(deps, profileId);
  const res = await deps.call<AttachResponse>('POST', '/api/join', { base: cloud.server, token, body: input });
  const profile = rebase(res.profile, deps.loadOutbox(cloud.accountId), withRoom(cloud, res.room), deps.now());
  deps.putProfile(profile);
  return profile;
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

/**
 * 用 Google 快速登入（備選）：這個 Google 帳號綁定的孩子全部登入到這台裝置，回傳這些角色。
 * 每一位都和代碼登入走同一條路：本機存檔＝伺服器版本＋這台裝置還沒送出的進度（不能直接覆蓋）。
 * 要不要切換目前角色由呼叫端決定（只有一位就直接進島，多位回選角畫面）。
 */
export async function googleLogin(deps: CloudDeps, server: string, idToken: string): Promise<Profile[]> {
  const res = await deps.call<GoogleKidsResponse>('POST', '/api/google/login', { base: server, body: { idToken } });
  return res.kids.map((kid) => {
    const cloud = cloudOf(server, kid);
    deps.setToken(cloud.accountId, kid.token);
    const profile = rebase(kid.profile, deps.loadOutbox(cloud.accountId), cloud, deps.now());
    deps.putProfile(profile);
    return profile;
  });
}

/** 讀出雲端角色的伺服器位置與權杖；沒有登入就丟出錯誤 */
function credentials(deps: CloudDeps, profileId: string): { cloud: CloudLink; token: string } {
  const cloud = deps.getProfile(profileId)?.cloud;
  if (!cloud) throw new Error('這個角色不是雲端角色');
  const token = deps.getToken(cloud.accountId);
  if (!token) throw new Error('請先重新登入班級');
  return { cloud, token };
}

/** 把 Google 帳號綁到這位孩子（之後可以用 Google 快速登入）；回傳已綁定的帳號（email 已遮罩） */
export async function linkGoogle(deps: CloudDeps, profileId: string, idToken: string): Promise<string[]> {
  const { cloud, token } = credentials(deps, profileId);
  return (await deps.call<GoogleLinksResponse>('POST', '/api/google/link', { base: cloud.server, token, body: { idToken } })).google;
}

/** 解除這位孩子的所有 Google 綁定 */
export async function unlinkGoogle(deps: CloudDeps, profileId: string): Promise<string[]> {
  const { cloud, token } = credentials(deps, profileId);
  return (await deps.call<GoogleLinksResponse>('DELETE', '/api/google/link', { base: cloud.server, token })).google;
}

/** 讀出這位孩子已綁定的 Google 帳號（email 已遮罩） */
export async function fetchGoogleLinks(deps: CloudDeps, profileId: string): Promise<string[]> {
  const { cloud, token } = credentials(deps, profileId);
  return (await deps.call<GoogleLinksResponse>('GET', '/api/me', { base: cloud.server, token })).google;
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
    // 班級跟著伺服器更新：在別台裝置退出班級、或被老師移出時，這台也會知道
    deps.putProfile(rebase(res.profile, rest, withRoom(current.cloud, res.room), deps.now()));
    if (!rest.pending.length) return { status: 'synced', rev: res.rev, rejected: res.rejected };
  }
}

// ---------- 送禮物（P3；規格見 docs/plans/online.md 第 7 節） ----------

/** 收下禮物的結果：returned 是已經有了、自動退回；done 是之前已經處理過（例如另一台裝置按過）；expired 是放太久已退回 */
export type AcceptOutcome = 'accepted' | 'returned' | 'done' | 'expired';

/** 呼叫需要登入的 API；權杖失效時清掉（畫面會請孩子重新登入），錯誤照樣丟出 */
async function authed<T>(deps: CloudDeps, profileId: string, method: string, path: string, body?: unknown): Promise<T> {
  const { cloud, token } = credentials(deps, profileId);
  try {
    return await deps.call<T>(method, path, { base: cloud.server, token, ...(body !== undefined ? { body } : {}) });
  } catch (err) {
    if (err instanceof ApiFailure && err.status === 401) deps.setToken(cloud.accountId, null);
    throw err;
  }
}

/** 伺服器回傳的最新存檔寫回本機：疊上還沒送出的操作（和同步同一條路） */
function applyServerProfile(deps: CloudDeps, profileId: string, server: Profile): void {
  const current = deps.getProfile(profileId);
  if (!current?.cloud) return;
  deps.putProfile(rebase(server, deps.loadOutbox(current.cloud.accountId), current.cloud, deps.now()));
}

/** 讀全班同學（不含自己），選送禮對象用 */
export async function fetchClassmates(deps: CloudDeps, profileId: string): Promise<Classmate[]> {
  return (await authed<ClassmatesResponse>(deps, profileId, 'GET', '/api/classmates')).classmates;
}

/** 讀禮物狀態：待收下的禮物、送出的禮物的結果、今天送了幾份 */
export async function fetchGifts(deps: CloudDeps, profileId: string): Promise<GiftsResponse> {
  return authed<GiftsResponse>(deps, profileId, 'GET', '/api/gifts');
}

/**
 * 送禮物。先把待送的操作送完，伺服器才看得到最新的金幣（直接呼叫 syncProfile：useCloud 的 syncNow
 * 在同步進行中時會馬上返回，不保證送完）。id 由呼叫端產生，同一次送禮重試時沿用，伺服器不會扣兩次錢。
 */
export async function sendGift(deps: CloudDeps, profileId: string, input: { id: string; to: string; itemId: string }): Promise<SendGiftResponse['gift']> {
  const flushed = await syncProfile(deps, profileId);
  if (flushed.status === 'offline') throw new ApiFailure(0, 'network', flushed.message);
  if (flushed.status === 'needLogin') throw new ApiFailure(401, 'unauthorized', '請重新登入班級');
  if (flushed.status === 'error') throw new ApiFailure(500, 'error', flushed.message);
  const res = await authed<SendGiftResponse>(deps, profileId, 'POST', '/api/gifts', input);
  applyServerProfile(deps, profileId, res.profile);
  return res.gift;
}

/** 收下禮物；之前已經處理過或放太久時不丟錯誤，回傳結果讓畫面說明 */
export async function acceptGift(deps: CloudDeps, profileId: string, giftId: string): Promise<AcceptOutcome> {
  try {
    const res = await authed<AcceptGiftResponse>(deps, profileId, 'POST', `/api/gifts/${encodeURIComponent(giftId)}/accept`, {});
    applyServerProfile(deps, profileId, res.profile);
    return res.status;
  } catch (err) {
    if (err instanceof ApiFailure && err.status === 409 && err.code === 'gift_done') return 'done';
    if (err instanceof ApiFailure && err.status === 409 && err.code === 'gift_expired') return 'expired';
    throw err;
  }
}

/** 不用了（金幣退回送禮人）；之前已經處理過就當作完成 */
export async function declineGift(deps: CloudDeps, profileId: string, giftId: string): Promise<void> {
  try {
    await authed(deps, profileId, 'POST', `/api/gifts/${encodeURIComponent(giftId)}/decline`, {});
  } catch (err) {
    if (err instanceof ApiFailure && err.status === 409 && err.code === 'gift_done') return;
    throw err;
  }
}

/** 送禮結果看過了 */
export async function ackGiftNotices(deps: CloudDeps, profileId: string, ids: string[]): Promise<void> {
  if (ids.length) await authed(deps, profileId, 'POST', '/api/gifts/notices/ack', { ids });
}
