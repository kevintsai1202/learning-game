/**
 * 核心資料型別：科目、題目、活動、作答結果。
 * 這個檔案不依賴 React 與 three，出題器、判題、存檔都只用這裡的型別，方便單元測試。
 */

/** 科目代碼：國語、數學、英語、生活與健康 */
export type SubjectId = 'zh' | 'math' | 'en' | 'life';

/** 朗讀語言 */
export type SpeakLang = 'zh-TW' | 'en-US';

/** 題目附圖：由答題介面依 kind 畫出對應的圖（SVG 或 3D 舞台） */
export type Visual =
  /** 一組 emoji，例如 🍎×3；groups 表示分成幾組（乘法情境） */
  | { kind: 'emoji'; emoji: string; count: number; groups?: number }
  /** 時鐘：顯示指定時刻 */
  | { kind: 'clock'; hour: number; minute: number }
  /** 直式算式 */
  | { kind: 'vertical'; a: number; b: number; op: '+' | '-' | '×' }
  /** 一把錢：面額陣列，例如 [100, 50, 10, 10, 1] */
  | { kind: 'money'; items: number[] }
  /** 尺上量長度：物品從 start 公分量到 end 公分 */
  | { kind: 'ruler'; start: number; end: number; item: string }
  /** 單位分數：一個圖形平分成 parts 份、塗色 shaded 份 */
  | { kind: 'fraction'; parts: number; shaded: number; shape: 'pizza' | 'bar' }
  /** 幾何形體或平面圖形 */
  | { kind: 'shape'; shape: ShapeId }
  /** 大字（例如要辨認的國字、注音或字母） */
  | { kind: 'bigtext'; text: string; lang?: SpeakLang }
  /** 統計表：類別與數量（以 emoji 圖示呈現） */
  | { kind: 'chart'; rows: { label: string; emoji: string; count: number }[] }
  /** 月曆：某年某月，標出指定日期 */
  | { kind: 'calendar'; year: number; month: number; highlight?: number }
  /** 3D 分類遊戲：一件物品（emoji 與名稱）要丟進選項代表的桶子；選項依序為各個桶子 */
  | { kind: 'bins'; item: string; name: string }
  /** 閱讀短文（閱讀測驗）：標題可省略 */
  | { kind: 'passage'; title?: string; text: string };

/** 平面圖形與立體形體 */
export type ShapeId =
  | 'triangle'
  | 'square'
  | 'rectangle'
  | 'circle'
  | 'cube'
  | 'cuboid'
  | 'cylinder'
  | 'cone'
  | 'sphere';

/** 選項：文字、emoji、圖形至少一個 */
export interface ChoiceOption {
  text?: string;
  emoji?: string;
  /** 以圖形當選項（畫成 SVG） */
  shape?: ShapeId;
  /** 朗讀用文字（省略時朗讀 text） */
  speak?: string;
  speakLang?: SpeakLang;
}

/** 所有題型共同欄位 */
interface QuestionBase {
  /** 題目唯一碼；出題器產生的題目由「技能 id + 題目內容」組成，同一題會得到同一個 id */
  id: string;
  subject: SubjectId;
  /** 細項技能 id，例如 math.add3；熟練度與錯題都以它歸類 */
  skill: string;
  /** 對應的 108 課綱代碼，例如 ['N-2-2'] */
  indicators: readonly string[];
  /** 題目文字 */
  prompt: string;
  /** 朗讀文字（省略時朗讀 prompt） */
  speak?: string;
  speakLang?: SpeakLang;
  /** 答錯後給的提示或解說 */
  explain?: string;
  /** 難度 1～3 */
  difficulty?: 1 | 2 | 3;
  /** 題目依據或出處說明（自編題寫「依課綱自編」） */
  source?: string;
  visual?: Visual;
}

/** 單選題（是非題也用它，選項為「對／錯」） */
export interface ChoiceQuestion extends QuestionBase {
  type: 'choice';
  options: ChoiceOption[];
  /** 正確選項的索引 */
  answer: number;
}

/** 數字作答（數字鍵盤） */
export interface NumberQuestion extends QuestionBase {
  type: 'number';
  answer: number;
  /** 答案單位，例如「公分」「元」 */
  unit?: string;
}

/** 排順序：把 tokens 排成 answer 的順序 */
export interface OrderQuestion extends QuestionBase {
  type: 'order';
  /** 畫面上打散顯示的詞卡 */
  tokens: string[];
  /** 正確順序 */
  answer: string[];
}

/** 撥時鐘：把指針撥到指定時刻 */
export interface ClockQuestion extends QuestionBase {
  type: 'clock';
  hour: number;
  minute: number;
  /** 分針一格幾分鐘（5 代表每次撥 5 分鐘） */
  step: number;
}

/** 付錢：用可用面額湊出指定金額 */
export interface MoneyQuestion extends QuestionBase {
  type: 'money';
  amount: number;
  /** 可以使用的面額 */
  denominations: number[];
}

/** 描寫：照筆順寫出國字、注音或字母 */
export interface WriteQuestion extends QuestionBase {
  type: 'write';
  target: string;
  script: 'hanzi' | 'zhuyin' | 'latin';
}

export type Question =
  | ChoiceQuestion
  | NumberQuestion
  | OrderQuestion
  | ClockQuestion
  | MoneyQuestion
  | WriteQuestion;

export type QuestionType = Question['type'];

/** 作答內容，依題型不同 */
export type Response =
  | { type: 'choice'; index: number }
  | { type: 'number'; value: number }
  | { type: 'order'; tokens: string[] }
  | { type: 'clock'; hour: number; minute: number }
  | { type: 'money'; items: number[] }
  /** 描寫題由筆順元件判定，mistakes 為寫錯的筆畫次數 */
  | { type: 'write'; completed: boolean; mistakes: number };

/** 出題器參數 */
export interface GenerateOptions {
  /** 亂數種子；相同種子產生相同題目 */
  seed: number;
  /** 題數 */
  count: number;
  /** 難度 1～3 */
  level: 1 | 2 | 3;
  /** 題目空間不夠時可以少於 count 題（組題目池時用），不要丟出錯誤 */
  allowFewer?: boolean;
  /** 數值上限（課本單元的範圍，例如二上只學到 200）；省略為一千以內 */
  maxNumber?: number;
}

/** 出題器：給定參數產生一組題目（純函式） */
export type QuestionGenerator = (opts: GenerateOptions) => Question[];

/** 一回合的結果 */
export interface SessionResult {
  activityId: string;
  subject: SubjectId;
  total: number;
  correct: number;
  /** 0～3 顆星 */
  stars: number;
  /** 本回合獲得的金幣 */
  coins: number;
  /** 用時（秒） */
  seconds: number;
  /** 每題的作答紀錄 */
  answers: AnswerRecord[];
}

/** 單題作答紀錄 */
export interface AnswerRecord {
  question: Question;
  correct: boolean;
  /** 第一次作答就答對 */
  firstTry: boolean;
}
