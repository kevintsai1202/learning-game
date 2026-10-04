/**
 * 存檔資料結構與更新規則（純函式、不可變更新）。
 * zustand store 只是把這些函式接上 localStorage；邏輯都在這裡，方便單元測試。
 */
import { z } from 'zod';
import { hashString } from '../core/rng';
import type { AnswerRecord, Question, SessionResult, SubjectId } from '../core/types';
import { subjectSchema } from '../content/schema';
import { awardBadges, badgeById } from './badges';
import { owns } from './catalog';
import { DEFAULT_PUZZLE_LIMIT_MIN, puzzleCoinsFor, trimPuzzleDays, type PuzzleDay, type PuzzleGameId, type PuzzleStats } from './puzzle';

/** 存檔格式版本；欄位有不相容變更時加一，並在 loadSave 補上轉換（v2：加入 recent、curriculum） */
export const SAVE_SCHEMA_VERSION = 2;
/** 每個活動記住最近做過幾題（約三回合），出題時優先避開 */
export const RECENT_LIMIT = 45;
/** 歷史紀錄最多保留幾筆 */
export const HISTORY_LIMIT = 300;
/** 熟練度盒子的最高等級（Leitner 盒子 0～5） */
export const MAX_BOX = 5;
/** 錯題連續一次答對幾次後移出錯題本 */
export const WRONG_BOOK_CLEAR_STREAK = 2;

/** 可選的動物角色 id（存檔驗證、型別、選單共用這一份；新增動物只要加在這裡） */
export const ANIMAL_IDS = ['bear', 'rabbit', 'cat', 'dog', 'capybara', 'panda', 'penguin', 'fox', 'koala', 'pig', 'eagle', 'elephant'] as const;

export type Animal = (typeof ANIMAL_IDS)[number];

/** 教材版本設定：國語、數學各用哪一個版本，以及學期（auto 依日期判斷） */
export interface CurriculumChoice {
  /** 國語版本 id，例如 kanghsuan-zh；generic 表示依 108 課綱通用 */
  zh: string;
  /** 數學版本 id，例如 nani-math */
  math: string;
  term: '上' | '下' | 'auto';
}

/** 預設版本：國語康軒、數學南一（使用者指定），學期依日期 */
export const DEFAULT_CURRICULUM: CurriculumChoice = { zh: 'kanghsuan-zh', math: 'nani-math', term: 'auto' };

/** 依日期判斷學期：8 月～隔年 1 月為上學期，2～7 月為下學期 */
export function termOf(d: Date): '上' | '下' {
  const m = d.getMonth() + 1;
  return m >= 8 || m === 1 ? '上' : '下';
}

/** 角色外觀 */
export interface AvatarConfig {
  animal: Animal;
  /** 身體顏色（CSS 色碼） */
  color: string;
  /** 戴的帽子（商店物品 id），沒有則為 null */
  hat: string | null;
  /** 眼鏡（2026-10 新增；舊存檔沒有時當作沒戴，寫入時一律存成 null） */
  face?: string | null;
  /** 背後（書包、披風、翅膀） */
  back?: string | null;
  /** 手持道具 */
  hand?: string | null;
  /** 寵物（跟在角色後面走） */
  pet?: string | null;
  /** 走路特效 */
  trail?: string | null;
}

/** 整理外觀：沒戴的格子一律寫成 null（不留 undefined，存檔轉成 JSON 時本機與伺服器才會一樣） */
export function normalizeAvatar(a: AvatarConfig): AvatarConfig {
  return {
    animal: a.animal,
    color: a.color,
    hat: a.hat ?? null,
    face: a.face ?? null,
    back: a.back ?? null,
    hand: a.hand ?? null,
    pet: a.pet ?? null,
    trail: a.trail ?? null,
  };
}

/** 某個技能的熟練度 */
export interface SkillStat {
  /** Leitner 盒子等級 0～5 */
  box: number;
  attempts: number;
  /** 一次就答對的次數 */
  firstTry: number;
  /** 最後練習日期 YYYY-MM-DD */
  lastSeen: string;
}

/** 錯題本的一筆 */
export interface WrongEntry {
  question: Question;
  wrongCount: number;
  lastWrong: string;
  /** 之後連續一次答對的次數 */
  streak: number;
}

/** 一回合的歷史紀錄 */
export interface SessionRecord {
  activityId: string;
  subject: SubjectId;
  date: string;
  total: number;
  /** 一次答對題數 */
  correct: number;
  stars: number;
  coins: number;
  seconds: number;
}

/**
 * 雲端角色的連結資訊（只存在本機；伺服器不存這個欄位）。
 * 有這個欄位的角色，進度會同步到班級伺服器。
 */
export interface CloudLink {
  /** 伺服器網址 */
  server: string;
  /** 班級代碼（6 位數字）；家長名下、還沒加入班級的雲端角色沒有（docs/plans/accounts.md 第 6 節） */
  room?: string;
  /** 班級名稱（顯示用）；沒有班級時沒有 */
  roomName?: string;
  /** 伺服器上的帳號 id（與 Profile.id 不同） */
  accountId: string;
}

/** 收禮紀錄的一筆（雲端角色才有；只有伺服器會寫入） */
export interface GiftLogEntry {
  /** 送禮人的暱稱 */
  from: string;
  /** 禮物 id（貼紙或外觀道具） */
  itemId: string;
  /** 收下的日期 YYYY-MM-DD */
  date: string;
}

/** 學習統計（獎章條件用；2026-10 新增，從這一版開始計數，以前的不補算） */
export interface LearningStats {
  /** 從錯題本清掉的題數（連續答對兩次、移出錯題本時加一） */
  wrongCleared: number;
  /** 描寫題完成的字數 */
  written: number;
}

/** 一位小朋友的資料 */
export interface Profile {
  id: string;
  name: string;
  avatar: AvatarConfig;
  createdAt: string;
  coins: number;
  /** 各活動最佳星數 */
  bestStars: Record<string, number>;
  skills: Record<string, SkillStat>;
  /** 依課綱代碼累計；鍵為「科目:代碼」（例如 math:N-2-2），不同科目可能有相同代碼 */
  indicators: Record<string, { attempts: number; firstTry: number }>;
  wrongBook: Record<string, WrongEntry>;
  history: SessionRecord[];
  /** 每日遊玩秒數，鍵為 YYYY-MM-DD */
  playLog: Record<string, number>;
  /** 已購買的商店物品 */
  inventory: string[];
  /** 各活動最近做過的題目 id（由舊到新，最多 RECENT_LIMIT 題） */
  recent: Record<string, string[]>;
  /** 教材版本設定 */
  curriculum: CurriculumChoice;
  /** 雲端角色才有：連到哪個班級（2026-10 新增，舊存檔沒有這個欄位） */
  cloud?: CloudLink;
  /** 學習統計（2026-10 新增；舊存檔沒有時當作 0） */
  stats?: LearningStats;
  /** 得到的獎章：獎章 id → 得到的日期 YYYY-MM-DD（2026-10 新增） */
  badges?: Record<string, string>;
  /** 顯示的稱號（獎章 id）；null 或沒有表示不顯示（2026-10 新增） */
  title?: string | null;
  /** 收到的貼紙：貼紙 id → 張數（雲端角色收禮物才有；2026-10 新增） */
  stickers?: Record<string, number>;
  /** 最近收到的禮物，最新的在前面，最多 50 筆（2026-10 新增） */
  giftLog?: GiftLogEntry[];
  /** 益智遊戲館的紀錄（2026-10 新增；舊存檔沒有時當作空的） */
  puzzle?: PuzzleStats;
}

/** 全機設定 */
export interface Settings {
  /** 畫面文字顯示注音 */
  zhuyin: boolean;
  /** 語音朗讀 */
  voice: boolean;
  /** 朗讀速度（0.5～1.5）；只影響裝置語音，預錄語音的速度固定 */
  voiceRate: number;
  /** 優先使用預錄語音（有音檔的句子播音檔，其他用裝置語音） */
  voiceClips: boolean;
  /** 音效 */
  sfx: boolean;
  /** 背景音樂 */
  music: boolean;
  /** 每日遊玩上限（分鐘），0 表示不限制 */
  dailyLimitMin: number;
  /** 益智遊戲館每日上限（分鐘），0 表示不另外限制（仍受每日遊玩上限）；2026-10 新增 */
  puzzleLimitMin: number;
  /** 3D 畫質 */
  quality: 'auto' | 'low' | 'high';
}

/** 整份存檔 */
export interface SaveData {
  schemaVersion: number;
  profiles: Profile[];
  activeProfileId: string | null;
  parent: { pinHash: string | null };
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  zhuyin: true,
  voice: true,
  voiceRate: 0.9,
  voiceClips: true,
  sfx: true,
  music: true,
  dailyLimitMin: 30,
  puzzleLimitMin: DEFAULT_PUZZLE_LIMIT_MIN,
  quality: 'auto',
};

/** 本機時間的日期字串 YYYY-MM-DD */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 建立空白存檔 */
export function createEmptySave(): SaveData {
  return { schemaVersion: SAVE_SCHEMA_VERSION, profiles: [], activeProfileId: null, parent: { pinHash: null }, settings: { ...DEFAULT_SETTINGS } };
}

/** 產生角色 id */
function newId(now: Date): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `p_${now.getTime().toString(36)}_${rand}`;
}

/** 新增一位小朋友並設為目前角色 */
export function addProfile(save: SaveData, input: { name: string; avatar: AvatarConfig }, now: Date): SaveData {
  const name = input.name.trim();
  if (!name) throw new Error('名字不能是空白');
  if (name.length > 12) throw new Error('名字最多 12 個字');
  const profile: Profile = {
    id: newId(now),
    name,
    avatar: normalizeAvatar(input.avatar),
    createdAt: now.toISOString(),
    coins: 0,
    bestStars: {},
    skills: {},
    indicators: {},
    wrongBook: {},
    history: [],
    playLog: {},
    inventory: [],
    recent: {},
    curriculum: { ...DEFAULT_CURRICULUM },
  };
  return { ...save, profiles: [...save.profiles, profile], activeProfileId: profile.id };
}

/** 對指定角色套用更新函式（找不到角色時丟出錯誤） */
function updateProfile(save: SaveData, profileId: string, fn: (p: Profile) => Profile): SaveData {
  const idx = save.profiles.findIndex((p) => p.id === profileId);
  if (idx < 0) throw new Error(`找不到角色 ${profileId}`);
  const profiles = save.profiles.slice();
  profiles[idx] = fn(save.profiles[idx]);
  return { ...save, profiles };
}

/** 用同 id 取代角色（雲端同步後套用伺服器版本）；沒有同 id 的角色就加在最後。目前角色不變 */
export function replaceProfile(save: SaveData, profile: Profile): SaveData {
  const idx = save.profiles.findIndex((p) => p.id === profile.id);
  const profiles = idx < 0 ? [...save.profiles, profile] : save.profiles.map((p, i) => (i === idx ? profile : p));
  return { ...save, profiles };
}

/** 技能熟練度 0～1 */
export function skillMastery(stat: SkillStat | undefined): number {
  return stat ? stat.box / MAX_BOX : 0;
}

/**
 * 作答紀錄對學習資料的更新：技能熟練度、課綱指標累計、錯題本、學習統計（學習回合與益智搶答共用）。
 * 熟練度規則：一次答對 +1、第二次才答對不變、最後仍答錯 −1。
 */
function learnFrom(p: Profile, answers: AnswerRecord[], today: string): Pick<Profile, 'skills' | 'indicators' | 'wrongBook' | 'stats'> {
  const skills = { ...p.skills };
  const indicators = { ...p.indicators };
  const wrongBook = { ...p.wrongBook };
  const stats: LearningStats = { wrongCleared: p.stats?.wrongCleared ?? 0, written: p.stats?.written ?? 0 };
  for (const a of answers) {
    const q = a.question;
    const prev = skills[q.skill] ?? { box: 0, attempts: 0, firstTry: 0, lastSeen: today };
    const delta = a.firstTry ? 1 : a.correct ? 0 : -1;
    skills[q.skill] = {
      box: Math.max(0, Math.min(MAX_BOX, prev.box + delta)),
      attempts: prev.attempts + 1,
      firstTry: prev.firstTry + (a.firstTry ? 1 : 0),
      lastSeen: today,
    };
    for (const code of q.indicators) {
      const key = `${q.subject}:${code}`;
      const s = indicators[key] ?? { attempts: 0, firstTry: 0 };
      indicators[key] = { attempts: s.attempts + 1, firstTry: s.firstTry + (a.firstTry ? 1 : 0) };
    }
    const w = wrongBook[q.id];
    if (!a.firstTry) {
      wrongBook[q.id] = { question: q, wrongCount: (w?.wrongCount ?? 0) + 1, lastWrong: today, streak: 0 };
    } else if (w) {
      const streak = w.streak + 1;
      if (streak >= WRONG_BOOK_CLEAR_STREAK) {
        delete wrongBook[q.id];
        stats.wrongCleared += 1;
      } else {
        wrongBook[q.id] = { ...w, streak };
      }
    }
    // 描寫題完成（最後寫完）才算寫完一個字
    if (q.type === 'write' && a.correct) stats.written += 1;
  }
  return { skills, indicators, wrongBook, stats };
}

/** 記住某個活動這次做過的題目（同一題只留最新一次，最多 RECENT_LIMIT 題），下次出題時優先避開 */
function withRecent(recent: Profile['recent'], key: string, ids: string[]): Profile['recent'] {
  const prev = (recent[key] ?? []).filter((id) => !ids.includes(id));
  return { ...recent, [key]: [...prev, ...ids].slice(-RECENT_LIMIT) };
}

/**
 * 紀錄一回合：金幣、最佳星數、技能熟練度、課綱指標累計、錯題本、歷史。
 */
export function recordSession(save: SaveData, profileId: string, result: SessionResult, now: Date): SaveData {
  const today = dateKey(now);
  return updateProfile(save, profileId, (p) => {
    const learned = learnFrom(p, result.answers, today);
    const record: SessionRecord = {
      activityId: result.activityId,
      subject: result.subject,
      date: today,
      total: result.total,
      correct: result.correct,
      stars: result.stars,
      coins: result.coins,
      seconds: result.seconds,
    };
    const updated: Profile = {
      ...p,
      // 記住這回合的題目，下回合出題時優先避開
      recent: withRecent(
        p.recent,
        result.activityId,
        result.answers.map((a) => a.question.id),
      ),
      coins: p.coins + result.coins,
      bestStars: { ...p.bestStars, [result.activityId]: Math.max(p.bestStars[result.activityId] ?? 0, result.stars) },
      skills: learned.skills,
      indicators: learned.indicators,
      wrongBook: learned.wrongBook,
      history: [...p.history, record].slice(-HISTORY_LIMIT),
      stats: learned.stats,
    };
    // 最後一步才頒發獎章：條件要看這一回合算完之後的存檔（達成的那一回合當下就拿到）
    return awardBadges(updated, today);
  });
}

/**
 * 累計遊玩時間（秒），只保留最近 60 天。
 * puzzle：在益智遊戲館玩的時間，同時加到益智遊戲的每日秒數（也照樣算進整體的遊玩時間）。
 */
export function addPlayTime(save: SaveData, profileId: string, seconds: number, now: Date, puzzle = false): SaveData {
  const key = dateKey(now);
  return updateProfile(save, profileId, (p) => {
    const playLog = { ...p.playLog, [key]: (p.playLog[key] ?? 0) + seconds };
    const keys = Object.keys(playLog).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete playLog[k];
    if (!puzzle) return { ...p, playLog };
    const stats = p.puzzle ?? { days: {}, best: {} };
    const day = stats.days[key] ?? { seconds: 0, coins: 0 };
    return { ...p, playLog, puzzle: { ...stats, days: trimPuzzleDays({ ...stats.days, [key]: { ...day, seconds: day.seconds + seconds } }) } };
  });
}

/** 益智遊戲的一局（星星數由各遊戲的規則算出來） */
export interface PuzzlePlay {
  game: PuzzleGameId;
  /** 1～3 顆星 */
  stars: number;
  /** 益智搶答的作答紀錄（題目都來自一般題庫）；其他遊戲沒有 */
  answers?: AnswerRecord[];
}

/**
 * 紀錄益智遊戲的一局：依星數給金幣（每天的益智金幣有上限）、記最佳星數。
 * 有作答紀錄（益智搶答）時，照學習的規則更新熟練度、課綱統計與錯題本，但不寫歷史紀錄（不算學習回合）。
 * 最後一步照樣頒發獎章：條件都由存檔算出來，本機與伺服器算出的結果相同。
 */
export function recordPuzzle(save: SaveData, profileId: string, play: PuzzlePlay, now: Date): SaveData {
  const today = dateKey(now);
  return updateProfile(save, profileId, (p) => {
    const stats = p.puzzle ?? { days: {}, best: {} };
    const day = stats.days[today] ?? { seconds: 0, coins: 0 };
    let coins = puzzleCoinsFor(play.stars, day.coins);
    let days = trimPuzzleDays({ ...stats.days, [today]: { ...day, coins: day.coins + coins } });
    // 比留下的日期還舊（裝置時鐘調回去、補送很久以前的紀錄）：那天的紀錄留不下來，
    // 給了金幣下一局又會從 0 開始算上限，所以這局不給
    if (!days[today]) {
      coins = 0;
      days = stats.days;
    }
    let updated: Profile = {
      ...p,
      coins: p.coins + coins,
      puzzle: {
        days,
        best: { ...stats.best, [play.game]: Math.max(stats.best[play.game] ?? 0, play.stars) },
      },
    };
    if (play.answers?.length) {
      updated = {
        ...updated,
        ...learnFrom(p, play.answers, today),
        recent: withRecent(
          p.recent,
          `puzzle.${play.game}`,
          play.answers.map((a) => a.question.id),
        ),
      };
    }
    return awardBadges(updated, today);
  });
}

/** 某一天的益智遊戲紀錄（遊玩秒數與拿到的金幣）；沒玩過是 0 */
export function puzzleToday(p: Profile, day: Date): PuzzleDay {
  return p.puzzle?.days[dateKey(day)] ?? { seconds: 0, coins: 0 };
}

/** 指定日期的遊玩秒數 */
export function secondsPlayedOn(p: Profile, day: Date): number {
  return p.playLog[dateKey(day)] ?? 0;
}

/** 購買商店物品；已擁有（含靠獎章擁有）則不重複扣款，金幣不足丟出錯誤 */
export function buyItem(save: SaveData, profileId: string, itemId: string, price: number): SaveData {
  return updateProfile(save, profileId, (p) => {
    if (owns(p, itemId) || p.inventory.includes(itemId)) return p;
    if (p.coins < price) throw new Error('金幣不夠');
    return { ...p, coins: p.coins - price, inventory: [...p.inventory, itemId] };
  });
}

/** 更新角色外觀 */
export function setAvatar(save: SaveData, profileId: string, avatar: AvatarConfig): SaveData {
  return updateProfile(save, profileId, (p) => ({ ...p, avatar: normalizeAvatar(avatar) }));
}

/** 設定某位小朋友的教材版本與學期 */
export function setCurriculum(save: SaveData, profileId: string, curriculum: CurriculumChoice): SaveData {
  return updateProfile(save, profileId, (p) => ({ ...p, curriculum: { ...curriculum } }));
}

/**
 * 設定顯示的稱號：只能選已得到、而且有稱號的獎章；null 表示不顯示。不符合時丟出錯誤。
 */
export function setTitle(save: SaveData, profileId: string, badgeId: string | null): SaveData {
  return updateProfile(save, profileId, (p) => {
    if (badgeId !== null && (!p.badges?.[badgeId] || !badgeById(badgeId)?.title)) throw new Error('還沒有這個稱號');
    return { ...p, title: badgeId };
  });
}

/** 刪除角色 */
export function removeProfile(save: SaveData, profileId: string): SaveData {
  const profiles = save.profiles.filter((p) => p.id !== profileId);
  const activeProfileId = save.activeProfileId === profileId ? (profiles[0]?.id ?? null) : save.activeProfileId;
  return { ...save, profiles, activeProfileId };
}

/** PIN 的雜湊（只是擋住孩子誤入家長區，不是資安防護） */
const pinHashOf = (pin: string): string => `v1:${hashString(`learning-island:${pin}`).toString(16)}`;

/** 設定家長 PIN（4 位數字） */
export function setPin(save: SaveData, pin: string): SaveData {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN 必須是 4 位數字');
  return { ...save, parent: { pinHash: pinHashOf(pin) } };
}

/** 驗證家長 PIN */
export function verifyPin(save: SaveData, pin: string): boolean {
  return save.parent.pinHash !== null && save.parent.pinHash === pinHashOf(pin);
}

// ---------- 載入驗證 ----------

const int = z.number().int();
/** 錯題本裡的題目只檢查基本欄位，避免日後新增題型時舊存檔整份讀不進來 */
export const storedQuestion = z.looseObject({ id: z.string(), type: z.string(), prompt: z.string(), skill: z.string(), indicators: z.array(z.string()) });
/** 一位小朋友的資料格式（伺服器驗證上傳的進度也用這份） */
export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.object({
    animal: z.enum(ANIMAL_IDS),
    color: z.string(),
    hat: z.string().nullable(),
    // 2026-10 新增：可省略
    face: z.string().nullable().optional(),
    back: z.string().nullable().optional(),
    hand: z.string().nullable().optional(),
    pet: z.string().nullable().optional(),
    trail: z.string().nullable().optional(),
  }),
  createdAt: z.string(),
  coins: int.min(0),
  bestStars: z.record(z.string(), int.min(0).max(3)),
  skills: z.record(z.string(), z.object({ box: int.min(0).max(MAX_BOX), attempts: int.min(0), firstTry: int.min(0), lastSeen: z.string() })),
  indicators: z.record(z.string(), z.object({ attempts: int.min(0), firstTry: int.min(0) })),
  wrongBook: z.record(z.string(), z.object({ question: storedQuestion, wrongCount: int.min(0), lastWrong: z.string(), streak: int.min(0) })),
  history: z.array(
    z.object({ activityId: z.string(), subject: subjectSchema, date: z.string(), total: int, correct: int, stars: int, coins: int, seconds: z.number() }),
  ),
  playLog: z.record(z.string(), z.number()),
  inventory: z.array(z.string()),
  recent: z.record(z.string(), z.array(z.string())),
  curriculum: z.object({ zh: z.string(), math: z.string(), term: z.enum(['上', '下', 'auto']) }),
  // 2026-10 新增：可省略，舊存檔不必升級版本
  // 2026-10 A2：班級可以沒有（家長名下的雲端角色）；舊版前端讀不了沒有班級的雲端角色，所以 A2～A4 只在 A5 一起上線
  cloud: z.object({ server: z.string(), room: z.string().optional(), roomName: z.string().optional(), accountId: z.string() }).optional(),
  stats: z.object({ wrongCleared: int.min(0), written: int.min(0) }).optional(),
  badges: z.record(z.string(), z.string()).optional(),
  title: z.string().nullable().optional(),
  stickers: z.record(z.string(), int.min(0)).optional(),
  giftLog: z.array(z.object({ from: z.string(), itemId: z.string(), date: z.string() })).optional(),
  puzzle: z
    .object({
      days: z.record(z.string(), z.object({ seconds: z.number().min(0), coins: int.min(0) })),
      best: z.record(z.string(), int.min(0).max(3)),
    })
    .optional(),
});
const saveSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  profiles: z.array(profileSchema),
  activeProfileId: z.string().nullable(),
  parent: z.object({ pinHash: z.string().nullable() }),
  settings: z.object({
    zhuyin: z.boolean(),
    voice: z.boolean(),
    voiceRate: z.number().min(0.5).max(1.5),
    // 2026-10 新增：舊存檔沒有這個欄位時補成開啟，不必升級存檔版本
    voiceClips: z.boolean().default(true),
    sfx: z.boolean(),
    music: z.boolean(),
    dailyLimitMin: int.min(0).max(240),
    // 2026-10 新增：舊存檔沒有這個欄位時補成預設值
    puzzleLimitMin: int.min(0).max(240).default(DEFAULT_PUZZLE_LIMIT_MIN),
    quality: z.enum(['auto', 'low', 'high']),
  }),
});

/** 驗證一位小朋友的資料（伺服器收上傳的進度用）；格式不符回傳 null。錯題本的題目只做寬鬆檢查 */
export function parseProfile(raw: unknown): Profile | null {
  const r = profileSchema.safeParse(raw);
  return r.success ? (r.data as unknown as Profile) : null;
}

/**
 * 舊版存檔升級到目前版本（逐版升級，每一步只補新欄位，不刪除舊資料）。
 * v1 → v2：每位小朋友補上 recent（空）與 curriculum（預設版本）。
 */
export function migrateSave(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as { schemaVersion?: number; profiles?: Record<string, unknown>[] };
  if (d.schemaVersion === 1 && Array.isArray(d.profiles)) {
    return {
      ...d,
      schemaVersion: 2,
      profiles: d.profiles.map((p) => ({ recent: {}, curriculum: { ...DEFAULT_CURRICULUM }, ...p })),
    };
  }
  return data;
}

/**
 * 從 JSON 字串載入存檔；舊版會先升級。格式不符或壞掉時回傳新存檔（呼叫端負責先備份原始字串）。
 */
export function loadSave(raw: string | null): SaveData {
  if (!raw) return createEmptySave();
  let data: unknown;
  try {
    data = migrateSave(JSON.parse(raw));
  } catch {
    return createEmptySave();
  }
  const r = saveSchema.safeParse(data);
  // 錯題本的題目只做寬鬆檢查，型別上視為 Question（顯示時再依題型處理）
  return r.success ? (r.data as unknown as SaveData) : createEmptySave();
}

/** 判斷原始字串是否為可讀的存檔（給備份與匯入用） */
export function isValidSave(raw: string): boolean {
  try {
    return saveSchema.safeParse(migrateSave(JSON.parse(raw))).success;
  } catch {
    return false;
  }
}
