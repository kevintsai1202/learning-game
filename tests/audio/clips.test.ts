/**
 * 預錄語音的查詢規則（純函式）：
 * - 對照表的鍵是「語言|句子」，句子是 cleanForSpeech + splitSentences 之後的結果
 * - 一段話的每一句都有音檔才播音檔；缺任何一句就整段用裝置語音，避免同一段話中途換聲音
 * - 單一個注音符號（例如「ㄅ。」）一律對到不帶標點的「zh-TW|ㄅ」；改用裝置語音時略過這種句子（裝置語音唸不準）
 */
import { describe, expect, it } from 'vitest';
import { clipKey, clipsFor, isSymbolSentence, parseManifest, ttsParts, type ClipManifest } from '../../src/audio/clips';

const manifest: ClipManifest = {
  version: 1,
  clips: {
    'zh-TW|太厲害了！': { f: 'a1.mp3', v: 0 },
    'zh-TW|全部都難不倒你！': { f: 'a2.mp3', v: 0 },
    'zh-TW|ㄅ': { f: 'zy-b.mp3', v: 1 },
    'zh-TW|照著筆順，描寫這個注音符號。': { f: 'a3.mp3', v: 0 },
    'en-US|apple': { f: 'e1.mp3', v: 2 },
  },
};

describe('isSymbolSentence', () => {
  it('只有一個注音符號（可帶句末標點）才算', () => {
    expect(isSymbolSentence('ㄅ')).toBe(true);
    expect(isSymbolSentence('ㄅ。')).toBe(true);
    expect(isSymbolSentence('ㄩ！')).toBe(true);
    expect(isSymbolSentence('ㄏㄨㄚ')).toBe(false);
    expect(isSymbolSentence('ˊ')).toBe(false);
    expect(isSymbolSentence('花。')).toBe(false);
  });
});

describe('clipKey', () => {
  it('一般句子：語言|句子', () => {
    expect(clipKey('zh-TW', '太厲害了！')).toBe('zh-TW|太厲害了！');
    expect(clipKey('en-US', 'apple')).toBe('en-US|apple');
  });

  it('注音符號句子去掉標點，而且一律用 zh-TW', () => {
    expect(clipKey('zh-TW', 'ㄅ。')).toBe('zh-TW|ㄅ');
    expect(clipKey('en-US', 'ㄅ')).toBe('zh-TW|ㄅ');
  });
});

describe('clipsFor', () => {
  it('每一句都有音檔時，依序回傳檔名', () => {
    expect(clipsFor(manifest, ['太厲害了！', '全部都難不倒你！'], 'zh-TW')).toEqual(['a1.mp3', 'a2.mp3']);
  });

  it('注音符號句子對到注音音檔，可以和一般句子混用', () => {
    expect(clipsFor(manifest, ['ㄅ。', '照著筆順，描寫這個注音符號。'], 'zh-TW')).toEqual(['zy-b.mp3', 'a3.mp3']);
  });

  it('缺任何一句就回傳 null（整段改用裝置語音）', () => {
    expect(clipsFor(manifest, ['太厲害了！', '這句沒有音檔。'], 'zh-TW')).toBeNull();
  });

  it('語言不同就對不到；沒有句子也回傳 null', () => {
    expect(clipsFor(manifest, ['apple'], 'zh-TW')).toBeNull();
    expect(clipsFor(manifest, ['apple'], 'en-US')).toEqual(['e1.mp3']);
    expect(clipsFor(manifest, [], 'zh-TW')).toBeNull();
  });
});

describe('ttsParts', () => {
  it('改用裝置語音時，略過只有注音符號的句子', () => {
    expect(ttsParts(['ㄅ。', '照著筆順，描寫這個注音符號。'])).toEqual(['照著筆順，描寫這個注音符號。']);
    expect(ttsParts(['太厲害了！'])).toEqual(['太厲害了！']);
  });
});

describe('parseManifest', () => {
  it('格式正確時回傳對照表', () => {
    expect(parseManifest(JSON.stringify(manifest))?.clips['zh-TW|ㄅ'].f).toBe('zy-b.mp3');
  });

  it('格式錯誤、版本不對或不是 JSON 時回傳 null', () => {
    expect(parseManifest('not json')).toBeNull();
    expect(parseManifest(JSON.stringify({ version: 99, clips: {} }))).toBeNull();
    expect(parseManifest(JSON.stringify({ version: 1, clips: { a: { f: 1 } } }))).toBeNull();
  });
});
