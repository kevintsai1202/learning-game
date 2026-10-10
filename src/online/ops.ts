/**
 * 雲端存檔的「操作」：裝置送出做了什麼，伺服器用同一套規則套用（前端與伺服器共用的純模組）。
 * 不上傳整份存檔，是為了避免互相覆蓋（例如玩到一半收到禮物，整份上傳會把禮物蓋掉）。
 * 這個檔案只能 import 純邏輯（存檔規則、計分、目錄、zod），伺服器會直接打包它。
 */
import { z } from 'zod';
import type { AnswerRecord, SessionResult } from '../core/types';
import { subjectSchema } from '../content/schema';
import { scoreSession } from '../engine/check';
import { SLOTS, findItem, owns } from '../store/catalog';
import { badgeById } from '../store/badges';
import { PUZZLE_GAME_IDS, type PuzzleGameId } from '../store/puzzle';
import { DECOR_MAX_OWNED, YARD_MAX_ITEMS, isDecor, ownedCount, yardItemSchema, type YardItem } from '../store/yard';
import {
  ANIMAL_IDS,
  addPlayTime,
  buyItem,
  createEmptySave,
  recordPuzzle,
  recordSession,
  setAvatar,
  setCurriculum,
  setTitle,
  setYard,
  storedQuestion,
  type AvatarConfig,
  type CurriculumChoice,
  type Profile,
  type SaveData,
} from '../store/save';

/** 單筆遊玩時間的上限（秒）；超過的改成這個值，不拒絕 */
export const PLAYTIME_OP_MAX = 600;
/** 操作時間最早只認到幾天前（裝置時鐘壞掉時的保護） */
export const OP_BACKDATE_LIMIT_DAYS = 90;
/** 一回合最多幾題（格式檢查用） */
const SESSION_MAX_QUESTIONS = 200;

/** 操作共同欄位：id（裝置產生，伺服器用來去重）與發生時間（ISO 字串） */
interface OpBase {
  id: string;
  at: string;
}

/** 一種操作 */
export type Op =
  | (OpBase & { kind: 'session'; result: SessionResult })
  /** puzzle：在益智遊戲館玩的時間（同時算進整體與益智遊戲的時間；舊裝置沒有這個欄位） */
  | (OpBase & { kind: 'playTime'; seconds: number; puzzle?: boolean })
  | (OpBase & { kind: 'buy'; itemId: string })
  /** 院子的擺設（自己的家，docs/plans/home.md）：整份取代，套用時照擁有的家具清理 */
  | (OpBase & { kind: 'yard'; items: YardItem[] })
  | (OpBase & { kind: 'avatar'; avatar: AvatarConfig })
  | (OpBase & { kind: 'curriculum'; curriculum: CurriculumChoice })
  | (OpBase & { kind: 'title'; badge: string | null })
  /** 益智遊戲的一局：金幣由套用端依星數與每日上限算；answers 只有益智搶答會帶 */
  | (OpBase & { kind: 'puzzle'; game: PuzzleGameId; stars: number; answers?: AnswerRecord[] });

/** 操作的內容（不含 id 與時間，產生操作時再補上） */
export type OpBody = Op extends infer T ? (T extends Op ? Omit<T, 'id' | 'at'> : never) : never;

/** 套用結果：成功回傳新存檔，失敗回傳中文原因 */
export type ApplyResult = { ok: true; profile: Profile } | { ok: false; reason: string };

// ---------- 格式 ----------

const base = { id: z.string().min(1).max(64), at: z.string().max(40) };
/** 回合裡的題目：與錯題本相同的寬鬆檢查，另外要有科目（課綱統計的鍵會用到） */
const opQuestion = storedQuestion.extend({ subject: subjectSchema });
/** 角色外觀格式（加入班級的請求也用這份） */
/** 教材版本設定（孩子自己的設定，以及老師設定的班級版本共用） */
export const curriculumSchema = z.object({ zh: z.string().max(60), math: z.string().max(60), term: z.enum(['上', '下', 'auto']) });

export const avatarSchema = z.object({
  animal: z.enum(ANIMAL_IDS),
  color: z.string().regex(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/),
  hat: z.string().max(40).nullable(),
  face: z.string().max(40).nullable().optional(),
  back: z.string().max(40).nullable().optional(),
  hand: z.string().max(40).nullable().optional(),
  pet: z.string().max(40).nullable().optional(),
  trail: z.string().max(40).nullable().optional(),
});

/** 一題的作答紀錄（回合與益智搶答共用） */
const answerSchema = z.object({ question: opQuestion, correct: z.boolean(), firstTry: z.boolean() });

/** 操作的格式（伺服器逐筆驗證） */
export const opSchema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('session'),
    result: z.object({
      activityId: z.string().min(1).max(100),
      subject: subjectSchema,
      total: z.number().int().min(1).max(SESSION_MAX_QUESTIONS),
      correct: z.number().int().min(0),
      stars: z.number().int().min(0).max(3),
      coins: z.number().int().min(0),
      seconds: z.number().min(0).max(24 * 3600),
      answers: z.array(answerSchema).max(SESSION_MAX_QUESTIONS),
    }),
  }),
  z.object({ ...base, kind: z.literal('playTime'), seconds: z.number().positive().max(24 * 3600), puzzle: z.boolean().optional() }),
  z.object({ ...base, kind: z.literal('buy'), itemId: z.string().min(1).max(40) }),
  z.object({ ...base, kind: z.literal('yard'), items: z.array(yardItemSchema).max(YARD_MAX_ITEMS) }),
  z.object({ ...base, kind: z.literal('avatar'), avatar: avatarSchema }),
  z.object({
    ...base,
    kind: z.literal('curriculum'),
    curriculum: curriculumSchema,
  }),
  z.object({ ...base, kind: z.literal('title'), badge: z.string().max(40).nullable() }),
  z.object({
    ...base,
    kind: z.literal('puzzle'),
    game: z.enum(PUZZLE_GAME_IDS),
    stars: z.number().int().min(1).max(3),
    answers: z.array(answerSchema).max(SESSION_MAX_QUESTIONS).optional(),
  }),
]);

/** 驗證並轉成 Op；格式不符回傳 null。題目只做寬鬆檢查，型別上視為 Question（與錯題本相同的做法） */
export function parseOp(raw: unknown): Op | null {
  const r = opSchema.safeParse(raw);
  return r.success ? (r.data as unknown as Op) : null;
}

// ---------- 套用 ----------

/**
 * 修正操作時間：比 now 晚的改成 now（裝置時鐘快了）；早於 90 天前的改成 90 天前；
 * 看不懂的字串改成 now。舊的操作不拒絕，寒暑假離線玩的進度也要收。
 */
export function normalizeOpTime(at: string, now: Date): Date {
  const t = new Date(at).getTime();
  if (Number.isNaN(t) || t > now.getTime()) return new Date(now.getTime());
  const earliest = now.getTime() - OP_BACKDATE_LIMIT_DAYS * 24 * 3600 * 1000;
  return new Date(Math.max(t, earliest));
}

/** 把單一角色包成存檔，套用 save.ts 的函式後再取出來 */
function onProfile(profile: Profile, fn: (save: SaveData, id: string) => SaveData): Profile {
  const save: SaveData = { ...createEmptySave(), profiles: [profile], activeProfileId: profile.id };
  return fn(save, profile.id).profiles[0];
}

/**
 * 套用一筆操作（純函式，不改動傳入的存檔）。
 * now：套用端的現在時間（伺服器的時鐘），只用來修正操作時間。
 */
export function applyOp(profile: Profile, op: Op, now: Date): ApplyResult {
  const at = normalizeOpTime(op.at, now);
  switch (op.kind) {
    case 'session': {
      const r = op.result;
      if (r.answers.length > r.total) return { ok: false, reason: '作答筆數比題數多' };
      // 星數與金幣用作答紀錄重算，不信任裝置送來的數字
      const correct = r.answers.filter((a) => a.firstTry).length;
      const { stars, coins } = scoreSession(r.total, correct);
      const result: SessionResult = { ...r, correct, stars, coins };
      return { ok: true, profile: onProfile(profile, (s, id) => recordSession(s, id, result, at)) };
    }
    case 'playTime': {
      const seconds = Math.min(op.seconds, PLAYTIME_OP_MAX);
      return { ok: true, profile: onProfile(profile, (s, id) => addPlayTime(s, id, seconds, at, op.puzzle === true)) };
    }
    case 'buy': {
      const item = findItem(op.itemId);
      if (!item) return { ok: false, reason: '沒有這個商品' };
      if (item.price === undefined) return { ok: false, reason: '這個要用獎章換' };
      const price = item.price;
      // 家具可以重複買（每種最多 DECOR_MAX_OWNED 個）；其他商品已經有就不扣款
      if (isDecor(item.id)) {
        if (ownedCount(profile, item.id) >= DECOR_MAX_OWNED) return { ok: false, reason: `這個家具已經有 ${DECOR_MAX_OWNED} 個了` };
        if (profile.coins < price) return { ok: false, reason: '金幣不夠' };
      } else if (!owns(profile, item.id) && profile.coins < price) return { ok: false, reason: '金幣不夠' };
      return { ok: true, profile: onProfile(profile, (s, id) => buyItem(s, id, item.id, price)) };
    }
    case 'yard':
      return { ok: true, profile: onProfile(profile, (s, id) => setYard(s, id, op.items)) };
    case 'avatar': {
      // 每一格戴的東西都要已擁有（含靠獎章擁有），而且格子相符
      for (const slot of SLOTS) {
        const itemId = op.avatar[slot];
        if (itemId == null) continue;
        if (findItem(itemId)?.slot !== slot || !owns(profile, itemId)) return { ok: false, reason: slot === 'hat' ? '還沒有這頂帽子' : '還沒有這個道具' };
      }
      return { ok: true, profile: onProfile(profile, (s, id) => setAvatar(s, id, op.avatar)) };
    }
    case 'curriculum':
      return { ok: true, profile: onProfile(profile, (s, id) => setCurriculum(s, id, op.curriculum)) };
    case 'title':
      if (op.badge !== null && (!profile.badges?.[op.badge] || !badgeById(op.badge)?.title)) return { ok: false, reason: '還沒有這個稱號' };
      return { ok: true, profile: onProfile(profile, (s, id) => setTitle(s, id, op.badge)) };
    case 'puzzle':
      // 金幣在 recordPuzzle 裡依星數與今天已拿的益智金幣重算（操作裡沒有金幣欄位）
      return { ok: true, profile: onProfile(profile, (s, id) => recordPuzzle(s, id, { game: op.game, stars: op.stars, answers: op.answers }, at)) };
  }
}

/** 產生操作 id */
export function newOpId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
