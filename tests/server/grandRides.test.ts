/**
 * 班級島大型設施（docs/plans/grand-rides.md）第 ② 段：伺服器。
 * - welcome 帶伺服器的時間 now（裝置對時，班次各台一致）；能力宣告 caps 有 grand。
 * - 座位代碼 co0～co23、wh0～wh47、sh：格式驗證收得到、轉送給島上其他人；範圍外的不收。
 * - 新操作 grand：扣 5 金幣（價錢查共用常數，不信任裝置）；金幣不夠拒絕；不認得的設施格式驗證失敗。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Hub, type HubConn } from '../../server/hub';
import { clientMessage, type ServerMessage } from '../../src/online/realtime';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';
import { applyOp, opSchema, type Op } from '../../src/online/ops';

/** 假連線：記下收到的訊息 */
class FakeConn implements HubConn {
  sent: ServerMessage[] = [];
  send(msg: ServerMessage) {
    this.sent.push(msg);
  }
  close() {}
  of<T extends ServerMessage['t']>(t: T) {
    return this.sent.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
  }
}

const NOW = new Date('2026-10-12T10:00:00+08:00');
const AT = '2026-10-12T09:59:00+08:00';
/** 一個孩子（金幣可以指定） */
function kid(coins: number): Profile {
  const p = addProfile(createEmptySave(), { name: '阿寶', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW).profiles[0];
  return { ...p, coins };
}

describe('即時中樞', () => {
  let hub: Hub;
  beforeEach(() => {
    hub = new Hub({ now: () => 1_760_000_000_000 });
  });
  const join = (id: string, nickname: string) => {
    const conn = new FakeConn();
    const profile = kid(20);
    hub.join(conn, { accountId: id, name: nickname, classes: [{ code: '123456', nickname, flags: { chatOpen: true, giftsOpen: true } }], profile, via: 'class', tokenRoom: '123456' });
    return conn;
  };

  it('歡迎訊息帶伺服器的時間（裝置對時）；能力宣告有 grand', () => {
    const a = join('a', '阿寶');
    const w = a.of('welcome')[0];
    expect(w.now).toBe(1_760_000_000_000);
    expect(w.caps).toContain('grand');
  });

  it('座位代碼 co、wh、sh：格式驗證收得到（範圍外不收），轉送給島上其他人（飛船的座標照原樣，是甲板上的局部座標）', () => {
    for (const a of ['co0', 'co23', 'wh0', 'wh47', 'sh']) expect(clientMessage.safeParse({ t: 'move', x: 1, z: 2, h: 0, a }).success).toBe(true);
    for (const a of ['co24', 'wh48', 'co', 'shh']) expect(clientMessage.safeParse({ t: 'move', x: 1, z: 2, h: 0, a }).success).toBe(false);
    const a = join('a', '阿寶');
    const b = join('b', '小美');
    hub.move(a, 1.4, -2.5, -1.2, 'sh');
    hub.flush();
    expect(b.of('moves').at(-1)!.list).toEqual([['a', 1.4, -2.5, -1.2, 'sh']]);
    hub.move(a, 3, 4, 0.5, 'co17');
    hub.flush();
    expect(b.of('moves').at(-1)!.list).toEqual([['a', 3, 4, 0.5, 'co17']]);
  });
});

describe('操作 grand：玩大型設施扣 5 金幣', () => {
  it('扣 5 金幣；金幣不夠拒絕；不認得的設施、帶了價錢的格式都不收', () => {
    const r = applyOp(kid(12), { id: 'g1', at: AT, kind: 'grand', ride: 'coaster' }, NOW);
    expect(r.ok && r.profile.coins).toBe(7);
    const w = applyOp(kid(5), { id: 'g2', at: AT, kind: 'grand', ride: 'wheel' }, NOW);
    expect(w.ok && w.profile.coins).toBe(0);
    expect(applyOp(kid(4), { id: 'g3', at: AT, kind: 'grand', ride: 'ship' }, NOW)).toEqual({ ok: false, reason: '金幣不夠' });
    expect(opSchema.safeParse({ id: 'g4', at: AT, kind: 'grand', ride: 'ship' }).success).toBe(true);
    expect(opSchema.safeParse({ id: 'g5', at: AT, kind: 'grand', ride: 'rocket' }).success).toBe(false);
    // 裝置送來的價錢不採用（格式驗證會把多的欄位拿掉，照樣扣 5）
    const parsed = opSchema.parse({ id: 'g6', at: AT, kind: 'grand', ride: 'coaster', price: 0 }) as Op;
    const r2 = applyOp(kid(10), parsed, NOW);
    expect(r2.ok && r2.profile.coins).toBe(5);
  });
});
