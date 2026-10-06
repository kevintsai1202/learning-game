/**
 * 多班級（docs/plans/multi-class.md）：一個孩子可以同時在好幾個班級（例如學校的班級＋安親班），最多 MAX_CLASSES 個。
 * 每一班各自的暱稱與孩子密碼放在 class_members（資料表第 10 版）；accounts.room_code、pin_hash 是舊欄位，不再讀也不再寫。
 *
 * 兩種「第一個」的定義（全部的程式都用這裡的，才不會不一致）：
 * - 一個孩子的「第一個班級」：最早加入的（joined_at，同時加入再比班級代碼）。回應裡給舊版網頁的 room、
 *   沒說哪一班時進的班級島，都用它。
 * - 兩個孩子的「共同班級」：最早建立的那一班（rooms.created_at，再比代碼）。好友名單上的暱稱、
 *   舊版網頁送禮記在哪一班用它，兩邊看到的一致。
 */
import type { Queryable } from './db';
import type { ClassInfo } from '../src/online/protocol';
import type { CurriculumChoice } from '../src/store/save';
import type { RoomFlags } from '../src/online/realtime';

/** 一個孩子最多幾個班級（使用者決定，第 8 節第 2 點） */
export const MAX_CLASSES = 5;

/** 一筆「我和某位朋友同在一班」的資料（ws.ts 從資料庫讀出來，交給 sharedClassNames） */
export interface SharedMembership {
  friendId: string;
  roomCode: string;
  roomCreatedAt: Date;
  /** 朋友在那一班的暱稱 */
  friendNickname: string;
  /** 我在那一班的暱稱 */
  myNickname: string;
}

/** 好友名單上用的名字：朋友在共同班級的暱稱，以及朋友那邊看到的我的名字（同一班） */
export interface SharedName {
  nickname: string;
  myName: string;
  roomCode: string;
}

/**
 * 每位朋友挑「最早建立的共同班級」，回傳朋友 id → 那一班的兩個暱稱。
 * 沒有共同班級的朋友（只是兄弟姊妹）不在結果裡，呼叫端用角色名字。
 */
export function sharedClassNames(rows: SharedMembership[]): Map<string, SharedName> {
  const best = new Map<string, SharedMembership>();
  for (const r of rows) {
    const cur = best.get(r.friendId);
    if (!cur || earlierRoom(r, cur)) best.set(r.friendId, r);
  }
  return new Map([...best].map(([id, r]) => [id, { nickname: r.friendNickname, myName: r.myNickname, roomCode: r.roomCode }]));
}

/** a 的班級是不是比 b 的早建立（同時建立比代碼） */
function earlierRoom(a: Pick<SharedMembership, 'roomCreatedAt' | 'roomCode'>, b: Pick<SharedMembership, 'roomCreatedAt' | 'roomCode'>): boolean {
  const ta = new Date(a.roomCreatedAt).getTime();
  const tb = new Date(b.roomCreatedAt).getTime();
  return ta !== tb ? ta < tb : a.roomCode < b.roomCode;
}

/** 一個孩子在某一班的成員資格（含班級的設定） */
export interface MembershipRow {
  room_code: string;
  nickname: string;
  nickname_key: string;
  /** 這一班的孩子密碼；家長用家長帳號加入、老師還沒設定時是 null */
  pin_hash: string | null;
  joined_at: Date;
  /** 班級名稱 */
  name: string;
  curriculum: CurriculumChoice | null;
  chat_open: boolean;
  gifts_open: boolean;
  room_created_at: Date;
}

/** 一個孩子的所有班級，第一個班級在前面（最早加入的） */
export async function membershipsOf(q: Queryable, accountId: string): Promise<MembershipRow[]> {
  return q.query<MembershipRow>(
    `SELECT m.room_code, m.nickname, m.nickname_key, m.pin_hash, m.joined_at, r.name, r.curriculum, r.chat_open, r.gifts_open, r.created_at AS room_created_at
     FROM class_members m JOIN rooms r ON r.code = m.room_code
     WHERE m.account_id = $1 ORDER BY m.joined_at, m.room_code`,
    [accountId],
  );
}

/** 回應給孩子裝置的班級清單（代碼、名稱、班級教材、這一班的暱稱），第一個班級在前面 */
export function classInfos(rows: MembershipRow[]): ClassInfo[] {
  return rows.map((m) => ({ code: m.room_code, name: m.name, curriculum: m.curriculum ?? null, nickname: m.nickname }));
}

/** 班級的開關（即時連線用） */
export function flagsOf(m: Pick<MembershipRow, 'chat_open' | 'gifts_open'>): RoomFlags {
  return { chatOpen: m.chat_open, giftsOpen: m.gifts_open };
}

/**
 * 撤銷某一班發的 class 權杖（用那一班的代碼＋暱稱＋密碼登入拿到的）。
 * 條件一定要有 via = 'class'：家長權杖的 room_code 是發權杖當時的班級，不能拿來判斷。
 */
export async function revokeClassTokens(q: Queryable, accountId: string, roomCode: string): Promise<void> {
  await q.query("DELETE FROM tokens WHERE account_id = $1 AND via = 'class' AND room_code = $2", [accountId, roomCode]);
}

/** 讓一個孩子離開某一班（只在交易裡呼叫，那一班的禮物要先結清）：刪掉成員資格與那一班發的 class 權杖 */
export async function leaveClass(tx: Queryable, accountId: string, roomCode: string): Promise<void> {
  await tx.query('DELETE FROM class_members WHERE account_id = $1 AND room_code = $2', [accountId, roomCode]);
  await revokeClassTokens(tx, accountId, roomCode);
}

/** 我和每位同學的共同班級（好友名單的名字用；交給 sharedClassNames 挑最早建立的那一班） */
export async function sharedMembershipsOf(q: Queryable, accountId: string): Promise<SharedMembership[]> {
  const rows = await q.query<{ friend_id: string; room_code: string; room_created_at: Date; friend_nickname: string; my_nickname: string }>(
    `SELECT other.account_id AS friend_id, mine.room_code, r.created_at AS room_created_at, other.nickname AS friend_nickname, mine.nickname AS my_nickname
     FROM class_members mine
     JOIN class_members other ON other.room_code = mine.room_code AND other.account_id <> mine.account_id
     JOIN rooms r ON r.code = mine.room_code
     WHERE mine.account_id = $1`,
    [accountId],
  );
  return rows.map((r) => ({ friendId: r.friend_id, roomCode: r.room_code, roomCreatedAt: r.room_created_at, friendNickname: r.friend_nickname, myNickname: r.my_nickname }));
}
