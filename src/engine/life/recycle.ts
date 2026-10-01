/**
 * 垃圾分類大作戰（3D 舞台上點垃圾桶作答）。
 * 依環境部「垃圾分三類」：資源垃圾（回收）、廚餘、一般垃圾。只收各縣市分類一致、沒有爭議的物品。
 */
import { createRng, hashString } from '../../core/rng';
import type { ChoiceQuestion, QuestionGenerator } from '../../core/types';

/** 三個桶子（選項順序固定，3D 舞台也依這個順序擺放） */
export const RECYCLE_BINS = [
  { text: '資源回收', emoji: '♻️', color: '#2f6fde' },
  { text: '廚餘', emoji: '🥕', color: '#3fbf7f' },
  { text: '一般垃圾', emoji: '🗑️', color: '#8a8aa0' },
] as const;

/** 要分類的物品：emoji、名稱、正確的桶子索引、說明 */
export const RECYCLE_ITEMS: { emoji: string; name: string; bin: 0 | 1 | 2; why: string }[] = [
  { emoji: '📰', name: '舊報紙', bin: 0, why: '紙類可以回收再做成新的紙。' },
  { emoji: '📦', name: '紙箱', bin: 0, why: '紙箱壓扁後拿去資源回收。' },
  { emoji: '🥫', name: '空鐵罐', bin: 0, why: '鐵罐沖乾淨後可以回收。' },
  { emoji: '🍾', name: '空玻璃瓶', bin: 0, why: '玻璃瓶可以回收再利用。' },
  { emoji: '🧃', name: '喝完的鋁箔包', bin: 0, why: '鋁箔包喝完壓扁，可以資源回收。' },
  { emoji: '📚', name: '不要的舊課本', bin: 0, why: '書本是紙類，可以回收。' },
  { emoji: '🔋', name: '用完的電池', bin: 0, why: '廢電池要回收，不能丟一般垃圾。' },
  { emoji: '🍌', name: '香蕉皮', bin: 1, why: '果皮是廚餘。' },
  { emoji: '🍉', name: '西瓜皮', bin: 1, why: '果皮是廚餘。' },
  { emoji: '🍚', name: '吃剩的飯菜', bin: 1, why: '剩下的飯菜是廚餘。' },
  { emoji: '🥬', name: '菜葉', bin: 1, why: '菜葉是廚餘。' },
  { emoji: '🍊', name: '橘子皮', bin: 1, why: '果皮是廚餘。' },
  { emoji: '🍎', name: '蘋果核', bin: 1, why: '水果吃剩的部分是廚餘。' },
  { emoji: '🧻', name: '用過的衛生紙', bin: 2, why: '用過的衛生紙不能回收，要丟一般垃圾。' },
  { emoji: '😷', name: '用過的口罩', bin: 2, why: '用過的口罩要丟一般垃圾。' },
  { emoji: '🩹', name: '用過的 OK 繃', bin: 2, why: '用過的 OK 繃要丟一般垃圾。' },
  { emoji: '🖍️', name: '斷掉的蠟筆', bin: 2, why: '蠟筆不能回收，丟一般垃圾。' },
  { emoji: '🧽', name: '舊菜瓜布', bin: 2, why: '舊菜瓜布丟一般垃圾。' },
];

/** 出題：打散物品取 count 題；選項永遠是三個桶子（順序固定，對應 3D 桶子位置） */
export const genRecycle: QuestionGenerator = ({ seed, count }) => {
  const rng = createRng((seed ^ hashString('life.recycle3d')) >>> 0);
  return rng.shuffle(RECYCLE_ITEMS)
    .slice(0, count)
    .map((it): ChoiceQuestion => ({
      id: `life.recycle3d:${it.name}`,
      subject: 'life',
      skill: 'life.recycle3d',
      indicators: ['B-Ⅰ-3', '6-Ⅰ-5'],
      source: '環境部垃圾分三類（資源垃圾、廚餘、一般垃圾）',
      type: 'choice',
      prompt: `${it.emoji} ${it.name}要丟到哪一個桶子？`,
      speak: `${it.name}要丟到哪一個桶子？`,
      options: RECYCLE_BINS.map((b) => ({ text: b.text, emoji: b.emoji })),
      answer: it.bin,
      visual: { kind: 'bins', item: it.emoji, name: it.name },
      explain: it.why,
    }));
};
