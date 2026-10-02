import { describe, expect, it } from 'vitest';
import { GIFT_LOG_LIMIT, STICKERS, canReceive, findSticker, giftName, giftPhrase, giftPrice, receiveGift } from '../../src/store/gifts';
import { ITEMS, owns } from '../../src/store/catalog';
import { addProfile, createEmptySave, parseProfile, type Profile } from '../../src/store/save';

/** 測試用的角色 */
const kid = (patch: Partial<Profile> = {}): Profile => ({
  ...addProfile(createEmptySave(), { name: '小美', avatar: { animal: 'panda', color: '#5b5b6b', hat: null } }, new Date('2026-10-03T10:00:00')).profiles[0],
  ...patch,
});

describe('禮物目錄', () => {
  it('貼紙 8 種：id 不重複、以 sticker. 開頭、3～10 金幣、有名稱與圖示，不和外觀道具撞 id', () => {
    expect(STICKERS).toHaveLength(8);
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(8);
    for (const s of STICKERS) {
      expect(s.id.startsWith('sticker.'), s.id).toBe(true);
      expect(s.price, s.id).toBeGreaterThanOrEqual(3);
      expect(s.price, s.id).toBeLessThanOrEqual(10);
      expect(s.name && s.emoji, s.id).toBeTruthy();
      expect(ITEMS.some((i) => i.id === s.id), s.id).toBe(false);
    }
    expect(findSticker('sticker.tulip')).toMatchObject({ name: '鬱金香', emoji: '🌷', price: 5 });
    expect(findSticker('hat.party')).toBeUndefined();
  });

  it('giftPrice：貼紙與有金幣價格的外觀可以送；獎章專屬道具與不存在的 id 不能送', () => {
    expect(giftPrice('sticker.tulip')).toBe(5);
    expect(giftPrice('hat.party')).toBe(20);
    expect(giftPrice('pet.dino')).toBe(150);
    expect(giftPrice('trail.stars')).toBe(120);
    expect(giftPrice('hat.scholar')).toBeNull();
    expect(giftPrice('pet.dragon')).toBeNull();
    expect(giftPrice('nope')).toBeNull();
    // 每一項外觀：金幣道具照百寶屋價格、獎章道具不能送
    for (const i of ITEMS) expect(giftPrice(i.id), i.id).toBe(i.badge ? null : i.price);
  });

  it('禮物的名稱與卡片上的說法：貼紙加「一張」與「貼紙」，外觀直接用名稱', () => {
    expect(giftName('sticker.tulip')).toBe('鬱金香貼紙');
    expect(giftPhrase('sticker.tulip')).toBe('一張 🌷 鬱金香貼紙');
    expect(giftName('hat.party')).toBe('派對帽');
    expect(giftPhrase('hat.party')).toBe('🎉 派對帽');
  });
});

describe('收禮物', () => {
  it('canReceive：貼紙可以重複收；外觀已經有了就不能收；不能送的東西不能收', () => {
    expect(canReceive(kid({ stickers: { 'sticker.tulip': 3 } }), 'sticker.tulip')).toBe(true);
    expect(canReceive(kid(), 'hat.party')).toBe(true);
    expect(canReceive(kid({ inventory: ['hat.party'] }), 'hat.party')).toBe(false);
    expect(canReceive(kid(), 'hat.scholar')).toBe(false);
    expect(canReceive(kid(), 'nope')).toBe(false);
  });

  it('收到貼紙：數量加一，收禮紀錄最新的排前面', () => {
    let p = receiveGift(kid(), { itemId: 'sticker.tulip', from: '小安' }, '2026-10-03');
    p = receiveGift(p, { itemId: 'sticker.tulip', from: '阿寶' }, '2026-10-04');
    expect(p.stickers).toEqual({ 'sticker.tulip': 2 });
    expect(p.giftLog).toEqual([
      { from: '阿寶', itemId: 'sticker.tulip', date: '2026-10-04' },
      { from: '小安', itemId: 'sticker.tulip', date: '2026-10-03' },
    ]);
  });

  it('收到外觀：放進收藏（之後可以戴），金幣不變', () => {
    const p = receiveGift(kid({ coins: 7 }), { itemId: 'hat.party', from: '小安' }, '2026-10-03');
    expect(p.inventory).toEqual(['hat.party']);
    expect(p.coins).toBe(7);
    expect(owns(p, 'hat.party')).toBe(true);
  });

  it('收禮紀錄只留最新 50 筆；貼紙數量照樣累加', () => {
    let p = kid();
    for (let i = 0; i < GIFT_LOG_LIMIT + 5; i++) p = receiveGift(p, { itemId: 'sticker.apple', from: `同學${i}` }, '2026-10-03');
    expect(p.giftLog).toHaveLength(GIFT_LOG_LIMIT);
    expect(p.giftLog![0].from).toBe(`同學${GIFT_LOG_LIMIT + 4}`);
    expect(p.stickers!['sticker.apple']).toBe(GIFT_LOG_LIMIT + 5);
  });

  it('不能送的東西不會改到存檔（防呆）；原本的存檔物件不會被改到', () => {
    const p = kid();
    expect(receiveGift(p, { itemId: 'hat.scholar', from: '小安' }, '2026-10-03')).toBe(p);
    const before = JSON.stringify(p);
    receiveGift(p, { itemId: 'sticker.star', from: '小安' }, '2026-10-03');
    receiveGift(p, { itemId: 'hat.cap', from: '小安' }, '2026-10-03');
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('存檔格式', () => {
  it('貼紙與收禮紀錄可以存讀；舊存檔沒有這兩個欄位也能讀', () => {
    const log = [{ from: '小安', itemId: 'sticker.star', date: '2026-10-03' }];
    const withGifts = parseProfile(JSON.parse(JSON.stringify(kid({ stickers: { 'sticker.star': 2 }, giftLog: log }))));
    expect(withGifts?.stickers).toEqual({ 'sticker.star': 2 });
    expect(withGifts?.giftLog).toEqual(log);
    const old = parseProfile(JSON.parse(JSON.stringify(kid())));
    expect(old).not.toBeNull();
    expect(old?.stickers).toBeUndefined();
    expect(old?.giftLog).toBeUndefined();
  });

  it('貼紙數量不能是負數或小數', () => {
    expect(parseProfile({ ...kid(), stickers: { 'sticker.star': -1 } })).toBeNull();
    expect(parseProfile({ ...kid(), stickers: { 'sticker.star': 1.5 } })).toBeNull();
  });
});
