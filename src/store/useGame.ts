/**
 * 遊戲存檔的 zustand store：把 save.ts 的純函式接上 localStorage。
 * 存檔壞掉時，先把原始字串備份到另一個鍵再重置，避免孩子的進度直接消失。
 */
import { create } from 'zustand';
import type { SessionResult } from '../core/types';
import {
  addPlayTime,
  addProfile,
  buyItem,
  createEmptySave,
  isValidSave,
  loadSave,
  recordSession,
  removeProfile,
  setAvatar,
  setCurriculum,
  setPin,
  verifyPin,
  type AvatarConfig,
  type CurriculumChoice,
  type Profile,
  type SaveData,
  type Settings,
} from './save';

/** localStorage 的鍵 */
export const SAVE_KEY = 'learning-island-save';

/** 讀取 localStorage（私密瀏覽或被封鎖時回傳 null） */
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 寫入 localStorage（失敗時靜默略過，遊戲照常進行） */
function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 儲存空間不足或被封鎖：本次進度只留在記憶體 */
  }
}

/** 啟動時載入存檔；無法解析時備份原始資料 */
function initialSave(): SaveData {
  const raw = readStorage(SAVE_KEY);
  if (raw && !isValidSave(raw)) writeStorage(`${SAVE_KEY}-broken-${Date.now()}`, raw);
  return loadSave(raw);
}

interface GameStore {
  save: SaveData;
  /** 目前的小朋友（沒有時為 null） */
  profile: () => Profile | null;
  createProfile: (name: string, avatar: AvatarConfig) => void;
  selectProfile: (id: string) => void;
  deleteProfile: (id: string) => void;
  updateAvatar: (avatar: AvatarConfig) => void;
  /** 設定某位小朋友的教材版本 */
  updateCurriculum: (profileId: string, curriculum: CurriculumChoice) => void;
  finishSession: (result: SessionResult) => void;
  tickPlayTime: (seconds: number) => void;
  purchase: (itemId: string, price: number) => boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  setParentPin: (pin: string) => void;
  checkParentPin: (pin: string) => boolean;
  /** 匯入備份（整份取代），格式不符回傳 false */
  importBackup: (raw: string) => boolean;
  exportBackup: () => string;
}

export const useGame = create<GameStore>((set, get) => {
  /** 更新存檔並寫回 localStorage */
  const commit = (next: SaveData) => {
    writeStorage(SAVE_KEY, JSON.stringify(next));
    set({ save: next });
  };
  const activeId = (): string => {
    const id = get().save.activeProfileId;
    if (!id) throw new Error('尚未選擇角色');
    return id;
  };
  return {
    save: initialSave(),
    profile: () => {
      const { save } = get();
      return save.profiles.find((p) => p.id === save.activeProfileId) ?? null;
    },
    createProfile: (name, avatar) => commit(addProfile(get().save, { name, avatar }, new Date())),
    selectProfile: (id) => commit({ ...get().save, activeProfileId: id }),
    deleteProfile: (id) => commit(removeProfile(get().save, id)),
    updateAvatar: (avatar) => commit(setAvatar(get().save, activeId(), avatar)),
    updateCurriculum: (profileId, curriculum) => commit(setCurriculum(get().save, profileId, curriculum)),
    finishSession: (result) => commit(recordSession(get().save, activeId(), result, new Date())),
    tickPlayTime: (seconds) => {
      if (!get().save.activeProfileId) return;
      commit(addPlayTime(get().save, activeId(), seconds, new Date()));
    },
    purchase: (itemId, price) => {
      try {
        commit(buyItem(get().save, activeId(), itemId, price));
        return true;
      } catch {
        return false;
      }
    },
    updateSettings: (patch) => commit({ ...get().save, settings: { ...get().save.settings, ...patch } }),
    setParentPin: (pin) => commit(setPin(get().save, pin)),
    checkParentPin: (pin) => verifyPin(get().save, pin),
    importBackup: (raw) => {
      if (!isValidSave(raw)) return false;
      commit(loadSave(raw));
      return true;
    },
    exportBackup: () => JSON.stringify(get().save, null, 2),
  };
});

/** 測試或除錯用：清空存檔 */
export function resetSaveForTests(): void {
  useGame.setState({ save: createEmptySave() });
}
