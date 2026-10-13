/**
 * 班級內容（G4 的班級題庫，docs/plans/ai-questions.md）在孩子裝置上的快取：
 * 現在所在的班級島的 contentRev 和快取不同就重新抓；抓到的存在這台裝置（localStorage），離線也能玩。
 * 什麼時候檢查：雲端角色或班級的版本號變了（同步、收到 content 通知後同步）、打開挑戰塔時。
 */
import { create } from 'zustand';
import { fetchClassContent } from './cloudSync';
import { cloudDeps } from './useCloud';
import { useGame } from '../store/useGame';
import { currentClass } from '../store/island';
import { needsClassContent, parseClassContentCache, type ClassContentCache } from '../store/classPacks';

/** localStorage 的鍵 */
const CACHE_KEY = 'learning-island-class-content';

/** 讀這台裝置的快取（私密視窗、被封鎖時當作沒有） */
function readCache(): ClassContentCache {
  try {
    return parseClassContentCache(localStorage.getItem(CACHE_KEY));
  } catch {
    return {};
  }
}

/** 寫回快取（空間不足時只留在記憶體） */
function writeCache(cache: ClassContentCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* 空間不足或被封鎖 */
  }
}

interface ClassContentStore {
  /** 班級代碼 → 版本號與啟用中的題庫 */
  cache: ClassContentCache;
  /** 現在所在的班級島需要的話重新抓（連不上就等下次） */
  refresh: () => Promise<void>;
}

/** 正在抓的班級（同一班不重複抓） */
const inflight = new Set<string>();

export const useClassContent = create<ClassContentStore>((set, get) => ({
  cache: readCache(),
  refresh: async () => {
    const p = useGame.getState().profile();
    const room = p?.cloud ? currentClass(p) : null;
    if (!p || !room || !needsClassContent(get().cache, room) || inflight.has(room.code)) return;
    inflight.add(room.code);
    try {
      const res = await fetchClassContent(cloudDeps, p.id, room.code);
      const cache = { ...get().cache, [room.code]: { rev: res.rev, packs: res.packs } };
      writeCache(cache);
      set({ cache });
    } catch {
      // 連不上或權杖失效：下次（版本號變了、打開挑戰塔）再抓
    } finally {
      inflight.delete(room.code);
    }
  },
}));

/** 開始看班級的版本號：角色、班級島或版本號變了就檢查一次；回傳停止的函式 */
export function startClassContent(): () => void {
  let last = '';
  const check = () => {
    const p = useGame.getState().profile();
    const room = p?.cloud ? currentClass(p) : null;
    const key = p && room ? `${p.id}:${room.code}:${room.contentRev ?? ''}` : '';
    if (key === last) return;
    last = key;
    if (key) void useClassContent.getState().refresh();
  };
  check();
  return useGame.subscribe(check);
}
