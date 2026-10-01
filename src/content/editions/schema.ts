/**
 * 教材版本（康軒、南一、翰林…）的資料格式：每一冊的課次／單元、對應的出題技能或生字。
 * 內建版本放在 src/content/editions/<科目>/<出版社>.json；其他版本或修正由家長以「版本包」匯入。
 *
 * 版權原則：只收「單元名稱、課名、每課生字、語詞」這類事實資料（整理自學校公告的課程計畫等公開資料），
 * 不收課文、習作或考卷內容；題目一律由出題器依這些資料自編。
 */
import { z } from 'zod';

/** 資料可信度：verified 兩個以上來源一致；single-source 只有一個來源；missing 查不到（課名仍保留） */
export const confidenceSchema = z.enum(['verified', 'single-source', 'missing']);

/** 資料來源 */
export const editionSourceSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.url(),
  /** 來源標示的學年度，例如「114」 */
  schoolYear: z.string().max(10).optional(),
});

/** 一課（國語）或一個單元（數學） */
export const editionUnitSchema = z.object({
  /** 第幾課／第幾單元（同一冊內從 1 開始） */
  no: z.number().int().min(1).max(30),
  /** 課名或單元名稱 */
  title: z.string().min(1).max(40),
  /** 國語：本課生字（寫字字），每個元素一個字 */
  chars: z.array(z.string().length(1)).max(30).optional(),
  /** 國語：本課認讀字（只認不寫），可省略 */
  readChars: z.array(z.string().length(1)).max(30).optional(),
  /** 國語：本課語詞，可省略 */
  words: z.array(z.string().min(1).max(8)).max(40).optional(),
  /** 數學：對應的出題技能 id（例如 math.add），依練習重要性排序 */
  skills: z.array(z.string().regex(/^math\.[a-z-]+$/)).max(8).optional(),
  /** 數學：這個單元的數值上限（例如二上「200 以內的數」為 200） */
  maxNumber: z.number().int().min(20).max(1000).optional(),
  /** 數學：這個單元的難度上限（1～3），例如二上的加減只到 2 */
  maxLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  /** 生字或單元內容的可信度 */
  confidence: confidenceSchema,
  /** 這一課資料的來源（可多個） */
  sources: z.array(editionSourceSchema).max(6),
  note: z.string().max(200).optional(),
});

/** 一冊（上學期或下學期） */
export const editionVolumeSchema = z.object({
  term: z.enum(['上', '下']),
  /** 資料整理所依據的學年度，例如「114」（各課可能不同時以課為準） */
  schoolYear: z.string().max(10),
  units: z.array(editionUnitSchema).min(1).max(30),
});

/** 一個教材版本（某出版社某科目二年級） */
export const editionSchema = z.object({
  format: z.literal('learning-island-edition'),
  version: z.literal(1),
  /** 版本 id，例如 kanghsuan-zh、nani-math（匯入的版本自訂） */
  id: z.string().regex(/^[a-z0-9-]+$/).max(40),
  subject: z.enum(['zh', 'math']),
  /** 出版社或版本名稱，例如「康軒」 */
  publisher: z.string().min(1).max(20),
  grade: z.literal(2),
  volumes: z.array(editionVolumeSchema).min(1).max(2),
  note: z.string().max(300).optional(),
});

export type Edition = z.infer<typeof editionSchema>;
export type EditionUnit = z.infer<typeof editionUnitSchema>;
export type EditionVolume = z.infer<typeof editionVolumeSchema>;
