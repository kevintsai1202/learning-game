/**
 * 挑選朗讀聲音的純函式：自然語音優先、台灣國語優先於其他中文、離線時只用本機聲音。
 * 測試資料取自各平台實際的聲音名稱（Edge、Chrome、Apple、Android）。
 */
import { describe, expect, it } from 'vitest';
import {
  isBasicVoice,
  isFallbackError,
  normLang,
  orderVoices,
  pickVoice,
  splitSentences,
  voiceTag,
  type VoiceLike,
} from '../../src/audio/voices';

/** 建一個假的聲音；voiceURI 省略時與 name 相同 */
const v = (name: string, lang: string, localService: boolean, voiceURI = name): VoiceLike => ({ name, lang, localService, voiceURI });

// Windows 上的 Edge：線上自然語音（需連網）＋舊版桌面語音
const HSIAOCHEN = v('Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)', 'zh-TW', false);
const YUNJHE = v('Microsoft YunJhe Online (Natural) - Chinese (Taiwan)', 'zh-TW', false);
const HANHAN = v('Microsoft Hanhan - Chinese (Traditional, Taiwan)', 'zh-TW', true);
const YATING = v('Microsoft Yating - Chinese (Traditional, Taiwan)', 'zh-TW', true);
const XIAOXIAO = v('Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', 'zh-CN', false);
// Chrome 的雲端語音
const GOOGLE_TW = v('Google 國語（臺灣）', 'zh-TW', false);
// Apple：一般、增強、高品質三種
const MEIJIA = v('Meijia', 'zh-TW', true, 'com.apple.voice.compact.zh-TW.Meijia');
const MEIJIA_ENH = v('美佳', 'zh-TW', true, 'com.apple.voice.enhanced.zh-TW.Meijia');
const MEIJIA_PRE = v('美佳', 'zh-TW', true, 'com.apple.voice.premium.zh-TW.Meijia');
// 英文
const AVA = v('Microsoft Ava Online (Natural) - English (United States)', 'en-US', false);
const DAVID = v('Microsoft David - English (United States)', 'en-US', true);
const ZIRA = v('Microsoft Zira - English (United States)', 'en-US', true);
const GOOGLE_US = v('Google US English', 'en-US', false);
const LIBBY = v('Microsoft Libby Online (Natural) - English (United Kingdom)', 'en-GB', false);

const names = (list: VoiceLike[]) => list.map((x) => x.name);

describe('normLang', () => {
  it('統一大小寫、底線與台灣中文的各種寫法', () => {
    expect(normLang('zh_TW')).toBe('zh-tw');
    expect(normLang('zh-Hant-TW')).toBe('zh-tw');
    expect(normLang('cmn-Hant-TW')).toBe('zh-tw');
    expect(normLang('cmn-TW')).toBe('zh-tw');
    expect(normLang('en_US')).toBe('en-us');
    expect(normLang('zh-CN')).toBe('zh-cn');
  });
});

describe('orderVoices', () => {
  it('Edge：自然語音排在舊版桌面語音前面', () => {
    const order = orderVoices([HANHAN, YATING, HSIAOCHEN, YUNJHE], 'zh-TW', { allowRemote: true });
    expect(names(order.slice(0, 2))).toEqual([HSIAOCHEN.name, YUNJHE.name]);
    expect(names(order.slice(2))).toEqual([HANHAN.name, YATING.name]);
  });

  it('Chrome：Google 國語（臺灣）排在桌面語音前面', () => {
    expect(orderVoices([HANHAN, GOOGLE_TW], 'zh-TW', { allowRemote: true })[0]).toBe(GOOGLE_TW);
  });

  it('台灣國語一律排在其他地區的中文前面，即使那是自然語音', () => {
    const order = orderVoices([XIAOXIAO, HANHAN], 'zh-TW', { allowRemote: true });
    expect(names(order)).toEqual([HANHAN.name, XIAOXIAO.name]);
  });

  it('沒有台灣國語時，退而使用其他中文', () => {
    expect(orderVoices([XIAOXIAO, DAVID], 'zh-TW', { allowRemote: true })).toEqual([XIAOXIAO]);
  });

  it('Apple：高品質 > 增強 > 一般（看 voiceURI）', () => {
    const order = orderVoices([MEIJIA, MEIJIA_ENH, MEIJIA_PRE], 'zh-TW', { allowRemote: true });
    expect(order.map((x) => x.voiceURI)).toEqual([MEIJIA_PRE.voiceURI, MEIJIA_ENH.voiceURI, MEIJIA.voiceURI]);
  });

  it('舊版桌面語音排在其他本機語音後面', () => {
    const other = v('Some Local Voice', 'zh-TW', true);
    expect(orderVoices([HANHAN, other], 'zh-TW', { allowRemote: true })[0]).toBe(other);
  });

  it('不允許連網語音時（離線或連網語音失敗過），只留本機聲音', () => {
    const order = orderVoices([HSIAOCHEN, GOOGLE_TW, HANHAN, YATING], 'zh-TW', { allowRemote: false });
    expect(names(order)).toEqual([HANHAN.name, YATING.name]);
  });

  it('英文：美式自然語音 > Google 美式 > 桌面語音；英式排在美式後面', () => {
    const order = orderVoices([DAVID, LIBBY, GOOGLE_US, ZIRA, AVA], 'en-US', { allowRemote: true });
    expect(names(order)).toEqual([AVA.name, GOOGLE_US.name, DAVID.name, ZIRA.name, LIBBY.name]);
  });

  it('不改動傳入的陣列', () => {
    const input = [HANHAN, HSIAOCHEN];
    orderVoices(input, 'zh-TW', { allowRemote: true });
    expect(input).toEqual([HANHAN, HSIAOCHEN]);
  });
});

describe('pickVoice', () => {
  const all = [HANHAN, YATING, HSIAOCHEN, YUNJHE, XIAOXIAO];

  it('自動：挑排序第一的聲音', () => {
    expect(pickVoice(all, 'zh-TW', { allowRemote: true })).toBe(HSIAOCHEN);
  });

  it('家長選的聲音（以 voiceURI 比對）優先', () => {
    expect(pickVoice(all, 'zh-TW', { allowRemote: true, preferred: YUNJHE.voiceURI })).toBe(YUNJHE);
  });

  it('家長選的聲音不在這台裝置上時，改用自動', () => {
    expect(pickVoice(all, 'zh-TW', { allowRemote: true, preferred: 'not-here' })).toBe(HSIAOCHEN);
  });

  it('家長選的是連網語音、但現在不能連網時，改用最好的本機聲音', () => {
    expect(pickVoice(all, 'zh-TW', { allowRemote: false, preferred: YUNJHE.voiceURI })).toBe(HANHAN);
  });

  it('沒有任何可用聲音時回傳 undefined', () => {
    expect(pickVoice([], 'zh-TW', { allowRemote: true })).toBeUndefined();
    expect(pickVoice([DAVID], 'zh-TW', { allowRemote: true })).toBeUndefined();
  });
});

describe('isBasicVoice', () => {
  it('自然語音、雲端語音、Apple 增強與高品質都不算基本語音', () => {
    expect(isBasicVoice(HSIAOCHEN)).toBe(false);
    expect(isBasicVoice(GOOGLE_TW)).toBe(false);
    expect(isBasicVoice(MEIJIA_ENH)).toBe(false);
    expect(isBasicVoice(MEIJIA_PRE)).toBe(false);
  });

  it('本機一般語音與舊版桌面語音算基本語音', () => {
    expect(isBasicVoice(HANHAN)).toBe(true);
    expect(isBasicVoice(MEIJIA)).toBe(true);
  });
});

describe('voiceTag', () => {
  it('家長選單上的標籤：自然語音、需連網、基本語音', () => {
    expect(voiceTag(HSIAOCHEN)).toBe('自然語音・需連網');
    expect(voiceTag(GOOGLE_TW)).toBe('需連網');
    expect(voiceTag(MEIJIA_PRE)).toBe('自然語音');
    expect(voiceTag(HANHAN)).toBe('基本語音');
  });
});

describe('isFallbackError', () => {
  it('被新句子打斷或被瀏覽器擋下，不是聲音本身的問題，不換聲音', () => {
    expect(isFallbackError('interrupted')).toBe(false);
    expect(isFallbackError('canceled')).toBe(false);
    expect(isFallbackError('not-allowed')).toBe(false);
  });

  it('網路或合成失敗時，要換成本機聲音', () => {
    for (const code of ['network', 'synthesis-failed', 'synthesis-unavailable', 'voice-unavailable', 'language-unavailable']) {
      expect(isFallbackError(code)).toBe(true);
    }
  });
});

describe('splitSentences', () => {
  it('依中文句末標點切句，保留標點', () => {
    expect(splitSentences('你好。今天天氣很好！要出門嗎？')).toEqual(['你好。', '今天天氣很好！', '要出門嗎？']);
  });

  it('英文依句號、驚嘆號、問號加空白切句', () => {
    expect(splitSentences('Hello! How are you? I am fine.')).toEqual(['Hello!', 'How are you?', 'I am fine.']);
  });

  it('英文稱謂縮寫（Mr. Ms. Mrs. Dr.）後面不切（英語課的問候句會用到）', () => {
    expect(splitSentences('Good morning, Ms. Wang.')).toEqual(['Good morning, Ms. Wang.']);
    expect(splitSentences('Good afternoon, Mr. Lee. See you!')).toEqual(['Good afternoon, Mr. Lee.', 'See you!']);
    expect(splitSentences('Mrs. Chen and Dr. Lin are here.')).toEqual(['Mrs. Chen and Dr. Lin are here.']);
  });

  it('數字裡的小數點與只有一句的題目不切', () => {
    expect(splitSentences('3.5 公分比 2.5 公分長多少？')).toEqual(['3.5 公分比 2.5 公分長多少？']);
    expect(splitSentences('「花」的注音是哪一個？')).toEqual(['「花」的注音是哪一個？']);
  });

  it('結尾引號跟著前一句；不產生空字串', () => {
    expect(splitSentences('老師說：「快來！」我們就跑過去。')).toEqual(['老師說：「快來！」', '我們就跑過去。']);
    expect(splitSentences('  ')).toEqual([]);
  });
});
