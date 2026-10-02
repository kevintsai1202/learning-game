/**
 * 題目要唸的文字（遊戲與預錄語音盤點腳本共用）：
 * 題目、選項、公布答案時唸什麼、用哪個語言，必須和畫面上實際呼叫 speak 的內容一致，預錄語音的對照表才找得到。
 */
import { describe, expect, it } from 'vitest';
import type { Question } from '../../src/core/types';
import { answerLine, answerText, optionSpeech, questionSpeech } from '../../src/quiz/spoken';

const choice = (extra: Partial<Question> & Record<string, unknown>): Question =>
  ({
    id: 'q1',
    subject: 'life',
    skill: 'life.traffic',
    indicators: [],
    prompt: '坐在汽車上，要記得做什麼？',
    type: 'choice',
    options: [
      { text: '繫好安全帶', emoji: '🚗' },
      { text: '把頭伸出窗外', emoji: '🤪', speak: '把頭伸出去' },
    ],
    answer: 0,
    ...extra,
  }) as Question;

describe('questionSpeech', () => {
  it('沒有 speak 時唸題目文字；中文科目用 zh-TW', () => {
    expect(questionSpeech(choice({}))).toEqual({ text: '坐在汽車上，要記得做什麼？', lang: 'zh-TW' });
  });

  it('有 speak 時唸 speak', () => {
    expect(questionSpeech(choice({ speak: '要記得做什麼？' })).text).toBe('要記得做什麼？');
  });

  it('英語科目預設用 en-US，題目可以自己指定語言', () => {
    expect(questionSpeech(choice({ subject: 'en' })).lang).toBe('en-US');
    expect(questionSpeech(choice({ subject: 'en', speakLang: 'zh-TW' })).lang).toBe('zh-TW');
  });
});

describe('optionSpeech', () => {
  it('選項有 speak 時唸 speak，否則唸 text', () => {
    const q = choice({});
    if (q.type !== 'choice') throw new Error('測試題目應為選擇題');
    expect(optionSpeech(q, q.options[0])).toEqual({ text: '繫好安全帶', lang: 'zh-TW' });
    expect(optionSpeech(q, q.options[1]).text).toBe('把頭伸出去');
  });

  it('選項語言依序取選項、題目，最後是 zh-TW（不看科目）', () => {
    const q = choice({ subject: 'en', speakLang: 'en-US' });
    if (q.type !== 'choice') throw new Error('測試題目應為選擇題');
    expect(optionSpeech(q, q.options[0]).lang).toBe('en-US');
    expect(optionSpeech(q, { text: 'cat', speakLang: 'en-US' }).lang).toBe('en-US');
    const q2 = choice({ subject: 'en' });
    if (q2.type !== 'choice') throw new Error('測試題目應為選擇題');
    expect(optionSpeech(q2, q2.options[0]).lang).toBe('zh-TW');
  });
});

describe('answerText／answerLine', () => {
  it('選擇題：畫面顯示 emoji 加文字；公布答案的朗讀只唸文字、用 zh-TW', () => {
    expect(answerText(choice({}))).toBe('🚗 繫好安全帶');
    expect(answerLine(choice({}))).toEqual({ text: '正確答案是：繫好安全帶', lang: 'zh-TW' });
  });

  it('選項只有 emoji 時，朗讀才唸 emoji（例如數字鍵帽，交給 cleanForSpeech 轉成數字）', () => {
    const q = choice({ options: [{ emoji: '1️⃣' }, { emoji: '2️⃣' }], answer: 0 });
    expect(answerLine(q).text).toBe('正確答案是：1️⃣');
    const q2 = choice({ options: [{ emoji: '5️⃣', text: '五' }, { emoji: '6️⃣', text: '六' }], answer: 0 });
    expect(answerLine(q2).text).toBe('正確答案是：五');
  });

  it('數字題帶單位；排序題英語用空白連接、中文直接連接', () => {
    const num = { id: 'n', subject: 'math', skill: 'm', indicators: [], prompt: 'p', type: 'number', answer: 35, unit: '公分' } as unknown as Question;
    expect(answerText(num)).toBe('35 公分');
    const orderEn = { id: 'o', subject: 'en', skill: 'e', indicators: [], prompt: 'p', type: 'order', tokens: ['I', 'am', 'fine'], answer: ['I', 'am', 'fine'] } as unknown as Question;
    expect(answerText(orderEn)).toBe('I am fine');
  });
});
