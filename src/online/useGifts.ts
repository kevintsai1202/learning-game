/**
 * 送禮物的畫面狀態（zustand）：待收下的禮物、送出的禮物的結果、送禮視窗。
 * 呼叫伺服器的邏輯在 cloudSync.ts（有單元測試）；這裡只管狀態與「目前是哪位雲端角色」。
 *
 * 什麼時候重新讀取：進到島上（禮物卡片掛載時）、即時連線連上（welcome）、收到 gift 訊息。
 * 卡片只在島上顯示（IslandHud），不打斷答題。
 */
import { create } from 'zustand';
import { acceptGift, ackGiftNotices, declineGift, fetchClassmates, fetchGifts, sendGift, type AcceptOutcome } from './cloudSync';
import type { Classmate, GiftNotice, IncomingGift, SendGiftResponse } from './protocol';
import { cloudDeps } from './useCloud';
import { useGame } from '../store/useGame';
import { GIFT_DAILY_LIMIT } from '../store/gifts';
import { currentClass } from '../store/island';

interface GiftStore {
  /** 目前的資料屬於哪位角色（換角色時不顯示舊的） */
  profileId: string | null;
  /** 待收下的禮物（舊的在前） */
  incoming: IncomingGift[];
  /** 送出的禮物的結果（還沒看過的） */
  notices: GiftNotice[];
  /** 今天送了幾份 */
  sentToday: number;
  /** 每天最多送幾份 */
  dailyLimit: number;
  /** 送禮視窗：null 表示關著；to 是預先選好的同學 id（從名牌點進來時） */
  dialog: { to: string | null } | null;
  /** 重新讀取目前雲端角色的禮物狀態；連不上就保留原本的 */
  load: () => Promise<void>;
  openDialog: (to?: string | null) => void;
  closeDialog: () => void;
  /** 讀全班同學（選送禮對象） */
  classmates: () => Promise<Classmate[]>;
  /** 送禮物（id 由送禮視窗產生，同一次送禮重試時沿用） */
  send: (input: { id: string; to: string; itemId: string }) => Promise<SendGiftResponse['gift']>;
  accept: (giftId: string) => Promise<AcceptOutcome>;
  decline: (giftId: string) => Promise<void>;
  /** 送禮結果看過了（先從畫面拿掉，再告訴伺服器；失敗也不再顯示） */
  ackNotice: (noticeId: string) => Promise<void>;
  /** 清掉（離線、換角色） */
  clear: () => void;
}

/** 目前的雲端角色 id；本機角色回傳 null */
const activeCloudId = (): string | null => {
  const p = useGame.getState().profile();
  return p?.cloud ? p.id : null;
};

/** 需要雲端角色的動作：沒有時丟出錯誤 */
/** 現在所在的班級島是哪一班（多班級：同學名單與送禮只算這一班）；在自己的島是 undefined */
const currentRoom = (): string | undefined => {
  const p = useGame.getState().profile();
  return p ? currentClass(p)?.code : undefined;
};

const requireCloudId = (): string => {
  const id = activeCloudId();
  if (!id) throw new Error('這個角色沒有加入班級');
  return id;
};

const EMPTY = { profileId: null, incoming: [], notices: [], sentToday: 0 };

export const useGifts = create<GiftStore>((set, get) => ({
  ...EMPTY,
  dailyLimit: GIFT_DAILY_LIMIT,
  dialog: null,

  load: async () => {
    const id = activeCloudId();
    if (!id) return set({ ...EMPTY });
    try {
      const r = await fetchGifts(cloudDeps, id);
      // 讀取期間換了角色：丟掉這次的結果
      if (activeCloudId() !== id) return;
      set({ profileId: id, incoming: r.incoming, notices: r.notices, sentToday: r.sentToday, dailyLimit: r.dailyLimit });
    } catch {
      // 連不上：等下次（回到島上、重新連線或收到通知）再讀
    }
  },

  openDialog: (to = null) => set({ dialog: { to } }),
  closeDialog: () => set({ dialog: null }),

  classmates: async () => fetchClassmates(cloudDeps, requireCloudId(), currentRoom()),

  send: async (input) => {
    const room = currentRoom();
    const gift = await sendGift(cloudDeps, requireCloudId(), room ? { ...input, room } : input);
    set((s) => ({ sentToday: s.sentToday + 1 }));
    void get().load();
    return gift;
  },

  accept: async (giftId) => {
    const outcome = await acceptGift(cloudDeps, requireCloudId(), giftId);
    set((s) => ({ incoming: s.incoming.filter((g) => g.id !== giftId) }));
    return outcome;
  },

  decline: async (giftId) => {
    await declineGift(cloudDeps, requireCloudId(), giftId);
    set((s) => ({ incoming: s.incoming.filter((g) => g.id !== giftId) }));
  },

  ackNotice: async (noticeId) => {
    set((s) => ({ notices: s.notices.filter((n) => n.id !== noticeId) }));
    const id = activeCloudId();
    if (id) await ackGiftNotices(cloudDeps, id, [noticeId]).catch(() => undefined);
  },

  clear: () => set({ ...EMPTY, dialog: null }),
}));
