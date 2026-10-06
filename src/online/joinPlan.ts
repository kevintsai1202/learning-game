/**
 * 掃 QR code 加入班級的面板怎麼做（L2 家長自動化，docs/plans/login-ux-review.md 的「L2 實作細節」）。純函式，不碰畫面。
 * - 一個角色都沒有：直接出現新建角色的表單。
 * - 只有一個家長名下、可以用的角色（可以加入、或已經在這一班）：自動加入、在這台裝置玩、進那一班的班級島。
 *   已經在這一班的，老師沒開放加入也照樣進。
 * - 從家長頁的「🏫 加入班級」帶著某個孩子進來：那個孩子可以用就自動。
 * - 其他：卡片，點一下就加入並進島。
 * 這台裝置上還沒存到雲端的角色不自動（共用裝置上可能是別人家的孩子，和「存到雲端」的決定 A 同一個理由）。
 */
import { MAX_CLASSES, kidRooms, type KidSummary } from './protocol';
import type { Profile } from '../store/save';

/** 卡片不能選的原因：已經有 MAX_CLASSES 個班級、老師沒開放加入 */
export type JoinBlock = 'full' | 'closed';

/** 家長名下的一個候選角色：member 是已經在這一班（點了直接進島） */
export interface CloudCandidate {
  kind: 'cloud';
  kid: KidSummary;
  member: boolean;
  blocked: JoinBlock | null;
}

/** 這台裝置上還沒存到雲端的候選角色（點了先存到家長帳號再加入） */
export interface LocalCandidate {
  kind: 'local';
  profile: Profile;
  blocked: 'closed' | null;
}

export type JoinCandidate = CloudCandidate | LocalCandidate;

/** 面板要怎麼做 */
export type JoinPlan = { kind: 'create' } | { kind: 'auto'; candidate: CloudCandidate } | { kind: 'pick'; candidates: JoinCandidate[] };

/** joinPlan 的輸入 */
export interface JoinPlanInput {
  /** 要加入的班級代碼 */
  code: string;
  /** 老師有沒有開放加入 */
  joinOpen: boolean;
  /** 家長名下的角色 */
  kids: KidSummary[];
  /** 這台裝置上的角色（裡面還沒存到雲端、雲端也沒有同一個角色的，才是候選） */
  localProfiles: Profile[];
  /** 從家長頁帶進來的孩子（雲端角色的帳號 id） */
  preferredKidId?: string;
}

/** 所有候選角色：家長名下的在前、這台裝置上的在後 */
export function joinCandidates({ code, joinOpen, kids, localProfiles }: JoinPlanInput): JoinCandidate[] {
  const cloud: CloudCandidate[] = kids.map((kid) => {
    const rooms = kidRooms(kid);
    const member = rooms.some((r) => r.code === code);
    const blocked: JoinBlock | null = member ? null : rooms.length >= MAX_CLASSES ? 'full' : joinOpen ? null : 'closed';
    return { kind: 'cloud', kid, member, blocked };
  });
  const local: LocalCandidate[] = localProfiles
    .filter((p) => !p.cloud && !kids.some((k) => k.profileId === p.id))
    .map((profile) => ({ kind: 'local', profile, blocked: joinOpen ? null : 'closed' }));
  return [...cloud, ...local];
}

/** 決定面板怎麼做（規則見檔頭） */
export function joinPlan(input: JoinPlanInput): JoinPlan {
  const candidates = joinCandidates(input);
  if (!candidates.length) return { kind: 'create' };
  const usable = (c: JoinCandidate | undefined): c is CloudCandidate => c?.kind === 'cloud' && c.blocked === null;
  const preferred = input.preferredKidId ? candidates.find((c) => c.kind === 'cloud' && c.kid.id === input.preferredKidId) : undefined;
  if (usable(preferred)) return { kind: 'auto', candidate: preferred };
  if (!input.preferredKidId && candidates.length === 1 && usable(candidates[0])) return { kind: 'auto', candidate: candidates[0] };
  return { kind: 'pick', candidates };
}
