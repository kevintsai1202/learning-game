/**
 * 遊戲存檔的 zustand store：把 save.ts 的純函式接上 localStorage。
 * 存檔壞掉時，先把原始字串備份到另一個鍵再重置，避免孩子的進度直接消失。
 * 雲端角色（有 cloud 欄位）的動作改用 applyOp 套用（與伺服器同一套規則），並放進待送佇列。
 */
import { create } from 'zustand';
import type { SessionResult } from '../core/types';
import { applyOp, newOpId, type Op, type OpBody } from '../online/ops';
import { recordOp } from '../online/storage';
import { findItem } from './catalog';
import { newlyEarned } from './badges';
import {
  addPlayTime,
  addProfile,
  buyItem,
  createEmptySave,
  isValidSave,
  loadSave,
  recordPuzzle,
  recordSession,
  removeProfile,
  replaceProfile,
  setAvatar,
  setCurriculum,
  setPin,
  setTitle,
  verifyPin,
  type AvatarConfig,
  type CurriculumChoice,
  type Profile,
  type PuzzlePlay,
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
  /** 紀錄一回合；回傳這一回合新得到的獎章 id（結算畫面慶祝用） */
  finishSession: (result: SessionResult) => string[];
  /** 紀錄益智遊戲的一局；回傳這局拿到的金幣（每日上限之後是 0）與新得到的獎章 */
  finishPuzzle: (play: PuzzlePlay) => { coins: number; newBadges: string[] };
  /** 選擇顯示的稱號（獎章 id；null 表示不顯示）；不能選時回傳 false */
  chooseTitle: (badgeId: string | null) => boolean;
  /** 累計遊玩時間；puzzle 表示在益智遊戲館（同時算進益智遊戲的每日時間） */
  tickPlayTime: (seconds: number, puzzle?: boolean) => void;
  purchase: (itemId: string, price: number) => boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  setParentPin: (pin: string) => void;
  checkParentPin: (pin: string) => boolean;
  /** 匯入備份（整份取代），格式不符回傳 false */
  importBackup: (raw: string) => boolean;
  exportBackup: () => string;
  /** 寫入一位角色（同 id 取代、沒有就新增）；雲端同步套用伺服器版本時用 */
  putProfile: (profile: Profile) => void;
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
  /**
   * 雲端角色的動作：本機先用 applyOp 套用，成功才放進待送佇列。
   * 回傳 null 表示不是雲端角色（呼叫端照原本的方式存檔）；true／false 表示套用成功或被拒絕。
   */
  const cloudAct = (profileId: string, op: OpBody): boolean | null => {
    const p = get().save.profiles.find((x) => x.id === profileId);
    if (!p?.cloud) return null;
    const full = { ...op, id: newOpId(), at: new Date().toISOString() } as Op;
    const r = applyOp(p, full, new Date());
    if (!r.ok) return false;
    commit(replaceProfile(get().save, r.profile));
    recordOp(p.cloud.accountId, full);
    return true;
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
    updateAvatar: (avatar) => {
      if (cloudAct(activeId(), { kind: 'avatar', avatar }) === null) commit(setAvatar(get().save, activeId(), avatar));
    },
    updateCurriculum: (profileId, curriculum) => {
      if (cloudAct(profileId, { kind: 'curriculum', curriculum }) === null) commit(setCurriculum(get().save, profileId, curriculum));
    },
    finishSession: (result) => {
      const before = get().profile()!;
      if (cloudAct(activeId(), { kind: 'session', result }) === null) commit(recordSession(get().save, activeId(), result, new Date()));
      return newlyEarned(before, get().profile()!);
    },
    finishPuzzle: (play) => {
      const before = get().profile()!;
      // 雲端操作不帶金幣：套用端（本機與伺服器）依星數與今天已拿的益智金幣重算
      const op: OpBody = { kind: 'puzzle', game: play.game, stars: play.stars, ...(play.answers ? { answers: play.answers } : {}) };
      if (cloudAct(activeId(), op) === null) commit(recordPuzzle(get().save, activeId(), play, new Date()));
      const after = get().profile()!;
      return { coins: after.coins - before.coins, newBadges: newlyEarned(before, after) };
    },
    chooseTitle: (badgeId) => {
      const cloud = cloudAct(activeId(), { kind: 'title', badge: badgeId });
      if (cloud !== null) return cloud;
      try {
        commit(setTitle(get().save, activeId(), badgeId));
        return true;
      } catch {
        return false;
      }
    },
    tickPlayTime: (seconds, puzzle = false) => {
      if (!get().save.activeProfileId) return;
      // 不在益智遊戲館時不帶 puzzle 欄位，操作格式和以前一樣
      const op: OpBody = puzzle ? { kind: 'playTime', seconds, puzzle: true } : { kind: 'playTime', seconds };
      if (cloudAct(activeId(), op) === null) commit(addPlayTime(get().save, activeId(), seconds, new Date(), puzzle));
    },
    purchase: (itemId, price) => {
      // 雲端角色的價格查目錄（和伺服器相同），不採用畫面傳來的價格
      const cloud = findItem(itemId) ? cloudAct(activeId(), { kind: 'buy', itemId }) : null;
      if (cloud !== null) return cloud;
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
    putProfile: (profile) => commit(replaceProfile(get().save, profile)),
  };
});

/** 測試或除錯用：清空存檔 */
export function resetSaveForTests(): void {
  useGame.setState({ save: createEmptySave() });
}
