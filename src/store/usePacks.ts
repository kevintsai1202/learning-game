/**
 * 自訂題庫（家長或老師匯入的 JSON）：存在 localStorage，在挑戰塔顯示成「自訂題庫」活動。
 */
import { create } from 'zustand';
import { createRng, hashString } from '../core/rng';
import type { SubjectId } from '../core/types';
import { contentPackSchema, formatIssues, type ContentPack } from '../content/schema';
import type { ActivityDef } from '../activities/types';

const PACKS_KEY = 'learning-island-packs';

/** 已匯入的題庫（含 id） */
export interface StoredPack extends ContentPack {
  id: string;
  importedAt: string;
}

function readPacks(): StoredPack[] {
  try {
    const raw = localStorage.getItem(PACKS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    // 每一包都重新驗證，壞掉的略過
    return arr.flatMap((p) => {
      const r = contentPackSchema.safeParse(p);
      const meta = p as { id?: string; importedAt?: string };
      return r.success && meta.id ? [{ ...(r.data as ContentPack), id: meta.id, importedAt: meta.importedAt ?? '' }] : [];
    });
  } catch {
    return [];
  }
}

function writePacks(packs: StoredPack[]): void {
  try {
    localStorage.setItem(PACKS_KEY, JSON.stringify(packs));
  } catch {
    /* 空間不足：只留在記憶體 */
  }
}

/** 題庫裡最多的科目（決定錯題與報表歸類） */
function mainSubject(p: ContentPack): SubjectId {
  const count: Record<string, number> = {};
  for (const q of p.questions) count[q.subject] = (count[q.subject] ?? 0) + 1;
  return (Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'math') as SubjectId;
}

/** 把題庫包轉成挑戰塔的活動 */
export function packToActivity(p: StoredPack): ActivityDef {
  return {
    id: `pack.${p.id}`,
    zone: 'tower',
    subject: mainSubject(p),
    title: p.title,
    icon: '📦',
    group: '自訂題庫',
    indicators: [...new Set(p.questions.flatMap((q) => q.indicators))],
    count: Math.min(10, p.questions.length),
    levels: false,
    description: p.description,
    make: ({ seed, count }) => createRng(seed).shuffle(p.questions as never[]).slice(0, count),
  };
}

interface PacksStore {
  packs: StoredPack[];
  activities: ActivityDef[];
  /** 匯入 JSON 文字；成功回傳 null，失敗回傳中文錯誤訊息 */
  importPack: (raw: string) => string[] | null;
  removePack: (id: string) => void;
}

export const usePacks = create<PacksStore>((set, get) => {
  const initial = readPacks();
  const commit = (packs: StoredPack[]) => {
    writePacks(packs);
    set({ packs, activities: packs.map(packToActivity) });
  };
  return {
    packs: initial,
    activities: initial.map(packToActivity),
    importPack: (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return ['檔案不是正確的 JSON 格式'];
      }
      const r = contentPackSchema.safeParse(data);
      if (!r.success) return formatIssues(r.error);
      const pack = r.data as ContentPack;
      const id = hashString(`${pack.title}:${pack.questions.length}:${pack.questions[0]?.id}`).toString(36);
      const others = get().packs.filter((p) => p.id !== id);
      commit([...others, { ...pack, id, importedAt: new Date().toISOString() }]);
      return null;
    },
    removePack: (id) => commit(get().packs.filter((p) => p.id !== id)),
  };
});
