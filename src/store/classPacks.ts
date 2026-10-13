/**
 * 班級題庫在孩子這邊（G4，docs/plans/ai-questions.md 第 1 節第 4 點）的純函式：
 * 題庫包轉成挑戰塔的活動、班級內容的快取什麼時候要重新抓、讀回這台裝置的快取。
 */
import { createRng } from '../core/rng';
import type { SubjectId } from '../core/types';
import type { ActivityDef } from '../activities/types';
import { contentPackSchema, type ContentPack } from '../content/schema';

/** 一包班級題庫（伺服器回的） */
export interface ClassContentPack {
  id: string;
  title: string;
  pack: ContentPack;
}

/** 一個班級的內容快取：版本號與啟用中的題庫 */
export interface ClassContentEntry {
  rev: number;
  packs: ClassContentPack[];
}

/** 這台裝置的班級內容快取：班級代碼 → 內容 */
export type ClassContentCache = Record<string, ClassContentEntry>;

/** 題庫裡最多的科目（決定錯題與報表歸類；裝置上匯入的題庫也用） */
export function mainSubject(p: ContentPack): SubjectId {
  const count: Record<string, number> = {};
  for (const q of p.questions) count[q.subject] = (count[q.subject] ?? 0) + 1;
  return (Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'math') as SubjectId;
}

/** 班級題庫轉成挑戰塔「班級題庫」分組的活動（id 是 class.<題庫 id>）；一回合最多 10 題，每次打亂 */
export function classPackActivity(p: ClassContentPack): ActivityDef {
  return {
    id: `class.${p.id}`,
    zone: 'tower',
    subject: mainSubject(p.pack),
    title: p.title,
    icon: '🏫',
    group: '班級題庫',
    indicators: [...new Set(p.pack.questions.flatMap((q) => q.indicators))],
    count: Math.min(10, p.pack.questions.length),
    levels: false,
    description: p.pack.description,
    make: ({ seed, count }) => createRng(seed).shuffle(p.pack.questions as never[]).slice(0, count),
  };
}

/** 要不要重新抓這一班的內容：伺服器的版本號和快取不同才抓；舊版伺服器沒有版本號就不抓 */
export function needsClassContent(cache: ClassContentCache, room: { code: string; contentRev?: number }): boolean {
  if (typeof room.contentRev !== 'number') return false;
  return cache[room.code]?.rev !== room.contentRev;
}

/** 讀回快取（localStorage 的字串）：壞掉的整份丟掉；每包題庫重新驗證，格式錯的略過 */
export function parseClassContentCache(raw: string | null): ClassContentCache {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object') return {};
  const out: ClassContentCache = {};
  for (const [code, entry] of Object.entries(data as Record<string, { rev?: unknown; packs?: unknown }>)) {
    if (typeof entry?.rev !== 'number' || !Array.isArray(entry.packs)) continue;
    const packs = (entry.packs as { id?: unknown; title?: unknown; pack?: unknown }[]).flatMap((p) => {
      const r = contentPackSchema.safeParse(p?.pack);
      return r.success && typeof p.id === 'string' && typeof p.title === 'string' ? [{ id: p.id, title: p.title, pack: r.data as ContentPack }] : [];
    });
    out[code] = { rev: entry.rev, packs };
  }
  return out;
}
