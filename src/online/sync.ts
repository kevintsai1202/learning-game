/**
 * 雲端同步的待送佇列與 rebase（純函式，有單元測試）。
 *
 * 佇列分兩段：
 * - pending（待送）：還沒交給伺服器，可以合併（連續的遊玩時間）。
 * - inflight（送出中）：已經送出、等伺服器確認。內容不能再變：斷線後要用同樣的 id 重送，
 *   伺服器依 id 去重，若內容改了，多出來的部分會被丟掉。
 */
import { applyOp, PLAYTIME_OP_MAX, type Op } from './ops';
import { dateKey, type CloudLink, type Profile } from '../store/save';

/** 一次最多送幾筆操作（伺服器也限制這個數量） */
export const BATCH_LIMIT = 20;

/** 待送佇列 */
export interface Outbox {
  /** 已送出、等確認的操作 */
  inflight: Op[];
  /** 還沒送出的操作 */
  pending: Op[];
}

/** 空佇列 */
export function emptyOutbox(): Outbox {
  return { inflight: [], pending: [] };
}

/** 佇列裡共有幾筆操作 */
export function outboxSize(box: Outbox): number {
  return box.inflight.length + box.pending.length;
}

/**
 * 放進一筆操作。遊玩時間若能接在待送段最後一筆遊玩時間後面（同一天、合併後不超過上限），就合併成一筆，
 * 保留第一筆的 id 與時間；否則另起一筆。
 */
export function enqueue(box: Outbox, op: Op): Outbox {
  const last = box.pending[box.pending.length - 1];
  if (op.kind === 'playTime' && last?.kind === 'playTime') {
    const sameDay = dateKey(new Date(last.at)) === dateKey(new Date(op.at));
    const total = last.seconds + op.seconds;
    if (sameDay && total <= PLAYTIME_OP_MAX) {
      return { ...box, pending: [...box.pending.slice(0, -1), { ...last, seconds: total }] };
    }
  }
  return { ...box, pending: [...box.pending, op] };
}

/**
 * 取出要送的一批：送出中段還有東西（上一批沒確認）就原樣重送；
 * 否則從待送段拿最多 BATCH_LIMIT 筆移到送出中。沒有操作時回傳空批次（用來向伺服器拿最新存檔）。
 */
export function takeBatch(box: Outbox): { box: Outbox; batch: Op[] } {
  if (box.inflight.length) return { box, batch: box.inflight };
  const batch = box.pending.slice(0, BATCH_LIMIT);
  return { box: { inflight: batch, pending: box.pending.slice(BATCH_LIMIT) }, batch };
}

/** 伺服器確認收到（不論各筆是套用或拒絕）後，清掉送出中段 */
export function ackBatch(box: Outbox): Outbox {
  return { inflight: [], pending: box.pending };
}

/**
 * 以伺服器的存檔為底，依序重算佇列裡還沒被伺服器確認的操作，得到本機要顯示的存檔。
 * 本機重算時被拒絕的操作直接略過（伺服器收到也會拒絕）。雲端標記一律用本機的。
 */
export function rebase(server: Profile, box: Outbox, cloud: CloudLink, now: Date): Profile {
  let p: Profile = { ...server, cloud };
  for (const op of [...box.inflight, ...box.pending]) {
    const r = applyOp(p, op, now);
    if (r.ok) p = r.profile;
  }
  return p;
}
