/**
 * 班級島大型設施的聲音排程（docs/plans/grand-rides.md 第 11.2 節；純函式）：每一格算「循環的聲音多大聲」與
 * 「這一格要響哪些一次的聲音」。時間一律用牆上的時間（wallSec），和班次同一個時鐘。
 * - 自己在雲霄飛車上：出發鈴、爬坡鏈條、越快滾動聲與風聲越大、俯衝與迴圈尖叫、最高點喊「好高喔」、進站煞車、下車喊「好好玩」。
 * - 摩天輪：上車鈴、越高風越大、到頂端喊「好高喔」。飛船：起飛與降落汽笛、螺旋槳、熱氣球噴火、海浪、海鷗。
 * - 站在島上：附近的設施越近越大聲；車上有人才有尖叫；海邊有海浪。牆上時間一下跳很多（撥時間、分頁切回來）不補響。
 */
import { describe, expect, it } from 'vitest';
import { RIDE_LOOPS, coasterMarks, ridePlan, type SoundInput } from '../../src/store/rideSound';
import { COASTER_BOARD, SHIP, SHIP_CYCLE, STATION, WHEEL, carPose, coaster, coasterRun, shipState, wheelSeatFrame } from '../../src/store/grandRides';

const { track, timeline, cycle } = coaster();
const run = 500;
const go = run * cycle + COASTER_BOARD;
/** 自己在雲霄飛車上，在 wall 那一刻（listener 在列車頭） */
function onCoaster(wall: number, dt = 1 / 60, riders = true): SoundInput {
  const s = coasterRun(wall).s;
  const p = carPose(s, 0).p;
  return { listener: p, prevWall: wall - dt, wall, own: { ride: 'coaster', run, w0: run * cycle + 3 }, coasterRiders: riders };
}
/** 某一刻（prevWall → wall）響的一次的聲音名字 */
const shots = (i: SoundInput) => ridePlan(i).shots.map((s) => s.name);
/** 某一段時間 [a, b] 每一格響的一次的聲音全部收起來 */
function shotsBetween(make: (w: number, dt: number) => SoundInput, a: number, b: number): { name: string; at: number; gain: number }[] {
  const out: { name: string; at: number; gain: number }[] = [];
  for (let w = a; w <= b; w += 1 / 60) for (const s of ridePlan(make(w, 1 / 60)).shots) out.push({ ...s, at: w });
  return out;
}

describe('雲霄飛車（自己在車上）', () => {
  const marks = coasterMarks();

  it('時間點：最高點在爬坡之後、迴圈在俯衝之後、煞車在最後', () => {
    expect(marks.crest).toBeGreaterThan(10);
    expect(marks.loop).toBeGreaterThan(marks.crest);
    expect(marks.brake).toBeGreaterThan(marks.loop);
    expect(marks.brake).toBeLessThan(timeline.duration);
  });

  it('停站時：沒有滾動聲；出發前 2 秒出發鈴', () => {
    expect(ridePlan(onCoaster(go - 10)).loops['coaster-roll'].gain).toBe(0);
    const s = shotsBetween((w, dt) => onCoaster(w, dt), go - 5, go);
    expect(s.filter((x) => x.name === 'bell')).toHaveLength(1);
    expect(s.find((x) => x.name === 'bell')!.at).toBeCloseTo(go - 2, 1);
  });

  it('爬坡：鏈條喀喀聲；最高點前喊「好高喔」', () => {
    expect(ridePlan(onCoaster(go + marks.crest - 5)).loops['coaster-chain'].gain).toBeGreaterThan(0.5);
    expect(ridePlan(onCoaster(go + marks.crest + 3)).loops['coaster-chain'].gain).toBe(0);
    const s = shotsBetween((w, dt) => onCoaster(w, dt), go + marks.crest - 4, go + marks.crest);
    expect(s.some((x) => x.name.startsWith('yell-high'))).toBe(true);
  });

  it('俯衝與迴圈：尖叫（大聲）；越快滾動聲與風聲越大', () => {
    const drop = shotsBetween((w, dt) => onCoaster(w, dt), go + marks.crest, go + marks.crest + 1.5);
    expect(drop.some((x) => x.name.startsWith('scream') && x.gain >= 0.8)).toBe(true);
    const loop = shotsBetween((w, dt) => onCoaster(w, dt), go + marks.loop - 0.5, go + marks.loop + 0.5);
    expect(loop.some((x) => x.name.startsWith('scream'))).toBe(true);
    const slow = ridePlan(onCoaster(go + marks.crest - 5)).loops;
    let fastest = 0;
    for (let i = 0; i < timeline.speed.length; i++) if (timeline.speed[i] > timeline.speed[fastest]) fastest = i;
    const fast = ridePlan(onCoaster(go + timeline.time[fastest])).loops;
    expect(fast['coaster-roll'].gain).toBeGreaterThan(slow['coaster-roll'].gain);
    expect(fast['coaster-roll'].rate).toBeGreaterThan(slow['coaster-roll'].rate);
    expect(fast['coaster-wind'].gain).toBeGreaterThan(0.5);
    expect(slow['coaster-wind'].gain).toBeLessThan(0.1);
  });

  it('進站煞車；跑完喊「好好玩」', () => {
    const s = shotsBetween((w, dt) => onCoaster(w, dt), go + marks.brake - 0.5, go + timeline.duration);
    expect(s.filter((x) => x.name === 'coaster-brake')).toHaveLength(1);
    expect(s.some((x) => x.name.startsWith('yell-fun'))).toBe(true);
  });

  it('牆上時間一下跳很多（撥時間、分頁切回來）：不補響一次的聲音', () => {
    expect(shots(onCoaster(go + marks.crest + 0.6, 30))).toEqual([]);
  });
});

describe('站在島上：附近的設施越近越大聲', () => {
  const marks = coasterMarks();
  const at = (listener: { x: number; y: number; z: number }, wall: number, riders = true): SoundInput => ({ listener, prevWall: wall - 1 / 60, wall, own: null, coasterRiders: riders });

  it('雲霄飛車的滾動聲：站在軌道旁邊比站在廣場大聲；停站時沒有', () => {
    const w = go + marks.loop;
    const train = carPose(coasterRun(w).s, 0).p;
    const near = ridePlan(at({ x: train.x * 0.8, y: 0, z: train.z * 0.8 }, w)).loops['coaster-roll'].gain;
    const plaza = ridePlan(at({ x: 0, y: 0, z: -2 }, w)).loops['coaster-roll'].gain;
    expect(near).toBeGreaterThan(plaza);
    expect(near).toBeGreaterThan(0.2);
    expect(ridePlan(at({ x: STATION.exit.x, y: 0, z: STATION.exit.z }, go - 8)).loops['coaster-roll'].gain).toBe(0);
  });

  it('俯衝時車上有人：靠近的人聽得到尖叫（越遠越小）；車上沒人就沒有尖叫', () => {
    const crest = track.pos[track.pos.findIndex((_, i) => Math.abs(timeline.time[i] - marks.crest) < 0.05)];
    const near = shotsBetween((w, dt) => ({ ...at({ x: crest.x * 0.85, y: 0, z: crest.z * 0.85 }, w), prevWall: w - dt }), go + marks.crest, go + marks.crest + 1.5);
    expect(near.some((x) => x.gain > 0.2)).toBe(true);
    const far = shotsBetween((w, dt) => ({ ...at({ x: 0, y: 0, z: 18 }, w), prevWall: w - dt }), go + marks.crest, go + marks.crest + 1.5);
    expect(Math.max(0, ...far.map((x) => x.gain))).toBeLessThan(Math.max(...near.map((x) => x.gain)));
    const empty = shotsBetween((w, dt) => ({ ...at({ x: crest.x * 0.85, y: 0, z: crest.z * 0.85 }, w, false), prevWall: w - dt }), go + marks.crest, go + marks.crest + 1.5);
    expect(empty.some((x) => x.name.startsWith('scream') || x.name === 'coaster-pass')).toBe(false);
  });

  it('海邊聽得到海浪，廣場聽不到', () => {
    expect(ridePlan(at({ x: 0, y: 0, z: 21 }, 100)).loops['sea-waves'].gain).toBeGreaterThan(0.2);
    expect(ridePlan(at({ x: 0, y: 0, z: -2 }, 100)).loops['sea-waves'].gain).toBe(0);
  });

  it('飛船飛的時候，靠近的人聽得到螺旋槳；停著的時候、離很遠聽不到', () => {
    const fly = 40 * SHIP_CYCLE + SHIP.board + 30;
    const ship = shipState(fly);
    expect(ridePlan(at({ x: ship.x * 0.7, y: 0, z: ship.z * 0.7 }, fly)).loops['ship-propeller'].gain).toBeGreaterThan(0.1);
    expect(ridePlan(at({ x: -ship.x * 0.6, y: 0, z: -ship.z * 0.6 }, fly)).loops['ship-propeller'].gain).toBe(0);
    expect(ridePlan(at({ x: -19, y: 0, z: -4 }, 40 * SHIP_CYCLE + 5)).loops['ship-propeller'].gain).toBe(0);
  });
});

describe('摩天輪、飛船（自己在上面）', () => {
  it('摩天輪：上車鈴、越高風越大、到頂端喊「好高喔」', () => {
    const w0 = 1000;
    const make = (w: number, dt = 1 / 60): SoundInput => {
      const f = wheelSeatFrame(4, w);
      return { listener: { x: f.x, y: f.y, z: f.z }, prevWall: w - dt, wall: w, own: { ride: 'wheel', run: 0, w0 }, coasterRiders: false };
    };
    const start = shotsBetween(make, w0 - 0.2, w0 + 0.5);
    expect(start.some((x) => x.name === 'bell')).toBe(true);
    const low = ridePlan(make(w0 + 1)).loops['wheel-wind'].gain;
    const high = ridePlan(make(w0 + WHEEL.period / 2)).loops['wheel-wind'].gain;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(0.6);
    const top = shotsBetween(make, w0 + WHEEL.period / 2 - 3, w0 + WHEEL.period / 2 + 1);
    expect(top.some((x) => x.name.startsWith('yell-high'))).toBe(true);
  });

  it('飛船：起飛與降落汽笛、飛行中螺旋槳與海浪、熱氣球噴火、海鷗；停著時螺旋槳小聲', () => {
    const r = 60;
    const make = (w: number, dt = 1 / 60): SoundInput => {
      const s = shipState(w);
      return { listener: { x: s.x, y: s.y, z: s.z }, prevWall: w - dt, wall: w, own: { ride: 'ship', run: r, w0: r * SHIP_CYCLE + 3 }, coasterRiders: false };
    };
    const all = shotsBetween(make, r * SHIP_CYCLE + 3, (r + 1) * SHIP_CYCLE);
    expect(all.filter((x) => x.name === 'ship-horn')).toHaveLength(2);
    expect(all.filter((x) => x.name === 'ship-burner').length).toBeGreaterThanOrEqual(3);
    expect(all.some((x) => x.name.startsWith('seagull'))).toBe(true);
    const flying = ridePlan(make(r * SHIP_CYCLE + SHIP.board + 40)).loops;
    expect(flying['ship-propeller'].gain).toBeGreaterThan(0.5);
    expect(flying['sea-waves'].gain).toBeGreaterThan(0.1);
    expect(ridePlan(make(r * SHIP_CYCLE + 5)).loops['ship-propeller'].gain).toBeLessThan(0.3);
  });

  it('每一種循環的聲音都有值（0～1，速度倍率 0.5～2）', () => {
    const p = ridePlan({ listener: { x: 0, y: 0, z: 0 }, prevWall: 0, wall: 1 / 60, own: null, coasterRiders: false });
    for (const k of RIDE_LOOPS) {
      expect(p.loops[k].gain).toBeGreaterThanOrEqual(0);
      expect(p.loops[k].gain).toBeLessThanOrEqual(1);
      expect(p.loops[k].rate).toBeGreaterThanOrEqual(0.5);
      expect(p.loops[k].rate).toBeLessThanOrEqual(2);
    }
  });
});
