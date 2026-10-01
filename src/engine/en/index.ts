/**
 * 英語技能清單：每個技能對應一個出題器與課綱代碼。
 * 活動（遊戲關卡）從這裡挑技能出題（見 src/activities/en.ts）。
 * 範圍原則：二年級沒有國定英語課，範圍以臺北市低年段 58 字＋29 句生活用語＋6 組句型、
 * 新北市 26 組字母代表字＋10 句教室用語為主；不要求拼寫，書寫只做字母描寫（臨摹）。
 */
import type { QuestionGenerator } from '../../core/types';
import type { WordTopic } from '../../content/en/words';
import { CASE_CODES, LISTEN_CODES, WRITE_CODES, genCaseMatch, genLetterListen, genLetterWrite } from './letters';
import { PHONICS_CODES, genPhonics } from './phonics';
import { WORD_CODES, WORD_HEAR_CODES, WORD_READ_CODES, makeWordGenerator } from './words';
import { PATTERN_CODES, PHRASE_CODES, genPatterns, genPhrases } from './phrases';

/** 英語技能 */
export interface EnSkill {
  id: string;
  title: string;
  icon: string;
  /** 選單分組標題 */
  group: string;
  /** 一句話說明 */
  description: string;
  /** 課綱代碼（技能層級；個別題目可能只用其中幾個） */
  indicators: string[];
  /** 每回合題數 */
  count: number;
  /** 是否讓孩子選難度 */
  levels: boolean;
  generate: QuestionGenerator;
}

/** 主題單字活動：id、名稱、圖示、包含的主題 */
const WORD_THEMES: { id: string; title: string; icon: string; topics: WordTopic[]; sort: boolean; description: string }[] = [
  { id: 'en.words-num', title: '數字', icon: '🔢', topics: ['num'], sort: true, description: '聽數字、看數字，認識 one、two、three…' },
  { id: 'en.words-color', title: '顏色', icon: '🎨', topics: ['color'], sort: true, description: 'red、blue、yellow…認識各種顏色' },
  { id: 'en.words-animal', title: '動物', icon: '🐶', topics: ['animal'], sort: true, description: 'cat、dog、bird…認識動物朋友' },
  { id: 'en.words-food', title: '水果與食物', icon: '🍎', topics: ['fruit', 'food'], sort: true, description: 'apple、banana、milk…認識水果與食物' },
  { id: 'en.words-family', title: '家人與人物', icon: '👨‍👩‍👧', topics: ['family', 'people'], sort: true, description: 'mom、dad、teacher、friend…認識身邊的人' },
  { id: 'en.words-body', title: '身體部位', icon: '👃', topics: ['body'], sort: true, description: 'nose、eye、ear、hand…認識身體' },
  { id: 'en.words-school', title: '文具與學校用品', icon: '✏️', topics: ['school'], sort: false, description: 'book、bag、pencil、ruler…認識文具' },
];

export const EN_SKILLS: EnSkill[] = [
  { id: 'en.letter-write', title: '字母描寫', icon: '✍️', group: '字母', description: '照筆順描出大寫、小寫字母', indicators: WRITE_CODES, count: 6, levels: true, generate: genLetterWrite },
  { id: 'en.case-match', title: '大小寫配對', icon: '🔠', group: '字母', description: '大寫和小寫，找出一對', indicators: CASE_CODES, count: 10, levels: true, generate: genCaseMatch },
  { id: 'en.letter-listen', title: '聽字母', icon: '🎧', group: '字母', description: '聽字母名稱，再選出字母', indicators: LISTEN_CODES, count: 10, levels: true, generate: genLetterListen },
  { id: 'en.phonics', title: '字母開頭音', icon: '🔊', group: '字母', description: '單字從哪個字母開頭？', indicators: PHONICS_CODES, count: 10, levels: true, generate: genPhonics },
  { id: 'en.word-cards', title: '單字圖卡', icon: '🃏', group: '單字', description: '聽單字選圖、看圖選字，各種主題一起考', indicators: WORD_CODES, count: 10, levels: true, generate: makeWordGenerator('en.word-cards') },
  ...WORD_THEMES.map((t) => ({
    id: t.id,
    title: t.title,
    icon: t.icon,
    group: '單字',
    description: t.description,
    indicators: t.sort ? WORD_CODES : [...new Set([...WORD_HEAR_CODES, ...WORD_READ_CODES])],
    count: 10,
    levels: true,
    generate: makeWordGenerator(t.id, t.topics),
  })),
  { id: 'en.phrases', title: '生活與教室用語', icon: '💬', group: '用語與句型', description: 'Hello、Sit down…什麼時候說哪一句', indicators: PHRASE_CODES, count: 10, levels: true, generate: genPhrases },
  { id: 'en.patterns', title: '句型：What\'s this?', icon: '🗨️', group: '用語與句型', description: "What's this? It's a ___. 看圖回答", indicators: PATTERN_CODES, count: 10, levels: true, generate: genPatterns },
];
