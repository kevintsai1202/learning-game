/**
 * 用家具時的音效時機（自己的家第 10 節第 ① 批：家具要有音效；純函式，不碰音訊）：
 * 從上一格到這一格（開始用之後幾秒）之間該響哪些音效。Player 每一格呼叫，照名字放 sfx。
 * 坐下、躺下一開始響一次；溜滑梯爬梯子每 0.25 秒一步、開始溜「咻」、溜到底「咚」；盪鞦韆每盪到一邊「嘎」。
 * 只有自己的角色會響（別人的動作不響，免得吵）。
 */
import { SWING_RATE, type UseKind } from '../store/furnitureUse';

/** 一種音效 */
export type ActSound = 'sit' | 'lie' | 'step' | 'whee' | 'land' | 'creak';

/** 溜滑梯爬梯子踩的時刻、開始溜、溜到底（秒；和 actFrame 的時間軸一致） */
const SLIDE_STEPS = [0, 0.25, 0.5, 0.75];
const SLIDE_WHEE = 1.3;
const SLIDE_LAND = 2.2;

/** 上一格（prevT）到這一格（t）之間要響的音效；剛開始用時 prevT 傳負數 */
export function actSoundEvents(kind: UseKind, prevT: number, t: number): ActSound[] {
  const out: ActSound[] = [];
  const crossed = (x: number) => prevT < x && t >= x;
  if ((kind === 'sit' || kind === 'piano' || kind === 'swing') && crossed(0)) out.push('sit');
  if (kind === 'lie' && crossed(0)) out.push('lie');
  if (kind === 'slide') {
    for (const s of SLIDE_STEPS) if (crossed(s)) out.push('step');
    if (crossed(SLIDE_WHEE)) out.push('whee');
    if (crossed(SLIDE_LAND)) out.push('land');
  }
  if (kind === 'swing') {
    // 盪到一邊的時刻是 (k + 0.5) × 半個週期
    const half = Math.PI / SWING_RATE;
    const k0 = Math.floor(Math.max(prevT, 0) / half - 0.5);
    const k1 = Math.floor(t / half - 0.5);
    for (let k = Math.max(k0 + 1, 0); k <= k1; k++) out.push('creak');
  }
  return out;
}
