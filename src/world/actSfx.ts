/**
 * 用家具時的音效名字 → 真正放的音效（自己的家第 10 節第 ① 批）。時機在 actSounds.ts（純函式），這裡接 sfx。
 */
import { sfx } from '../audio/sfx';
import type { ActSound } from './actSounds';

/** 音效名字 → 音效 */
export const ACT_SFX: Record<ActSound, () => void> = {
  sit: sfx.sit,
  lie: sfx.lie,
  step: sfx.step,
  whee: sfx.whee,
  land: sfx.land,
  creak: sfx.creak,
};
