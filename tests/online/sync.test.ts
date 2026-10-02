import { describe, expect, it } from 'vitest';
import { ackBatch, emptyOutbox, enqueue, outboxSize, rebase, takeBatch, BATCH_LIMIT, type Outbox } from '../../src/online/sync';
import { PLAYTIME_OP_MAX, type Op } from '../../src/online/ops';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';

const NOW = new Date('2026-10-02T10:00:00+08:00');
const play = (id: string, seconds: number, at = '2026-10-02T09:00:00+08:00'): Op => ({ id, at, kind: 'playTime', seconds });
const buy = (id: string, itemId: string): Op => ({ id, at: '2026-10-02T09:00:00+08:00', kind: 'buy', itemId });

function kid(coins = 100): Profile {
  const s = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW);
  return { ...s.profiles[0], coins };
}

describe('待送佇列：遊玩時間合併', () => {
  it('連續的遊玩時間合併成一筆（保留第一筆的 id 與時間）', () => {
    let box = emptyOutbox();
    box = enqueue(box, play('p1', 60));
    box = enqueue(box, play('p2', 60, '2026-10-02T09:01:00+08:00'));
    expect(box.pending).toEqual([play('p1', 120)]);
  });

  it(`合併後超過 ${PLAYTIME_OP_MAX} 秒就另起一筆`, () => {
    let box = emptyOutbox();
    for (let i = 0; i < 40; i++) box = enqueue(box, play(`p${i}`, 60));
    expect(box.pending.map((o) => (o.kind === 'playTime' ? o.seconds : 0))).toEqual([600, 600, 600, 600]);
  });

  it('不同日期、或中間隔著別的操作，都不合併', () => {
    let box = emptyOutbox();
    box = enqueue(box, play('p1', 60, '2026-10-01T23:59:00+08:00'));
    box = enqueue(box, play('p2', 60, '2026-10-02T00:01:00+08:00'));
    box = enqueue(box, buy('b1', 'hat.cap'));
    box = enqueue(box, play('p3', 60));
    expect(box.pending.map((o) => o.id)).toEqual(['p1', 'p2', 'b1', 'p3']);
  });

  it('送出中的操作內容不能再變：新的遊玩時間只合併進待送段', () => {
    let box = enqueue(emptyOutbox(), play('p1', 60));
    box = takeBatch(box).box;
    box = enqueue(box, play('p2', 60));
    expect(box.inflight).toEqual([play('p1', 60)]);
    expect(box.pending).toEqual([play('p2', 60)]);
  });
});

describe('待送佇列：分批送出', () => {
  it(`一次最多拿 ${BATCH_LIMIT} 筆放進送出中`, () => {
    let box = emptyOutbox();
    for (let i = 0; i < BATCH_LIMIT + 5; i++) box = enqueue(box, buy(`b${i}`, 'hat.cap'));
    const { box: next, batch } = takeBatch(box);
    expect(batch).toHaveLength(BATCH_LIMIT);
    expect(next.inflight).toEqual(batch);
    expect(next.pending).toHaveLength(5);
    expect(outboxSize(next)).toBe(BATCH_LIMIT + 5);
  });

  it('上一批還沒確認（例如斷線）就重送同一批，不拿新的', () => {
    let box: Outbox = enqueue(emptyOutbox(), buy('b1', 'hat.cap'));
    box = takeBatch(box).box;
    box = enqueue(box, buy('b2', 'hat.party'));
    const again = takeBatch(box);
    expect(again.batch.map((o) => o.id)).toEqual(['b1']);
    expect(again.box).toEqual(box);
  });

  it('伺服器確認後清掉送出中，待送段保留', () => {
    let box = enqueue(emptyOutbox(), buy('b1', 'hat.cap'));
    box = takeBatch(box).box;
    box = enqueue(box, buy('b2', 'hat.party'));
    box = ackBatch(box);
    expect(box).toEqual({ inflight: [], pending: [buy('b2', 'hat.party')] });
  });

  it('沒有待送的操作時，送出的是空批次（用來向伺服器拿最新存檔）', () => {
    expect(takeBatch(emptyOutbox()).batch).toEqual([]);
  });
});

describe('rebase：伺服器版本＋還沒送出的操作', () => {
  const cloud = { server: 'https://island.example', room: '123456', roomName: '二年一班', accountId: 'a_1' };

  it('在伺服器的存檔上重算待送操作，並保留本機的雲端標記', () => {
    const server = kid(100);
    const box: Outbox = { inflight: [], pending: [buy('b1', 'hat.cap'), play('p1', 120)] };
    const p = rebase(server, box, cloud, NOW);
    expect(p.coins).toBe(70);
    expect(p.inventory).toEqual(['hat.cap']);
    expect(p.playLog['2026-10-02']).toBe(120);
    expect(p.cloud).toEqual(cloud);
  });

  it('本機重算時被拒絕的操作直接略過（伺服器收到也會拒絕）', () => {
    const server = kid(10);
    const box: Outbox = { inflight: [], pending: [buy('b1', 'hat.crown'), play('p1', 60)] };
    const p = rebase(server, box, cloud, NOW);
    expect(p.coins).toBe(10);
    expect(p.inventory).toEqual([]);
    expect(p.playLog['2026-10-02']).toBe(60);
  });

  it('伺服器傳來的存檔若帶著別的雲端標記，以本機的為準', () => {
    const server = { ...kid(), cloud: { ...cloud, accountId: 'a_x' } };
    expect(rebase(server, emptyOutbox(), cloud, NOW).cloud).toEqual(cloud);
  });
});
