import { describe, expect, it } from 'vitest';
import { HATS, ITEMS, equippedOf, findItem, itemsOfSlot, owns } from '../../src/store/catalog';
import { BADGES, badgeById } from '../../src/store/badges';
import { addProfile, createEmptySave, type Profile } from '../../src/store/save';

describe('商品目錄', () => {
  it('原有 8 頂帽子的價格沒有變（從 Hats.tsx 搬出來時不能改到內容）', () => {
    expect(HATS.slice(0, 8).map((h) => [h.id, h.price])).toEqual([
      ['hat.party', 20],
      ['hat.cap', 30],
      ['hat.flower', 40],
      ['hat.straw', 50],
      ['hat.helmet', 60],
      ['hat.chef', 60],
      ['hat.crown', 120],
      ['hat.wizard', 150],
    ]);
  });

  it('用 id 查得到商品與價格；查不到回傳 undefined', () => {
    expect(findItem('hat.crown')).toMatchObject({ id: 'hat.crown', name: '皇冠', price: 120 });
    expect(findItem('hat.unknown')).toBeUndefined();
  });
});

describe('商品目錄：外觀道具（R2）', () => {
  it('id 不重複、每項都有名稱與圖示；金幣道具有價格、獎章專屬道具沒有價格', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const i of ITEMS) {
      expect(i.name, i.id).toBeTruthy();
      expect(i.emoji, i.id).toBeTruthy();
      expect(i.id.startsWith(`${i.slot}.`), i.id).toBe(true);
      if (i.badge) expect(i.price, i.id).toBeUndefined();
      else expect(i.price, i.id).toBeGreaterThan(0);
    }
    expect(itemsOfSlot('face').map((i) => i.id)).toEqual(['face.round', 'face.sun', 'face.heart']);
  });

  it('獎章專屬道具和獎章定義一致（每個有道具的獎章，目錄裡都有對應的道具）', () => {
    for (const b of BADGES.filter((x) => x.item)) {
      expect(findItem(b.item!), b.id).toMatchObject({ badge: b.id });
    }
    for (const i of ITEMS.filter((x) => x.badge)) expect(badgeById(i.badge!)?.item, i.id).toBe(i.id);
  });
});

describe('擁有與裝備', () => {
  const p = (patch: Partial<Profile> = {}): Profile => ({
    ...addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, new Date()).profiles[0],
    ...patch,
  });

  it('收藏裡有，或已經得到對應的獎章，就算擁有', () => {
    expect(owns(p({ inventory: ['face.round'] }), 'face.round')).toBe(true);
    expect(owns(p(), 'face.round')).toBe(false);
    expect(owns(p({ badges: { 'tower-hero': '2026-10-01' } }), 'hat.scholar')).toBe(true);
    expect(owns(p(), 'hat.scholar')).toBe(false);
    expect(owns(p({ inventory: ['nope'] }), 'nope')).toBe(false);
  });

  it('equippedOf：沒擁有、類別不符的道具當作沒戴；沒有的格子補 null', () => {
    const kid = p({
      inventory: ['face.sun', 'hat.cap'],
      avatar: { animal: 'cat', color: '#ffffff', hat: 'hat.cap', face: 'face.sun', back: 'back.wings', hand: 'face.sun' },
    });
    expect(equippedOf(kid)).toEqual({ animal: 'cat', color: '#ffffff', hat: 'hat.cap', face: 'face.sun', back: null, hand: null, pet: null, trail: null });
    expect(equippedOf(p())).toEqual({ animal: 'bear', color: '#8b5a2b', hat: null, face: null, back: null, hand: null, pet: null, trail: null });
  });
});

describe('商品目錄：寵物與走路特效（R3）', () => {
  it('寵物 4 種金幣＋2 種獎章專屬；走路特效 2 種', () => {
    expect(itemsOfSlot('pet').map((i) => [i.id, i.price ?? i.badge])).toEqual([
      ['pet.chick', 60],
      ['pet.butterfly', 80],
      ['pet.fishbowl', 100],
      ['pet.dino', 150],
      ['pet.dragon', 'streak-7'],
      ['pet.owl', 'skill-master'],
    ]);
    expect(itemsOfSlot('trail').map((i) => i.id)).toEqual(['trail.flowers', 'trail.stars']);
  });

  it('寵物與特效也走 equippedOf 的擁有檢查', () => {
    const base = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, new Date()).profiles[0];
    const kid: Profile = { ...base, inventory: ['pet.chick'], badges: { 'skill-master': '2026-10-03' }, avatar: { ...base.avatar, pet: 'pet.owl', trail: 'trail.stars' } };
    expect(equippedOf(kid)).toMatchObject({ pet: 'pet.owl', trail: null });
  });
});
