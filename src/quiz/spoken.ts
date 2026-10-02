/**
 * 題目要唸的文字與語言：答題畫面（QuizRunner、選項的 🔊）和預錄語音的盤點腳本（scripts/voice/collect.test.ts）共用這裡，
 * 兩邊算出來的文字一定相同，預錄語音的對照表才查得到。改這裡的規則後，要重跑盤點與產生語音檔。
 */
import type { ChoiceOption, Question, SpeakLang } from '../core/types';
import { correctResponse } from '../engine/check';

/** 一段要朗讀的文字 */
export interface Spoken {
  text: string;
  lang: SpeakLang;
}

/** 題目出現時朗讀的內容：有 speak 唸 speak，否則唸題目；英語科目預設用英文語音 */
export function questionSpeech(q: Question): Spoken {
  return { text: q.speak ?? q.prompt, lang: q.speakLang ?? (q.subject === 'en' ? 'en-US' : 'zh-TW') };
}

/** 按選項旁的 🔊 時朗讀的內容；語言依序取選項、題目，最後是 zh-TW */
export function optionSpeech(q: Question, o: ChoiceOption): Spoken {
  return { text: o.speak ?? o.text ?? '', lang: o.speakLang ?? q.speakLang ?? 'zh-TW' };
}

/** 把標準答案轉成文字（公布答案時顯示與朗讀） */
export function answerText(q: Question): string {
  const r = correctResponse(q);
  switch (r.type) {
    case 'choice': {
      const o = q.type === 'choice' ? q.options[r.index] : undefined;
      return [o?.emoji, o?.text].filter(Boolean).join(' ');
    }
    case 'number':
      return `${r.value}${q.type === 'number' && q.unit ? ` ${q.unit}` : ''}`;
    case 'order':
      return r.tokens.join(q.subject === 'en' ? ' ' : '');
    case 'clock':
      return r.minute === 0 ? `${r.hour} 點` : `${r.hour} 點 ${r.minute} 分`;
    case 'money':
      return `${r.items.join(' + ')} 元`;
    case 'write':
      return q.type === 'write' ? q.target : '';
  }
}

/**
 * 答錯兩次、公布答案時朗讀的句子。選擇題唸的和按選項 🔊 一樣：有朗讀文字唸朗讀文字（例如字首音題選項顯示「Ee」、唸「E」），
 * 否則唸文字（emoji 是給眼睛看的，例如「5️⃣ 五」唸「五」），只有 emoji 時才唸 emoji（數字鍵帽由 cleanForSpeech 轉成數字）；
 * 其他題型和畫面顯示的答案相同。
 */
export function answerLine(q: Question): Spoken {
  const o = q.type === 'choice' ? q.options[q.answer] : undefined;
  const said = o ? (o.speak ?? o.text ?? o.emoji ?? '') : answerText(q);
  return { text: `正確答案是：${said}`, lang: 'zh-TW' };
}
