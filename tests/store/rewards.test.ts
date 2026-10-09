/**
 * 老師發的獎勵（老師 GM 的 G3，src/store/rewards.ts，伺服器共用）：金幣加到存檔；貼紙張數加一，
 * 收禮紀錄記「熊熊老師」（百寶屋的貼紙簿看得到誰送的）。
 */
import { describe, expect, it } from 'vitest';
import { applyReward, isRewardSticker } from '../../src/store/rewards';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';

const kid = (patch: Partial<Profile> = {}): Profile => ({
  ...addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, new Date()).profiles[0],
  ...patch,
});
const DATE = '2026-10-09';

describe('applyReward', () => {
  it('金幣：加到存檔', () => {
    expect(applyReward(kid({ coins: 7 }), { coins: 10 }, DATE).coins).toBe(17);
  });

  it('貼紙：張數加一，收禮紀錄記熊熊老師', () => {
    const p = applyReward(kid({ stickers: { 'sticker.tulip': 2 } }), { sticker: 'sticker.tulip' }, DATE);
    expect(p.stickers).toEqual({ 'sticker.tulip': 3 });
    expect(p.giftLog?.[0]).toEqual({ from: '熊熊老師', itemId: 'sticker.tulip', date: DATE });
  });

  it('金幣和貼紙一起；原本的存檔不變', () => {
    const before = kid({ coins: 1 });
    const p = applyReward(before, { coins: 5, sticker: 'sticker.star' }, DATE);
    expect(p).toMatchObject({ coins: 6, stickers: { 'sticker.star': 1 } });
    expect(before.coins).toBe(1);
    expect(before.stickers).toBeUndefined();
  });

  it('只有 8 種貼紙算數（外觀道具、不存在的 id 不行）', () => {
    expect(isRewardSticker('sticker.unicorn')).toBe(true);
    expect(isRewardSticker('hat.cap')).toBe(false);
    expect(isRewardSticker('sticker.nope')).toBe(false);
  });
});
