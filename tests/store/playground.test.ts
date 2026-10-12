/**
 * 班級島遊樂場（docs/plans/playground.md）第 ① 段：規則（純函式，前端與伺服器共用的部分在 rideKinds.ts、actCodes.ts）。
 * - 4 個位置不碰到建築、門口、步道、廣場、出生點、噴水池，都在草地上。
 * - 八種器材的座位數、座位的樣子（照時鐘算；同一個時鐘大家一起動）、溜滑梯城堡的時間軸、翹翹板看兩邊有沒有人。
 * - 下車點在器材的碰撞外面；最近的空位；搶同一個位子時 id 小的留著。
 */
import { describe, expect, it } from 'vitest';
import { FOUNTAIN, SPAWN, WALK_RADIUS, ZONES, doorOf } from '../../src/world/layout';
import { PLAZA, pathSegments } from '../../src/world/scenery';
import { DEFAULT_PLAYGROUND, PLAYGROUND_SLOTS, RIDE_KINDS, emptyPlayground, playgroundSchema, type RideKind } from '../../src/store/rideKinds';
import { ACT_CODES, rideSeatOf, rideSeatCode } from '../../src/store/actCodes';
import {
  PLAYGROUND_SPOTS,
  RIDES,
  SPOT_RADIUS,
  freeSeat,
  rideExit,
  rideFrame,
  rideObstacles,
  seatMap,
  slotNear,
  takenSeats,
} from '../../src/store/playground';

/** 點到線段的距離 */
function distToSeg(px: number, pz: number, s: { ax: number; az: number; bx: number; bz: number }): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - s.ax - t * dx, pz - s.az - t * dz);
}
/** 兩個時鐘：牆上的時間（一直轉的器材）、坐上去之後幾秒（鞦韆、溜滑梯） */
const clock = (wall: number, since = wall) => ({ wall, since });
const ALL_FREE = Array(8).fill(false);

describe('器材種類與資料格式（伺服器共用）', () => {
  it('八種器材；4 個位置，每個位置一種或空的；空的遊樂場、老師還沒設定過的預設 4 座', () => {
    expect([...RIDE_KINDS]).toEqual(['carousel', 'seesaw', 'swingset', 'trampoline', 'slidecastle', 'ferris', 'teacups', 'train']);
    expect(PLAYGROUND_SLOTS).toBe(4);
    expect(emptyPlayground()).toEqual([null, null, null, null]);
    // 老師還沒設定過的班級先放好的 4 座（使用者 2026-10-12）：旋轉木馬、翹翹板、大鞦韆組、彈跳床（對平板最輕的一組）
    expect(DEFAULT_PLAYGROUND).toEqual(['carousel', 'seesaw', 'swingset', 'trampoline']);
    expect(playgroundSchema.safeParse(DEFAULT_PLAYGROUND).success).toBe(true);
    expect(playgroundSchema.safeParse(['carousel', null, 'seesaw', 'train']).success).toBe(true);
    expect(playgroundSchema.safeParse(['carousel', null, 'seesaw']).success).toBe(false);
    expect(playgroundSchema.safeParse(['rocket', null, null, null]).success).toBe(false);
  });

  it('座位代碼 ride0～ride7（move 的 a）：伺服器的格式驗證收得到；換算座位編號', () => {
    for (let i = 0; i < 8; i++) {
      expect(ACT_CODES).toContain(rideSeatCode(i));
      expect(rideSeatOf(rideSeatCode(i))).toBe(i);
    }
    expect(rideSeatOf('sit')).toBeNull();
    expect(rideSeatOf('swing')).toBeNull();
  });
});

describe('4 個位置', () => {
  it('都在草地上，不碰到建築與門口、步道、廣場、出生點、噴水池', () => {
    expect(PLAYGROUND_SPOTS).toHaveLength(4);
    for (const s of PLAYGROUND_SPOTS) {
      const where = `(${s.x}, ${s.z})`;
      expect(Math.hypot(s.x, s.z) + SPOT_RADIUS, where).toBeLessThanOrEqual(WALK_RADIUS - 1);
      for (const z of ZONES) {
        expect(Math.hypot(s.x - z.x, s.z - z.z), `${where} ${z.id}`).toBeGreaterThanOrEqual(z.radius + SPOT_RADIUS + 0.8);
        const d = doorOf(z);
        expect(Math.hypot(s.x - d.x, s.z - d.z), `${where} ${z.id} 門口`).toBeGreaterThanOrEqual(SPOT_RADIUS + 1.5);
      }
      for (const seg of pathSegments()) expect(distToSeg(s.x, s.z, seg), `${where} 步道`).toBeGreaterThanOrEqual(SPOT_RADIUS + 1);
      expect(Math.hypot(s.x - PLAZA.x, s.z - PLAZA.z)).toBeGreaterThanOrEqual(PLAZA.radius + SPOT_RADIUS);
      expect(Math.hypot(s.x - SPAWN.x, s.z - SPAWN.z)).toBeGreaterThanOrEqual(3.5 + SPOT_RADIUS);
      expect(Math.hypot(s.x - FOUNTAIN.x, s.z - FOUNTAIN.z)).toBeGreaterThanOrEqual(FOUNTAIN.radius + SPOT_RADIUS);
    }
    // 位置之間不重疊
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) expect(Math.hypot(PLAYGROUND_SPOTS[i].x - PLAYGROUND_SPOTS[j].x, PLAYGROUND_SPOTS[i].z - PLAYGROUND_SPOTS[j].z)).toBeGreaterThan(SPOT_RADIUS * 2);
  });

  it('slotNear：角色旁邊（器材外圍 1.5 公尺內）的那一座；空的位置不算', () => {
    const pg: (RideKind | null)[] = ['carousel', null, 'seesaw', null];
    const s0 = PLAYGROUND_SPOTS[0];
    expect(slotNear(pg, { x: s0.x, z: s0.z + SPOT_RADIUS + 1 })).toBe(0);
    expect(slotNear(pg, { x: PLAYGROUND_SPOTS[1].x, z: PLAYGROUND_SPOTS[1].z })).toBeNull();
    expect(slotNear(pg, { x: 0, z: 13 })).toBeNull();
  });
});

describe('八種器材', () => {
  const seats: Record<RideKind, number> = { carousel: 6, seesaw: 4, swingset: 4, trampoline: 6, slidecastle: 2, ferris: 6, teacups: 6, train: 6 };

  it('座位數照規格；每一種都有名字、圖示、按鈕的字', () => {
    for (const k of RIDE_KINDS) {
      expect(RIDES[k].seats, k).toBe(seats[k]);
      expect(RIDES[k].name.length, k).toBeGreaterThan(0);
      expect(RIDES[k].label, k).toContain(RIDES[k].emoji);
    }
    expect(RIDES.slidecastle.locked).toBe(true);
  });

  it('每個座位在任何時間都在器材的範圍裡、離地面不低於 0、朝向是數字（四個時間點）', () => {
    const c = PLAYGROUND_SPOTS[0];
    for (const k of RIDE_KINDS)
      for (let seat = 0; seat < RIDES[k].seats; seat++)
        for (const t of [0, 0.7, 3.1, 11.4]) {
          const f = rideFrame(k, seat, c, clock(t, Math.min(t, 1.5)), ALL_FREE);
          const where = `${k} 座位 ${seat} t=${t}`;
          expect(Math.hypot(f.x - c.x, f.z - c.z), where).toBeLessThanOrEqual(SPOT_RADIUS + 0.01);
          expect(f.y, where).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(f.heading), where).toBe(true);
          expect(f.scale, where).toBe(1);
        }
  });

  it('牆上的時間很大（真的 Date.now 秒，約 17 億）時，每一種器材的朝向都夾在 (−π, π]（送給別人、轉身都不會算到很大的數）', () => {
    const c = { x: 0, z: 0 };
    for (const k of RIDE_KINDS)
      for (let seat = 0; seat < RIDES[k].seats; seat++) {
        const f = rideFrame(k, seat, c, clock(1.76e9 + seat * 0.37, 0.8), ALL_FREE);
        expect(f.heading, `${k} 座位 ${seat}`).toBeGreaterThan(-Math.PI - 1e-9);
        expect(f.heading, `${k} 座位 ${seat}`).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
  });

  it('旋轉木馬：同一個座位隔幾秒位置不一樣（在轉）、離中心的距離不變；坐著', () => {
    const c = { x: 0, z: 0 };
    const a = rideFrame('carousel', 2, c, clock(1), ALL_FREE);
    const b = rideFrame('carousel', 2, c, clock(3), ALL_FREE);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.3);
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(Math.hypot(b.x, b.z), 6);
    expect(a.pose).toBe('sit');
    // 同一個時間，不同座位在不同位置
    const other = rideFrame('carousel', 3, c, clock(1), ALL_FREE);
    expect(Math.hypot(a.x - other.x, a.z - other.z)).toBeGreaterThan(1);
  });

  it('翹翹板：兩邊都有人才上下；只有一邊有人，那一邊沉下去；沒人是平的', () => {
    const c = { x: 0, z: 0 };
    // 第一座是座位 0、1
    const both = [true, true, false, false, false, false, false, false];
    const ys = [0.3, 0.9, 1.5].map((t) => rideFrame('seesaw', 0, c, clock(t), both).y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.2);
    const onlyLeft = [true, false, false, false, false, false, false, false];
    const left = rideFrame('seesaw', 0, c, clock(1), onlyLeft);
    for (const t of [0.3, 0.9, 1.5]) expect(rideFrame('seesaw', 0, c, clock(t), onlyLeft).y).toBeCloseTo(left.y, 6);
    const level = rideFrame('seesaw', 0, c, clock(1), ALL_FREE);
    expect(left.y).toBeLessThan(level.y - 0.2);
    // 另一座（座位 2、3）不受第一座影響
    expect(rideFrame('seesaw', 2, c, clock(1), both).y).toBeCloseTo(rideFrame('seesaw', 2, c, clock(1), ALL_FREE).y, 6);
  });

  it('摩天輪：轉到最高處比 5 公尺高；車廂保持直立（坐著、沒有傾斜）', () => {
    const c = { x: 0, z: 0 };
    const hs = Array.from({ length: 60 }, (_, i) => rideFrame('ferris', 0, c, clock(i), ALL_FREE).y);
    expect(Math.max(...hs)).toBeGreaterThan(5);
    expect(Math.min(...hs)).toBeLessThan(1);
    const f = rideFrame('ferris', 0, c, clock(7), ALL_FREE);
    expect(f.pose).toBe('sit');
    expect(f.tiltX).toBe(0);
  });

  it('彈跳床：站著一直彈（高度隨時間變）；鞦韆組照坐上去的時間盪（樞軸是橫桿）', () => {
    const c = { x: 0, z: 0 };
    const tramp = [0.1, 0.4, 0.8].map((t) => rideFrame('trampoline', 1, c, clock(t), ALL_FREE));
    expect(tramp[0].pose).toBe('stand');
    expect(Math.max(...tramp.map((f) => f.y)) - Math.min(...tramp.map((f) => f.y))).toBeGreaterThan(0.2);
    const sw = rideFrame('swingset', 1, c, clock(100, 0.7), ALL_FREE);
    expect(sw.pivotY).toBeGreaterThan(2.5);
    expect(sw.tiltX).not.toBe(0);
    // 鞦韆看坐上去之後幾秒，不看牆上的時間
    expect(rideFrame('swingset', 1, c, clock(5, 0.7), ALL_FREE)).toEqual(sw);
  });

  it('溜滑梯城堡：爬上去（越來越高）再溜下來（越來越低），到時間做完、站著；兩條滑道不一樣', () => {
    const c = { x: 0, z: 0 };
    const d = RIDES.slidecastle.duration!;
    for (const seat of [0, 1]) {
      const at = (since: number) => rideFrame('slidecastle', seat, c, clock(0, since), ALL_FREE);
      expect(at(0.9).y).toBeGreaterThan(at(0.2).y);
      expect(at(0.9).pose).toBe('climb');
      const mid = at(d * 0.55);
      const late = at(d * 0.85);
      expect(late.y).toBeLessThan(mid.y);
      const end = at(d + 0.1);
      expect(end.done).toBe(true);
      expect(end.pose).toBe('stand');
      expect(end.y).toBeCloseTo(0);
    }
    const a = rideFrame('slidecastle', 0, c, clock(0, d * 0.7), ALL_FREE);
    const b = rideFrame('slidecastle', 1, c, clock(0, d * 0.7), ALL_FREE);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
  });
});

describe('下車、碰撞、選座位、搶位子', () => {
  it('下車點在器材的碰撞外面（每一種、每個座位、不同時間；離每個碰撞圓至少角色的半徑）', () => {
    const c = PLAYGROUND_SPOTS[1];
    for (const k of RIDE_KINDS) {
      const pg: (RideKind | null)[] = [null, k, null, null];
      const obs = rideObstacles(pg);
      expect(obs.length, k).toBeGreaterThan(0);
      for (let seat = 0; seat < RIDES[k].seats; seat++)
        for (const t of [0, 2.3, 9.9]) {
          const f = rideFrame(k, seat, c, clock(t), ALL_FREE);
          const e = rideExit(k, seat, c, f);
          for (const o of obs) expect(Math.hypot(e.x - o.x, e.z - o.z), `${k} 座位 ${seat} t=${t}`).toBeGreaterThanOrEqual(o.r + 0.45 - 1e-6);
        }
    }
  });

  it('freeSeat：選離角色最近的空位；坐滿了是 null', () => {
    const c = { x: 0, z: 0 };
    const t = clock(2);
    // 站在旋轉木馬某個座位旁邊，選到那個座位
    const f3 = rideFrame('carousel', 3, c, t, ALL_FREE);
    const near3 = { x: c.x + (f3.x - c.x) * 1.6, z: c.z + (f3.z - c.z) * 1.6 };
    expect(freeSeat('carousel', new Set(), c, near3, t)).toBe(3);
    expect(freeSeat('carousel', new Set([3]), c, near3, t)).not.toBe(3);
    expect(freeSeat('carousel', new Set([0, 1, 2, 3, 4, 5]), c, near3, t)).toBeNull();
    expect(freeSeat('slidecastle', new Set([0]), c, { x: 3, z: 0 }, t)).toBe(1);
  });

  it('seatMap：搶同一個位子時 id 小的留著，其他人被擠掉（每台裝置算的結果一樣）', () => {
    const riders = [
      { id: 'b', slot: 0, seat: 2 },
      { id: 'a', slot: 0, seat: 2 },
      { id: 'c', slot: 0, seat: 3 },
      { id: 'd', slot: 1, seat: 2 },
    ];
    const m = seatMap(riders);
    expect(m.seats.get('0:2')).toBe('a');
    expect(m.seats.get('0:3')).toBe('c');
    expect(m.seats.get('1:2')).toBe('d');
    expect(m.bumped).toEqual(['b']);
    // 順序不同，結果一樣
    expect(seatMap([...riders].reverse())).toEqual(m);
    expect(takenSeats(m, 0)).toEqual(new Set([2, 3]));
  });

  it('rideObstacles：只有選了器材的位置有碰撞；空的位置沒有', () => {
    expect(rideObstacles(emptyPlayground())).toEqual([]);
    const obs = rideObstacles(['carousel', null, null, null]);
    for (const o of obs) expect(Math.hypot(o.x - PLAYGROUND_SPOTS[0].x, o.z - PLAYGROUND_SPOTS[0].z) + o.r).toBeLessThanOrEqual(SPOT_RADIUS + 0.01);
  });
});
