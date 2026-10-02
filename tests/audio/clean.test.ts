/**
 * 朗讀前的文字清理：去掉 emoji 等不該唸出來的符號。
 * 數字鍵帽（1️⃣）的組合字元 U+20E3 若留著，語音合成會亂唸（實測產生 50 秒以上的音檔），要轉成數字本身；
 * 破折號（A – a）改成頓號，唸成短暫停頓。
 */
import { describe, expect, it } from 'vitest';
import { cleanForSpeech } from '../../src/audio/speech';

describe('cleanForSpeech', () => {
  it('去掉一般 emoji 與變體選擇符', () => {
    expect(cleanForSpeech('🚗 繫好安全帶')).toBe('繫好安全帶');
    expect(cleanForSpeech('👩‍🏫 王老師早安。')).toBe('王老師早安。');
  });

  it('數字鍵帽轉成數字本身', () => {
    expect(cleanForSpeech('正確答案是：1️⃣')).toBe('正確答案是：1');
    expect(cleanForSpeech('正確答案是：0⃣')).toBe('正確答案是：0');
    expect(cleanForSpeech('#️⃣')).toBe('#');
  });

  it('破折號改成頓號', () => {
    expect(cleanForSpeech('正確答案是：A – a')).toBe('正確答案是：A、a');
    expect(cleanForSpeech('B—b')).toBe('B、b');
  });

  it('空格符號唸成「空格」，多個空白合成一個', () => {
    expect(cleanForSpeech('一（○）書')).toBe('一（空格）書');
    expect(cleanForSpeech('  a   b  ')).toBe('a b');
  });
});
