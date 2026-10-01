/**
 * 家長匯入的教材版本包（存在 localStorage）：可以新增其他版本，或用相同 id 覆蓋內建版本（修正生字表）。
 */
import { create } from 'zustand';
import { editionSchema, type Edition } from '../content/editions/schema';
import { formatIssues } from '../content/schema';
import { BUILT_IN_EDITIONS, mergeEditions } from '../content/editions';

const EDITIONS_KEY = 'learning-island-editions';

function readImported(): Edition[] {
  try {
    const raw = localStorage.getItem(EDITIONS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as unknown[]).flatMap((e) => {
      const r = editionSchema.safeParse(e);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

function writeImported(list: Edition[]): void {
  try {
    localStorage.setItem(EDITIONS_KEY, JSON.stringify(list));
  } catch {
    /* 空間不足：只留在記憶體 */
  }
}

interface EditionsStore {
  /** 家長匯入的版本 */
  imported: Edition[];
  /** 內建＋匯入合併後的全部版本 */
  all: Edition[];
  /** 匯入版本包 JSON；成功回傳 null，失敗回傳中文錯誤訊息 */
  importEdition: (raw: string) => string[] | null;
  removeImported: (id: string) => void;
}

export const useEditions = create<EditionsStore>((set, get) => {
  const imported = readImported();
  const commit = (list: Edition[]) => {
    writeImported(list);
    set({ imported: list, all: mergeEditions(BUILT_IN_EDITIONS, list) });
  };
  return {
    imported,
    all: mergeEditions(BUILT_IN_EDITIONS, imported),
    importEdition: (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return ['檔案不是正確的 JSON 格式'];
      }
      const r = editionSchema.safeParse(data);
      if (!r.success) return formatIssues(r.error);
      commit([...get().imported.filter((e) => e.id !== r.data.id), r.data]);
      return null;
    },
    removeImported: (id) => commit(get().imported.filter((e) => e.id !== id)),
  };
});
