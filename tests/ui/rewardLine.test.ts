/**
 * 收到老師獎勵的卡片句子（老師 GM 的 G3，src/ui/lines.ts 的 rewardCardLine）：金幣、貼紙、兩種都有。
 * 句子有數字與貼紙名稱，用裝置語音朗讀（不預錄）。
 */
import { describe, expect, it } from 'vitest';
import { rewardCardLine } from '../../src/ui/lines';

describe('rewardCardLine', () => {
  it('只有金幣', () => {
    expect(rewardCardLine(10, null)).toBe('熊熊老師給你 10 枚金幣！');
  });

  it('只有貼紙', () => {
    expect(rewardCardLine(0, 'sticker.tulip')).toBe('熊熊老師送你一張 🌷 鬱金香貼紙！');
  });

  it('金幣和貼紙', () => {
    expect(rewardCardLine(5, 'sticker.star')).toBe('熊熊老師給你 5 枚金幣和一張 ⭐ 星星貼紙！');
  });
});
