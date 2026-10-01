/**
 * 國語屋的「生字與筆順」活動：生字描寫、注音符號描寫、認字讀音、部首、筆畫數、造詞。
 * 不跟課本時從整個字集（三版本二年級生字的聯集）出題；筆順一律是台灣教育部標準，
 * 沒有驗證過筆順的字（writable: false）不出描寫題與筆畫數題，其餘題型照出。
 * 匯入出題模組同時會註冊「課本單元出題器」，課本單元活動才出得了題。
 */
import { ZH_CHARS_IDS, makeCharRadical, makeCharRead, makeCharStrokes, makeCharWords, makeCharWrite, makeZhuyinWrite } from '../engine/zh/chars';
import type { ActivityDef } from './types';

/** 簡寫：國語屋、國語科、「生字與筆順」分組 */
const act = (def: Pick<ActivityDef, 'id' | 'title' | 'icon' | 'indicators' | 'description' | 'make'> & Partial<Pick<ActivityDef, 'count' | 'arcade'>>): ActivityDef => ({
  count: 10,
  ...def,
  zone: 'zh',
  subject: 'zh',
  group: '生字與筆順',
  levels: true,
});

export const ZH_CHARS_ACTIVITIES: ActivityDef[] = [
  act({
    id: ZH_CHARS_IDS.write,
    title: '生字描寫',
    icon: '✍️',
    // 課綱提醒寫字「質重於量」：描寫活動每回合 5 題
    count: 5,
    indicators: ['4-Ⅰ-5', 'Ab-Ⅰ-3'],
    description: '照著台灣教育部筆順，一筆一畫寫國字',
    make: (o) => makeCharWrite(o),
  }),
  act({
    id: ZH_CHARS_IDS.zhuyinWrite,
    title: '注音符號描寫',
    icon: '🔡',
    count: 5,
    indicators: ['3-Ⅰ-1', 'Aa-Ⅰ-1'],
    description: '37 個注音符號，照筆順寫一寫',
    make: makeZhuyinWrite,
  }),
  act({
    id: ZH_CHARS_IDS.read,
    title: '認字讀音',
    icon: '👀',
    arcade: true,
    indicators: ['4-Ⅰ-1', 'Ab-Ⅰ-1', '3-Ⅰ-2'],
    description: '看字選注音，看注音選字',
    make: (o) => makeCharRead(o),
  }),
  act({
    id: ZH_CHARS_IDS.radical,
    title: '部首',
    icon: '🧩',
    arcade: true,
    indicators: ['4-Ⅰ-2', 'Ab-Ⅰ-4'],
    description: '「河」的部首是什麼？哪兩個字部首相同？',
    make: (o) => makeCharRadical(o),
  }),
  act({
    id: ZH_CHARS_IDS.strokes,
    title: '筆畫數',
    icon: '🔢',
    arcade: true,
    indicators: ['4-Ⅰ-5', 'Ab-Ⅰ-3'],
    description: '「山」有幾畫？哪一個字的筆畫比較多？',
    make: (o) => makeCharStrokes(o),
  }),
  act({
    id: ZH_CHARS_IDS.words,
    title: '造詞',
    icon: '🧱',
    arcade: true,
    indicators: ['Ab-Ⅰ-2', 'Ab-Ⅰ-6'],
    description: '選出有這個字的語詞，或把缺的字補回語詞',
    make: (o) => makeCharWords(o),
  }),
];
