/**
 * 商品目錄（純資料與純函式，前端與伺服器共用；規格見 docs/plans/rewards.md 第 4 節）。
 * 伺服器依這裡的價格扣金幣、依 owns() 判斷能不能戴，所以不能 import 任何畫面、音訊或 3D 的程式。
 * 只用 type import 讀 save.ts（save.ts 會 import 這裡，避免執行期的循環引用）。
 */
import type { AvatarConfig, Profile } from './save';

/** 道具戴在哪一格：帽子、眼鏡、背後、手持、寵物、走路特效 */
export type AvatarSlot = 'hat' | 'face' | 'back' | 'hand' | 'pet' | 'trail';
/** 商品的種類：穿戴的格子，或擺在院子裡的家具（decor，自己的家，docs/plans/home.md） */
export type Slot = AvatarSlot | 'decor';

/** 一項商品 */
export interface CatalogItem {
  /** id 以格子開頭，例如 face.round */
  id: string;
  name: string;
  slot: Slot;
  /** 選單上的圖示 */
  emoji: string;
  /** 金幣價格；獎章專屬道具沒有價格 */
  price?: number;
  /** 獎章專屬道具：需要的獎章 id（得到獎章就擁有，不能買） */
  badge?: string;
  /** 家具：可以走過去（花草、石板路、小池塘）；沒有這個欄位的家具會擋路 */
  walkable?: boolean;
}

/** 帽子：原有 8 頂、R2 新增 3 頂金幣帽與 3 頂獎章帽（外觀在 src/world/Hats.tsx） */
export const HATS: readonly CatalogItem[] = [
  { id: 'hat.party', name: '派對帽', slot: 'hat', emoji: '🎉', price: 20 },
  { id: 'hat.cap', name: '棒球帽', slot: 'hat', emoji: '🧢', price: 30 },
  { id: 'hat.flower', name: '花圈', slot: 'hat', emoji: '🌸', price: 40 },
  { id: 'hat.straw', name: '草帽', slot: 'hat', emoji: '👒', price: 50 },
  { id: 'hat.helmet', name: '安全帽', slot: 'hat', emoji: '⛑️', price: 60 },
  { id: 'hat.chef', name: '廚師帽', slot: 'hat', emoji: '👨‍🍳', price: 60 },
  { id: 'hat.crown', name: '皇冠', slot: 'hat', emoji: '👑', price: 120 },
  { id: 'hat.wizard', name: '魔法帽', slot: 'hat', emoji: '🧙', price: 150 },
  { id: 'hat.bunny', name: '兔耳髮箍', slot: 'hat', emoji: '🐰', price: 50 },
  { id: 'hat.dino', name: '恐龍帽', slot: 'hat', emoji: '🦖', price: 80 },
  { id: 'hat.pirate', name: '海盜帽', slot: 'hat', emoji: '🏴‍☠️', price: 90 },
  { id: 'hat.explorer', name: '探險家帽', slot: 'hat', emoji: '🧭', badge: 'all-subjects' },
  { id: 'hat.hero-helmet', name: '勇者頭盔', slot: 'hat', emoji: '⚔️', badge: 'wrong-50' },
  { id: 'hat.scholar', name: '學士帽', slot: 'hat', emoji: '🎓', badge: 'tower-hero' },
];

/** 眼鏡、背後、手持（外觀在 src/world/Accessories.tsx） */
const ACCESSORIES: readonly CatalogItem[] = [
  { id: 'face.round', name: '圓框眼鏡', slot: 'face', emoji: '👓', price: 30 },
  { id: 'face.sun', name: '墨鏡', slot: 'face', emoji: '🕶️', price: 60 },
  { id: 'face.heart', name: '愛心眼鏡', slot: 'face', emoji: '💗', price: 80 },
  { id: 'back.bag', name: '小書包', slot: 'back', emoji: '🎒', price: 50 },
  { id: 'back.cape', name: '紅披風', slot: 'back', emoji: '🦸', price: 90 },
  { id: 'back.wings', name: '天使翅膀', slot: 'back', emoji: '🪽', price: 150 },
  { id: 'back.gold-cape', name: '金色披風', slot: 'back', emoji: '✨', badge: 'correct-1000' },
  { id: 'hand.flag', name: '小旗子', slot: 'hand', emoji: '🚩', price: 30 },
  { id: 'hand.balloon', name: '氣球', slot: 'hand', emoji: '🎈', price: 40 },
  { id: 'hand.sunflower', name: '向日葵', slot: 'hand', emoji: '🌻', price: 60 },
  { id: 'hand.star-wand', name: '星星魔法棒', slot: 'hand', emoji: '🪄', badge: 'correct-100' },
  { id: 'hand.brush', name: '毛筆', slot: 'hand', emoji: '🖌️', badge: 'write-100' },
];

/** 寵物（跟在角色後面走；外觀在 src/world/Pets.tsx）與走路特效（走路時腳下冒出來；src/world/Trail.tsx） */
const PETS_AND_TRAILS: readonly CatalogItem[] = [
  { id: 'pet.chick', name: '小雞', slot: 'pet', emoji: '🐥', price: 60 },
  { id: 'pet.butterfly', name: '蝴蝶', slot: 'pet', emoji: '🦋', price: 80 },
  { id: 'pet.fishbowl', name: '小魚缸', slot: 'pet', emoji: '🐠', price: 100 },
  { id: 'pet.dino', name: '小恐龍', slot: 'pet', emoji: '🦕', price: 150 },
  { id: 'pet.dragon', name: '小龍', slot: 'pet', emoji: '🐲', badge: 'streak-7' },
  { id: 'pet.owl', name: '貓頭鷹', slot: 'pet', emoji: '🦉', badge: 'skill-master' },
  { id: 'trail.flowers', name: '小花腳印', slot: 'trail', emoji: '🌸', price: 80 },
  { id: 'trail.stars', name: '閃亮星星', slot: 'trail', emoji: '✨', price: 120 },
];

/**
 * 院子的家具（自己的家第一期，docs/plans/home.md 第 3.2 節；外觀在 src/world/Furniture.tsx）。
 * 一個一個買，同一種可以買很多個（收藏裡同一個 id 出現幾次就是有幾個）；不能當禮物
 */
export const FURNITURE: readonly CatalogItem[] = [
  { id: 'decor.bed-red', name: '紅花圃', slot: 'decor', emoji: '🌹', price: 8, walkable: true },
  { id: 'decor.bed-yellow', name: '黃花圃', slot: 'decor', emoji: '🌼', price: 8, walkable: true },
  { id: 'decor.tulip', name: '鬱金香', slot: 'decor', emoji: '🌷', price: 10, walkable: true },
  { id: 'decor.grass', name: '草叢', slot: 'decor', emoji: '🌿', price: 5, walkable: true },
  { id: 'decor.mushroom', name: '蘑菇', slot: 'decor', emoji: '🍄', price: 10, walkable: true },
  { id: 'decor.stone', name: '石板路', slot: 'decor', emoji: '🪨', price: 5, walkable: true },
  { id: 'decor.tree', name: '小樹', slot: 'decor', emoji: '🌳', price: 20 },
  { id: 'decor.bush', name: '灌木', slot: 'decor', emoji: '🌲', price: 15 },
  { id: 'decor.fence', name: '木柵欄', slot: 'decor', emoji: '🪵', price: 6 },
  { id: 'decor.bench', name: '長椅', slot: 'decor', emoji: '🪑', price: 40 },
  { id: 'decor.picnic', name: '野餐桌', slot: 'decor', emoji: '🧺', price: 60 },
  { id: 'decor.parasol', name: '遮陽傘', slot: 'decor', emoji: '⛱️', price: 50 },
  { id: 'decor.lamp', name: '路燈', slot: 'decor', emoji: '💡', price: 45 },
  { id: 'decor.mailbox', name: '信箱', slot: 'decor', emoji: '📮', price: 30 },
  { id: 'decor.scarecrow', name: '稻草人', slot: 'decor', emoji: '🌾', price: 50 },
  { id: 'decor.crate', name: '木箱', slot: 'decor', emoji: '📦', price: 20 },
  { id: 'decor.swing', name: '鞦韆', slot: 'decor', emoji: '🎠', price: 120 },
  { id: 'decor.slide', name: '溜滑梯', slot: 'decor', emoji: '🛝', price: 150 },
  { id: 'decor.sandbox', name: '沙坑', slot: 'decor', emoji: '🏖️', price: 80 },
  { id: 'decor.windmill', name: '風車', slot: 'decor', emoji: '🌀', price: 90 },
  { id: 'decor.pond', name: '小池塘', slot: 'decor', emoji: '🐟', price: 100, walkable: true },
];

/** 全部商品 */
export const ITEMS: readonly CatalogItem[] = [...HATS, ...ACCESSORIES, ...PETS_AND_TRAILS, ...FURNITURE];

/** 用 id 查商品；查不到回傳 undefined */
export function findItem(id: string): CatalogItem | undefined {
  return ITEMS.find((item) => item.id === id);
}

/** 某一格的全部商品（百寶屋分頁用） */
export function itemsOfSlot(slot: Slot): CatalogItem[] {
  return ITEMS.filter((item) => item.slot === slot);
}

/**
 * 是否擁有：收藏裡有，或已經得到這個獎章專屬道具需要的獎章。目錄裡沒有的 id 一律不算擁有。
 * 獎章道具不寫進收藏，由獎章推算，所以早先得到的獎章也自動擁有。
 */
export function owns(p: Profile, itemId: string): boolean {
  const item = findItem(itemId);
  if (!item) return false;
  if (item.badge) return !!p.badges?.[item.badge];
  return p.inventory.includes(itemId);
}

/** 外觀的道具格子（家具不是穿戴的格子） */
export const SLOTS: readonly AvatarSlot[] = ['hat', 'face', 'back', 'hand', 'pet', 'trail'];

/**
 * 畫角色用的外觀：只留下真的擁有、而且格子相符的道具，其他當作沒戴；沒有的格子補 null。
 * 存檔裡的值不一定合法（例如獎章被收回），畫面一律經過這裡。
 */
export function equippedOf(p: Profile): AvatarConfig {
  const a = p.avatar;
  const pick = (slot: AvatarSlot): string | null => {
    const id = a[slot];
    return id && findItem(id)?.slot === slot && owns(p, id) ? id : null;
  };
  const [hat, face, back, hand, pet, trail] = SLOTS.map(pick);
  return { animal: a.animal, color: a.color, hat, face, back, hand, pet, trail };
}
