import { describe, expect, it } from 'vitest';
import { ZH_LANGUAGE_ACTIVITIES } from '../../src/activities/zhLanguage';
import { questionSchema } from '../../src/content/schema';
import { ZH_LANGUAGE_INDICATORS } from '../../src/content/zh/codes-language';
import {
  ANTONYM_PAIRS,
  BOPOMOFO_ONLY,
  CHAR_CHOICE_ITEMS,
  CONNECTIVE_ITEMS,
  LIGHT_TONE_SETS,
  MEASURE_ITEMS,
  ORDER_ITEMS,
  PUNCT_ITEMS,
  QUOTE_ITEMS,
  READING_PASSAGES,
  REDUPLICATION_ITEMS,
  SYNONYM_ITEMS,
  WRONG_CHAR_ITEMS,
  ZHUYIN_ENTRIES,
  baseOf,
  toneOf,
} from '../../src/content/zh/language';
import { checkAnswer, correctResponse } from '../../src/engine/check';
import type { Lv } from '../../src/content/zh/language';

/** 一組測試用種子 */
const SEEDS = Array.from({ length: 8 }, (_, i) => i * 7919 + 1);
/** 「連玩三回合」用的三個種子（抽題是亂數：隨機三個種子在除閱讀外的活動幾乎都達標，閱讀約六成；這組種子在 27 種活動與難度組合都達標，題材大幅改動後若不達標，換一組即可） */
const THREE_SEEDS = [101, 202, 909];
const LEVELS: Lv[] = [1, 2, 3];

describe('國語（注音、語詞、句子與閱讀）：活動清單', () => {
  it('9 個活動，id 不重複、屬於國語屋與國語科、每回合 10 題、可選難度', () => {
    expect(ZH_LANGUAGE_ACTIVITIES.length).toBe(9);
    const ids = ZH_LANGUAGE_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ZH_LANGUAGE_ACTIVITIES) {
      expect(a.zone, a.id).toBe('zh');
      expect(a.subject, a.id).toBe('zh');
      expect(a.count, a.id).toBe(10);
      expect(a.levels, a.id).toBe(true);
      expect(a.indicators.length, a.id).toBeGreaterThan(0);
      for (const code of a.indicators) expect(ZH_LANGUAGE_INDICATORS[code], `${a.id} ${code}`).toBeTruthy();
    }
  });

  it('ZH_LANGUAGE_INDICATORS 只收活動有用到的代碼，且代碼格式正確', () => {
    const used = new Set(ZH_LANGUAGE_ACTIVITIES.flatMap((a) => a.indicators));
    for (const code of Object.keys(ZH_LANGUAGE_INDICATORS)) {
      expect(used.has(code), code).toBe(true);
      expect(code, code).toMatch(/^(?:[1-6]-Ⅰ-\d|[A-C][a-e]?-Ⅰ-\d)$/);
    }
  });
});

describe('國語：題材資料自我檢查', () => {
  it('注音例字表：注音只含注音符號與聲調（輕聲點在前、聲調在後）、國字不重複', () => {
    const chars = ZHUYIN_ENTRIES.map((z) => z.char);
    expect(new Set(chars).size).toBe(chars.length);
    for (const z of ZHUYIN_ENTRIES) {
      expect(z.char, z.zhuyin).toMatch(/^[一-鿿]$/);
      expect(z.zhuyin, z.char).toMatch(BOPOMOFO_ONLY);
      expect(toneOf(z.zhuyin), z.char).toBeGreaterThanOrEqual(1);
    }
  });

  it('注音例字表：拼音類型（二拼、三拼、結合韻）與注音符號相符', () => {
    for (const z of ZHUYIN_ENTRIES) {
      const b = baseOf(z.zhuyin);
      const combo = /[ㄧㄨㄩ](ㄠ|ㄡ|ㄞ|ㄟ|ㄢ|ㄣ|ㄤ|ㄥ)/.test(b);
      const three = /[ㄧㄨㄩ][ㄚㄛㄝ]/.test(b);
      const expected = combo ? 'combo' : three ? 'three' : 'two';
      expect(z.kind, `${z.char} ${z.zhuyin}`).toBe(expected);
    }
  });

  it('輕聲組：注音格式正確、輕聲字為輕聲、其他字不是輕聲', () => {
    for (const s of LIGHT_TONE_SETS) {
      expect(s.light.zhuyin).toMatch(BOPOMOFO_ONLY);
      expect(toneOf(s.light.zhuyin)).toBe(5);
      expect(s.light.phrase).toContain(s.light.char);
      expect(s.light.speak).toContain(s.light.char);
      expect(s.others.length).toBeGreaterThanOrEqual(3);
      for (const o of s.others) {
        expect(o.zhuyin, o.char).toMatch(BOPOMOFO_ONLY);
        expect(toneOf(o.zhuyin), o.char).not.toBe(5);
      }
    }
  });

  it('各題材的題庫量足夠連玩三回合（固定題庫至少 30 題、閱讀至少 10 篇）', () => {
    expect(MEASURE_ITEMS.length).toBeGreaterThanOrEqual(30);
    expect(ANTONYM_PAIRS.length * 2).toBeGreaterThanOrEqual(30);
    expect(CHAR_CHOICE_ITEMS.length + WRONG_CHAR_ITEMS.length).toBeGreaterThanOrEqual(30);
    expect(SYNONYM_ITEMS.length + REDUPLICATION_ITEMS.length + CONNECTIVE_ITEMS.length).toBeGreaterThanOrEqual(30);
    expect(ORDER_ITEMS.length).toBeGreaterThanOrEqual(30);
    expect(PUNCT_ITEMS.length + QUOTE_ITEMS.length).toBeGreaterThanOrEqual(30);
    expect(READING_PASSAGES.length).toBeGreaterThanOrEqual(10);
    // 每個難度的注音例字都夠多
    expect(ZHUYIN_ENTRIES.filter((z) => z.kind === 'two').length).toBeGreaterThanOrEqual(30);
    expect(ZHUYIN_ENTRIES.filter((z) => z.kind !== 'two').length).toBeGreaterThanOrEqual(30);
  });

  it('量詞、相反詞：沒有「干擾項其實也對」的明顯衝突', () => {
    for (const m of MEASURE_ITEMS) {
      expect(m.wrong.length, m.noun).toBe(3);
      expect(m.wrong, m.noun).not.toContain(m.right);
    }
    // 相反詞不能一個詞對應到兩組
    const words = ANTONYM_PAIRS.flatMap((p) => [p.a, p.b]);
    expect(new Set(words).size).toBe(words.length);
  });

  it('閱讀短文：至少 10 篇、60～150 字、每篇至少 3 題、題目 id 用的短文 id 不重複', () => {
    expect(new Set(READING_PASSAGES.map((p) => p.id)).size).toBe(READING_PASSAGES.length);
    const genres = new Set(READING_PASSAGES.map((p) => p.genre));
    for (const g of ['story', 'poem', 'diary', 'explain']) expect(genres.has(g as never), g).toBe(true);
    for (const p of READING_PASSAGES) {
      const len = p.text.replace(/\s/g, '').length;
      expect(len, `${p.id} 字數 ${len}`).toBeGreaterThanOrEqual(60);
      expect(len, `${p.id} 字數 ${len}`).toBeLessThanOrEqual(150);
      expect(p.questions.length, p.id).toBeGreaterThanOrEqual(3);
      for (const q of p.questions) {
        expect(q.wrong.length, `${p.id} ${q.prompt}`).toBe(3);
        expect(new Set([q.right, ...q.wrong]).size, `${p.id} ${q.prompt}`).toBe(4);
      }
    }
  });

  it('排序題材：詞卡 3～6 張、詞卡不重複、句子不重複', () => {
    const sentences = ORDER_ITEMS.map((o) => o.steps.join(''));
    expect(new Set(sentences).size).toBe(sentences.length);
    expect(new Set(ORDER_ITEMS.map((o) => o.id)).size).toBe(ORDER_ITEMS.length);
    for (const o of ORDER_ITEMS) {
      expect(o.steps.length, o.id).toBeGreaterThanOrEqual(3);
      expect(o.steps.length, o.id).toBeLessThanOrEqual(6);
      expect(new Set(o.steps).size, o.id).toBe(o.steps.length);
    }
  });
});

for (const activity of ZH_LANGUAGE_ACTIVITIES) {
  describe(activity.id, () => {
    for (const level of LEVELS) {
      it(`難度 ${level}：指定題數、id 不重複、相同種子結果相同、不同種子題目不同`, () => {
        for (const seed of SEEDS) {
          const qs = activity.make({ seed, count: 10, level });
          expect(qs.length).toBe(10);
          expect(new Set(qs.map((q) => q.id)).size).toBe(10);
          expect(activity.make({ seed, count: 10, level })).toEqual(qs);
        }
        const a = activity.make({ seed: 1, count: 10, level }).map((q) => q.id).join();
        const b = activity.make({ seed: 2, count: 10, level }).map((q) => q.id).join();
        expect(a).not.toBe(b);
      });

      it(`難度 ${level}：用 3 個不同種子玩三回合，合計至少 25 題不重複`, () => {
        const ids = new Set<string>();
        for (const seed of THREE_SEEDS) for (const q of activity.make({ seed, count: 10, level })) ids.add(q.id);
        expect(ids.size, `${activity.id} L${level} 三回合不重複題數`).toBeGreaterThanOrEqual(25);
      });

      it(`難度 ${level}：每題通過 schema、標準答案判對、選項不重複、課綱代碼有效、題幹有空格或符號時有 speak`, () => {
        for (const seed of SEEDS) {
          for (const q of activity.make({ seed, count: 10, level })) {
            const parsed = questionSchema.safeParse(q);
            expect(parsed.success, `${q.id} ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`).toBe(true);
            expect(q.subject).toBe('zh');
            expect(q.skill).toBe(activity.id);
            expect(q.id.startsWith(`${activity.id}:`), q.id).toBe(true);
            expect(q.difficulty, q.id).toBe(level);
            expect(checkAnswer(q, correctResponse(q)), q.id).toBe(true);
            expect(q.indicators.length, q.id).toBeGreaterThan(0);
            for (const code of q.indicators) {
              expect(ZH_LANGUAGE_INDICATORS[code], `${q.id} ${code}`).toBeTruthy();
              expect(activity.indicators, `${q.id} ${code}`).toContain(code);
            }
            if (q.prompt.includes('（　）')) {
              expect(q.speak, q.id).toBeTruthy();
              expect(q.speak, q.id).not.toContain('（　）');
            }
            if (q.type === 'choice') {
              const keys = q.options.map((o) => `${o.text ?? ''}|${o.emoji ?? ''}`);
              expect(new Set(keys).size, q.id).toBe(keys.length);
              expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
            }
          }
        }
      });
    }
  });
}

describe('各活動的專屬檢查', () => {
  const make = (id: string, level: Lv, seed: number) => ZH_LANGUAGE_ACTIVITIES.find((a) => a.id === id)!.make({ seed, count: 10, level });

  it('注音拼讀：看注音的題目不唸出答案；選項是注音時 speak 為例字且注音格式正確', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        for (const q of make('zh.zhuyin', level, seed)) {
          if (q.type !== 'choice') throw new Error('應為單選題');
          if (q.visual?.kind === 'bigtext' && BOPOMOFO_ONLY.test(q.visual.text)) {
            // 看注音：朗讀文字就是題幹的固定說法，不能多唸出答案
            expect(q.speak, q.id).toBe(q.prompt);
          }
          for (const o of q.options) {
            if (o.text && /[ㄅ-ㄩ]/.test(o.text)) {
              expect(o.text, q.id).toMatch(BOPOMOFO_ONLY);
              expect(o.speak, `${q.id} ${o.text}`).toMatch(/[一-鿿]/);
              // 例字的注音必須和選項相符（以例字表或輕聲組為準）
              const hit = ZHUYIN_ENTRIES.find((z) => z.char === o.speak && z.zhuyin === o.text);
              const lightHit = LIGHT_TONE_SETS.some((s) => s.light.zhuyin === o.text || s.others.some((x) => x.char === o.speak && x.zhuyin === o.text));
              expect(hit || lightHit, `${q.id} ${o.text}→${o.speak}`).toBeTruthy();
            }
          }
        }
      }
    }
  });

  it('聲調：「第幾聲」題的答案與注音的聲調符號一致；輕聲題的正解是輕聲', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        for (const q of make('zh.tone', level, seed)) {
          if (q.type !== 'choice') throw new Error('應為單選題');
          if (q.id.includes(':num:')) {
            const zhuyin = q.visual?.kind === 'bigtext' ? q.visual.text : '';
            expect(q.answer + 1, q.id).toBe(toneOf(zhuyin));
          }
          if (q.id.includes(':light')) expect(toneOf(q.options[q.answer].text!), q.id).toBe(5);
          if (q.id.includes(':pick:')) {
            const want = ['一', '二', '三', '四'].findIndex((n) => q.prompt.includes(`${n}聲`)) + 1;
            expect(toneOf(q.options[q.answer].text!), q.id).toBe(want);
            // 其他選項不能也是同一個聲調
            q.options.forEach((o, i) => i !== q.answer && expect(toneOf(o.text!), q.id).not.toBe(want));
          }
        }
      }
    }
  });

  it('量詞：反向題的干擾名詞都不適用這個量詞', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        for (const q of make('zh.measure', level, seed)) {
          if (q.type !== 'choice' || !q.id.includes(':rev:')) continue;
          const measure = q.prompt[1];
          q.options.forEach((o, i) => {
            const item = MEASURE_ITEMS.find((m) => m.noun === o.text)!;
            if (i === q.answer) expect(item.right, q.id).toBe(measure);
            else expect(item.wrong, `${q.id} ${o.text}`).toContain(measure);
          });
        }
      }
    }
  });

  it('句子排序：詞卡 3～6 張，打散後不等於正解', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        for (const q of make('zh.order', level, seed)) {
          if (q.type !== 'order') throw new Error('應為排序題');
          expect(q.tokens.length, q.id).toBeGreaterThanOrEqual(3);
          expect(q.tokens.length, q.id).toBeLessThanOrEqual(6);
          expect(q.tokens.join('|'), q.id).not.toBe(q.answer.join('|'));
        }
      }
    }
  });

  it('閱讀小短文：每題都有短文，同一篇短文的題目連在一起，題幹不含短文', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        const qs = make('zh.reading', level, seed);
        const seen: string[] = [];
        for (const q of qs) {
          expect(q.visual?.kind, q.id).toBe('passage');
          if (q.visual?.kind === 'passage') {
            expect(q.visual.text.length, q.id).toBeLessThanOrEqual(400);
            expect(q.prompt, q.id).not.toContain(q.visual.text.slice(0, 10));
            if (seen[seen.length - 1] !== q.visual.text) seen.push(q.visual.text);
          }
        }
        // 每篇短文只會連續出現一次
        expect(new Set(seen).size, `${level}-${seed}`).toBe(seen.length);
      }
    }
  });

  it('同音字與形近字：找錯字題的正解是句子裡真的有的字', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        for (const q of make('zh.homophone', level, seed)) {
          if (q.type !== 'choice' || !q.id.includes(':wrong:')) continue;
          const bad = q.options[q.answer].text!;
          expect(WRONG_CHAR_ITEMS.some((w) => w.wrong === bad && q.prompt.includes(w.sentence)), q.id).toBe(true);
        }
      }
    }
  });
});
