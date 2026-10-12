/**
 * 走路動作（純函式；docs/plans/grand-rides.md 第 11.3 節）：孩子的角色（Avatar）與熊熊老師（Teacher）共用。
 * 使用者 2026-10-13：「人物在走動時要有走路的動作，看其他朋友走路也要有動作，不能滑動」——以前只有腳前後擺 0.6、
 * 身體上下 0.12，從島上的鏡頭（斜上方往下看、短短的腳被身體擋住）看起來像在滑。
 * 現在：身體一蹦一蹦（每一步離地約 0.22）、跟著步伐左右搖擺、往前傾一點、落地時稍微壓扁（在空中拉回原狀）、手腳擺得更大。
 * phase 是走路的相位（弧度，每走一步加 π），walking 是有沒有在走，t 是時間（秒，站著時呼吸用）。
 */

/** 這一刻的樣子：腳、手前後擺的角度（弧度）、身體往上多少（公尺）、左右搖擺與前傾（弧度）、上下的縮放（1 是原狀） */
export interface WalkPose {
  leg: number;
  arm: number;
  bob: number;
  sway: number;
  lean: number;
  squash: number;
}

/** 每秒相位走多少（弧度）：走越快踏越快 */
export function WALK_STEP_RATE(speed: number): number {
  return 9 + speed * 1.2;
}

export function walkPose(phase: number, walking: boolean, t: number): WalkPose {
  if (!walking) return { leg: 0, arm: 0, bob: Math.sin(t * 2) * 0.02, sway: 0, lean: 0, squash: 1 };
  const s = Math.sin(phase);
  /** 離地的程度（0 是踩在地上，1 是跳最高） */
  const up = Math.abs(s);
  return {
    leg: s * 0.78,
    arm: s * 0.95,
    bob: up * 0.22,
    // 左右搖擺：跟著哪一隻腳踩地（每一步換邊），在空中最歪
    sway: s * 0.13,
    lean: 0.12,
    // 落地時壓扁一點（踩下去的感覺），在空中拉回原狀
    squash: 1 - 0.07 * (1 - up) ** 2,
  };
}
