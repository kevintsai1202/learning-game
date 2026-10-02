/**
 * 商品目錄（純資料，前端與伺服器共用）。
 * 伺服器依這裡的價格扣金幣，所以不能 import 任何畫面、音訊或 3D 的程式。
 */

/** 一項商品 */
export interface CatalogItem {
  id: string;
  name: string;
  /** 價格（金幣） */
  price: number;
}

/** 百寶屋的帽子（外觀在 src/world/Hats.tsx） */
export const HATS = [
  { id: 'hat.party', name: '派對帽', price: 20 },
  { id: 'hat.cap', name: '棒球帽', price: 30 },
  { id: 'hat.flower', name: '花圈', price: 40 },
  { id: 'hat.straw', name: '草帽', price: 50 },
  { id: 'hat.helmet', name: '安全帽', price: 60 },
  { id: 'hat.chef', name: '廚師帽', price: 60 },
  { id: 'hat.crown', name: '皇冠', price: 120 },
  { id: 'hat.wizard', name: '魔法帽', price: 150 },
] as const satisfies readonly CatalogItem[];

/** 全部可以用金幣買的商品 */
const ALL_ITEMS: readonly CatalogItem[] = [...HATS];

/** 用 id 查商品；查不到回傳 undefined */
export function findItem(id: string): CatalogItem | undefined {
  return ALL_ITEMS.find((item) => item.id === id);
}
