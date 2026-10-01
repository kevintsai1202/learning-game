/**
 * 活動（遊戲關卡）定義：每個活動屬於島上一棟建築，用出題器或題庫產生一回合的題目。
 */
import type { GenerateOptions, Question, SubjectId } from '../core/types';
import type { ZoneId } from '../store/useUi';

export interface ActivityDef {
  /** 活動 id，例如 math.add */
  id: string;
  zone: ZoneId;
  /** 科目（挑戰塔的段考模擬歸在出題的那一科） */
  subject: SubjectId;
  title: string;
  icon: string;
  /** 選單上的分組標題，例如「數與計算」 */
  group: string;
  /** 對應課綱代碼 */
  indicators: string[];
  /** 每回合題數 */
  count: number;
  /** 是否讓孩子選難度（固定題庫的活動通常不分難度） */
  levels: boolean;
  /** 產生一回合題目 */
  make: (opts: GenerateOptions) => Question[];
  /** 一句話說明 */
  description?: string;
  /** 段考模擬：結算時以 100 分制顯示 */
  exam?: boolean;
  /** 可以用「氣球射擊」玩（題目多為數字或單選題） */
  arcade?: boolean;
  /** 暫時不能玩的原因（例如生字資料待補）；有值時選單顯示為停用 */
  disabledReason?: string;
}
