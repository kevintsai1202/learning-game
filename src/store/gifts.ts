/**
 * 禮物目錄與收禮規則（純資料與純函式，前端與伺服器共用；規格見 docs/plans/online.md 第 7 節）。
 * 伺服器依這裡判斷什麼能送、價格多少、收下後存檔怎麼變，所以不能 import 任何畫面、音訊或 3D 的程式；
 * 只用 type import 讀 save.ts（避免執行期的循環引用）。
 */
import { findItem, owns } from './catalog';
import type { Profile } from './save';

/** 一種貼紙（只能當禮物收，不能自己買） */
export interface Sticker {
  /** id 以 sticker. 開頭 */
  id: string;
  name: string;
  emoji: string;
  /** 送一張要花的金幣 */
  price: number;
}

/** 貼紙目錄：可以重複收，百寶屋的「貼紙簿」顯示收集到幾張 */
export const STICKERS: readonly Sticker[] = [
  { id: 'sticker.cookie', name: '餅乾', emoji: '🍪', price: 3 },
  { id: 'sticker.apple', name: '蘋果', emoji: '🍎', price: 3 },
  { id: 'sticker.tulip', name: '鬱金香', emoji: '🌷', price: 5 },
  { id: 'sticker.star', name: '星星', emoji: '⭐', price: 5 },
  { id: 'sticker.rainbow', name: '彩虹', emoji: '🌈', price: 8 },
  { id: 'sticker.whale', name: '鯨魚', emoji: '🐳', price: 8 },
  { id: 'sticker.rocket', name: '火箭', emoji: '🚀', price: 10 },
  { id: 'sticker.unicorn', name: '獨角獸', emoji: '🦄', price: 10 },
];

/** 每人每天最多送幾份（當天送出的都算，包括後來被退回的） */
export const GIFT_DAILY_LIMIT = 5;
/** 幾天沒收下就退回送禮人 */
export const GIFT_EXPIRE_DAYS = 7;
/** 收禮紀錄最多留幾筆 */
export const GIFT_LOG_LIMIT = 50;

/** 用 id 查貼紙；查不到回傳 undefined */
export function findSticker(id: string): Sticker | undefined {
  return STICKERS.find((s) => s.id === id);
}

/** 禮物的價格：貼紙，或有金幣價格的外觀道具；獎章專屬道具與不存在的 id 不能送，回傳 null */
export function giftPrice(itemId: string): number | null {
  const sticker = findSticker(itemId);
  if (sticker) return sticker.price;
  const item = findItem(itemId);
  // 家具（自己的家）不能當禮物
  return item && !item.badge && item.slot !== 'decor' && item.price !== undefined ? item.price : null;
}

/** 禮物的名稱：貼紙是「鬱金香貼紙」，外觀道具直接用名稱 */
export function giftName(itemId: string): string {
  const sticker = findSticker(itemId);
  if (sticker) return `${sticker.name}貼紙`;
  return findItem(itemId)?.name ?? itemId;
}

/** 禮物的圖示 */
export function giftEmoji(itemId: string): string {
  return findSticker(itemId)?.emoji ?? findItem(itemId)?.emoji ?? '🎁';
}

/** 卡片上的說法：「一張 🌷 鬱金香貼紙」、「🎉 派對帽」 */
export function giftPhrase(itemId: string): string {
  const sticker = findSticker(itemId);
  if (sticker) return `一張 ${sticker.emoji} ${sticker.name}貼紙`;
  return `${giftEmoji(itemId)} ${giftName(itemId)}`;
}

/** 這位孩子能不能收這份禮物：能送的東西才能收；貼紙可以重複收，外觀道具已經有了就不能收 */
export function canReceive(p: Profile, itemId: string): boolean {
  if (giftPrice(itemId) === null) return false;
  return findSticker(itemId) ? true : !owns(p, itemId);
}

/**
 * 收下禮物後的存檔：貼紙張數加一、外觀道具放進收藏，收禮紀錄加在最前面（只留最新 50 筆）。
 * 不能送的東西回傳原本的存檔（防呆；伺服器在收下前已經檢查過）。
 */
export function receiveGift(p: Profile, gift: { itemId: string; from: string }, date: string): Profile {
  if (giftPrice(gift.itemId) === null) return p;
  const giftLog = [{ from: gift.from, itemId: gift.itemId, date }, ...(p.giftLog ?? [])].slice(0, GIFT_LOG_LIMIT);
  if (findSticker(gift.itemId)) {
    const stickers = { ...p.stickers, [gift.itemId]: (p.stickers?.[gift.itemId] ?? 0) + 1 };
    return { ...p, stickers, giftLog };
  }
  const inventory = p.inventory.includes(gift.itemId) ? p.inventory : [...p.inventory, gift.itemId];
  return { ...p, inventory, giftLog };
}
