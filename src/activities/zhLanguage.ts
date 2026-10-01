/**
 * 國語屋的「注音拼讀、語詞、句子與閱讀」活動：9 個活動，每回合 10 題，皆可選難度。
 * 注音生字、筆順、部首、造詞另有模組。
 */
import { ZH_LANG_IDS, makeAntonym, makeCloze, makeHomophone, makeMeasure, makePunct, makeReading, makeSentenceOrder, makeTone, makeZhuyin } from '../engine/zh/language';
import type { ActivityDef } from './types';

/** 簡寫：國語屋、國語科、每回合 10 題、可選難度 */
const act = (def: Pick<ActivityDef, 'id' | 'title' | 'icon' | 'group' | 'indicators' | 'description' | 'make'>): ActivityDef => ({
  ...def,
  zone: 'zh',
  subject: 'zh',
  count: 10,
  levels: true,
});

export const ZH_LANGUAGE_ACTIVITIES: ActivityDef[] = [
  act({
    id: ZH_LANG_IDS.zhuyin,
    title: '注音拼讀',
    icon: '🔤',
    group: '注音拼讀',
    indicators: ['Aa-Ⅰ-3', 'Aa-Ⅰ-4', '3-Ⅰ-2'],
    description: '看注音找字或圖，看字找注音',
    make: makeZhuyin,
  }),
  act({
    id: ZH_LANG_IDS.tone,
    title: '聲調',
    icon: '🎼',
    group: '注音拼讀',
    indicators: ['Aa-Ⅰ-2', '3-Ⅰ-1'],
    description: '一聲、二聲、三聲、四聲和輕聲',
    make: makeTone,
  }),
  act({
    id: ZH_LANG_IDS.measure,
    title: '量詞',
    icon: '📏',
    group: '語詞',
    indicators: ['Ab-Ⅰ-6', 'Ac-Ⅰ-2'],
    description: '一（　）書，要用哪一個量詞？',
    make: makeMeasure,
  }),
  act({
    id: ZH_LANG_IDS.antonym,
    title: '相反詞',
    icon: '↔️',
    group: '語詞',
    indicators: ['Ab-Ⅰ-5', 'Ab-Ⅰ-6'],
    description: '找出意思相反的詞',
    make: makeAntonym,
  }),
  act({
    id: ZH_LANG_IDS.homophone,
    title: '同音字與形近字',
    icon: '🔍',
    group: '語詞',
    indicators: ['Ab-Ⅰ-1', '4-Ⅰ-1', '6-Ⅰ-5'],
    description: '選對的字，或找出句子裡的錯字',
    make: makeHomophone,
  }),
  act({
    id: ZH_LANG_IDS.cloze,
    title: '選詞填空',
    icon: '🧩',
    group: '語詞',
    indicators: ['Ab-Ⅰ-5', 'Ab-Ⅰ-6', 'Ac-Ⅰ-2', 'Ac-Ⅰ-3'],
    description: '近義詞、疊詞、關聯詞',
    make: makeCloze,
  }),
  act({
    id: ZH_LANG_IDS.order,
    title: '句子排序',
    icon: '🧱',
    group: '句子與閱讀',
    indicators: ['Ac-Ⅰ-2', '6-Ⅰ-3'],
    description: '把詞卡排成通順的句子',
    make: makeSentenceOrder,
  }),
  act({
    id: ZH_LANG_IDS.punct,
    title: '標點符號',
    icon: '❓',
    group: '句子與閱讀',
    indicators: ['Ac-Ⅰ-1', '5-Ⅰ-2', '6-Ⅰ-1'],
    description: '逗號、句號、問號、驚嘆號和引號',
    make: makePunct,
  }),
  act({
    id: ZH_LANG_IDS.reading,
    title: '閱讀小短文',
    icon: '📖',
    group: '句子與閱讀',
    indicators: ['5-Ⅰ-3', '5-Ⅰ-4', '5-Ⅰ-7', 'Ad-Ⅰ-2', 'Ad-Ⅰ-3', 'Bb-Ⅰ-1'],
    description: '讀一讀短文，回答問題',
    make: makeReading,
  }),
];
